// src/services/podcastService.js
const { query } = require('../config/database');

/**
 * Return all active podcasts, optionally filtered by theme.
 */
async function getLibrary(theme = null) {
  const params = [];
  let sql = `SELECT id, title, host, description, theme, duration_secs, audio_url,
                    sort_order, published_on
             FROM podcasts WHERE is_active = TRUE`;
  if (theme) {
    params.push(theme);
    sql += ` AND theme = $${params.length}`;
  }
  sql += ' ORDER BY theme, sort_order ASC';
  const res = await query(sql, params);
  return res.rows;
}

/**
 * Deterministic daily picks — 2 podcasts per calendar day.
 * Uses a seeded shuffle of podcast IDs so it never changes for the same day.
 */
async function getDailyPodcasts(date = null) {
  const d = date ? new Date(date) : new Date();
  // Seed: year * 1000 + dayOfYear
  const start      = new Date(d.getFullYear(), 0, 0);
  const dayOfYear  = Math.floor((d - start) / 86400000);
  const seed       = d.getFullYear() * 1000 + dayOfYear;

  // LCG random function
  const lcg = s => ((s * 1664525 + 1013904223) & 0xffffffff) >>> 0;

  const res = await query(
    `SELECT id, title, host, description, theme, duration_secs, audio_url, sort_order
     FROM podcasts WHERE is_active = TRUE ORDER BY sort_order ASC`
  );
  const all = res.rows;
  if (all.length === 0) return [];

  const s1 = lcg(seed);
  const s2 = lcg(s1);
  let i1   = s1 % all.length;
  let i2   = s2 % all.length;
  if (i2 === i1) i2 = (i2 + 1) % all.length;
  return [all[i1], all[i2]];
}

/**
 * Get a single podcast by ID (includes transcript).
 */
async function getPodcast(id) {
  const res = await query(
    `SELECT id, title, host, description, theme, duration_secs, audio_url, transcript,
            sort_order, published_on
     FROM podcasts WHERE id = $1 AND is_active = TRUE`,
    [id]
  );
  return res.rows[0] || null;
}

/**
 * Save or update listening progress for a user.
 * Upserts: one row per (user, podcast).
 */
async function saveProgress(userId, podcastId, { position_secs, char_index, total_chars, completed }) {
  await query(
    `INSERT INTO podcast_progress
       (user_id, podcast_id, position_secs, char_index, total_chars, completed)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, podcast_id) DO UPDATE SET
       position_secs = EXCLUDED.position_secs,
       char_index    = EXCLUDED.char_index,
       total_chars   = EXCLUDED.total_chars,
       completed     = EXCLUDED.completed,
       updated_at    = NOW()`,
    [userId, podcastId,
     position_secs ?? 0,
     char_index    ?? 0,
     total_chars   ?? 0,
     completed     ?? false]
  );
}

/**
 * Get all progress entries for a user (for "Continue Listening").
 */
async function getUserProgress(userId) {
  const res = await query(
    `SELECT pp.podcast_id, pp.position_secs, pp.char_index, pp.total_chars,
            pp.completed, pp.updated_at,
            p.title, p.theme, p.duration_secs
     FROM podcast_progress pp
     JOIN podcasts p ON pp.podcast_id = p.id
     WHERE pp.user_id = $1
     ORDER BY pp.updated_at DESC`,
    [userId]
  );
  return res.rows;
}

/**
 * Get progress for a single podcast.
 */
async function getOneProgress(userId, podcastId) {
  const res = await query(
    `SELECT position_secs, char_index, total_chars, completed
     FROM podcast_progress WHERE user_id = $1 AND podcast_id = $2`,
    [userId, podcastId]
  );
  return res.rows[0] || null;
}

/**
 * Delete progress (when episode completed + cleared).
 */
async function clearProgress(userId, podcastId) {
  await query(
    'DELETE FROM podcast_progress WHERE user_id = $1 AND podcast_id = $2',
    [userId, podcastId]
  );
}

module.exports = {
  getLibrary,
  getDailyPodcasts,
  getPodcast,
  saveProgress,
  getUserProgress,
  getOneProgress,
  clearProgress,
};
