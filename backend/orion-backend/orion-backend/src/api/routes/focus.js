// src/api/routes/focus.js
const express = require('express');
const router  = express.Router();
const focusService = require('../../services/focusService');
const aiService    = require('../../services/aiService');
const { requireAuth } = require('../middleware/auth');
const { handleValidation, focusSessionRules } = require('../../utils/validators');
const { body } = require('express-validator');

// All routes require auth
router.use(requireAuth);

// POST /api/focus/sessions — log a completed focus session
router.post('/sessions', focusSessionRules, handleValidation, async (req, res, next) => {
  try {
    const session = await focusService.logSession(req.user.id, {
      duration_mins: req.body.duration_mins,
      mode:          req.body.mode,
      notes:         req.body.notes,
      started_at:    req.body.started_at,
    });
    res.status(201).json({ ok: true, session });
  } catch (e) { next(e); }
});

// GET /api/focus/today — today's total focus minutes
router.get('/today', async (req, res, next) => {
  try {
    const mins = await focusService.getDailyMinutes(req.user.id);
    res.json({ mins });
  } catch (e) { next(e); }
});

// GET /api/focus/week — 7-day breakdown
router.get('/week', async (req, res, next) => {
  try {
    const data = await focusService.getWeekData(req.user.id, 7);
    res.json({ days: data });
  } catch (e) { next(e); }
});

// GET /api/focus/analytics — full analytics payload
router.get('/analytics', async (req, res, next) => {
  try {
    const data = await focusService.getAnalytics(req.user.id);
    res.json(data);
  } catch (e) { next(e); }
});

// POST /api/focus/emotional-state — log stress/mood state
router.post('/emotional-state', [
  body('state').trim().isIn(['calm','moderate','stressed','anxious','overwhelmed'])
    .withMessage('Invalid state'),
  body('weekTargetMins').optional().isInt({ min: 0 }),
  handleValidation,
], async (req, res, next) => {
  try {
    await focusService.logEmotionalState(req.user.id, req.body.state, req.body.weekTargetMins);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// GET /api/focus/weekly-target?state=calm — AI recommended weekly target
router.get('/weekly-target', async (req, res, next) => {
  try {
    const { state = 'moderate' } = req.query;
    const weekMins = await focusService.getWeekData(req.user.id, 7)
      .then(days => days.reduce((s, d) => s + d.mins, 0));
    const target = await aiService.getWeeklyTarget(req.user.id, state, weekMins);
    res.json({ target });
  } catch (e) { next(e); }
});

module.exports = router;
