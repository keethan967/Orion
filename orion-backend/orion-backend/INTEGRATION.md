# Orion — Frontend ↔ Backend Integration Guide

## What changes in `orion-v4.jsx`

The backend replaces three things:
1. Direct `callClaude()` calls → backend AI proxy
2. `localStorage` time tracking → persistent DB sessions  
3. Client-side auth (any password works) → real bcrypt + JWT auth

All UI, animations, design, and component structure stay **exactly the same**.

---

## Step 1 — Add the API client

Copy `orion-api-client.js` to your frontend project root.

Add to the top of `orion-v4.jsx`:

```js
import api from './orion-api-client';
```

Set your API URL in `.env`:

```
REACT_APP_API_URL=http://localhost:4000/api
```

---

## Step 2 — Replace `handleAuth` (AuthScreen)

**Before:**
```js
function handleSubmit() {
  const user = { email, name, isNew: mode === 'signup' };
  onAuth(user);
}
```

**After:**
```js
async function handleSubmit() {
  try {
    if (mode === 'signup') {
      const res = await api.auth.register(name, email, pass);
      setErr(res.message); // "Check your email to verify"
    } else {
      const res = await api.auth.login(email, pass);
      if (!res.ok) { setErr(res.message); return; }
      onAuth({ ...res.user, isNew: !res.user.onboardingDone });
    }
  } catch (e) {
    setErr(e.body?.error || 'Login failed');
  }
}
```

---

## Step 3 — Replace `handleLogout`

```js
async function handleLogout() {
  await api.auth.logout();
  setUser(null); setProfile(null); setScreen('entry');
  ambientEngine.stop();
}
```

---

## Step 4 — Replace `handleOnboarding`

```js
async function handleOnboarding(answers) {
  await api.auth.saveOnboarding(answers);
  setProfile(answers);
  setScreen('app');
  setTimeout(() => setContentVis(true), 300);
}
```

---

## Step 5 — Replace AI calls

| Old (direct Anthropic)              | New (backend proxy)                          |
|-------------------------------------|----------------------------------------------|
| `callClaude([...], systemPrompt)`   | `api.ai.getQuote()` / `api.ai.getInsight()`  |
| `callClaude(msgs, sys)` (strategist)| `api.ai.strategistChat(message, history)`    |
| `callClaude(...)` (weekly target)   | `api.ai.getWeeklyTarget(state, weekMins)`    |
| `callClaude(...)` (note summary)    | `api.ai.summarizeNote(noteId)`               |

**DailyQuote — before:**
```js
callClaude([{role:'user', content:prompt}], sys, 200).then(setQuote);
```

**DailyQuote — after:**
```js
api.ai.getQuote().then(setQuote).catch(() => setQuote(fallback));
```

---

## Step 6 — Replace time tracking

**Before (localStorage):**
```js
addMinutesToday(mins);      // updates localStorage
getTodayMinutes();          // reads localStorage
```

**After (backend):**
```js
// On session complete:
await api.focus.logSession(mins, mode);

// To read today's total:
const { mins } = await api.focus.getToday();

// Weekly data for charts:
const { days } = await api.focus.getWeek();
```

The `getWeekDayData()` function that feeds the bar charts can be kept as-is for 
offline display — just sync from `api.focus.getWeek()` on mount.

---

## Step 7 — Replace podcast progress

**Before (localStorage key `orion_podcast_progress_v2`):**
```js
savePodcastProgress(id, charIndex, totalChars);
loadPodcastProgress();
clearPodcastProgress(id);
```

**After:**
```js
// Save progress
await api.podcasts.saveProgress(id, positionSecs, charIndex, totalChars);

// Load all progress on mount
const { progressMap } = await api.podcasts.getLibrary();

// Clear on completion
await api.podcasts.clearProgress(id);
```

The `progressMap` returned from `getLibrary()` is already keyed by `podcast_id` 
and has the same shape the frontend expects.

---

## Session persistence on page load

Add this to `App` component `useEffect`:

```js
useEffect(() => {
  const token = api.storage.getToken();
  if (!token) return;
  api.auth.me().then(user => {
    setUser(user);
    setProfile({
      primaryGoal: user.primaryGoal,
      dailyHours: user.dailyHours,
      biggestChallenge: user.biggestChallenge,
      morningType: user.morningType,
    });
    setScreen('app');
    setTimeout(() => setContentVis(true), 300);
  }).catch(() => api.storage.clearToken());
}, []);
```

---

## Environment variables summary

**Backend `.env`:**
```
DATABASE_URL=postgresql://...
JWT_SECRET=your-64-char-random-secret
ANTHROPIC_API_KEY=sk-ant-...
SMTP_HOST=smtp.gmail.com
SMTP_USER=you@gmail.com
SMTP_PASS=your-app-password
FRONTEND_URL=http://localhost:3000
PORT=4000
```

**Frontend `.env`:**
```
REACT_APP_API_URL=http://localhost:4000/api
```

---

## Running locally

```bash
# 1. Start PostgreSQL
createdb orion_db

# 2. Install & migrate
cd orion-backend
npm install
node src/db/migrate.js
node src/db/seeds/index.js

# 3. Start server
npm run dev   # nodemon on port 4000

# 4. Start frontend (separate terminal)
cd ../orion-frontend
npm start     # CRA / Vite on port 3000
```

---

## API reference

| Method | Path                          | Auth | Description                     |
|--------|-------------------------------|------|---------------------------------|
| POST   | /api/auth/register            | —    | Create account                  |
| GET    | /api/auth/verify-email?token= | —    | Verify email                    |
| POST   | /api/auth/login               | —    | Login → access + refresh token  |
| POST   | /api/auth/refresh             | —    | Refresh access token            |
| POST   | /api/auth/logout              | —    | Revoke refresh token            |
| POST   | /api/auth/forgot-password     | —    | Send reset email                |
| POST   | /api/auth/reset-password      | —    | Set new password                |
| GET    | /api/auth/me                  | ✓    | Get current user                |
| POST   | /api/auth/onboarding          | ✓    | Save onboarding answers         |
| POST   | /api/focus/sessions           | ✓    | Log focus session               |
| GET    | /api/focus/today              | ✓    | Today's focus minutes           |
| GET    | /api/focus/week               | ✓    | 7-day breakdown                 |
| GET    | /api/focus/analytics          | ✓    | Full analytics payload          |
| GET    | /api/focus/weekly-target      | ✓    | AI weekly target                |
| POST   | /api/focus/emotional-state    | ✓    | Log emotional state             |
| GET    | /api/podcasts                 | ✓    | Library + progress + daily      |
| GET    | /api/podcasts/daily           | ✓    | Today's 2 picks                 |
| GET    | /api/podcasts/:id             | ✓    | Single podcast + transcript     |
| PUT    | /api/podcasts/:id/progress    | ✓    | Save listening position         |
| DELETE | /api/podcasts/:id/progress    | ✓    | Clear progress                  |
| GET    | /api/ai/quote                 | ✓    | Personalized daily quote        |
| GET    | /api/ai/insight               | ✓    | Personalized daily insight      |
| GET    | /api/ai/reading               | ✓    | Daily long-form reading         |
| POST   | /api/ai/strategist            | ✓    | Chat with AI strategist         |
| POST   | /api/ai/summarize/:noteId     | ✓    | Summarize vault note            |
| GET    | /api/content/notes            | ✓    | Get vault notes                 |
| POST   | /api/content/notes            | ✓    | Create vault note               |
| PATCH  | /api/content/notes/:id        | ✓    | Update vault note               |
| DELETE | /api/content/notes/:id        | ✓    | Delete vault note               |
| GET    | /api/content/reflections      | ✓    | Get reflections                 |
| POST   | /api/content/reflections      | ✓    | Save reflection                 |
| GET    | /health                       | —    | DB health check                 |
