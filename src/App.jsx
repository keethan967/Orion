import { useState, useEffect, useRef, useCallback } from "react";

/* ═══════════════════════════════════════════════════════════════════
   ORION — Celestial Self-Evolution Platform  v3.0
   Enhancements:
   • Fixed daily timer with midnight reset & persistent storage
   • 3-level tracking: daily / weekly / AI-recommended target
   • Weekly dashboard with progress ring
   • Real ambient audio player (Web Audio API procedural synthesis)
   • Podcast section with audio playback
   • AI weekly target based on emotional/stress state
   • Smooth page transitions preserved
═══════════════════════════════════════════════════════════════════ */

// ── Anthropic API helper ────────────────────────────────────────
async function callClaude(messages, systemPrompt, maxTokens = 1000) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });
  const data = await res.json();
  return data.content?.map(b => b.text || "").join("") || "";
}

// ── Storage helpers (localStorage with daily-key isolation) ─────
const STORAGE_KEY = "orion_tracking_v3";

function getTodayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function loadTracking() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveTracking(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function getTodayMinutes() {
  const data = loadTracking();
  return data[getTodayKey()] || 0;
}

function addMinutesToday(mins) {
  const data = loadTracking();
  const key = getTodayKey();
  data[key] = (data[key] || 0) + mins;
  saveTracking(data);
  return data[key];
}

function getWeekMinutes() {
  const data = loadTracking();
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    total += data[key] || 0;
  }
  return total;
}

function getWeekDayData() {
  const data = loadTracking();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const label = d.toLocaleDateString("en-US", { weekday: "short" }).slice(0,1);
    days.push({ label, mins: data[key] || 0, isToday: i === 0 });
  }
  return days;
}

// ── CSS globals ─────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body { background: #07090e; overflow-x: hidden; cursor: default; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(212,175,100,0.18); border-radius: 2px; }
  textarea, input { font-family: inherit; }
  textarea::placeholder, input::placeholder { color: rgba(180,170,155,0.22); }
  input[type=range] { -webkit-appearance: none; appearance: none; height: 2px; background: rgba(212,175,100,0.15); border-radius: 1px; outline: none; cursor: pointer; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%; background: rgba(212,175,100,0.8); cursor: pointer; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(20px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes fadeIn {
    from { opacity: 0; } to { opacity: 1; }
  }
  @keyframes pulseGold {
    0%, 100% { opacity: 0.35; }
    50%       { opacity: 0.85; }
  }
  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes ripple {
    0% { transform: scale(1); opacity: 0.6; }
    100% { transform: scale(2.2); opacity: 0; }
  }
  .fadeUp { animation: fadeUp 0.7s cubic-bezier(0.16,1,0.3,1) both; }
  .fadeUp-1 { animation-delay: 0.05s; }
  .fadeUp-2 { animation-delay: 0.12s; }
  .fadeUp-3 { animation-delay: 0.20s; }
  .fadeUp-4 { animation-delay: 0.28s; }
  .fadeUp-5 { animation-delay: 0.36s; }
`;

// ── Design tokens ────────────────────────────────────────────────
const T = {
  bg: "#07090e",
  surface: "rgba(12,15,22,0.9)",
  surfaceHover: "rgba(18,22,32,0.95)",
  border: "rgba(212,175,100,0.07)",
  borderHover: "rgba(212,175,100,0.2)",
  gold: "rgba(212,175,100,0.85)",
  goldDim: "rgba(212,175,100,0.4)",
  goldFaint: "rgba(212,175,100,0.08)",
  text: "#e8dfc8",
  textMid: "rgba(220,210,195,0.65)",
  textDim: "rgba(180,170,155,0.4)",
  serif: "'Playfair Display', Georgia, serif",
  body: "'Cormorant Garamond', Georgia, serif",
};

/* ════════════════ WEB AUDIO AMBIENT ENGINE ════════════════════ */
// Generates procedural ambient soundscapes using Web Audio API
class AmbientEngine {
  constructor() {
    this.ctx = null;
    this.nodes = [];
    this.gainNode = null;
    this.active = false;
  }
  _init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.ctx.createGain();
      this.gainNode.connect(this.ctx.destination);
      this.gainNode.gain.value = 0.5;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  stop() {
    this.nodes.forEach(n => { try { n.stop?.(); n.disconnect?.(); } catch {} });
    this.nodes = [];
    this.active = false;
  }
  setVolume(v) { if (this.gainNode) this.gainNode.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1); }

  // ── Rain: filtered pink noise bursts ──
  playRain() {
    this._init(); this.stop(); this.active = true;
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
    for (let i=0; i<bufSize; i++) {
      const w = Math.random()*2-1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      data[i]=(b0+b1+b2+b3+b4+b5+b6+w*0.5362)*0.11;
      b6=w*0.115926;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass"; filter.frequency.value = 1200; filter.Q.value = 0.4;
    src.connect(filter); filter.connect(this.gainNode);
    src.start(); this.nodes.push(src);
    // occasional drip tones
    const drip = () => {
      if (!this.active) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.value = 800 + Math.random()*400;
      o.type = "sine";
      g.gain.setValueAtTime(0.03, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime+0.3);
      o.connect(g); g.connect(this.gainNode);
      o.start(); o.stop(this.ctx.currentTime+0.3);
      setTimeout(drip, 200+Math.random()*800);
    };
    setTimeout(drip, 500);
  }

  // ── Ocean: low-frequency swoosh cycles ──
  playOcean() {
    this._init(); this.stop(); this.active = true;
    const bufSize = this.ctx.sampleRate * 4;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0; i<bufSize; i++) {
      const t = i / this.ctx.sampleRate;
      const wave = Math.sin(2*Math.PI*0.15*t) * 0.5 + 0.5;
      data[i] = (Math.random()*2-1) * wave * 0.4;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = 600;
    const filter2 = this.ctx.createBiquadFilter();
    filter2.type = "peaking"; filter2.frequency.value = 200; filter2.gain.value = 8;
    src.connect(filter); filter.connect(filter2); filter2.connect(this.gainNode);
    src.start(); this.nodes.push(src);
  }

  // ── Forest: layered wind + bird chirps ──
  playForest() {
    this._init(); this.stop(); this.active = true;
    // Wind
    const bufSize = this.ctx.sampleRate * 3;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0; i<bufSize; i++) {
      const t = i / this.ctx.sampleRate;
      data[i] = (Math.random()*2-1) * (0.3 + 0.2*Math.sin(2*Math.PI*0.08*t));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 350; f.Q.value = 0.3;
    src.connect(f); f.connect(this.gainNode);
    src.start(); this.nodes.push(src);
    // Birds
    const bird = () => {
      if (!this.active) return;
      const n = 2 + Math.floor(Math.random()*3);
      for (let i=0;i<n;i++) {
        setTimeout(() => {
          if (!this.active) return;
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          const base = 2000 + Math.random()*1500;
          o.type="sine"; o.frequency.value = base;
          o.frequency.linearRampToValueAtTime(base*1.2, this.ctx.currentTime+0.08);
          g.gain.setValueAtTime(0, this.ctx.currentTime);
          g.gain.linearRampToValueAtTime(0.04, this.ctx.currentTime+0.02);
          g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime+0.15);
          o.connect(g); g.connect(this.gainNode);
          o.start(); o.stop(this.ctx.currentTime+0.15);
        }, i*120);
      }
      setTimeout(bird, 1500 + Math.random()*4000);
    };
    setTimeout(bird, 1000);
  }

  // ── Deep Space: slow evolving drone ──
  playDeepSpace() {
    this._init(); this.stop(); this.active = true;
    [55, 110, 165, 220].forEach((freq, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = i % 2 === 0 ? "sine" : "triangle";
      o.frequency.value = freq;
      const detune = (Math.random()-0.5)*4;
      o.detune.value = detune;
      g.gain.value = [0.15, 0.08, 0.05, 0.04][i];
      o.connect(g); g.connect(this.gainNode);
      o.start();
      this.nodes.push(o);
      // Slow LFO
      const lfo = this.ctx.createOscillator();
      const lfoG = this.ctx.createGain();
      lfo.frequency.value = 0.05 + i*0.02;
      lfoG.gain.value = 3;
      lfo.connect(lfoG); lfoG.connect(o.detune);
      lfo.start(); this.nodes.push(lfo);
    });
  }

  // ── Fireplace: crackling warmth ──
  playFireplace() {
    this._init(); this.stop(); this.active = true;
    const bufSize = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i=0;i<bufSize;i++) {
      last = last*0.995 + (Math.random()*2-1)*0.005;
      data[i] = last * 3;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = 800;
    const f2 = this.ctx.createBiquadFilter();
    f2.type = "peaking"; f2.frequency.value = 120; f2.gain.value = 14;
    src.connect(f); f.connect(f2); f2.connect(this.gainNode);
    src.start(); this.nodes.push(src);
    // Crackles
    const crackle = () => {
      if (!this.active) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type="square"; o.frequency.value = 80+Math.random()*200;
      g.gain.setValueAtTime(0.06, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime+0.05);
      o.connect(g); g.connect(this.gainNode);
      o.start(); o.stop(this.ctx.currentTime+0.05);
      setTimeout(crackle, 80+Math.random()*400);
    };
    crackle();
  }

  // ── Tibetan Bowls: harmonic bell tones ──
  playBowls() {
    this._init(); this.stop(); this.active = true;
    const freqs = [174, 285, 396, 417, 528, 639, 741, 852, 963];
    const bowl = () => {
      if (!this.active) return;
      const f = freqs[Math.floor(Math.random()*freqs.length)];
      [1, 2.76, 5.4].forEach((harm, i) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = "sine"; o.frequency.value = f * harm;
        const vol = [0.12, 0.06, 0.02][i];
        g.gain.setValueAtTime(vol, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime+4);
        o.connect(g); g.connect(this.gainNode);
        o.start(); o.stop(this.ctx.currentTime+4);
      });
      setTimeout(bowl, 3000+Math.random()*5000);
    };
    bowl();
  }
}

const ambientEngine = new AmbientEngine();

/* ════════════════ STAR FIELD ════════════════════════════════════ */
function StarField() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; const ctx = c.getContext("2d");
    let id, W = (c.width = innerWidth), H = (c.height = innerHeight);
    const stars = Array.from({ length: 200 }, () => ({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*1.1+0.1, a: Math.random()*0.55+0.08,
      s: Math.random()*0.1+0.015, d: (Math.random()-0.5)*0.06,
    }));
    const nebulae = Array.from({ length: 4 }, () => ({
      x: Math.random()*W, y: Math.random()*H,
      r: Math.random()*280+120, h: Math.random()*50+195,
      a: Math.random()*0.035+0.008,
    }));
    function draw() {
      ctx.clearRect(0,0,W,H);
      ctx.fillStyle=T.bg; ctx.fillRect(0,0,W,H);
      nebulae.forEach(n => {
        const g=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
        g.addColorStop(0,`hsla(${n.h},38%,32%,${n.a})`);
        g.addColorStop(1,"transparent");
        ctx.fillStyle=g; ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
      });
      stars.forEach(s => {
        s.y-=s.s; s.x+=s.d;
        if(s.y<-2){s.y=H+2;s.x=Math.random()*W;}
        if(s.x<-2)s.x=W+2; if(s.x>W+2)s.x=-2;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle=`rgba(210,200,185,${s.a})`; ctx.fill();
      });
      id=requestAnimationFrame(draw);
    }
    draw();
    const onResize=()=>{W=c.width=innerWidth;H=c.height=innerHeight;};
    addEventListener("resize",onResize);
    return ()=>{cancelAnimationFrame(id);removeEventListener("resize",onResize);};
  },[]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,zIndex:0,pointerEvents:"none"}} />;
}

/* ════════════════ SHARED UI ═════════════════════════════════════ */
function Card({ children, style={}, onClick, className="" }) {
  const [hov,setHov]=useState(false);
  return (
    <div className={className} onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background: hov?T.surfaceHover:T.surface,
        border:`1px solid ${hov?T.borderHover:T.border}`,
        borderRadius:12, padding:28, backdropFilter:"blur(16px)",
        transition:"all 0.35s ease", cursor:onClick?"pointer":"default", ...style,
      }}>{children}</div>
  );
}

function Label({ children, style={} }) {
  return (
    <div style={{ fontFamily:T.body, fontSize:10, letterSpacing:"0.28em",
      textTransform:"uppercase", color:T.textDim, marginBottom:12, ...style,
    }}>{children}</div>
  );
}

function GoldBtn({ children, onClick, style={}, disabled=false, loading=false }) {
  const [hov,setHov]=useState(false);
  return (
    <button onClick={disabled||loading?undefined:onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background:hov&&!disabled?T.goldFaint:"transparent",
        border:`1px solid ${disabled?"rgba(212,175,100,0.15)":hov?"rgba(212,175,100,0.65)":T.goldDim}`,
        color:disabled?"rgba(212,175,100,0.35)":T.gold,
        fontFamily:T.body, fontSize:11, letterSpacing:"0.28em",
        textTransform:"uppercase", padding:"10px 26px",
        cursor:disabled?"not-allowed":"pointer",
        transition:"all 0.3s ease", borderRadius:2,
        display:"inline-flex", alignItems:"center", gap:8, ...style,
      }}>
      {loading&&<span style={{display:"inline-block",width:10,height:10,border:"1px solid rgba(212,175,100,0.6)",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />}
      {children}
    </button>
  );
}

function SectionHead({ title, sub }) {
  return (
    <div className="fadeUp" style={{marginBottom:36}}>
      <h2 style={{fontFamily:T.serif,fontSize:"clamp(22px,3vw,32px)",fontWeight:300,letterSpacing:"0.06em",color:T.text,margin:0}}>{title}</h2>
      {sub&&<p style={{fontFamily:T.body,fontSize:14,fontStyle:"italic",color:T.goldDim,marginTop:6,letterSpacing:"0.05em"}}>{sub}</p>}
    </div>
  );
}

function Spinner() {
  return <span style={{display:"inline-block",width:14,height:14,border:"1px solid rgba(212,175,100,0.3)",borderTopColor:T.gold,borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />;
}

// ── Format helpers ──
const fmtMins = m => m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`;
const fmtSecs = s => `${String(Math.floor(s/3600)).padStart(2,"0")}:${String(Math.floor((s%3600)/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

/* ════════════════ WEEKLY PROGRESS RING ═════════════════════════ */
function WeeklyRing({ actual, target, size=120 }) {
  const pct = Math.min(1, target > 0 ? actual/target : 0);
  const r = (size-16)/2;
  const circ = 2*Math.PI*r;
  const dash = circ*pct;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{transform:"rotate(-90deg)"}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(212,175,100,0.07)" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none"
        stroke={pct >= 1 ? "rgba(180,220,160,0.7)" : "rgba(212,175,100,0.7)"}
        strokeWidth="3" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
        style={{transition:"stroke-dasharray 1.2s cubic-bezier(0.16,1,0.3,1)"}} />
    </svg>
  );
}

/* ════════════════ AUTH SCREEN ═══════════════════════════════════ */
function AuthScreen({ onAuth }) {
  const [mode,setMode]=useState("login");
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [name,setName]=useState("");
  const [err,setErr]=useState("");
  const [vis,setVis]=useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),150);},[]);

  const inputStyle = {
    width:"100%", padding:"13px 16px",
    background:"rgba(10,13,20,0.9)",
    border:"1px solid rgba(212,175,100,0.12)",
    borderRadius:6, outline:"none",
    fontFamily:T.body, fontSize:15,
    color:T.textMid, transition:"border 0.3s",
    boxSizing:"border-box",
  };

  function handleSubmit() {
    if(!email||!pass){setErr("Please fill all fields.");return;}
    if(mode==="signup"&&!name){setErr("Please enter your name.");return;}
    const user={email,name:name||email.split("@")[0],isNew:mode==="signup"};
    onAuth(user);
  }

  return (
    <div style={{position:"fixed",inset:0,zIndex:20,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:400,opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(24px)",transition:"all 1.1s cubic-bezier(0.16,1,0.3,1)",padding:"0 24px"}}>
        <div style={{textAlign:"center",marginBottom:48}}>
          <OrionSymbol size={48} />
          <h1 style={{fontFamily:T.serif,fontSize:42,fontWeight:300,letterSpacing:"0.2em",color:T.text,marginTop:16}}>ORION</h1>
          <p style={{fontFamily:T.body,fontSize:12,letterSpacing:"0.3em",color:T.goldDim,marginTop:6,textTransform:"uppercase",fontStyle:"italic"}}>Celestial Self-Evolution</p>
        </div>
        <Card style={{padding:"36px 32px"}}>
          <Label style={{textAlign:"center",marginBottom:28,fontSize:11,letterSpacing:"0.25em"}}>{mode==="login"?"Sign in to your Observatory":"Begin your Evolution"}</Label>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {mode==="signup"&&<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" style={inputStyle} onFocus={e=>e.target.style.borderColor=T.goldDim} onBlur={e=>e.target.style.borderColor="rgba(212,175,100,0.12)"} />}
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" type="email" style={inputStyle} onFocus={e=>e.target.style.borderColor=T.goldDim} onBlur={e=>e.target.style.borderColor="rgba(212,175,100,0.12)"} />
            <input value={pass} onChange={e=>setPass(e.target.value)} placeholder="Password" type="password" style={inputStyle} onFocus={e=>e.target.style.borderColor=T.goldDim} onBlur={e=>e.target.style.borderColor="rgba(212,175,100,0.12)"} onKeyDown={e=>e.key==="Enter"&&handleSubmit()} />
          </div>
          {err&&<p style={{fontFamily:T.body,fontSize:12,color:"rgba(220,120,100,0.7)",marginTop:12,fontStyle:"italic"}}>{err}</p>}
          <GoldBtn onClick={handleSubmit} style={{width:"100%",justifyContent:"center",marginTop:24,padding:"13px"}}>{mode==="login"?"Enter Orion":"Create Account"}</GoldBtn>
          <p style={{fontFamily:T.body,fontSize:12,color:T.textDim,textAlign:"center",marginTop:20,letterSpacing:"0.05em"}}>
            {mode==="login"?"New to Orion? ":"Already have an account? "}
            <span onClick={()=>{setMode(mode==="login"?"signup":"login");setErr("");}} style={{color:T.goldDim,cursor:"pointer",textDecoration:"underline",textDecorationColor:"rgba(212,175,100,0.3)"}}>
              {mode==="login"?"Create account":"Sign in"}
            </span>
          </p>
        </Card>
        <p style={{fontFamily:T.body,fontSize:11,color:"rgba(180,170,155,0.2)",textAlign:"center",marginTop:24,letterSpacing:"0.1em"}}>Your data is encrypted and private</p>
      </div>
    </div>
  );
}

/* ════════════════ ONBOARDING ════════════════════════════════════ */
const ONBOARDING_STEPS = [
  { key:"primaryGoal", question:"What is your primary focus right now?", sub:"This helps Orion personalize your daily guidance.", options:["Deep Work & Productivity","Personal Growth & Identity","Creative Output","Health & Discipline","Strategic Thinking"] },
  { key:"dailyHours", question:"How many hours per day can you dedicate to deep focus?", sub:"Orion will calibrate your session recommendations.", options:["Less than 1 hour","1–2 hours","3–4 hours","5+ hours"] },
  { key:"biggestChallenge", question:"What is your greatest obstacle to clarity?", sub:"Understanding this helps Orion guide you more precisely.", options:["Distraction & digital noise","Lack of clear direction","Emotional resistance","Inconsistent energy","Overthinking"] },
  { key:"morningType", question:"When does your mind feel sharpest?", sub:"Orion will schedule your most important work accordingly.", options:["Early morning (5–8am)","Morning (8–11am)","Afternoon (1–5pm)","Evening (6–10pm)"] },
];

function OnboardingScreen({ user, onComplete }) {
  const [step,setStep]=useState(0);
  const [answers,setAnswers]=useState({});
  const [vis,setVis]=useState(false);
  useEffect(()=>{setVis(false);setTimeout(()=>setVis(true),50);},[step]);
  const current=ONBOARDING_STEPS[step];
  const isLast=step===ONBOARDING_STEPS.length-1;
  function select(val) {
    const next={...answers,[current.key]:val};
    setAnswers(next);
    if(isLast){setTimeout(()=>onComplete(next),400);}
    else{setTimeout(()=>setStep(s=>s+1),300);}
  }
  return (
    <div style={{position:"fixed",inset:0,zIndex:20,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:"100%",maxWidth:520,padding:"0 24px"}}>
        <div style={{marginBottom:48,textAlign:"center"}}>
          <p style={{fontFamily:T.body,fontSize:11,letterSpacing:"0.25em",textTransform:"uppercase",color:T.textDim,marginBottom:12}}>Calibrating your Observatory · {step+1} of {ONBOARDING_STEPS.length}</p>
          <div style={{height:1,background:T.border,borderRadius:1}}>
            <div style={{height:"100%",width:`${(step/ONBOARDING_STEPS.length)*100}%`,background:"linear-gradient(90deg,rgba(212,175,100,0.3),rgba(212,175,100,0.7))",transition:"width 0.6s ease"}} />
          </div>
        </div>
        <div style={{opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(16px)",transition:"all 0.5s cubic-bezier(0.16,1,0.3,1)"}}>
          <h2 style={{fontFamily:T.serif,fontSize:"clamp(20px,3vw,28px)",fontWeight:300,color:T.text,marginBottom:10,lineHeight:1.3}}>{current.question}</h2>
          <p style={{fontFamily:T.body,fontSize:14,fontStyle:"italic",color:T.goldDim,marginBottom:32}}>{current.sub}</p>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {current.options.map((opt,i)=>(
              <OnboardOption key={opt} label={opt} delay={i*0.06} onClick={()=>select(opt)} />
            ))}
          </div>
        </div>
        <p style={{fontFamily:T.body,fontSize:11,color:"rgba(180,170,155,0.2)",textAlign:"center",marginTop:40,letterSpacing:"0.12em"}}>Welcome, {user.name}</p>
      </div>
    </div>
  );
}

function OnboardOption({ label, delay, onClick }) {
  const [hov,setHov]=useState(false);
  return (
    <div className="fadeUp" onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{animationDelay:`${delay}s`,padding:"14px 20px",background:hov?"rgba(212,175,100,0.07)":T.surface,border:`1px solid ${hov?"rgba(212,175,100,0.3)":T.border}`,borderRadius:8,cursor:"pointer",fontFamily:T.body,fontSize:15,color:hov?T.gold:T.textMid,transition:"all 0.25s ease",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      {label}
      <span style={{fontSize:10,color:T.goldDim,opacity:hov?1:0,transition:"opacity 0.2s"}}>→</span>
    </div>
  );
}

/* ════════════════ ENTRY SCREEN ══════════════════════════════════ */
function EntryScreen({ onEnter }) {
  const [vis,setVis]=useState(false);
  const [exit,setExit]=useState(false);
  useEffect(()=>{setTimeout(()=>setVis(true),200);},[]);
  const go=()=>{setExit(true);setTimeout(onEnter,900);};
  return (
    <div style={{position:"fixed",inset:0,zIndex:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:exit?"transparent":"rgba(7,9,14,0.88)",transition:"background 0.9s ease"}}>
      <div style={{textAlign:"center",opacity:vis&&!exit?1:0,transform:vis&&!exit?"translateY(0)":"translateY(22px)",transition:"all 1.2s cubic-bezier(0.16,1,0.3,1)"}}>
        <OrionSymbol size={60} animate />
        <h1 style={{fontFamily:T.serif,fontSize:"clamp(50px,8vw,86px)",fontWeight:300,letterSpacing:"0.18em",color:T.text,margin:"24px 0 0"}}>ORION</h1>
        <p style={{fontFamily:T.body,fontSize:"clamp(13px,2vw,16px)",letterSpacing:"0.3em",color:T.goldDim,margin:"14px 0 52px",textTransform:"uppercase",fontStyle:"italic"}}>Celestial Self-Evolution</p>
        <GoldBtn onClick={go} style={{padding:"14px 44px",fontSize:12}}>Enter Orion</GoldBtn>
        <p style={{fontFamily:T.body,fontSize:11,letterSpacing:"0.18em",color:"rgba(180,170,155,0.2)",marginTop:44,textTransform:"uppercase"}}>Your private observatory awaits</p>
      </div>
    </div>
  );
}

/* ════════════════ ORION SYMBOL ══════════════════════════════════ */
function OrionSymbol({ size=64, animate=false }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" style={{display:"block",margin:"0 auto"}}>
      <circle cx="32" cy="32" r="28" stroke="rgba(212,175,100,0.25)" strokeWidth="0.8" />
      <circle cx="32" cy="32" r="18" stroke="rgba(212,175,100,0.4)" strokeWidth="0.8" style={animate?{animation:"pulseGold 3s ease-in-out infinite"}:{}} />
      {[[32,14,3],[50,26,2],[44,46,2.5],[20,46,2.5],[14,26,2]].map(([cx,cy,r],i)=>(
        <circle key={i} cx={cx} cy={cy} r={r} fill={`rgba(212,175,100,${0.6+i*0.06})`} />
      ))}
      {[[32,14,50,26],[50,26,44,46],[44,46,20,46],[20,46,14,26],[14,26,32,14]].map(([x1,y1,x2,y2],i)=>(
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(212,175,100,0.15)" strokeWidth="0.7" />
      ))}
      <circle cx="32" cy="32" r="4" fill="rgba(212,175,100,0.1)" stroke="rgba(212,175,100,0.75)" strokeWidth="0.8" />
    </svg>
  );
}

/* ════════════════ SIDEBAR ═══════════════════════════════════════ */
const NAV = [
  {id:"dashboard", label:"Command",   icon:"◈"},
  {id:"focus",     label:"Focus",     icon:"◎"},
  {id:"ambient",   label:"Ambient",   icon:"♫"},
  {id:"podcasts",  label:"Podcasts",  icon:"◐"},
  {id:"reflect",   label:"Reflect",   icon:"◇"},
  {id:"identity",  label:"Identity",  icon:"△"},
  {id:"vault",     label:"Vault",     icon:"▣"},
  {id:"analytics", label:"Analytics", icon:"◉"},
];

function Sidebar({ active, setActive, user, onLogout }) {
  return (
    <nav style={{position:"fixed",left:0,top:0,bottom:0,width:216,zIndex:20,background:"rgba(8,10,16,0.88)",backdropFilter:"blur(24px)",borderRight:`1px solid ${T.border}`,display:"flex",flexDirection:"column",padding:"36px 0"}}>
      <div style={{padding:"0 26px 32px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{fontFamily:T.serif,fontSize:20,fontWeight:300,letterSpacing:"0.2em",color:T.text}}>ORION</div>
        <div style={{fontFamily:T.body,fontSize:10,letterSpacing:"0.24em",color:T.goldDim,marginTop:3,textTransform:"uppercase",fontStyle:"italic"}}>Observatory</div>
      </div>
      <div style={{flex:1,padding:"24px 0",overflowY:"auto"}}>
        {NAV.map((item,i)=><NavItem key={item.id} item={item} active={active} setActive={setActive} delay={i*0.04} />)}
      </div>
      <div style={{padding:"20px 26px",borderTop:`1px solid ${T.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
          <div style={{width:30,height:30,borderRadius:"50%",background:T.goldFaint,border:`1px solid ${T.goldDim}`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:T.serif,fontSize:13,color:T.gold}}>
            {user?.name?.[0]?.toUpperCase()||"✦"}
          </div>
          <div>
            <div style={{fontFamily:T.body,fontSize:13,color:T.textMid,letterSpacing:"0.04em"}}>{user?.name}</div>
            <div style={{fontFamily:T.body,fontSize:10,color:T.textDim,letterSpacing:"0.06em"}}>Active</div>
          </div>
        </div>
        <button onClick={onLogout} style={{background:"none",border:"none",fontFamily:T.body,fontSize:10,color:"rgba(180,170,155,0.25)",cursor:"pointer",letterSpacing:"0.15em",textTransform:"uppercase",padding:0}}>Sign out</button>
      </div>
    </nav>
  );
}

function NavItem({ item, active, setActive, delay }) {
  const [hov,setHov]=useState(false);
  const isActive=active===item.id;
  return (
    <button onClick={()=>setActive(item.id)}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{width:"100%",textAlign:"left",background:isActive?T.goldFaint:"transparent",border:"none",borderLeft:`2px solid ${isActive?"rgba(212,175,100,0.65)":(hov?"rgba(212,175,100,0.2)":"transparent")}`,padding:"11px 26px",cursor:"pointer",display:"flex",alignItems:"center",gap:13,transition:"all 0.25s ease",animationDelay:`${delay}s`}}>
      <span style={{fontSize:13,color:isActive?T.gold:hov?"rgba(212,175,100,0.5)":"rgba(180,170,155,0.28)",transition:"color 0.25s"}}>{item.icon}</span>
      <span style={{fontFamily:T.body,fontSize:13,letterSpacing:"0.1em",textTransform:"uppercase",color:isActive?T.gold:hov?T.textMid:"rgba(180,170,155,0.42)",transition:"color 0.25s"}}>{item.label}</span>
    </button>
  );
}

/* ════════════════ DAILY QUOTE ═══════════════════════════════════ */
function DailyQuote({ profile }) {
  const [quote,setQuote]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const key=`orion_quote_${getTodayKey()}`;
    const cached=sessionStorage.getItem(key);
    if(cached){setQuote(cached);setLoading(false);return;}
    callClaude(
      [{role:"user",content:`Generate one powerful, original quote (2-3 sentences max) for someone focused on: "${profile?.primaryGoal||"personal growth"}". No attribution. Private wisdom only.`}],
      "You are a philosophical writer who crafts precise, luminous quotes for self-evolving individuals. Never use clichés. Write as if carving truth into stone.",200
    ).then(q=>{
      const clean=q.replace(/^["']|["']$/g,"").trim();
      sessionStorage.setItem(key,clean); setQuote(clean); setLoading(false);
    }).catch(()=>{setQuote("The most powerful thing you can do today is decide, clearly, who you are becoming.");setLoading(false);});
  },[]);
  return (
    <Card className="fadeUp fadeUp-2" style={{padding:"32px 36px",borderColor:"rgba(212,175,100,0.1)",marginBottom:16}}>
      <Label style={{marginBottom:16}}>Today's Guiding Thought</Label>
      {loading?<div style={{display:"flex",alignItems:"center",gap:10,color:T.textDim,fontFamily:T.body,fontSize:13}}><Spinner /><span>Orion is thinking...</span></div>
        :<p style={{fontFamily:T.serif,fontSize:"clamp(16px,2.2vw,21px)",fontWeight:300,fontStyle:"italic",color:T.text,lineHeight:1.65,margin:0}}>"{quote}"</p>}
    </Card>
  );
}

/* ════════════════ DAILY INSIGHT ═════════════════════════════════ */
function DailyInsight({ profile }) {
  const [insight,setInsight]=useState(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    const key=`orion_insight_${getTodayKey()}`;
    const cached=sessionStorage.getItem(key);
    if(cached){setInsight(cached);setLoading(false);return;}
    const ctx=`Goal:${profile?.primaryGoal||"growth"}.Challenge:${profile?.biggestChallenge||"focus"}.Peak:${profile?.morningType||"morning"}.`;
    callClaude(
      [{role:"user",content:`Based on this user profile:${ctx} — give one specific, actionable daily insight (3-4 sentences). Be direct, strategic, warm.`}],
      "You are Orion's strategic intelligence. Give precise, personalized daily guidance like a world-class mentor. Never be generic.",300
    ).then(r=>{sessionStorage.setItem(key,r.trim());setInsight(r.trim());setLoading(false);})
    .catch(()=>{setInsight("Your focus window is most powerful in the first 90 minutes after waking. Protect that time ruthlessly — no email, no social. Begin with your most cognitively demanding task while your mental reserves are at peak capacity.");setLoading(false);});
  },[]);
  return (
    <Card className="fadeUp fadeUp-3" style={{padding:"24px 28px"}}>
      <div style={{display:"flex",gap:14,alignItems:"flex-start"}}>
        <div style={{fontSize:18,color:T.goldDim,marginTop:2,flexShrink:0}}>✦</div>
        <div>
          <Label style={{marginBottom:8}}>Orion's Daily Insight</Label>
          {loading?<div style={{display:"flex",alignItems:"center",gap:10,color:T.textDim,fontFamily:T.body,fontSize:13}}><Spinner /><span>Analyzing your patterns...</span></div>
            :<p style={{fontFamily:T.body,fontSize:15,color:T.textMid,lineHeight:1.75,margin:0}}>{insight}</p>}
        </div>
      </div>
    </Card>
  );
}

/* ════════════════ AI STRATEGIST ═════════════════════════════════ */
function AIStrategist({ profile, vaultNotes }) {
  const [msgs,setMsgs]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [open,setOpen]=useState(false);
  const bottomRef=useRef(null);
  useEffect(()=>{
    if(open&&msgs.length===0){setMsgs([{role:"assistant",content:"Welcome. I am Orion's strategic intelligence — here to help you think clearly, plan precisely, and evolve with intention.\n\nYou may ask me about productivity systems, personal development, your goals, or how to navigate your current challenges. What's on your mind?"}]);}
  },[open]);
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[msgs]);
  async function send() {
    if(!input.trim()||loading)return;
    const userMsg={role:"user",content:input};
    const newMsgs=[...msgs,userMsg];
    setMsgs(newMsgs); setInput(""); setLoading(true);
    const vaultCtx=vaultNotes?.length?`\n\nUser vault:\n${vaultNotes.map(n=>`- "${n.title}":${n.content?.slice(0,120)}`).join("\n")}` : "";
    const sys=`You are Orion's strategic intelligence — a world-class mentor. Calm, precise, wise. Direct, actionable, never generic. Studied philosophy, psychology, strategy, peak performance.\nProfile: goal:${profile?.primaryGoal||"not set"}, challenge:${profile?.biggestChallenge||"not set"}, hours:${profile?.dailyHours||"not set"}, peak:${profile?.morningType||"not set"}${vaultCtx}\nKeep responses 2-4 paragraphs.`;
    try {
      const reply=await callClaude(newMsgs.map(m=>({role:m.role,content:m.content})),sys,800);
      setMsgs(m=>[...m,{role:"assistant",content:reply}]);
    } catch { setMsgs(m=>[...m,{role:"assistant",content:"There was an issue connecting to the strategic intelligence. Please try again."}]); }
    setLoading(false);
  }
  return (
    <div className="fadeUp fadeUp-4">
      <Card onClick={()=>setOpen(o=>!o)} style={{borderRadius:open?"12px 12px 0 0":12,cursor:"pointer",padding:"20px 28px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <Label style={{marginBottom:4}}>AI Strategist</Label>
            <p style={{fontFamily:T.body,fontSize:14,color:T.textMid,fontStyle:"italic"}}>Ask Orion anything about growth, focus, or strategy</p>
          </div>
          <span style={{fontSize:16,color:T.goldDim,transform:open?"rotate(180deg)":"none",transition:"transform 0.3s"}}>▾</span>
        </div>
      </Card>
      {open&&(
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderTop:"none",borderRadius:"0 0 12px 12px",backdropFilter:"blur(16px)"}}>
          <div style={{height:300,overflowY:"auto",padding:"24px 28px",display:"flex",flexDirection:"column",gap:16}}>
            {msgs.map((m,i)=>(
              <div key={i} style={{display:"flex",gap:12,justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                {m.role==="assistant"&&<div style={{width:24,height:24,borderRadius:"50%",background:T.goldFaint,border:`1px solid ${T.goldDim}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:T.gold,flexShrink:0,marginTop:2}}>✦</div>}
                <div style={{maxWidth:"78%",padding:"12px 16px",borderRadius:10,background:m.role==="user"?T.goldFaint:"rgba(255,255,255,0.02)",border:`1px solid ${m.role==="user"?"rgba(212,175,100,0.2)":T.border}`,fontFamily:T.body,fontSize:14,color:T.textMid,lineHeight:1.7,whiteSpace:"pre-wrap"}}>{m.content}</div>
              </div>
            ))}
            {loading&&<div style={{display:"flex",gap:12,alignItems:"center"}}><div style={{width:24,height:24,borderRadius:"50%",background:T.goldFaint,border:`1px solid ${T.goldDim}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:T.gold}}>✦</div><div style={{display:"flex",gap:5}}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{width:5,height:5,borderRadius:"50%",background:T.goldDim,animation:`pulseGold 1.2s ease-in-out ${d}s infinite`}} />)}</div></div>}
            <div ref={bottomRef} />
          </div>
          <div style={{padding:"16px 20px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask your strategist..." style={{flex:1,padding:"10px 16px",background:"rgba(10,13,20,0.8)",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:T.body,fontSize:14,color:T.textMid,outline:"none"}} />
            <GoldBtn onClick={send} loading={loading} disabled={!input.trim()} style={{padding:"10px 20px"}}>Send</GoldBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ════════════════ DAILY READING ═════════════════════════════════ */
function DailyReading({ profile }) {
  const [reading,setReading]=useState(null);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(false);
  useEffect(()=>{
    const key=`orion_reading_${getTodayKey()}`;
    const cached=sessionStorage.getItem(key);
    if(cached){try{setReading(JSON.parse(cached));}catch{}setLoading(false);return;}
    callClaude(
      [{role:"user",content:`Create a short reading (180–220 words) relevant to someone focused on:"${profile?.primaryGoal||"personal growth"}". Choose: philosophy, cognitive science, strategy, stoicism, depth psychology. Give a compelling title. Return JSON:{"title":"...","topic":"...","content":"..."}`}],
      "You are a scholar who creates elegant short readings for serious thinkers. Return only valid JSON, no markdown.",600
    ).then(r=>{
      try{const clean=r.replace(/```json|```/g,"").trim();const parsed=JSON.parse(clean);sessionStorage.setItem(key,JSON.stringify(parsed));setReading(parsed);}
      catch{setReading({title:"On the Architecture of Attention",topic:"Cognitive Science",content:"Attention is not passive reception — it is an act of creation. Every moment you decide where to place your focus, you are sculpting the person you are becoming.\n\nThe ancient Stoics understood this intuitively. Marcus Aurelius wrote not to manage time, but to manage perception — to choose, with precision, what would be given the weight of significance. In this sense, attention is the most powerful currency you possess.\n\nModern neuroscience confirms what philosophy long suspected: the brain physically restructures itself around what we repeatedly attend to. Your habitual focus becomes your cognitive architecture.\n\nThe question, then, is not whether you will attend — you must. The question is whether your attention will be sovereign or surrendered. Each morning offers a moment of choice: what will you build today with the raw material of your focus?"});}
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);
  return (
    <Card className="fadeUp fadeUp-5" style={{marginTop:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16}}>
        <div><Label>Daily Reading</Label>{reading&&<div style={{fontFamily:T.body,fontSize:10,letterSpacing:"0.18em",textTransform:"uppercase",color:T.goldDim}}>{reading.topic}</div>}</div>
        {reading&&<span onClick={()=>setExpanded(e=>!e)} style={{fontFamily:T.body,fontSize:11,color:T.textDim,cursor:"pointer",letterSpacing:"0.1em",textTransform:"uppercase"}}>{expanded?"Collapse":"Read"}</span>}
      </div>
      {loading?<div style={{display:"flex",alignItems:"center",gap:10,color:T.textDim,fontFamily:T.body,fontSize:13}}><Spinner /><span>Selecting today's reading...</span></div>
        :reading?<><h3 style={{fontFamily:T.serif,fontSize:18,fontWeight:300,color:T.text,marginBottom:expanded?18:0,lineHeight:1.3}}>{reading.title}</h3>
          {expanded&&<p style={{fontFamily:T.body,fontSize:15,color:T.textMid,lineHeight:1.85,whiteSpace:"pre-wrap",margin:0,animation:"fadeUp 0.4s ease"}}>{reading.content}</p>}</> : null}
    </Card>
  );
}

/* ════════════════ WEEKLY WELLNESS DASHBOARD ═════════════════════ */
function WeeklyDashboard({ trackingRefresh }) {
  const [weekMins,setWeekMins]=useState(0);
  const [todayMins,setTodayMins]=useState(0);
  const [weekTarget,setWeekTarget]=useState(null);
  const [loadingTarget,setLoadingTarget]=useState(false);
  const [stressLevel,setStressLevel]=useState("moderate");
  const [dayData,setDayData]=useState([]);

  useEffect(()=>{
    setWeekMins(getWeekMinutes());
    setTodayMins(getTodayMinutes());
    setDayData(getWeekDayData());
  },[trackingRefresh]);

  // Load cached AI target
  useEffect(()=>{
    const key=`orion_weektarget_${getTodayKey()}_${stressLevel}`;
    const cached=localStorage.getItem(key);
    if(cached){setWeekTarget(parseInt(cached));return;}
  },[stressLevel]);

  async function generateTarget() {
    setLoadingTarget(true);
    const key=`orion_weektarget_${getTodayKey()}_${stressLevel}`;
    try {
      const r=await callClaude(
        [{role:"user",content:`User stress/emotional state: "${stressLevel}". Current weekly calm/focus minutes logged: ${weekMins}. Recommend a realistic weekly target in minutes for calm, focused, or disciplined activity. Return ONLY a number between 300 and 2100 (representing minutes). No text.`}],
        "You are a wellness strategist. Return only a plain integer number of minutes as the weekly target. No words, no units, just the number.",100
      );
      const mins=parseInt(r.trim().replace(/[^0-9]/g,""));
      const target=isNaN(mins)?840:Math.max(300,Math.min(2100,mins));
      localStorage.setItem(key,String(target));
      setWeekTarget(target);
    } catch { setWeekTarget(840); }
    setLoadingTarget(false);
  }

  const maxDay=Math.max(...dayData.map(d=>d.mins),1);
  const pct=weekTarget?Math.min(1,weekMins/weekTarget):0;

  return (
    <Card className="fadeUp fadeUp-1" style={{marginBottom:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
        <div>
          <Label>Weekly Wellness Tracker</Label>
          <h3 style={{fontFamily:T.serif,fontSize:20,fontWeight:300,color:T.text,margin:0}}>7-Day Overview</h3>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontFamily:T.body,fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase",color:T.textDim,marginBottom:4}}>This Week</div>
          <div style={{fontFamily:T.serif,fontSize:26,fontWeight:300,color:T.gold}}>{fmtMins(weekMins)}</div>
        </div>
      </div>

      {/* Day bars */}
      <div style={{display:"flex",gap:8,alignItems:"flex-end",height:80,marginBottom:20}}>
        {dayData.map((d,i)=>(
          <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <div style={{fontFamily:T.body,fontSize:9,color:T.goldDim,opacity:d.mins>0?1:0,whiteSpace:"nowrap"}}>{d.mins>0?fmtMins(d.mins):""}</div>
            <div style={{width:"100%",height:`${Math.max(4,(d.mins/maxDay)*60)}px`,background:d.isToday?"rgba(212,175,100,0.7)":`rgba(212,175,100,${0.15+(d.mins/maxDay)*0.3})`,borderRadius:"3px 3px 0 0",transition:"height 0.8s ease",border:d.isToday?"1px solid rgba(212,175,100,0.4)":"none"}} />
            <div style={{fontFamily:T.body,fontSize:9,color:d.isToday?T.gold:T.textDim,fontWeight:d.isToday?"500":"normal"}}>{d.label}</div>
          </div>
        ))}
      </div>

      {/* Target section */}
      <div style={{borderTop:`1px solid ${T.border}`,paddingTop:20}}>
        <div style={{display:"flex",gap:20,alignItems:"center",flexWrap:"wrap"}}>
          {/* Ring */}
          <div style={{position:"relative",width:100,height:100,flexShrink:0}}>
            <WeeklyRing actual={weekMins} target={weekTarget||840} size={100} />
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontFamily:T.serif,fontSize:16,fontWeight:300,color:pct>=1?"rgba(180,220,160,0.9)":T.gold}}>{Math.round(pct*100)}%</div>
              <div style={{fontFamily:T.body,fontSize:8,letterSpacing:"0.1em",color:T.textDim,textTransform:"uppercase"}}>of goal</div>
            </div>
          </div>
          <div style={{flex:1,minWidth:180}}>
            <div style={{fontFamily:T.body,fontSize:12,color:T.textMid,marginBottom:10}}>
              <span style={{color:T.gold}}>{fmtMins(weekMins)}</span> logged this week
              {weekTarget&&<> · Target: <span style={{color:T.goldDim}}>{fmtMins(weekTarget)}</span></>}
            </div>
            <div style={{marginBottom:12}}>
              <Label style={{marginBottom:6,fontSize:9}}>Your current state</Label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["calm","moderate","stressed","anxious","overwhelmed"].map(s=>(
                  <button key={s} onClick={()=>setStressLevel(s)} style={{padding:"4px 12px",background:stressLevel===s?T.goldFaint:"transparent",border:`1px solid ${stressLevel===s?"rgba(212,175,100,0.35)":T.border}`,borderRadius:20,fontFamily:T.body,fontSize:11,color:stressLevel===s?T.gold:T.textDim,cursor:"pointer",transition:"all 0.2s",textTransform:"capitalize"}}>{s}</button>
                ))}
              </div>
            </div>
            <GoldBtn onClick={generateTarget} loading={loadingTarget} style={{fontSize:10,padding:"7px 16px"}}>
              {weekTarget?"Recalculate Target":"Get AI Target"}
            </GoldBtn>
          </div>
        </div>
        {weekTarget&&(
          <div style={{marginTop:14,padding:"10px 14px",background:T.goldFaint,borderRadius:6,display:"flex",gap:10,alignItems:"center"}}>
            <span style={{color:T.goldDim,fontSize:12}}>✦</span>
            <p style={{fontFamily:T.body,fontSize:13,color:T.textMid,margin:0,fontStyle:"italic"}}>
              {stressLevel==="calm"&&`Great foundation. Your ${fmtMins(weekTarget)} weekly target maintains your equilibrium.`}
              {stressLevel==="moderate"&&`Steady progress. Aim for ${fmtMins(weekTarget)} this week to build resilience.`}
              {stressLevel==="stressed"&&`Elevated stress detected. Orion recommends ${fmtMins(weekTarget)} of calm practice to restore balance.`}
              {stressLevel==="anxious"&&`Anxiety calls for more stillness. Your ${fmtMins(weekTarget)} target prioritizes nervous system recovery.`}
              {stressLevel==="overwhelmed"&&`Start small, move gently. Your ${fmtMins(weekTarget)} target is calibrated for sustainable restoration.`}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ════════════════ DASHBOARD ═════════════════════════════════════ */
function Dashboard({ profile, vaultNotes, trackingRefresh }) {
  const hour=new Date().getHours();
  const greeting=hour<12?"Good morning":hour<18?"Good afternoon":"Good evening";
  const todayMins=getTodayMinutes();

  return (
    <div>
      <div className="fadeUp" style={{marginBottom:44}}>
        <p style={{fontFamily:T.body,fontSize:12,letterSpacing:"0.28em",textTransform:"uppercase",color:T.goldDim,marginBottom:8}}>{greeting}</p>
        <h1 style={{fontFamily:T.serif,fontSize:"clamp(26px,4vw,42px)",fontWeight:300,color:T.text,letterSpacing:"0.04em"}}>Your Observatory</h1>
        <p style={{fontFamily:T.body,fontSize:14,fontStyle:"italic",color:T.textDim,marginTop:8}}>{profile?.primaryGoal?`Focused on: ${profile.primaryGoal}`:"The stars align for those who move with intention."}</p>
      </div>

      {/* Stats */}
      <div className="fadeUp fadeUp-1" style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:20}}>
        {[
          {label:"Focus Today",val:fmtMins(todayMins),sub:"Resets at midnight",accent:true},
          {label:"This Week",val:fmtMins(getWeekMinutes()),sub:"7-day total"},
          {label:"Active Goals",val:"4",sub:"2 nearing completion"},
          {label:"Streak",val:"9d",sub:"Personal best approaching",accent:true},
        ].map(s=>(
          <Card key={s.label} style={{flex:1,minWidth:140,padding:"22px 20px"}}>
            <Label style={{marginBottom:8}}>{s.label}</Label>
            <div style={{fontFamily:T.serif,fontSize:30,fontWeight:300,color:s.accent?T.gold:T.text,lineHeight:1}}>{s.val}</div>
            {s.sub&&<div style={{fontFamily:T.body,fontSize:11,color:T.textDim,marginTop:6,fontStyle:"italic"}}>{s.sub}</div>}
          </Card>
        ))}
      </div>

      <WeeklyDashboard trackingRefresh={trackingRefresh} />
      <DailyQuote profile={profile} />
      <DailyInsight profile={profile} />
      <DailyReading profile={profile} />

      <div style={{marginTop:16}}>
        <AIStrategist profile={profile} vaultNotes={vaultNotes} />
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginTop:16}}>
        <Card className="fadeUp">
          <Label>Evolution Progress</Label>
          {[["Mental Clarity",72],["Discipline",58],["Creative Output",85]].map(([trait,pct])=>(
            <div key={trait} style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontFamily:T.body,fontSize:13,color:T.textMid}}>{trait}</span>
                <span style={{fontFamily:T.body,fontSize:11,color:T.goldDim}}>{pct}%</span>
              </div>
              <div style={{height:2,background:T.goldFaint,borderRadius:1}}>
                <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,rgba(212,175,100,0.35),rgba(212,175,100,0.75))",borderRadius:1}} />
              </div>
            </div>
          ))}
        </Card>
        <Card className="fadeUp fadeUp-1">
          <Label>Recent Activity</Label>
          {[{time:"2h ago",action:"Focus Session",detail:"Deep Work · 90 min"},{time:"Yesterday",action:"Evening Reflection",detail:"3 insights captured"},{time:"2 days ago",action:"Identity Update",detail:"Revised: Discipline"}].map((a,i)=>(
            <div key={i} style={{display:"flex",gap:16,padding:"11px 0",borderBottom:i<2?`1px solid ${T.border}`:"none"}}>
              <span style={{fontFamily:T.body,fontSize:10,color:T.textDim,minWidth:72,letterSpacing:"0.05em",paddingTop:2}}>{a.time}</span>
              <div><div style={{fontFamily:T.body,fontSize:13,color:T.textMid}}>{a.action}</div><div style={{fontFamily:T.body,fontSize:11,color:T.goldDim,marginTop:2,fontStyle:"italic"}}>{a.detail}</div></div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ════════════════ FOCUS MODULE (with real tracking) ════════════ */
function FocusModule({ onMinutesLogged }) {
  const [running,setRunning]=useState(false);
  const [secs,setSecs]=useState(90*60);
  const [mode,setMode]=useState("Deep Work");
  const [todayMins,setTodayMins]=useState(()=>getTodayMinutes());
  const [sessions,setSessions]=useState([]);
  const [sound,setSound]=useState("Silence");
  const timerRef=useRef(null);
  const sessionStartRef=useRef(0);

  // Midnight reset check
  useEffect(()=>{
    const checkMidnight=()=>{
      const now=new Date();
      const msUntilMidnight=(new Date(now.getFullYear(),now.getMonth(),now.getDate()+1)-now);
      return setTimeout(()=>{
        setTodayMins(0); // UI reset — storage already keyed to date
        onMinutesLogged?.();
      },msUntilMidnight);
    };
    const t=checkMidnight();
    return ()=>clearTimeout(t);
  },[]);

  useEffect(()=>{
    if(running){
      sessionStartRef.current=Date.now();
      timerRef.current=setInterval(()=>{
        setSecs(s=>{
          if(s<=1){
            const elapsed=Math.round((Date.now()-sessionStartRef.current)/60000);
            const newTotal=addMinutesToday(elapsed);
            setTodayMins(newTotal);
            onMinutesLogged?.();
            setSessions(prev=>[{mode,duration:`${durations[mode]} min`,time:new Date().toTimeString().slice(0,5),mins:elapsed},...prev]);
            setRunning(false); return 0;
          }
          return s-1;
        });
      },1000);
    } else { clearInterval(timerRef.current); }
    return ()=>clearInterval(timerRef.current);
  },[running]);

  const durations={["Deep Work"]:90,["Creative Flow"]:60,["Reading"]:45,["Contemplation"]:30};
  const totalSecs=durations[mode]*60;
  const pct=1-secs/totalSecs;

  function startNew(m){setMode(m);setRunning(false);setSecs(durations[m]*60);}

  function completeEarly(){
    const elapsed=Math.round((Date.now()-sessionStartRef.current)/60000);
    if(elapsed>0){
      const newTotal=addMinutesToday(elapsed);
      setTodayMins(newTotal);
      onMinutesLogged?.();
      setSessions(prev=>[{mode,duration:`${elapsed} min`,time:new Date().toTimeString().slice(0,5),mins:elapsed},...prev]);
    }
    setRunning(false); setSecs(durations[mode]*60);
  }

  const SOUNDS=[
    {id:"Silence",label:"Silence",desc:"Pure quiet"},
    {id:"Rain",label:"Rain",desc:"Soft rainfall"},
    {id:"Ocean",label:"Ocean Waves",desc:"Rhythmic shore"},
    {id:"Forest",label:"Forest Wind",desc:"Birdsong & breeze"},
    {id:"DeepSpace",label:"Deep Space",desc:"Harmonic drone"},
    {id:"Fireplace",label:"Fireplace",desc:"Warm crackling"},
  ];

  function selectSound(id){
    ambientEngine.stop();
    setSound(id);
    if(running&&id!=="Silence"){
      if(id==="Rain")ambientEngine.playRain();
      else if(id==="Ocean")ambientEngine.playOcean();
      else if(id==="Forest")ambientEngine.playForest();
      else if(id==="DeepSpace")ambientEngine.playDeepSpace();
      else if(id==="Fireplace")ambientEngine.playFireplace();
    }
  }

  useEffect(()=>{
    if(running&&sound!=="Silence"){
      if(sound==="Rain")ambientEngine.playRain();
      else if(sound==="Ocean")ambientEngine.playOcean();
      else if(sound==="Forest")ambientEngine.playForest();
      else if(sound==="DeepSpace")ambientEngine.playDeepSpace();
      else if(sound==="Fireplace")ambientEngine.playFireplace();
    } else if(!running){ambientEngine.stop();}
  },[running]);

  return (
    <div>
      <SectionHead title="Focus Chamber" sub="Enter the state of undivided attention." />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        <Card className="fadeUp" style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"44px 28px"}}>
          <div style={{position:"relative",width:190,height:190,marginBottom:32}}>
            <svg width="190" height="190" style={{transform:"rotate(-90deg)"}}>
              <circle cx="95" cy="95" r="84" fill="none" stroke="rgba(212,175,100,0.05)" strokeWidth="2" />
              <circle cx="95" cy="95" r="84" fill="none" stroke="rgba(212,175,100,0.65)" strokeWidth="1.5"
                strokeDasharray={`${2*Math.PI*84}`}
                strokeDashoffset={`${2*Math.PI*84*(1-pct)}`}
                strokeLinecap="round" style={{transition:"stroke-dashoffset 1s linear"}} />
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontFamily:T.serif,fontSize:30,fontWeight:300,color:T.text,letterSpacing:"0.05em"}}>{fmtSecs(secs)}</div>
              <div style={{fontFamily:T.body,fontSize:10,letterSpacing:"0.2em",color:T.goldDim,textTransform:"uppercase",marginTop:6}}>{mode}</div>
              {running&&<div style={{width:5,height:5,borderRadius:"50%",background:T.gold,marginTop:8,animation:"pulseGold 1.5s ease-in-out infinite"}} />}
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginBottom:running?12:0}}>
            <GoldBtn onClick={()=>setRunning(r=>!r)}>{running?"Pause":"Begin Session"}</GoldBtn>
            <GoldBtn onClick={()=>{setRunning(false);setSecs(durations[mode]*60);}}>Reset</GoldBtn>
          </div>
          {running&&<GoldBtn onClick={completeEarly} style={{fontSize:10,marginTop:8}}>Complete Early</GoldBtn>}
          <div style={{marginTop:24,padding:"12px 20px",background:T.goldFaint,borderRadius:6,textAlign:"center"}}>
            <div style={{fontFamily:T.body,fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase",color:T.textDim,marginBottom:4}}>Total Focus Today</div>
            <div style={{fontFamily:T.serif,fontSize:22,fontWeight:300,color:T.gold}}>{fmtMins(todayMins)}</div>
            <div style={{fontFamily:T.body,fontSize:9,color:T.textDim,marginTop:3,fontStyle:"italic"}}>Resets at midnight</div>
          </div>
        </Card>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card className="fadeUp fadeUp-1">
            <Label>Session Mode</Label>
            {Object.entries(durations).map(([m,d])=>(
              <button key={m} onClick={()=>startNew(m)} style={{display:"flex",width:"100%",textAlign:"left",background:mode===m?T.goldFaint:"transparent",border:`1px solid ${mode===m?"rgba(212,175,100,0.25)":"transparent"}`,borderRadius:6,padding:"9px 12px",cursor:"pointer",marginBottom:5,fontFamily:T.body,fontSize:13,letterSpacing:"0.06em",color:mode===m?T.gold:T.textDim,transition:"all 0.2s",justifyContent:"space-between"}}>
                <span>{m}</span><span style={{opacity:0.5}}>{d}m</span>
              </button>
            ))}
          </Card>

          <Card className="fadeUp fadeUp-2">
            <Label>Ambient Sound</Label>
            {SOUNDS.map(s=>(
              <div key={s.id} onClick={()=>selectSound(s.id)} style={{padding:"9px 0",borderBottom:`1px solid ${T.border}`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",transition:"all 0.2s"}}>
                <div>
                  <div style={{fontFamily:T.body,fontSize:13,color:sound===s.id?T.gold:T.textDim,transition:"color 0.2s"}}>{s.label}</div>
                  <div style={{fontFamily:T.body,fontSize:10,color:T.textDim,fontStyle:"italic"}}>{s.desc}</div>
                </div>
                {sound===s.id&&<span style={{fontSize:8,color:T.goldDim,animation:"pulseGold 2s infinite"}}>●</span>}
              </div>
            ))}
            {sound!=="Silence"&&(
              <div style={{marginTop:12}}>
                <Label style={{marginBottom:6,fontSize:9}}>Volume</Label>
                <input type="range" min="0" max="1" step="0.05" defaultValue="0.5"
                  onChange={e=>ambientEngine.setVolume(parseFloat(e.target.value))}
                  style={{width:"100%"}} />
              </div>
            )}
          </Card>
        </div>
      </div>

      {sessions.length>0&&(
        <Card className="fadeUp fadeUp-3">
          <Label>Session History — Today</Label>
          {sessions.map((s,i)=>(
            <div key={i} style={{display:"flex",gap:20,padding:"10px 0",borderBottom:i<sessions.length-1?`1px solid ${T.border}`:"none"}}>
              <span style={{fontFamily:T.body,fontSize:11,color:T.textDim,minWidth:44}}>{s.time}</span>
              <span style={{fontFamily:T.body,fontSize:13,color:T.textMid}}>{s.mode}</span>
              <span style={{fontFamily:T.body,fontSize:12,color:T.goldDim,marginLeft:"auto"}}>{s.duration}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

/* ════════════════ AMBIENT MODULE (standalone) ══════════════════ */
const AMBIENT_ENVIRONMENTS = [
  {id:"Rain",     label:"Rain",           desc:"Soft rainfall on leaves — for deep concentration and mental calm.",   icon:"🌧", color:"rgba(100,160,220,0.15)"},
  {id:"Ocean",    label:"Ocean Waves",    desc:"Rhythmic tidal breathing — mirrors the body's natural rhythm.",       icon:"🌊", color:"rgba(80,140,200,0.12)"},
  {id:"Forest",   label:"Forest Wind",    desc:"Birdsong and rustling trees — awakens presence and grounding.",       icon:"🌲", color:"rgba(80,160,100,0.12)"},
  {id:"DeepSpace",label:"Deep Space",     desc:"Harmonic drone — dissolves mental noise, induces flow states.",       icon:"✦",  color:"rgba(100,80,180,0.12)"},
  {id:"Fireplace",label:"Fireplace",      desc:"Warm crackling — comfort, safety, and creative warmth.",              icon:"🔥", color:"rgba(200,120,60,0.12)"},
  {id:"Bowls",    label:"Tibetan Bowls",  desc:"Resonant healing tones — meditation and nervous system reset.",      icon:"◎",  color:"rgba(212,175,100,0.1)"},
];

function AmbientModule() {
  const [active,setActive]=useState(null);
  const [volume,setVolume]=useState(0.5);
  const [timer,setTimer]=useState(0); // minutes, 0=no limit
  const [elapsed,setElapsed]=useState(0);
  const [playing,setPlaying]=useState(false);
  const timerRef=useRef(null);

  function play(id){
    ambientEngine.stop();
    setActive(id); setPlaying(true); setElapsed(0);
    ambientEngine.setVolume(volume);
    if(id==="Rain")ambientEngine.playRain();
    else if(id==="Ocean")ambientEngine.playOcean();
    else if(id==="Forest")ambientEngine.playForest();
    else if(id==="DeepSpace")ambientEngine.playDeepSpace();
    else if(id==="Fireplace")ambientEngine.playFireplace();
    else if(id==="Bowls")ambientEngine.playBowls();
  }

  function stop(){
    ambientEngine.stop(); setPlaying(false);
    clearInterval(timerRef.current);
  }

  function togglePlay(){
    if(playing){stop();}
    else if(active){play(active);}
  }

  useEffect(()=>{
    clearInterval(timerRef.current);
    if(playing){
      timerRef.current=setInterval(()=>{
        setElapsed(e=>{
          const next=e+1;
          if(timer>0&&next>=timer*60){stop();return 0;}
          return next;
        });
      },1000);
    }
    return ()=>clearInterval(timerRef.current);
  },[playing,timer]);

  useEffect(()=>{ambientEngine.setVolume(volume);},[volume]);
  useEffect(()=>{return ()=>ambientEngine.stop();},[]);

  const fmtElapsed=s=>`${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;

  return (
    <div>
      <SectionHead title="Ambient Sanctuary" sub="Immersive soundscapes for deep states of being." />

      {/* Environments grid */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
        {AMBIENT_ENVIRONMENTS.map((env,i)=>{
          const isActive=active===env.id;
          return (
            <Card key={env.id} className={`fadeUp fadeUp-${i%5+1}`}
              onClick={()=>{ if(isActive&&playing){stop();}else{play(env.id);} }}
              style={{padding:"20px 18px",cursor:"pointer",background:isActive?`${env.color}`:"rgba(12,15,22,0.9)",borderColor:isActive?"rgba(212,175,100,0.25)":T.border,transition:"all 0.4s ease"}}>
              <div style={{fontSize:22,marginBottom:10,display:"block"}}>{env.icon}</div>
              <div style={{fontFamily:T.serif,fontSize:15,fontWeight:300,color:isActive?T.text:T.textMid,marginBottom:6}}>{env.label}</div>
              <p style={{fontFamily:T.body,fontSize:11,color:T.textDim,lineHeight:1.5,margin:0,fontStyle:"italic"}}>{env.desc}</p>
              {isActive&&playing&&(
                <div style={{marginTop:10,display:"flex",alignItems:"center",gap:6}}>
                  <div style={{width:4,height:4,borderRadius:"50%",background:T.gold,animation:"pulseGold 1.2s infinite"}} />
                  <span style={{fontFamily:T.body,fontSize:10,color:T.gold,letterSpacing:"0.15em"}}>PLAYING</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Player controls */}
      {active&&(
        <Card className="fadeUp" style={{padding:"24px 28px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16}}>
            <div>
              <Label style={{marginBottom:4}}>Now Playing</Label>
              <div style={{fontFamily:T.serif,fontSize:18,fontWeight:300,color:T.text}}>{AMBIENT_ENVIRONMENTS.find(e=>e.id===active)?.label}</div>
              <div style={{fontFamily:T.body,fontSize:12,color:T.goldDim,marginTop:4,letterSpacing:"0.1em"}}>{playing?fmtElapsed(elapsed):"Paused"}</div>
            </div>
            <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
              <GoldBtn onClick={togglePlay} style={{minWidth:100}}>{playing?"Pause":"Resume"}</GoldBtn>
              <GoldBtn onClick={stop}>Stop</GoldBtn>
            </div>
          </div>

          <div style={{marginTop:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <div>
              <Label style={{marginBottom:8}}>Volume</Label>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontFamily:T.body,fontSize:10,color:T.textDim}}>○</span>
                <input type="range" min="0" max="1" step="0.02" value={volume}
                  onChange={e=>setVolume(parseFloat(e.target.value))} style={{flex:1}} />
                <span style={{fontFamily:T.body,fontSize:10,color:T.textDim}}>◉</span>
              </div>
            </div>
            <div>
              <Label style={{marginBottom:8}}>Auto-stop Timer</Label>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[0,10,20,30,45,60].map(m=>(
                  <button key={m} onClick={()=>setTimer(m)} style={{padding:"4px 10px",background:timer===m?T.goldFaint:"transparent",border:`1px solid ${timer===m?"rgba(212,175,100,0.3)":T.border}`,borderRadius:3,fontFamily:T.body,fontSize:11,color:timer===m?T.gold:T.textDim,cursor:"pointer",transition:"all 0.2s"}}>
                    {m===0?"∞":`${m}m`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   PODCAST SYSTEM v2 — Web Speech API TTS engine
   • All spoken content is clean, structured, meaningful
   • Daily rotation (2 new picks per calendar day)
   • Continue Listening — persists timestamp to localStorage
   • Themed library (Calmness / Discipline / Reflection / Focus / Mindset)
   • Full player: play/pause, seek, skip ±30s, volume, waveform animation
════════════════════════════════════════════════════════════════ */

// ── Podcast storage helpers ──────────────────────────────────────
const PC_PROGRESS_KEY = "orion_podcast_progress_v2";

function loadPodcastProgress() {
  try { return JSON.parse(localStorage.getItem(PC_PROGRESS_KEY) || "{}"); }
  catch { return {}; }
}
function savePodcastProgress(id, charIndex, totalChars) {
  const data = loadPodcastProgress();
  data[id] = { charIndex, totalChars, savedAt: Date.now() };
  try { localStorage.setItem(PC_PROGRESS_KEY, JSON.stringify(data)); } catch {}
}
function clearPodcastProgress(id) {
  const data = loadPodcastProgress();
  delete data[id];
  try { localStorage.setItem(PC_PROGRESS_KEY, JSON.stringify(data)); } catch {}
}

// ── Full spoken-word podcast library ────────────────────────────
// Each episode has structured intro + body paragraphs + closing.
// Text is read aloud via Web Speech API — 100% clean spoken content.
const PODCAST_LIBRARY = [
  // ── CALMNESS ─────────────────────────────────────────────────
  {
    id: "c1", theme: "Calmness", title: "The Art of Returning to Stillness",
    host: "Orion Sessions", duration: "~8 min",
    desc: "A guided reflection on how stillness is not an absence but a skill — one that can be practiced and deepened every day.",
    script: `Welcome to Orion Sessions. Find a comfortable position, allow your breath to soften, and give yourself full permission to arrive in this moment.

Today we explore the art of returning to stillness.

Most of us believe that calmness is something that happens to us — a state we stumble into when circumstances are favorable, when the work is done, when the noise finally stops. But that understanding is incomplete. Stillness is not a reward that arrives when the world cooperates. It is a discipline. A practice. A skill that deepens with use.

The ancient Stoics understood this well. Marcus Aurelius, writing to himself in the evenings after days filled with the weight of empire, did not wait for silence to find him. He created it — in the space between events, in the pause before response, in the deliberate act of returning his attention to what he could control. You have power over your mind, not outside events, he wrote. Realize this, and you will find strength.

Notice what happens in your body right now as you listen. There may be tension in the shoulders, a subtle urgency somewhere, the residue of the day's demands pressing at the edges of your awareness. This is normal. This is human. But it is not permanent.

The practice of returning to stillness begins with one simple act: noticing. Not judging, not suppressing, not explaining — simply noticing that you have drifted, and choosing to return. This is the entire practice, repeated endlessly, and each return is not a failure but a success.

Breath by breath, moment by moment, we are always practicing something. The question is whether we are practicing reactivity — or practicing stillness.

When you leave this session, carry one intention with you: that at least once today, before you respond to something that demands your attention, you will pause. One full breath. One moment of choosing rather than reacting. That single practice, sustained over time, builds the architecture of a calmer life.

You are not behind. You are not late. You are exactly where the practice asks you to be.

Rest here for a moment before you continue. The stillness is yours.`,
  },
  {
    id: "c2", theme: "Calmness", title: "Breathing as an Anchor",
    host: "Orion Sessions", duration: "~6 min",
    desc: "How the breath connects body and mind, and why returning to it in difficult moments is one of the most powerful things you can do.",
    script: `Welcome. Before we begin, take one deliberate breath — slow, full, and conscious. Let that breath be your signal that you are transitioning from doing into being.

Today we speak about the breath as an anchor.

The breath is perhaps the most underestimated tool available to any human being. It is always present. It requires no equipment, no preparation, no ideal conditions. It is the one process in the body that operates both automatically and voluntarily — meaning it bridges the unconscious and the conscious in a way nothing else does.

When we are afraid, the breath shortens. When we are angry, it quickens. When we grieve, it catches. The breath is a faithful reporter of our inner state — and, crucially, it is a lever we can pull in return. By consciously slowing and deepening the breath, we send a signal through the vagus nerve to the nervous system: safety. Calm. No emergency here.

This is not metaphor. This is physiology.

The practice is simple, though not always easy. When you feel the pull of anxiety, the rising heat of frustration, the scattered energy of overwhelm — before you do anything else, anchor to the breath. Four counts in through the nose. Hold for four. Six counts out through the mouth. Repeat three times.

In that small window, something remarkable happens. The prefrontal cortex — the seat of reason, perspective, and wisdom — reasserts itself. The reactive mind softens. What felt urgent may still require attention, but it no longer requires panic.

Over time, this practice reshapes how you move through difficulty. Not by removing it, but by ensuring that you meet it from a stable center rather than a reactive one.

The breath is always here. It has been with you through every difficult moment of your life. It carried you through every one of them.

Trust it. Return to it. Let it be your anchor.`,
  },

  // ── DISCIPLINE ───────────────────────────────────────────────
  {
    id: "d1", theme: "Discipline", title: "The Quiet Power of Small Commitments",
    host: "The Becoming", duration: "~9 min",
    desc: "Why discipline is not about grand gestures but about the small, unglamorous choices made daily — and how they compound into transformation.",
    script: `Welcome to The Becoming. I'm glad you're here. Settle in, and let us begin.

Today we speak about the quiet power of small commitments.

There is a common misconception about discipline — that it looks like dramatic sacrifice, enormous willpower, and heroic consistency. That the disciplined person never wavers, never doubts, never feels the pull of distraction. This image is not only inaccurate, it is harmful. Because it sets an impossible standard, and when we inevitably fall short of that standard, we conclude that we are simply not disciplined people.

The truth is far less dramatic and far more encouraging.

Discipline is not a character trait granted at birth to a fortunate few. It is a practice — a series of small, daily choices that accumulate invisibly over time until they become the architecture of a life.

Consider the writer who sits down to write each morning — not because inspiration strikes, not because conditions are perfect, but because it is nine o'clock and nine o'clock is writing time. The athlete who laces up in the cold dark morning not with a surge of motivation but with quiet resolve. The practitioner of stillness who, even when the meditation is shallow and the mind restless, shows up to the cushion because they said they would.

These are not dramatic acts. They will never be photographed or celebrated. But they are the actual substance of a disciplined life.

James Clear, in his work on habits and identity, observed that every action you take is a vote for the type of person you wish to become. You don't need a majority in a single day. You just need to keep casting votes.

What this means in practice is that a missed day is not a failure — it is a data point. A five-minute practice when you planned thirty minutes is still a practice. Beginning again after weeks of stopping is not starting over — it is continuing.

The discipline that lasts is not rigid. It is resilient. It bends without breaking. It returns without drama.

Today, choose one small commitment. Something specific, something concrete, something you can honor in the next twenty-four hours. Not a sweeping life overhaul — just one small promise kept to yourself.

That promise, honored, is the beginning of everything.`,
  },
  {
    id: "d2", theme: "Discipline", title: "On Doing the Hard Thing First",
    host: "The Becoming", duration: "~7 min",
    desc: "The philosophy and neuroscience behind why tackling your most demanding work at the start of the day transforms everything that follows.",
    script: `Welcome. Let us begin with a question. Think about your day yesterday — was there something important you kept deferring? Something that needed your best attention, but instead received your leftover energy at the end?

If so, you are not alone. And today we explore why this pattern exists, and how to break it.

The concept of eating the frog — a phrase made popular by productivity writer Brian Tracy — is deceptively simple. It suggests that the most effective thing you can do each morning is to tackle your most difficult, most dreaded task before anything else. Before email. Before the news. Before small wins that create the illusion of progress.

The neuroscience supports this completely. In the first hours after waking, the prefrontal cortex — responsible for complex reasoning, creative problem-solving, and focused attention — is at its most capable. Decision fatigue has not yet set in. Cortisol levels follow a natural morning peak that sharpens alertness. Willpower, which research suggests functions like a muscle, is fully rested.

By late afternoon, these resources are depleted. The hardest work, done then, will take twice as long and produce half the quality.

But there is something deeper here than neuroscience. Doing the hard thing first is a statement to yourself about who you are. It says: I am someone who chooses difficulty when difficulty is what is needed. I am not managed by comfort. I am not a servant of ease.

This matters because identity shapes behavior more powerfully than motivation ever can. Motivation comes and goes. Identity — the story we tell about who we are — provides a consistent framework for decisions.

The practice is this: each evening, identify the one task tomorrow that you most want to avoid. The difficult conversation, the complex work, the creative challenge that feels uncertain. Write it down. Place it first on your morning list.

Then, tomorrow morning, before anything else, begin.

You will likely find that the anticipation was worse than the task itself. You will almost certainly finish the day feeling more grounded, more capable, more like the person you intend to become.

The hard thing done early is a gift to your future self. Start tomorrow with that gift.`,
  },

  // ── REFLECTION ───────────────────────────────────────────────
  {
    id: "r1", theme: "Reflection", title: "The Practice of Evening Review",
    host: "Orion Sessions", duration: "~8 min",
    desc: "Drawing from Marcus Aurelius and modern psychology: why reviewing your day with honest compassion is one of the most transformative practices available.",
    script: `Welcome back to Orion Sessions. This episode is best experienced in the evening — though whenever you are listening, allow yourself to settle into a reflective posture.

Today we explore the practice of evening review.

Marcus Aurelius was one of the most powerful men in the ancient world — and yet each evening, before sleep, he sat with his journal and examined his day. Not to catalog achievements. Not to punish himself for failures. But to understand, clearly and honestly, where his actions aligned with his values and where they did not.

This practice — known in Stoic philosophy as the daily examination — is among the most ancient and enduring tools for personal growth. And modern psychology has rediscovered why it works.

When we review our day, we engage a part of the brain called the default mode network — the same network involved in imagination, empathy, and the construction of meaning. This network helps us extract patterns from experience, consolidate learning, and connect what happened today to the larger narrative of who we are becoming.

Without this review, days blur together. Lessons remain unlearned. Patterns persist unexamined.

The practice is simple. At the end of each day, find five quiet minutes. Ask yourself three questions.

Where did I act in alignment with the person I intend to be? Name something specific. Let yourself feel the satisfaction of that.

Where did I fall short? Not to condemn yourself, but to understand. What circumstance, what emotion, what belief, led you there?

What will I do differently tomorrow? One specific, concrete intention.

That is the entire practice. No elaborate journaling required. No performance. Just honest, compassionate attention.

Over time, this practice does something remarkable. It accelerates growth not by adding more effort but by extracting more learning from the effort already given. The same experiences that once simply passed through you begin to teach you.

You are not just living your life. You are studying it.

And a life studied is a life transformed.

Close your eyes for just a moment. Ask yourself: what is the one thing from today that most deserves my honest reflection? Let the answer arise without force.

That is where tomorrow's growth begins.`,
  },
  {
    id: "r2", theme: "Reflection", title: "What Silence Reveals",
    host: "Orion Sessions", duration: "~7 min",
    desc: "A meditation on why modern people fear silence — and what becomes available when we learn to sit with it without filling it.",
    script: `Welcome. I want to begin today with an observation, not a question.

Most people in the modern world are almost never in silence. Not true silence. There is always a podcast, a playlist, a notification, a screen. The space between thoughts — which used to be filled with gentle awareness — is now filled immediately with more content.

This is not an accident. It is, in part, by design. The attention economy depends on our discomfort with silence. It profits from our habit of filling every available moment with stimulation.

But there is a cost.

Silence is not empty. Silence is full — full of the things we have not yet allowed ourselves to notice. The grief we have been outrunning. The creative ideas that require stillness to surface. The subtle sense of what we actually want, beneath the noise of what we think we should want.

The philosopher Blaise Pascal wrote, in the seventeenth century, that all of humanity's problems stem from the inability to sit quietly in a room alone. He was not being hyperbolic. He was identifying something real: our flight from inner experience is the source of enormous unnecessary suffering.

The good news is that silence, like most things, is a practice. You do not need to achieve perfect stillness immediately. You simply need to tolerate a little more of it each day.

Begin with two minutes. Set a timer, put down every device, and simply sit. Notice what arises. Boredom. Restlessness. Fragments of thought. Let them move through without catching them, without feeding them.

What you are practicing is not meditation in the formal sense — though it resembles it. You are practicing presence. The ability to be with yourself without immediately escaping.

And over time, as this practice deepens, something begins to emerge. A clearer sense of your own values. A quieter relationship with anxiety. A creativity that requires space to exist.

The answers you have been searching for externally — in books, in advice, in distraction — very often live in the silence you have been avoiding.

Give yourself two minutes of it today. Just two. And notice what speaks.`,
  },

  // ── FOCUS ────────────────────────────────────────────────────
  {
    id: "f1", theme: "Focus", title: "The Architecture of Deep Work",
    host: "Focus Dialogues", duration: "~9 min",
    desc: "How to build the internal and external conditions for sustained, undistracted attention — and why depth is the rarest and most valuable skill of our era.",
    script: `Welcome to Focus Dialogues. I'm glad you've set aside this time.

The topic today is one of the most important of our era: the architecture of deep work.

Cal Newport, in his seminal work on this subject, defines deep work as professional activity performed in a state of distraction-free concentration that pushes your cognitive capabilities to their limit. These efforts, he argues, create new value, improve your skill, and are hard to replicate.

Contrast this with what he calls shallow work — logistical tasks that can be performed while distracted. Answering emails. Attending most meetings. Scrolling social platforms. These activities feel productive but rarely produce anything of lasting value.

The uncomfortable truth is that the modern workplace is almost perfectly designed to prevent deep work. Open offices, constant notifications, the expectation of immediate availability — these are architectures of distraction. And distraction, unlike most obstacles, does not announce itself. It simply arrives, steals your attention, and leaves you wondering where the afternoon went.

So how do we build the architecture of depth?

First, we ritualize. The most productive creators and thinkers in history did not wait for inspiration before beginning their most important work. They built rituals — specific times, specific places, specific signals that told the mind: now we go deep. Beethoven walked every morning before composing. Darwin worked in three ninety-minute blocks with mandatory rest between. Haruki Murakami wakes at four in the morning, writes for five to six hours, and considers any deviation from this schedule a creative betrayal.

The ritual is not about willpower. It is about reducing the friction between intention and action until beginning becomes automatic.

Second, we protect. Deep work requires defended time. Not requested time. Not hoped-for time. Defended time — blocks in your calendar that you treat as non-negotiable commitments to your most important work.

Third, we train. The ability to focus is not fixed. It is a capacity that atrophies with neglect and strengthens with practice. Every time you choose to resist distraction — every time you notice the pull of your phone and return your attention to the work — you are building focus like a muscle.

Start small. One hour of protected, focused work each day is more valuable than eight hours of fragmented, distracted effort.

What would you build if you had that hour?

That question is worth sitting with.`,
  },
  {
    id: "f2", theme: "Focus", title: "Single-Tasking as Sacred Practice",
    host: "Focus Dialogues", duration: "~6 min",
    desc: "Why multitasking is a myth, what it actually costs your brain, and how the radical act of doing one thing at a time changes everything.",
    script: `Welcome. Let us begin today with a myth worth dismantling.

Multitasking does not exist.

What we call multitasking is, neurologically, rapid task-switching — the brain moving quickly between different focuses, paying a cognitive cost called a switching penalty with each transition. Research by the American Psychological Association suggests that switching tasks can cost as much as forty percent of productive time. Not forty percent of one task. Forty percent of your day.

We are not faster when we multitask. We are slower, more error-prone, and more mentally fatigued.

And yet, the habit persists — because it feels productive. The activity of switching creates stimulation, and stimulation can be mistaken for progress.

The antidote is deceptively simple: do one thing at a time.

When you eat, eat. Not eat and scroll. When you write, write. Not write and check messages. When you are in conversation with someone, be in conversation — not half there and half elsewhere.

This sounds obvious. It is extraordinarily difficult in practice. Because we have trained ourselves, through years of digital behavior, to treat sustained attention as somehow wasteful — as if attending to one thing means missing another.

But here is what single-tasking actually provides: depth. The kind of thinking that only arises when you stay with something long enough for it to reveal its complexity. The creative connections that only form when the mind is not constantly interrupted. The satisfaction of actually finishing something with your full attention given to it.

There is also something more personal here. When we single-task with another person — when we put down our devices and truly attend — we offer something rare and precious: our full presence. People feel the difference. Relationships deepen. Understanding grows.

The practice for today is simple. Choose one activity — one meeting, one creative session, one meal — and give it your complete and undivided attention. Not because it is easy, but because you are choosing to practice.

One thing at a time. It is a radical act in this world. And it is one of the most powerful you can perform.`,
  },

  // ── MINDSET ──────────────────────────────────────────────────
  {
    id: "m1", theme: "Mindset", title: "The Identity Beneath the Habit",
    host: "The Becoming", duration: "~8 min",
    desc: "Why trying to change behaviors without changing identity rarely works — and the deeper shift that makes lasting transformation possible.",
    script: `Welcome to The Becoming. Settle in. This conversation goes somewhere important.

Today we explore the identity beneath the habit.

Most approaches to personal change focus on outcomes or behaviors. I want to lose weight. I want to exercise more. I want to be more disciplined. And so we create systems around those desired behaviors — tracking apps, accountability partners, reward structures.

These work, sometimes, for a while. But they frequently fail. Not because the person lacks willpower or commitment. They fail because they are trying to build new behaviors on an unchanged foundation of identity.

James Clear puts it this way: the most effective way to change your habits is to focus not on what you want to achieve, but on who you wish to become.

The difference is profound.

The person who says I am trying to exercise more is working against an identity that does not yet include exercise as a core trait. Every workout is a struggle. Every missed day confirms the underlying belief: I am not really an athletic person.

The person who says I am someone who takes care of their body does not need to negotiate with themselves each morning. The behavior flows naturally from the identity. Missing a workout creates a small dissonance with self-image — which motivates return, rather than abandonment.

This is not about positive affirmation. This is about genuine identity construction through accumulated evidence.

Every action you take is a vote for a particular type of person. Every time you write, you cast a vote for: I am a writer. Every time you choose the difficult conversation over avoidance, you cast a vote for: I am someone of integrity. Every time you return to your practice after a lapse, you cast a vote for: I am someone who perseveres.

You do not need a majority on any given day. You simply need to keep voting.

Over time, the votes accumulate into a new self-concept. And that self-concept becomes the most powerful driver of behavior available to you — because it operates automatically, beneath conscious decision-making.

So the question is not: what habits do I want to build?

The question is: who am I becoming?

Sit with that for a moment. Let an honest answer emerge.

That answer is your north star.`,
  },
  {
    id: "m2", theme: "Mindset", title: "On Trusting the Process",
    host: "The Becoming", duration: "~7 min",
    desc: "How to maintain clarity and commitment when results are invisible, and why the quiet period before a breakthrough is the most important phase of growth.",
    script: `Welcome. Today we speak about one of the hardest things in any serious practice: trusting the process when you cannot yet see the results.

There is a phenomenon in growth and learning that researchers call the plateau. It occurs across every domain — language acquisition, athletic training, musical practice, creative work, and personal transformation. You work consistently, with genuine effort and care. And for a period that can feel discouragingly long, nothing seems to change.

The plateau is not stagnation. It is the phase during which deep structural change occurs beneath the surface — changes in neural architecture, in habit formation, in subconscious belief — that do not yet have visible outer expression.

This is the most dangerous phase. Because it feels like failure. And it is precisely here that most people stop.

Geoff Colvin, in his research on expert performance, found that the individuals who ultimately achieve mastery are not distinguished by superior talent at the start. They are distinguished by the ability to keep working during the plateau. To trust that invisible progress is real progress.

The bamboo plant is often cited in this context. For the first four years of its growth, bamboo shows almost no visible development above ground. The farmer who does not know this might reasonably conclude that the seeds are dead and stop watering. But underground, the bamboo is developing an extraordinary root system. When it finally breaks through the surface — in its fifth year — it can grow ninety feet in five weeks.

The roots are the work you are doing now, in the quiet and the invisible.

Trust this.

The practice I want to offer you today is one of patience — but not passive patience. Active patience. The kind that keeps showing up, keeps doing the work, keeps honoring the process — not because results are visible, but because you trust the nature of how growth works.

On the hardest days, return to this: I am building roots. The growth is happening. It is real even when I cannot see it.

And when the breakthrough comes — and it will come — you will understand that the plateau was not the obstacle.

The plateau was the work.`,
  },
  {
    id: "m3", theme: "Mindset", title: "Letting Go of the Need to Be Ready",
    host: "Orion Sessions", duration: "~6 min",
    desc: "Why waiting until you feel ready is a trap — and how starting before you feel prepared is the only honest path to capability.",
    script: `Welcome to Orion Sessions.

There is a thought that has stopped more potential than any external obstacle ever could. It sounds reasonable, even responsible. It sounds like wisdom. But it is not.

That thought is: I'll begin when I'm ready.

When I have more clarity. When conditions are better. When I have learned a little more. When the timing is right. When I feel confident.

The waiting is the trap.

Here is the truth that experience teaches, that every practitioner of any serious craft eventually discovers: you do not become ready before you begin. You become ready by beginning. Readiness is not a prerequisite. It is a result.

The writer who waits to feel like a writer before writing will wait indefinitely. The writer who sits down and writes, uncertainly and imperfectly, becomes a writer through the act.

This is not a motivational platitude. It is a description of how competence actually develops. Cognitive science calls it learning through performance — the process by which attempting a skill, failing, adjusting, and attempting again is the mechanism of mastery, not a shortcut around it.

Fear of beginning is, at its root, fear of being seen as someone who does not yet know. But not knowing is the entry point of all learning. It is not a disqualification. It is the first honest step.

Steven Pressfield, in his remarkable work on the creative process, identified what he calls the Resistance — that inner voice that whispers: not yet, not you, not enough. He argues that the strength of the Resistance is in direct proportion to the importance of the work. The more meaningful the undertaking, the more powerfully the inner voice argues for delay.

This means that when you feel most strongly that you are not ready, you are often standing closest to the threshold of something that matters.

What is the one thing you have been waiting to feel ready for?

You do not need to feel ready. You need to begin.

Begin today. Imperfectly. Uncertainly. Incompletely.

The readiness will follow.`,
  },
];

// ── Daily rotation: deterministic 2 picks per calendar day ───────
function getDailyPodcasts() {
  const d = new Date();
  // Seed based on year+dayOfYear so it changes each day consistently
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  const seed = d.getFullYear() * 1000 + dayOfYear;
  // Simple LCG from seed
  const lcg = (s) => ((s * 1664525 + 1013904223) & 0xffffffff) >>> 0;
  const s1 = lcg(seed);
  const s2 = lcg(s1);
  const i1 = s1 % PODCAST_LIBRARY.length;
  let i2 = s2 % PODCAST_LIBRARY.length;
  if (i2 === i1) i2 = (i2 + 1) % PODCAST_LIBRARY.length;
  return [PODCAST_LIBRARY[i1], PODCAST_LIBRARY[i2]];
}

// ── Theme config ─────────────────────────────────────────────────
const THEMES = ["All", "Calmness", "Discipline", "Reflection", "Focus", "Mindset"];
const THEME_COLORS = {
  Calmness:   "rgba(100,160,220,0.12)",
  Discipline: "rgba(200,140,60,0.12)",
  Reflection: "rgba(140,100,200,0.12)",
  Focus:      "rgba(80,180,120,0.12)",
  Mindset:    "rgba(212,175,100,0.1)",
};

// ── Speech Engine v2 ──────────────────────────────────────────────
// Robust Web Speech API wrapper.
// Splits long scripts into paragraph-chunks to avoid Chrome's ~15s
// utterance cutoff bug. Tracks absolute char position for seek/resume.
class SpeechEngine {
  constructor() {
    this.chunks      = [];   // array of { text, startChar }
    this.chunkIndex  = 0;
    this.charOffset  = 0;    // absolute char of current chunk start
    this.charIndex   = 0;    // absolute char of last word boundary
    this.totalChars  = 0;
    this.rate        = 0.90;
    this.pitch       = 1.0;
    this.volume      = 0.92;
    this._voice      = null;
    this.speaking    = false;
    this.paused      = false;
    this._loaded     = false;
    // callbacks
    this.onProgress  = null; // (charIndex, totalChars) => void
    this.onEnd       = null; // () => void
    // Chrome keep-alive: resume every 10s while paused
    this._keepAlive  = null;
  }

  /* Pick the calmest available English voice */
  _pickVoice() {
    const voices = window.speechSynthesis?.getVoices() || [];
    const order = [
      "Google UK English Female", "Microsoft Sonia", "Microsoft Libby",
      "Google UK English Male",   "Microsoft George", "Microsoft Zira",
      "Karen",                    "Samantha",         "Daniel",
      "Alex",                     "Moira",
    ];
    for (const name of order) {
      const v = voices.find(v => v.name.includes(name));
      if (v) return v;
    }
    return voices.find(v => v.lang?.startsWith("en")) || voices[0] || null;
  }

  /* Split text into paragraph chunks for reliable long-form playback */
  _splitChunks(text, startChar = 0) {
    // Find closest sentence boundary at or before startChar
    let si = startChar;
    if (si > 0) {
      while (si > 0 && !/[.\n]/.test(text[si])) si--;
      if (si > 0) si++;  // start after the period/newline
    }
    const remaining = text.slice(si);
    // Split on paragraph breaks first, then long sentences
    const rawChunks = remaining.split(/\n\n+/).filter(c => c.trim().length > 0);
    const chunks = [];
    let pos = si;
    for (const raw of rawChunks) {
      const idx = text.indexOf(raw, pos);
      chunks.push({ text: raw.trim(), startChar: idx >= 0 ? idx : pos });
      pos = (idx >= 0 ? idx : pos) + raw.length;
    }
    return chunks;
  }

  /* Build and attach a single utterance for chunkIndex */
  _buildUtterance(chunkIdx) {
    if (chunkIdx >= this.chunks.length) return null;
    const chunk = this.chunks[chunkIdx];
    if (!this._voice) this._voice = this._pickVoice();
    const u = new SpeechSynthesisUtterance(chunk.text);
    if (this._voice)  u.voice  = this._voice;
    u.rate   = this.rate;
    u.pitch  = this.pitch;
    u.volume = this.volume;
    u.onboundary = (e) => {
      if (e.name === "word") {
        this.charIndex = chunk.startChar + e.charIndex;
        this.onProgress?.(this.charIndex, this.totalChars);
      }
    };
    u.onend = () => {
      if (this.paused) return;
      this.chunkIndex++;
      if (this.chunkIndex < this.chunks.length) {
        const next = this._buildUtterance(this.chunkIndex);
        if (next) window.speechSynthesis.speak(next);
      } else {
        this.speaking = false;
        this._stopKeepAlive();
        this.onEnd?.();
      }
    };
    u.onerror = (e) => {
      if (e.error === "interrupted" || e.error === "canceled") return;
      // Try next chunk on error
      this.chunkIndex++;
      if (this.chunkIndex < this.chunks.length) {
        const next = this._buildUtterance(this.chunkIndex);
        if (next) window.speechSynthesis.speak(next);
      } else {
        this.speaking = false;
        this._stopKeepAlive();
      }
    };
    return u;
  }

  /* Load script, optionally resuming from a character position */
  load(text, startChar = 0) {
    this.stop();
    this.totalChars  = text.length;
    this.charIndex   = startChar;
    this.chunks      = this._splitChunks(text, startChar);
    this.chunkIndex  = 0;
    this._loaded     = true;
    this._voice      = null; // re-pick fresh
  }

  play() {
    if (!this._loaded || this.chunks.length === 0) return;
    if (this.paused) {
      window.speechSynthesis?.resume();
      this.paused  = false;
      this.speaking = true;
      this._startKeepAlive();
      return;
    }
    window.speechSynthesis?.cancel();
    this.speaking   = true;
    this.paused     = false;
    this._voice     = this._pickVoice(); // fresh pick with loaded voices
    const u = this._buildUtterance(this.chunkIndex);
    if (u) {
      window.speechSynthesis.speak(u);
      this._startKeepAlive();
    }
  }

  pause() {
    window.speechSynthesis?.pause();
    this.paused   = true;
    this.speaking = false;
    this._stopKeepAlive();
  }

  stop() {
    window.speechSynthesis?.cancel();
    this.speaking   = false;
    this.paused     = false;
    this._loaded    = false;
    this._stopKeepAlive();
  }

  /* Seek to a fractional position 0-1 */
  seekTo(pct, text) {
    const targetChar = Math.floor(pct * (text?.length || this.totalChars));
    this.stop();
    this.load(text || "", targetChar);
    this.charIndex = targetChar;
  }

  setVolume(v) {
    this.volume = v;
  }

  setRate(r) {
    this.rate = r;
  }

  isSupported() {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /* Keep-alive: Chrome pauses speechSynthesis silently after ~15s on some builds */
  _startKeepAlive() {
    this._stopKeepAlive();
    this._keepAlive = setInterval(() => {
      if (window.speechSynthesis && !this.paused && this.speaking) {
        window.speechSynthesis.pause();
        window.speechSynthesis.resume();
      }
    }, 10000);
  }
  _stopKeepAlive() {
    if (this._keepAlive) { clearInterval(this._keepAlive); this._keepAlive = null; }
  }
}

const speechEngine = new SpeechEngine();

// ── Live waveform — CSS-animated bars, rhythm varies by position ──
function Waveform({ playing, bars = 28, height = 32 }) {
  const heights = Array.from({ length: bars }, (_, i) => {
    const base = 3;
    const wave = Math.abs(Math.sin(i * 0.55) * 10 + Math.sin(i * 1.1) * 5 + Math.cos(i * 0.33) * 4);
    return base + wave;
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2.5, height }}>
      {heights.map((h, i) => {
        const period   = (0.5 + (i % 7) * 0.09).toFixed(2);
        const delay    = ((i * 0.04) % 0.7).toFixed(2);
        const opacity  = playing ? (0.35 + (i % 4) * 0.14).toFixed(2) : "0.12";
        return (
          <div key={i} style={{
            width: 2.5, borderRadius: 2, flexShrink: 0,
            background: `rgba(212,175,100,${opacity})`,
            height: playing ? `${Math.max(3, h)}px` : "3px",
            transition: "height 0.4s ease, background 0.3s ease",
            animation: playing
              ? `pulseGold ${period}s ease-in-out ${delay}s infinite alternate`
              : "none",
          }} />
        );
      })}
    </div>
  );
}

// ── Sticky bottom playbar — always visible while a podcast is playing ──
function StickyPlayer({ activePodcast, playing, progress, charIndex, totalChars,
                        onTogglePlay, onSeek, onClose, volume, onVolume, rate, onRate }) {
  if (!activePodcast) return null;
  const p = activePodcast.podcast;
  const charsPerMin = 900 * speechEngine.rate;
  const totalMin    = totalChars / charsPerMin;
  const elapsedMin  = charIndex  / charsPerMin;
  const fmtT = m => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;
  const RATES = [0.75, 0.9, 1.0, 1.1, 1.25];

  return (
    <div style={{
      position: "fixed", bottom: 0, left: 216, right: 0, zIndex: 40,
      background: "rgba(8,10,16,0.97)", backdropFilter: "blur(24px)",
      borderTop: "1px solid rgba(212,175,100,0.12)",
      padding: "0 40px",
      animation: "fadeUp 0.4s cubic-bezier(0.16,1,0.3,1)",
    }}>
      {/* Full-width seek bar at very top of bar */}
      <div
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width); }}
        style={{ height: 3, background: "rgba(212,175,100,0.08)", cursor: "pointer", position: "relative", marginBottom: 0 }}
      >
        <div style={{ height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, rgba(212,175,100,0.35), rgba(212,175,100,0.75))", transition: "width 0.6s linear" }} />
        <div style={{ position: "absolute", top: "50%", left: `${progress * 100}%`, transform: "translate(-50%,-50%)", width: 9, height: 9, borderRadius: "50%", background: T.gold, boxShadow: "0 0 8px rgba(212,175,100,0.6)", cursor: "pointer" }} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 20, height: 64 }}>
        {/* Waveform */}
        <Waveform playing={playing} bars={18} height={28} />

        {/* Episode info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: T.serif, fontSize: 13, fontWeight: 300, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</div>
          <div style={{ fontFamily: T.body, fontSize: 10, color: T.goldDim, marginTop: 1 }}>{p.theme} · {fmtT(elapsedMin)} / {fmtT(totalMin)}</div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {/* −30 */}
          <button onClick={() => onSeek(Math.max(0, progress - 30 / (totalMin * 60)))}
            style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontFamily: T.body, fontSize: 10, padding: "4px 6px", borderRadius: 4 }}>−30s</button>
          {/* play/pause */}
          <button onClick={onTogglePlay}
            style={{ width: 40, height: 40, borderRadius: "50%", background: playing ? "rgba(212,175,100,0.18)" : T.goldFaint, border: `1px solid rgba(212,175,100,${playing ? 0.55 : 0.28})`, color: T.gold, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.25s", flexShrink: 0 }}>
            {playing ? "⏸" : "▶"}
          </button>
          {/* +30 */}
          <button onClick={() => onSeek(Math.min(1, progress + 30 / (totalMin * 60)))}
            style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontFamily: T.body, fontSize: 10, padding: "4px 6px", borderRadius: 4 }}>+30s</button>
        </div>

        {/* Rate selector */}
        <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
          {RATES.map(r => (
            <button key={r} onClick={() => onRate(r)}
              style={{ padding: "2px 7px", background: Math.abs(rate - r) < 0.01 ? T.goldFaint : "transparent", border: `1px solid ${Math.abs(rate - r) < 0.01 ? "rgba(212,175,100,0.3)" : "transparent"}`, borderRadius: 3, fontFamily: T.body, fontSize: 10, color: Math.abs(rate - r) < 0.01 ? T.gold : T.textDim, cursor: "pointer", transition: "all 0.2s" }}>
              {r === 1.0 ? "1×" : `${r}×`}
            </button>
          ))}
        </div>

        {/* Volume */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, width: 100, flexShrink: 0 }}>
          <span style={{ fontSize: 9, color: T.textDim }}>♪</span>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => onVolume(parseFloat(e.target.value))} style={{ flex: 1 }} />
        </div>

        {/* Close */}
        <button onClick={onClose}
          style={{ background: "none", border: "none", color: T.textDim, cursor: "pointer", fontSize: 18, padding: "0 4px", lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
    </div>
  );
}

// ── Expanded inline player (shown below the active card) ──────────
function ExpandedPlayer({ podcast, playing, progress, charIndex, totalChars,
                          onTogglePlay, onSeek, volume }) {
  const charsPerMin = 900 * speechEngine.rate;
  const totalMin    = totalChars / charsPerMin;
  const elapsedMin  = charIndex  / charsPerMin;
  const fmtT = m => `${Math.floor(m)}:${String(Math.round((m % 1) * 60)).padStart(2, "0")}`;

  // Scrolling transcript — highlight approx current paragraph
  const paragraphs = podcast.script.split(/\n\n+/).filter(Boolean);
  const charsPerPara = totalChars / Math.max(1, paragraphs.length);
  const activePara  = Math.min(Math.floor(charIndex / charsPerPara), paragraphs.length - 1);

  return (
    <div style={{
      marginTop: 10,
      background: "rgba(8,10,18,0.95)",
      border: "1px solid rgba(212,175,100,0.14)",
      borderRadius: "0 0 12px 12px",
      backdropFilter: "blur(20px)",
      overflow: "hidden",
      animation: "fadeUp 0.35s cubic-bezier(0.16,1,0.3,1)",
    }}>
      {/* Seek bar */}
      <div
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width); }}
        style={{ height: 3, background: "rgba(212,175,100,0.08)", cursor: "pointer", position: "relative" }}
      >
        <div style={{ height: "100%", width: `${progress * 100}%`, background: "linear-gradient(90deg, rgba(212,175,100,0.4), rgba(212,175,100,0.8))", transition: "width 0.6s linear" }} />
        <div style={{ position: "absolute", top: "50%", left: `${progress * 100}%`, transform: "translate(-50%,-50%)", width: 11, height: 11, borderRadius: "50%", background: T.gold, boxShadow: "0 0 8px rgba(212,175,100,0.5)" }} />
      </div>

      <div style={{ padding: "18px 22px 20px" }}>
        {/* Time + waveform row */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontFamily: T.body, fontSize: 11, color: T.textDim, letterSpacing: "0.06em" }}>{fmtT(elapsedMin)}</span>
          <Waveform playing={playing} bars={32} height={28} />
          <span style={{ fontFamily: T.body, fontSize: 11, color: T.textDim, letterSpacing: "0.06em" }}>{fmtT(totalMin)}</span>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 18 }}>
          <button onClick={() => onSeek(Math.max(0, progress - 30 / (totalMin * 60)))}
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: "50%", width: 36, height: 36, color: T.textDim, cursor: "pointer", fontFamily: T.body, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>−30</button>
          <button onClick={onTogglePlay}
            style={{ width: 52, height: 52, borderRadius: "50%", background: playing ? "rgba(212,175,100,0.16)" : T.goldFaint, border: `1px solid rgba(212,175,100,${playing ? 0.55 : 0.32})`, color: T.gold, cursor: "pointer", fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.25s" }}>
            {playing ? "⏸" : "▶"}
          </button>
          <button onClick={() => onSeek(Math.min(1, progress + 30 / (totalMin * 60)))}
            style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: "50%", width: 36, height: 36, color: T.textDim, cursor: "pointer", fontFamily: T.body, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>+30</button>
        </div>

        {/* Scrolling transcript */}
        <div style={{ maxHeight: 120, overflowY: "auto", position: "relative" }}>
          {paragraphs.map((para, i) => (
            <p key={i} style={{
              fontFamily: T.body, fontSize: 12.5, lineHeight: 1.72, margin: "0 0 10px",
              color: i === activePara ? T.textMid : T.textDim,
              fontStyle: "italic",
              transition: "color 0.5s ease",
              opacity: i === activePara ? 1 : Math.abs(i - activePara) === 1 ? 0.5 : 0.25,
            }}>{para.trim()}</p>
          ))}
          <div style={{ position: "sticky", bottom: 0, height: 28, background: "linear-gradient(transparent, rgba(8,10,18,0.98))" }} />
        </div>
      </div>
    </div>
  );
}

// ── Individual podcast card ────────────────────────────────────────
function PodcastCard({ podcast, isActive, isPlaying, onPlay, progress, animDelay = 0 }) {
  const [hov, setHov] = useState(false);
  const pct         = progress ? Math.min(0.99, progress.charIndex / Math.max(1, progress.totalChars)) : 0;
  const hasProgress = pct > 0.02 && pct < 0.97;

  const THEME_ACCENT = {
    Calmness:   "rgba(90,150,215,0.6)",
    Discipline: "rgba(200,138,52,0.6)",
    Reflection: "rgba(135,92,200,0.6)",
    Focus:      "rgba(68,174,108,0.6)",
    Mindset:    "rgba(212,175,100,0.6)",
  };
  const THEME_GLOW = {
    Calmness:   "rgba(90,150,215,0.05)",
    Discipline: "rgba(200,138,52,0.06)",
    Reflection: "rgba(135,92,200,0.06)",
    Focus:      "rgba(68,174,108,0.05)",
    Mindset:    "rgba(212,175,100,0.06)",
  };
  const accent = THEME_ACCENT[podcast.theme] || "rgba(212,175,100,0.55)";
  const glow   = THEME_GLOW[podcast.theme]   || T.goldFaint;
  const active = isActive || hov;

  return (
    <div
      className="fadeUp"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        animationDelay: `${animDelay}s`,
        background: isActive ? glow : hov ? T.surfaceHover : T.surface,
        border: `1px solid ${active ? "rgba(212,175,100,0.18)" : T.border}`,
        borderLeft: `3px solid ${active ? accent : "rgba(212,175,100,0.1)"}`,
        borderRadius: 10,
        backdropFilter: "blur(16px)",
        transition: "all 0.3s ease",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "16px 20px 15px", display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* Play button */}
        <button
          onClick={onPlay}
          style={{
            flexShrink: 0, width: 42, height: 42, marginTop: 2,
            borderRadius: "50%",
            background: isActive ? "rgba(212,175,100,0.13)" : "transparent",
            border: `1px solid rgba(212,175,100,${isActive ? 0.45 : hov ? 0.25 : 0.14})`,
            color: isActive ? T.gold : hov ? T.goldDim : T.textDim,
            cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.25s",
            boxShadow: isActive && isPlaying ? `0 0 16px ${glow}` : "none",
          }}>
          {isActive && isPlaying ? "⏸" : "▶"}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Meta row */}
          <div style={{ display: "flex", gap: 7, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: T.body, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase",
              color: isActive ? T.gold : T.goldDim,
              border: `1px solid ${isActive ? "rgba(212,175,100,0.26)" : "rgba(212,175,100,0.1)"}`,
              padding: "2px 6px", borderRadius: 2, transition: "all 0.3s",
            }}>{podcast.theme}</span>
            <span style={{ fontFamily: T.body, fontSize: 10, color: T.textDim }}>{podcast.duration}</span>
            {isActive && isPlaying && (
              <span style={{ fontFamily: T.body, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: T.gold, animation: "pulseGold 2.5s infinite" }}>● playing</span>
            )}
            {hasProgress && !isActive && (
              <span style={{ fontFamily: T.body, fontSize: 9, color: "rgba(150,200,140,0.7)", letterSpacing: "0.1em", textTransform: "uppercase" }}>↺ {Math.round(pct * 100)}%</span>
            )}
          </div>

          {/* Title */}
          <h3 style={{
            fontFamily: T.serif, fontSize: 15, fontWeight: 300,
            color: isActive ? T.text : T.textMid,
            margin: "0 0 4px", lineHeight: 1.35, transition: "color 0.3s",
          }}>{podcast.title}</h3>

          {/* Description */}
          <p style={{ fontFamily: T.body, fontSize: 12, color: T.textDim, margin: "0 0 7px", lineHeight: 1.55, fontStyle: "italic" }}>{podcast.desc}</p>

          {/* Host */}
          <span style={{ fontFamily: T.body, fontSize: 10, letterSpacing: "0.07em", color: "rgba(180,170,155,0.28)" }}>{podcast.host}</span>

          {/* Progress bar */}
          {(hasProgress || (isActive && pct > 0)) && (
            <div style={{ marginTop: 9, height: 2, background: "rgba(212,175,100,0.07)", borderRadius: 1 }}>
              <div style={{
                height: "100%",
                width: `${pct * 100}%`,
                background: isActive ? "rgba(212,175,100,0.5)" : "rgba(150,200,140,0.45)",
                borderRadius: 1, transition: "width 0.9s ease",
              }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main PodcastsModule ───────────────────────────────────────────
function PodcastsModule() {
  // ── state ──
  const [activePodcast, setActivePodcast]   = useState(null);  // { podcast, resumeFrom }
  const [playing,       setPlaying]         = useState(false);
  const [charIndex,     setCharIndex]       = useState(0);
  const [totalChars,    setTotalChars]      = useState(0);
  const [progressMap,   setProgressMap]     = useState(() => loadPodcastProgress());
  const [activeTheme,   setActiveTheme]     = useState("All");
  const [volume,        setVolume]          = useState(0.92);
  const [rate,          setRate]            = useState(0.90);
  const [voicesReady,   setVoicesReady]     = useState(false);
  const [expandedId,    setExpandedId]      = useState(null);  // which card shows ExpandedPlayer

  const dailyPicks    = getDailyPodcasts();
  const activePodId   = activePodcast?.podcast?.id;

  // Ensure voices are loaded (Chrome lazy-loads them)
  useEffect(() => {
    const try_ = () => { if (window.speechSynthesis?.getVoices()?.length > 0) { setVoicesReady(true); return true; } return false; };
    if (try_()) return;
    const handler = () => try_();
    window.speechSynthesis?.addEventListener("voiceschanged", handler);
    const t = setTimeout(() => setVoicesReady(true), 3000);
    return () => { window.speechSynthesis?.removeEventListener("voiceschanged", handler); clearTimeout(t); };
  }, []);

  function loadAndPlay(podcast, resumeFrom = 0) {
    speechEngine.stop();
    speechEngine.setVolume(volume);
    speechEngine.setRate(rate);
    speechEngine.load(podcast.script, resumeFrom);
    // Wire callbacks BEFORE play() — no setTimeout race condition
    speechEngine.onProgress = (ci, total) => {
      setCharIndex(ci);
      setProgressMap(prev => ({ ...prev, [podcast.id]: { charIndex: ci, totalChars: total, savedAt: Date.now() } }));
      savePodcastProgress(podcast.id, ci, total);
    };
    speechEngine.onEnd = () => {
      setPlaying(false);
      clearPodcastProgress(podcast.id);
      setProgressMap(prev => { const n = { ...prev }; delete n[podcast.id]; return n; });
    };
    setActivePodcast({ podcast, resumeFrom });
    setTotalChars(podcast.script.length);
    setCharIndex(resumeFrom);
    setExpandedId(podcast.id);
    speechEngine.play();
    setPlaying(true);
  }

  function handlePlay(podcast) {
    const saved = progressMap[podcast.id];
    const resumeFrom = saved ? saved.charIndex : 0;
    if (activePodId === podcast.id) {
      // Same episode — toggle play/pause
      if (playing) { speechEngine.pause(); setPlaying(false); }
      else          { speechEngine.play();  setPlaying(true); }
      setExpandedId(expandedId === podcast.id ? null : podcast.id);
    } else {
      loadAndPlay(podcast, resumeFrom);
    }
  }

  function handleSeek(pct) {
    if (!activePodcast) return;
    const p = activePodcast.podcast;
    speechEngine.seekTo(pct, p.script);
    const newChar = Math.floor(pct * p.script.length);
    setCharIndex(newChar);
    speechEngine.onProgress = (ci, total) => {
      setCharIndex(ci);
      savePodcastProgress(p.id, ci, total);
      setProgressMap(prev => ({ ...prev, [p.id]: { charIndex: ci, totalChars: total, savedAt: Date.now() } }));
    };
    speechEngine.onEnd = () => {
      setPlaying(false);
      clearPodcastProgress(p.id);
      setProgressMap(prev => { const n = { ...prev }; delete n[p.id]; return n; });
    };
    if (playing) { speechEngine.play(); }
  }

  function handleClose() {
    if (activePodcast && charIndex > 20) {
      savePodcastProgress(activePodcast.podcast.id, charIndex, totalChars);
    }
    speechEngine.stop();
    setPlaying(false);
    setActivePodcast(null);
    setExpandedId(null);
  }

  function handleVolume(v) {
    setVolume(v);
    speechEngine.setVolume(v);
  }

  function handleRate(r) {
    setRate(r);
    speechEngine.setRate(r);
    if (activePodcast) {
      const p = activePodcast.podcast;
      const wasPlaying = playing;
      speechEngine.stop();
      speechEngine.setRate(r);
      speechEngine.load(p.script, charIndex);
      speechEngine.onProgress = (ci, total) => {
        setCharIndex(ci);
        savePodcastProgress(p.id, ci, total);
        setProgressMap(prev => ({ ...prev, [p.id]: { charIndex: ci, totalChars: total, savedAt: Date.now() } }));
      };
      speechEngine.onEnd = () => {
        setPlaying(false);
        clearPodcastProgress(p.id);
        setProgressMap(prev => { const n = { ...prev }; delete n[p.id]; return n; });
      };
      if (wasPlaying) { speechEngine.play(); setPlaying(true); }
    }
  }

  const progress = totalChars > 0 ? Math.min(1, charIndex / totalChars) : 0;

  // Continue Listening — saved progress, not currently active
  const continueItems = PODCAST_LIBRARY.filter(p => {
    const pr = progressMap[p.id];
    return pr && pr.charIndex > 30 && pr.charIndex < (pr.totalChars * 0.97);
  });

  const filteredLibrary = activeTheme === "All"
    ? PODCAST_LIBRARY
    : PODCAST_LIBRARY.filter(p => p.theme === activeTheme);

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <div style={{ paddingBottom: activePodcast ? 90 : 0 }}>
      <SectionHead title="Podcast Library" sub="Curated spoken reflections for the evolving mind." />

      {/* ── Today's Listening ────────────────────────────────── */}
      <section className="fadeUp" style={{ marginBottom: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
          <Label style={{ marginBottom: 0 }}>Today's Listening</Label>
          <span style={{ fontFamily: T.body, fontSize: 10, color: T.textDim, fontStyle: "italic", letterSpacing: "0.06em" }}>{todayLabel}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {dailyPicks.map((p, i) => (
            <div key={p.id}>
              <PodcastCard
                podcast={p}
                isActive={activePodId === p.id}
                isPlaying={activePodId === p.id && playing}
                progress={progressMap[p.id]}
                onPlay={() => handlePlay(p)}
                animDelay={i * 0.07}
              />
              {activePodId === p.id && expandedId === p.id && (
                <ExpandedPlayer
                  podcast={p}
                  playing={playing}
                  progress={progress}
                  charIndex={charIndex}
                  totalChars={totalChars}
                  onTogglePlay={() => handlePlay(p)}
                  onSeek={handleSeek}
                  volume={volume}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── Continue Listening ───────────────────────────────── */}
      {continueItems.length > 0 && (
        <section className="fadeUp fadeUp-2" style={{ marginBottom: 32 }}>
          <Label style={{ marginBottom: 14 }}>Continue Listening</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {continueItems.map((p, i) => (
              <div key={p.id}>
                <PodcastCard
                  podcast={p}
                  isActive={activePodId === p.id}
                  isPlaying={activePodId === p.id && playing}
                  progress={progressMap[p.id]}
                  onPlay={() => handlePlay(p)}
                  animDelay={i * 0.06}
                />
                {activePodId === p.id && expandedId === p.id && (
                  <ExpandedPlayer
                    podcast={p}
                    playing={playing}
                    progress={progress}
                    charIndex={charIndex}
                    totalChars={totalChars}
                    onTogglePlay={() => handlePlay(p)}
                    onSeek={handleSeek}
                    volume={volume}
                  />
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Full Library ─────────────────────────────────────── */}
      <section className="fadeUp fadeUp-3">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
          <Label style={{ marginBottom: 0 }}>Full Library</Label>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {THEMES.map(t => (
              <button key={t} onClick={() => setActiveTheme(t)}
                style={{ padding: "4px 11px", background: activeTheme === t ? T.goldFaint : "transparent", border: `1px solid ${activeTheme === t ? "rgba(212,175,100,0.32)" : T.border}`, borderRadius: 20, fontFamily: T.body, fontSize: 11, color: activeTheme === t ? T.gold : T.textDim, cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.05em" }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filteredLibrary.map((p, i) => (
            <div key={p.id}>
              <PodcastCard
                podcast={p}
                isActive={activePodId === p.id}
                isPlaying={activePodId === p.id && playing}
                progress={progressMap[p.id]}
                onPlay={() => handlePlay(p)}
                animDelay={i * 0.04}
              />
              {activePodId === p.id && expandedId === p.id && (
                <ExpandedPlayer
                  podcast={p}
                  playing={playing}
                  progress={progress}
                  charIndex={charIndex}
                  totalChars={totalChars}
                  onTogglePlay={() => handlePlay(p)}
                  onSeek={handleSeek}
                  volume={volume}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Voices not yet loaded nudge */}
      {!voicesReady && (
        <div className="fadeUp" style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 10, fontFamily: T.body, fontSize: 12, color: T.textDim, fontStyle: "italic" }}>
          <Spinner /> Preparing voice engine...
        </div>
      )}

      {/* Info footer */}
      <div style={{ marginTop: 28, padding: "12px 16px", background: "rgba(212,175,100,0.03)", border: `1px solid ${T.border}`, borderRadius: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
        <span style={{ color: T.goldDim, fontSize: 11, flexShrink: 0, marginTop: 1 }}>✦</span>
        <p style={{ fontFamily: T.body, fontSize: 11.5, color: T.textDim, margin: 0, lineHeight: 1.65, fontStyle: "italic" }}>
          All episodes are narrated through your device's voice synthesis engine — clear, structured spoken content with no background noise or random audio. Progress is saved automatically. Use Chrome or Edge for the best voice quality. Adjust playback speed with the rate controls in the bottom player.
        </p>
      </div>

      {/* Sticky bottom player */}
      <StickyPlayer
        activePodcast={activePodcast}
        playing={playing}
        progress={progress}
        charIndex={charIndex}
        totalChars={totalChars}
        onTogglePlay={() => activePodcast && handlePlay(activePodcast.podcast)}
        onSeek={handleSeek}
        onClose={handleClose}
        volume={volume}
        onVolume={handleVolume}
        rate={rate}
        onRate={handleRate}
      />
    </div>
  );
}

/* ════════════════ REFLECT MODULE ════════════════════════════════ */
function ReflectModule() {
  const [text,setText]=useState("");
  const [saved,setSaved]=useState(false);
  const [entries,setEntries]=useState([
    {date:"Mar 4",preview:"I noticed resistance when the task required patience..."},
    {date:"Mar 3",preview:"The clarity came after I stopped forcing the answer..."},
    {date:"Mar 1",preview:"What I discovered about discipline is that it's not severity..."},
  ]);
  const prompts=["What did you resist today, and why?","Where did your energy flow with ease?","What belief is quietly holding you back?","Describe one moment of clarity from today.","What would your future self thank you for doing now?","What are you avoiding that you already know you need to face?"];
  const [prompt]=useState(prompts[Math.floor(Math.random()*prompts.length)]);
  function save(){
    if(!text.trim())return;
    setEntries(e=>[{date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"}),preview:text.slice(0,80)+(text.length>80?"...":"")}, ...e]);
    setSaved(true); setText(""); setTimeout(()=>setSaved(false),2500);
  }
  return (
    <div>
      <SectionHead title="Reflection Space" sub="Truth arrives in stillness." />
      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:16}}>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card className="fadeUp" style={{borderColor:"rgba(212,175,100,0.1)"}}>
            <Label>Tonight's Prompt</Label>
            <p style={{fontFamily:T.serif,fontSize:19,fontWeight:300,fontStyle:"italic",color:T.text,lineHeight:1.55,margin:0}}>"{prompt}"</p>
          </Card>
          <Card className="fadeUp fadeUp-1" style={{padding:0}}>
            <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Let your thoughts flow without judgment..." style={{width:"100%",minHeight:210,background:"transparent",border:"none",outline:"none",fontFamily:T.body,fontSize:15,lineHeight:1.82,color:T.textMid,resize:"none",padding:28,boxSizing:"border-box"}} />
            <div style={{padding:"14px 28px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontFamily:T.body,fontSize:11,color:"rgba(180,170,155,0.22)"}}>{text.split(/\s+/).filter(Boolean).length} words</span>
              <GoldBtn onClick={save}>{saved?"✦ Saved":"Save Reflection"}</GoldBtn>
            </div>
          </Card>
        </div>
        <Card className="fadeUp fadeUp-2">
          <Label>Past Reflections</Label>
          {entries.map((r,i)=>(
            <div key={i} style={{padding:"12px 0",borderBottom:i<entries.length-1?`1px solid ${T.border}`:"none",cursor:"pointer"}}>
              <div style={{fontFamily:T.body,fontSize:10,color:T.goldDim,letterSpacing:"0.1em",marginBottom:4}}>{r.date}</div>
              <div style={{fontFamily:T.body,fontSize:13,color:T.textDim,fontStyle:"italic",lineHeight:1.5}}>{r.preview}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ════════════════ IDENTITY MODULE ══════════════════════════════ */
function IdentityModule({ profile }) {
  const traits=[{name:"Discipline",pct:72,note:"Consistent morning routines"},{name:"Clarity",pct:85,note:"Decisive in ambiguous situations"},{name:"Creativity",pct:60,note:"Exploring new mediums"},{name:"Presence",pct:48,note:"Working on digital detachment"},{name:"Courage",pct:66,note:"Speaking truth without hesitation"}];
  return (
    <div>
      <SectionHead title="Identity Architecture" sub="You are becoming who you choose to be." />
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <Card className="fadeUp">
          <Label>Core Identity Statement</Label>
          <p style={{fontFamily:T.serif,fontSize:18,fontWeight:300,fontStyle:"italic",color:T.text,lineHeight:1.65,margin:"0 0 20px"}}>"I am a disciplined creator who moves with clarity and builds with intention."</p>
          {profile?.primaryGoal&&<div style={{padding:"12px 16px",background:T.goldFaint,borderRadius:6,marginBottom:16}}><div style={{fontFamily:T.body,fontSize:10,letterSpacing:"0.2em",textTransform:"uppercase",color:T.textDim,marginBottom:4}}>Primary Focus</div><div style={{fontFamily:T.body,fontSize:14,color:T.textMid}}>{profile.primaryGoal}</div></div>}
          <GoldBtn>Refine Statement</GoldBtn>
        </Card>
        <Card className="fadeUp fadeUp-1">
          <Label>Core Traits</Label>
          {traits.map(t=>(
            <div key={t.name} style={{marginBottom:15}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}><span style={{fontFamily:T.body,fontSize:13,color:T.textMid}}>{t.name}</span><span style={{fontFamily:T.body,fontSize:10,color:T.goldDim}}>{t.pct}%</span></div>
              <div style={{height:2,background:T.goldFaint,borderRadius:1}}><div style={{height:"100%",width:`${t.pct}%`,background:`linear-gradient(90deg,rgba(212,175,100,0.3),rgba(212,175,100,${0.45+t.pct/200}))`,borderRadius:1}} /></div>
              <div style={{fontFamily:T.body,fontSize:11,color:"rgba(180,170,155,0.28)",marginTop:3,fontStyle:"italic"}}>{t.note}</div>
            </div>
          ))}
        </Card>
        <Card className="fadeUp fadeUp-2" style={{gridColumn:"1 / -1"}}>
          <Label>Active Goals</Label>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            {[{goal:"Write 500 words daily",pct:80,streak:"12 days"},{goal:"Cold exposure each morning",pct:60,streak:"9 days"},{goal:"1 hour deep reading nightly",pct:45,streak:"7 days"}].map((g,i)=>(
              <div key={i} style={{padding:18,background:T.goldFaint,border:`1px solid ${T.border}`,borderRadius:8}}>
                <div style={{fontFamily:T.body,fontSize:14,color:T.textMid,marginBottom:12,lineHeight:1.45}}>{g.goal}</div>
                <div style={{height:2,background:"rgba(212,175,100,0.07)",borderRadius:1,marginBottom:7}}><div style={{height:"100%",width:`${g.pct}%`,background:"rgba(212,175,100,0.55)",borderRadius:1}} /></div>
                <div style={{fontFamily:T.body,fontSize:10,color:T.goldDim}}>{g.streak} streak · {g.pct}%</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ════════════════ KNOWLEDGE VAULT ══════════════════════════════ */
function VaultModule({ notes, setNotes }) {
  const [query,setQuery]=useState("");
  const [adding,setAdding]=useState(false);
  const [newTitle,setNewTitle]=useState("");
  const [newContent,setNewContent]=useState("");
  const [newTag,setNewTag]=useState("");
  const [summarizing,setSummarizing]=useState(null);
  const [summary,setSummary]=useState({});

  function addNote(){
    if(!newTitle.trim())return;
    setNotes(n=>[{id:Date.now(),title:newTitle.trim(),content:newContent.trim(),tags:newTag.split(",").map(t=>t.trim()).filter(Boolean),date:new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"})}, ...n]);
    setAdding(false); setNewTitle(""); setNewContent(""); setNewTag("");
  }

  async function summarize(note){
    setSummarizing(note.id);
    try{const s=await callClaude([{role:"user",content:`Summarize in 2-3 sentences and extract one key actionable insight:\nTitle:${note.title}\nContent:${note.content}`}],"You are a thoughtful analyst. Distill knowledge with precision. Be concise.",250);setSummary(prev=>({...prev,[note.id]:s}));}
    catch{setSummary(prev=>({...prev,[note.id]:"Could not generate summary."}));}
    setSummarizing(null);
  }

  const filtered=notes.filter(n=>!query||n.title.toLowerCase().includes(query.toLowerCase())||n.tags?.some(t=>t.toLowerCase().includes(query.toLowerCase())));

  return (
    <div>
      <SectionHead title="Knowledge Vault" sub="Your personal archive of insight." />
      <div style={{display:"flex",gap:12,marginBottom:18}}>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search vault..." style={{flex:1,padding:"11px 16px",background:T.surface,border:`1px solid ${T.border}`,borderRadius:6,outline:"none",fontFamily:T.body,fontSize:14,color:T.textMid,boxSizing:"border-box"}} />
        <GoldBtn onClick={()=>setAdding(a=>!a)}>{adding?"Cancel":"+ New Entry"}</GoldBtn>
      </div>
      {adding&&(
        <Card className="fadeUp" style={{marginBottom:16,borderColor:"rgba(212,175,100,0.15)"}}>
          <Label>New Entry</Label>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <input value={newTitle} onChange={e=>setNewTitle(e.target.value)} placeholder="Title..." style={{padding:"10px 14px",background:"rgba(10,13,20,0.8)",border:`1px solid ${T.border}`,borderRadius:5,fontFamily:T.body,fontSize:14,color:T.textMid,outline:"none"}} />
            <textarea value={newContent} onChange={e=>setNewContent(e.target.value)} placeholder="Your note or idea..." style={{padding:"12px 14px",background:"rgba(10,13,20,0.8)",border:`1px solid ${T.border}`,borderRadius:5,fontFamily:T.body,fontSize:14,color:T.textMid,outline:"none",resize:"vertical",minHeight:100}} />
            <input value={newTag} onChange={e=>setNewTag(e.target.value)} placeholder="Tags (comma separated)..." style={{padding:"10px 14px",background:"rgba(10,13,20,0.8)",border:`1px solid ${T.border}`,borderRadius:5,fontFamily:T.body,fontSize:13,color:T.textMid,outline:"none"}} />
            <GoldBtn onClick={addNote} style={{alignSelf:"flex-start"}}>Save to Vault</GoldBtn>
          </div>
        </Card>
      )}
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {filtered.map((n,i)=>(
          <Card key={n.id} className="fadeUp" style={{animationDelay:`${i*0.05}s`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div style={{flex:1}}>
                <h3 style={{fontFamily:T.serif,fontSize:17,fontWeight:300,color:T.text,marginBottom:8}}>{n.title}</h3>
                {n.content&&<p style={{fontFamily:T.body,fontSize:13,fontStyle:"italic",color:T.textDim,margin:0,lineHeight:1.55}}>{n.content.slice(0,120)}{n.content.length>120?"...":""}</p>}
                {summary[n.id]&&<div style={{marginTop:12,padding:"12px 14px",background:T.goldFaint,borderRadius:6,fontFamily:T.body,fontSize:13,color:T.textMid,lineHeight:1.6,fontStyle:"italic",borderLeft:"2px solid rgba(212,175,100,0.3)"}}>{summary[n.id]}</div>}
                <div style={{marginTop:12,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  {n.tags?.map(t=><span key={t} style={{fontFamily:T.body,fontSize:9,letterSpacing:"0.18em",textTransform:"uppercase",color:T.goldDim,border:"1px solid rgba(212,175,100,0.15)",padding:"2px 8px",borderRadius:2}}>{t}</span>)}
                  <button onClick={()=>summarize(n)} style={{background:"none",border:"none",fontFamily:T.body,fontSize:10,color:"rgba(180,170,155,0.3)",cursor:"pointer",letterSpacing:"0.1em",marginLeft:4,display:"flex",alignItems:"center",gap:5}}>
                    {summarizing===n.id?<><Spinner /> Analyzing...</>:"✦ AI Summary"}
                  </button>
                </div>
              </div>
              <div style={{fontFamily:T.body,fontSize:10,color:T.textDim,marginLeft:20,flexShrink:0}}>{n.date}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ════════════════ ANALYTICS MODULE ════════════════════════════ */
function AnalyticsModule() {
  const dayData=getWeekDayData();
  const maxM=Math.max(...dayData.map(d=>d.mins),1);
  const weekTotal=getWeekMinutes();

  return (
    <div>
      <SectionHead title="Patterns & Insights" sub="Understanding yourself through data." />
      <div className="fadeUp" style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:18}}>
        {[
          {label:"Focus Today",val:fmtMins(getTodayMinutes()),sub:"Resets at midnight",accent:true},
          {label:"This Week",val:fmtMins(weekTotal),sub:"7-day total"},
          {label:"Best Day",val:dayData.reduce((a,b)=>b.mins>a.mins?b:a,{mins:0,label:"–"}).label,sub:"Highest focus day",accent:true},
          {label:"Vault Notes",val:"47",sub:"Since inception"},
        ].map(s=>(
          <Card key={s.label} style={{flex:1,minWidth:130,padding:"20px 18px"}}>
            <Label style={{marginBottom:8}}>{s.label}</Label>
            <div style={{fontFamily:T.serif,fontSize:28,fontWeight:300,color:s.accent?T.gold:T.text}}>{s.val}</div>
            <div style={{fontFamily:T.body,fontSize:11,color:T.textDim,marginTop:5,fontStyle:"italic"}}>{s.sub}</div>
          </Card>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"3fr 2fr",gap:16}}>
        <Card className="fadeUp fadeUp-1">
          <Label>Focus Time — This Week (Live)</Label>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,height:130,marginBottom:10}}>
            {dayData.map((d,i)=>(
              <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                <div style={{width:"100%",height:`${Math.max(4,(d.mins/maxM)*100)}px`,background:d.isToday?"rgba(212,175,100,0.75)":`rgba(212,175,100,${0.15+(d.mins/maxM)*0.45})`,borderRadius:"3px 3px 0 0",position:"relative",transition:"height 0.8s ease",border:d.isToday?"1px solid rgba(212,175,100,0.3)":"none"}}>
                  {d.mins>0&&<div style={{position:"absolute",top:-18,left:"50%",transform:"translateX(-50%)",fontFamily:T.body,fontSize:9,color:T.goldDim,whiteSpace:"nowrap"}}>{fmtMins(d.mins)}</div>}
                </div>
                <div style={{fontFamily:T.body,fontSize:10,color:d.isToday?T.gold:T.textDim}}>{d.label}</div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card className="fadeUp fadeUp-2">
            <Label>Activity Balance</Label>
            {[["Focus",55],["Reflection",25],["Learning",20]].map(([l,p])=>(
              <div key={l} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}><span style={{fontFamily:T.body,fontSize:12,color:T.textDim}}>{l}</span><span style={{fontFamily:T.body,fontSize:10,color:T.goldDim}}>{p}%</span></div>
                <div style={{height:2,background:T.goldFaint,borderRadius:1}}><div style={{height:"100%",width:`${p}%`,background:"rgba(212,175,100,0.5)",borderRadius:1}} /></div>
              </div>
            ))}
          </Card>
          <Card className="fadeUp fadeUp-3">
            <Label>Pattern Insight</Label>
            <p style={{fontFamily:T.serif,fontSize:15,fontWeight:300,fontStyle:"italic",color:T.text,lineHeight:1.65,margin:0}}>
              {weekTotal>0?"Your consistency this week is building momentum. Each logged session compounds your evolution.":"Begin logging focus sessions to unlock personalized pattern insights."}
            </p>
          </Card>
          <Card className="fadeUp fadeUp-4">
            <Label>Monthly Trend</Label>
            <div style={{display:"flex",gap:6,alignItems:"flex-end",height:50}}>
              {[38,42,45,50,48,55,60,58,62,65,70,68].map((v,i)=>(
                <div key={i} style={{flex:1,height:`${(v/70)*100}%`,background:i===11?"rgba(212,175,100,0.7)":"rgba(212,175,100,0.2)",borderRadius:"2px 2px 0 0"}} />
              ))}
            </div>
            <div style={{fontFamily:T.body,fontSize:10,color:T.textDim,marginTop:6,fontStyle:"italic"}}>12-month focus trajectory ↑ 79%</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ════════════════ ROOT APP ══════════════════════════════════════ */
const DEFAULT_NOTES = [
  {id:1,title:"On the Nature of Deep Work",date:"Mar 4",content:"Depth is not about time spent but about the quality of attention brought to a task. The mind needs friction-free immersion.",tags:["focus","productivity"]},
  {id:2,title:"The Compound Effect of Identity",date:"Mar 2",content:"Every small decision is a vote for the person you're becoming. Identity change is the north star of behavior change.",tags:["identity","growth"]},
  {id:3,title:"Principles of Calm Productivity",date:"Feb 28",content:"True productivity emerges from a clear mind, not a busy one. Slow down to go fast.",tags:["focus","calm"]},
];

export default function App() {
  const [screen,setScreen]=useState("entry");
  const [user,setUser]=useState(null);
  const [profile,setProfile]=useState(null);
  const [active,setActive]=useState("dashboard");
  const [contentVis,setContentVis]=useState(false);
  const [vaultNotes,setVaultNotes]=useState(DEFAULT_NOTES);
  const [trackingRefresh,setTrackingRefresh]=useState(0);

  function handleEntryDone(){setScreen("auth");}

  function handleAuth(u){
    setUser(u);
    if(u.isNew){setScreen("onboarding");}
    else{
      setProfile({primaryGoal:"Deep Work & Productivity",biggestChallenge:"Distraction & digital noise",morningType:"Morning (8–11am)",dailyHours:"3–4 hours"});
      setScreen("app"); setTimeout(()=>setContentVis(true),300);
    }
  }

  function handleOnboarding(answers){
    setProfile(answers); setScreen("app"); setTimeout(()=>setContentVis(true),300);
  }

  function handleLogout(){
    setUser(null); setProfile(null); setScreen("entry"); setContentVis(false);
    ambientEngine.stop();
    sessionStorage.clear();
  }

  function handleSetActive(id){
    setContentVis(false);
    setTimeout(()=>{setActive(id);setContentVis(true);},180);
  }

  function onMinutesLogged(){
    setTrackingRefresh(r=>r+1);
  }

  const panels={
    dashboard: <Dashboard profile={profile} vaultNotes={vaultNotes} trackingRefresh={trackingRefresh} />,
    focus:     <FocusModule onMinutesLogged={onMinutesLogged} />,
    ambient:   <AmbientModule />,
    podcasts:  <PodcastsModule />,
    reflect:   <ReflectModule />,
    identity:  <IdentityModule profile={profile} />,
    vault:     <VaultModule notes={vaultNotes} setNotes={setVaultNotes} />,
    analytics: <AnalyticsModule />,
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      <StarField />
      {screen==="entry"      && <EntryScreen onEnter={handleEntryDone} />}
      {screen==="auth"       && <AuthScreen onAuth={handleAuth} />}
      {screen==="onboarding" && <OnboardingScreen user={user} onComplete={handleOnboarding} />}
      {screen==="app"&&(
        <>
          <Sidebar active={active} setActive={handleSetActive} user={user} onLogout={handleLogout} />
          <main style={{marginLeft:216,minHeight:"100vh",padding:"48px 48px 80px",opacity:contentVis?1:0,transform:contentVis?"translateY(0)":"translateY(12px)",transition:"all 0.6s cubic-bezier(0.16,1,0.3,1)",position:"relative",zIndex:5}}>
            <div style={{maxWidth:960,margin:"0 auto"}}>
              {panels[active]}
            </div>
          </main>
        </>
      )}
    </>
  );
}
