// src/services/aiService.js
// All Anthropic API calls go through here — API key never touches the frontend.
const https  = require('https');
const { query } = require('../config/database');
const logger = require('../config/logger');

const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const MODEL           = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const ANTHROPIC_URL   = 'https://api.anthropic.com/v1/messages';

/**
 * Low-level POST to Anthropic API using Node's built-in https.
 * (No axios/node-fetch dependency needed.)
 */
async function callAnthropic({ system, messages, maxTokens = 1000 }) {
  if (!ANTHROPIC_KEY) {
    logger.warn('[AI] ANTHROPIC_API_KEY not set, returning fallback');
    throw new Error('AI service unavailable');
  }

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message));
          const text = (json.content || []).map(b => b.text || '').join('');
          resolve(text);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Cache an AI response in the database.
 * cacheKey is a hash of the prompt context to avoid re-calling for the same day.
 */
async function cacheAndSave(userId, type, cacheKey, promptSummary, responseText, tokensUsed = null) {
  try {
    await query(
      `INSERT INTO ai_interactions (user_id, type, prompt_summary, response_text, tokens_used, cache_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, promptSummary, responseText, tokensUsed, cacheKey]
    );
  } catch (e) {
    logger.warn('[AI] Failed to cache interaction:', e.message);
  }
}

/**
 * Check if we have a cached response for this cacheKey (same day).
 */
async function getCached(cacheKey) {
  const res = await query(
    `SELECT response_text FROM ai_interactions
     WHERE cache_key = $1 AND created_at >= CURRENT_DATE
     ORDER BY created_at DESC LIMIT 1`,
    [cacheKey]
  );
  return res.rows[0]?.response_text || null;
}

// ── Public AI endpoints ──────────────────────────────────────────

/**
 * Generate today's daily quote personalized to user profile.
 */
async function getDailyQuote(userId, profile) {
  const cacheKey = `quote_${userId}_${new Date().toISOString().slice(0, 10)}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const text = await callAnthropic({
    system: "You are a philosophical writer who crafts precise, luminous quotes for self-evolving individuals. Never use clichés. Write as if carving truth into stone.",
    messages: [{
      role: 'user',
      content: `Generate one powerful, original quote (2-3 sentences max) for someone focused on: "${profile?.primaryGoal || 'personal growth'}". No attribution. Private wisdom only.`,
    }],
    maxTokens: 200,
  });

  const clean = text.replace(/^["']|["']$/g, '').trim();
  await cacheAndSave(userId, 'quote', cacheKey, profile?.primaryGoal, clean);
  return clean;
}

/**
 * Generate personalized daily insight.
 */
async function getDailyInsight(userId, profile) {
  const cacheKey = `insight_${userId}_${new Date().toISOString().slice(0, 10)}`;
  const cached = await getCached(cacheKey);
  if (cached) return cached;

  const ctx = `Goal: ${profile?.primaryGoal || 'growth'}. Challenge: ${profile?.biggestChallenge || 'focus'}. Peak: ${profile?.morningType || 'morning'}.`;
  const text = await callAnthropic({
    system: "You are Orion's strategic intelligence. Give precise, personalized daily guidance like a world-class mentor. Never be generic.",
    messages: [{
      role: 'user',
      content: `Based on this user profile: ${ctx} — give one specific, actionable daily insight (3-4 sentences). Be direct, strategic, warm.`,
    }],
    maxTokens: 300,
  });

  await cacheAndSave(userId, 'insight', cacheKey, ctx, text.trim());
  return text.trim();
}

/**
 * Generate a short daily reading (title + content JSON).
 */
async function getDailyReading(userId, profile) {
  const cacheKey = `reading_${userId}_${new Date().toISOString().slice(0, 10)}`;
  const cached = await getCached(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch {}
  }

  const text = await callAnthropic({
    system: "You are a curator of deep, life-changing ideas. Return only valid JSON, no markdown.",
    messages: [{
      role: 'user',
      content: `Create a short reading (180-220 words) for someone focused on: "${profile?.primaryGoal || 'personal growth'}". Choose from: philosophy, cognitive science, strategy, stoicism. Return JSON: {"title":"...","topic":"...","content":"..."}`,
    }],
    maxTokens: 400,
  });

  let reading = null;
  try {
    reading = JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch {
    reading = { title: 'The Power of Intentional Living', topic: 'Philosophy', content: text };
  }

  await cacheAndSave(userId, 'reading', cacheKey, profile?.primaryGoal, JSON.stringify(reading));
  return reading;
}

/**
 * AI-recommended weekly target based on emotional state.
 */
async function getWeeklyTarget(userId, emotionalState, currentWeekMins) {
  const cacheKey = `weektarget_${userId}_${new Date().toISOString().slice(0, 10)}_${emotionalState}`;
  const cached = await getCached(cacheKey);
  if (cached) return parseInt(cached);

  const text = await callAnthropic({
    system: "You are a wellness strategist. Return only a plain integer number of minutes as the weekly target. No words, no units, just the number.",
    messages: [{
      role: 'user',
      content: `User state: "${emotionalState}". Current weekly minutes: ${currentWeekMins}. Recommend a realistic weekly focus target (minutes). Return ONLY a number between 300 and 2100.`,
    }],
    maxTokens: 20,
  });

  const mins = parseInt(text.trim().replace(/[^0-9]/g, ''));
  const target = isNaN(mins) ? 840 : Math.max(300, Math.min(2100, mins));
  await cacheAndSave(userId, 'weekly_target', cacheKey, emotionalState, String(target));
  return target;
}

/**
 * AI Strategist conversation — stateless (client sends history).
 * Returns the assistant reply string.
 */
async function strategistChat(userId, userMessage, history, profile, vaultNotes = []) {
  const vaultCtx = vaultNotes.length
    ? `\n\nUser vault context:\n${vaultNotes.map(n => `- "${n.title}": ${(n.content || '').slice(0, 100)}`).join('\n')}`
    : '';

  const system = `You are Orion's strategic intelligence — a world-class mentor. Calm, precise, wise. Direct, actionable, never generic. Studied philosophy, psychology, strategy, peak performance.
Profile: goal:${profile?.primaryGoal || 'not set'}, challenge:${profile?.biggestChallenge || 'not set'}, hours:${profile?.dailyHours || 'not set'}, peak:${profile?.morningType || 'not set'}${vaultCtx}
Keep responses 2-4 paragraphs. No markdown headers.`;

  // Build message history (max last 20 turns)
  const recent = (history || []).slice(-20);
  const messages = [
    ...recent,
    { role: 'user', content: userMessage },
  ];

  const reply = await callAnthropic({ system, messages, maxTokens: 800 });

  // Store the interaction (async, no await needed for response)
  cacheAndSave(userId, 'strategist', null, userMessage.slice(0, 200), reply).catch(() => {});

  return reply;
}

/**
 * Generate AI summary for a vault note.
 */
async function summarizeNote(userId, noteTitle, noteContent) {
  const text = await callAnthropic({
    system: "You are a precise knowledge curator. Summarize the core insight in 1-2 sentences.",
    messages: [{
      role: 'user',
      content: `Summarize this note titled "${noteTitle}":\n\n${noteContent.slice(0, 2000)}`,
    }],
    maxTokens: 150,
  });
  return text.trim();
}

module.exports = {
  getDailyQuote,
  getDailyInsight,
  getDailyReading,
  getWeeklyTarget,
  strategistChat,
  summarizeNote,
};
