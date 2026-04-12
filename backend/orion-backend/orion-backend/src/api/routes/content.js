// src/api/routes/content.js
const express = require('express');
const router  = express.Router();
const contentService = require('../../services/contentService');
const { requireAuth } = require('../middleware/auth');
const { handleValidation, vaultNoteRules, reflectionRules } = require('../../utils/validators');
const { param } = require('express-validator');

router.use(requireAuth);

// ── VAULT NOTES ──────────────────────────────────────────────────

// GET /api/content/notes
router.get('/notes', async (req, res, next) => {
  try {
    const notes = await contentService.getNotes(req.user.id, {
      search: req.query.search,
      tag:    req.query.tag,
    });
    res.json({ notes });
  } catch (e) { next(e); }
});

// POST /api/content/notes
router.post('/notes', vaultNoteRules, handleValidation, async (req, res, next) => {
  try {
    const note = await contentService.createNote(req.user.id, req.body);
    res.status(201).json({ ok: true, note });
  } catch (e) { next(e); }
});

// PATCH /api/content/notes/:id
router.patch('/notes/:id', [
  param('id').isUUID(),
  ...vaultNoteRules.map(r => r.optional ? r : r),
  handleValidation,
], async (req, res, next) => {
  try {
    const note = await contentService.updateNote(req.user.id, req.params.id, req.body);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ ok: true, note });
  } catch (e) { next(e); }
});

// DELETE /api/content/notes/:id
router.delete('/notes/:id', [
  param('id').isUUID(), handleValidation,
], async (req, res, next) => {
  try {
    const deleted = await contentService.deleteNote(req.user.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Note not found' });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── REFLECTIONS ──────────────────────────────────────────────────

// GET /api/content/reflections
router.get('/reflections', async (req, res, next) => {
  try {
    const reflections = await contentService.getReflections(req.user.id);
    res.json({ reflections });
  } catch (e) { next(e); }
});

// POST /api/content/reflections
router.post('/reflections', reflectionRules, handleValidation, async (req, res, next) => {
  try {
    const entry = await contentService.createReflection(req.user.id, req.body.content);
    res.status(201).json({ ok: true, entry });
  } catch (e) { next(e); }
});

module.exports = router;
