// src/api/routes/podcasts.js
const express = require('express');
const router  = express.Router();
const podcastService = require('../../services/podcastService');
const { requireAuth } = require('../middleware/auth');
const { handleValidation, podcastProgressRules } = require('../../utils/validators');
const { param } = require('express-validator');

// GET /api/podcasts — full library, optional ?theme=Focus
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { theme } = req.query;
    const [library, progress, daily] = await Promise.all([
      podcastService.getLibrary(theme || null),
      podcastService.getUserProgress(req.user.id),
      podcastService.getDailyPodcasts(),
    ]);

    // Map progress by podcast_id for quick lookup
    const progressMap = {};
    progress.forEach(p => {
      progressMap[p.podcast_id] = {
        positionSecs: p.position_secs,
        charIndex:    p.char_index,
        totalChars:   p.total_chars,
        completed:    p.completed,
        updatedAt:    p.updated_at,
      };
    });

    res.json({
      library,
      dailyPicks: daily,
      progressMap,
    });
  } catch (e) { next(e); }
});

// GET /api/podcasts/daily — today's 2 picks
router.get('/daily', requireAuth, async (req, res, next) => {
  try {
    const picks = await podcastService.getDailyPodcasts();
    res.json({ picks });
  } catch (e) { next(e); }
});

// GET /api/podcasts/:id — single podcast with transcript
router.get('/:id', requireAuth, [
  param('id').isUUID().withMessage('Invalid ID'),
  handleValidation,
], async (req, res, next) => {
  try {
    const podcast = await podcastService.getPodcast(req.params.id);
    if (!podcast) return res.status(404).json({ error: 'Podcast not found' });

    // Attach user progress if exists
    const progress = await podcastService.getOneProgress(req.user.id, podcast.id);
    res.json({ podcast, progress: progress || null });
  } catch (e) { next(e); }
});

// PUT /api/podcasts/:id/progress — save listening position
router.put('/:id/progress', requireAuth, podcastProgressRules, handleValidation, async (req, res, next) => {
  try {
    await podcastService.saveProgress(req.user.id, req.params.id, {
      position_secs: req.body.position_secs,
      char_index:    req.body.char_index,
      total_chars:   req.body.total_chars,
      completed:     req.body.completed || false,
    });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// DELETE /api/podcasts/:id/progress — clear progress on completion
router.delete('/:id/progress', requireAuth, [
  param('id').isUUID().withMessage('Invalid ID'),
  handleValidation,
], async (req, res, next) => {
  try {
    await podcastService.clearProgress(req.user.id, req.params.id);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
