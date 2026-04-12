// src/services/contentService.js
// Vault notes and reflections
const { query } = require('../config/database');

// ── VAULT NOTES ──────────────────────────────────────────────────

async function getNotes(userId, { search, tag } = {}) {
  let sql = `SELECT id, title, content, tags, created_at FROM vault_notes
             WHERE user_id = $1`;
  const params = [userId];

  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (title ILIKE $${params.length} OR content ILIKE $${params.length})`;
  }
  if (tag) {
    params.push(tag);
    sql += ` AND $${params.length} = ANY(tags)`;
  }

  sql += ' ORDER BY created_at DESC LIMIT 100';
  const res = await query(sql, params);
  return res.rows;
}

async function createNote(userId, { title, content, tags = [] }) {
  const res = await query(
    `INSERT INTO vault_notes (user_id, title, content, tags)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [userId, title.trim(), (content || '').trim(), tags]
  );
  return res.rows[0];
}

async function updateNote(userId, noteId, { title, content, tags }) {
  const res = await query(
    `UPDATE vault_notes SET
       title      = COALESCE($3, title),
       content    = COALESCE($4, content),
       tags       = COALESCE($5, tags),
       updated_at = NOW()
     WHERE id = $1 AND user_id = $2 RETURNING *`,
    [noteId, userId, title?.trim(), content?.trim(), tags]
  );
  return res.rows[0] || null;
}

async function deleteNote(userId, noteId) {
  const res = await query(
    'DELETE FROM vault_notes WHERE id = $1 AND user_id = $2 RETURNING id',
    [noteId, userId]
  );
  return res.rows[0] || null;
}

// ── REFLECTIONS ──────────────────────────────────────────────────

async function createReflection(userId, content) {
  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;
  const res = await query(
    `INSERT INTO reflections (user_id, content, word_count)
     VALUES ($1, $2, $3) RETURNING id, word_count, created_at`,
    [userId, content.trim(), wordCount]
  );
  return res.rows[0];
}

async function getReflections(userId, limit = 20) {
  const res = await query(
    `SELECT id, content, word_count, created_at
     FROM reflections WHERE user_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [userId, limit]
  );
  return res.rows;
}

module.exports = {
  getNotes, createNote, updateNote, deleteNote,
  createReflection, getReflections,
};
