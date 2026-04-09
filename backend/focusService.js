// src/services/focusService.js
const { query } = require('../config/database');

/**
 * Log a completed focus session.
 */
async function logSession(userId, { duration_mins, mode = 'Deep Work', notes = '', started_at }) {
  const start = started_at ? new Date(started_at) : new Date(Date.now() - duration_mins * 60000);
  const end   = new Date(start.getTime() + duration_mins * 60000);

  const res = await query(
    `INSERT INTO focus_sessions (user_id, mode, duration_mins, notes, started_at, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [userId, mode, duration_mins, notes.trim(), start, end]
  );
  return res.rows[0];
}

/**
 * Get today's focus minutes (UTC date boundary).
 */
async function getDailyMinutes(userId) {
  const res = await query(
    `SELECT COALESCE(SUM(duration_mins), 0)::int AS total
     FROM focus_sessions
     WHERE user_id = $1
       AND started_at >= CURRENT_DATE AT TIME ZONE 'UTC'
       AND started_at <  (CURRENT_DATE + INTERVAL '1 day') AT TIME ZONE 'UTC'`,
    [userId]
  );
  return res.rows[0].total;
}

/**
 * Get focus minutes per day for the past N days.
 * Returns array of { date, mins } in ascending order.
 */
async function getWeekData(userId, days = 7) {
  const res = await query(
    `SELECT
       DATE(started_at AT TIME ZONE 'UTC') AS day,
       SUM(duration_mins)::int            AS mins
     FROM focus_sessions
     WHERE user_id = $1
       AND started_at >= (CURRENT_DATE - INTERVAL '${days - 1} days') AT TIME ZONE 'UTC'
     GROUP BY 1
     ORDER BY 1 ASC`,
    [userId]
  );

  // Fill in missing days with 0
  const map = {};
  res.rows.forEach(r => { map[r.day] = r.mins; });

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d   = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    result.push({
      date:    key,
      label:   d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      mins:    map[key] || 0,
      isToday: i === 0,
    });
  }
  return result;
}

/**
 * Total lifetime focus minutes.
 */
async function getTotalMinutes(userId) {
  const res = await query(
    `SELECT COALESCE(SUM(duration_mins), 0)::int AS total
     FROM focus_sessions WHERE user_id = $1`,
    [userId]
  );
  return res.rows[0].total;
}

/**
 * Weekly discipline score (0–100) based on session consistency.
 */
async function getWeeklyScore(userId) {
  const week  = await getWeekData(userId, 7);
  const total = week.reduce((s, d) => s + d.mins, 0);
  const activeDays = week.filter(d => d.mins >= 15).length; // days with ≥15 min
  // Score: (active days / 7) * 60% + (total minutes / 420) * 40%, capped at 100
  const score = Math.min(100, Math.round(
    (activeDays / 7) * 60 + (Math.min(total, 420) / 420) * 40
  ));
  return { score, activeDays, totalMins: total };
}

/**
 * Log the user's current emotional state.
 */
async function logEmotionalState(userId, state, weekTargetMins = null) {
  await query(
    `INSERT INTO emotional_states (user_id, state, week_target_mins)
     VALUES ($1, $2, $3)`,
    [userId, state, weekTargetMins]
  );
}

/**
 * Get most recent emotional state.
 */
async function getLatestEmotionalState(userId) {
  const res = await query(
    `SELECT state, week_target_mins, logged_at
     FROM emotional_states WHERE user_id = $1
     ORDER BY logged_at DESC LIMIT 1`,
    [userId]
  );
  return res.rows[0] || null;
}

/**
 * Return aggregated analytics payload for the Analytics module.
 */
async function getAnalytics(userId) {
  const [daily, week, total, score, emotional] = await Promise.all([
    getDailyMinutes(userId),
    getWeekData(userId, 7),
    getTotalMinutes(userId),
    getWeeklyScore(userId),
    getLatestEmotionalState(userId),
  ]);

  return {
    todayMins:     daily,
    weekMins:      week.reduce((s, d) => s + d.mins, 0),
    totalMins:     total,
    weekData:      week,
    weeklyScore:   score,
    emotionalState: emotional?.state || null,
  };
}

module.exports = {
  logSession,
  getDailyMinutes,
  getWeekData,
  getTotalMinutes,
  getWeeklyScore,
  logEmotionalState,
  getLatestEmotionalState,
  getAnalytics,
};
