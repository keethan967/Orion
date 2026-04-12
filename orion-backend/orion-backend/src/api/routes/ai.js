// src/api/routes/ai.js
const express = require('express');
const router  = express.Router();
const aiService      = require('../../services/aiService');
const contentService = require('../../services/contentService');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter }   = require('../middleware/rateLimiter');
const { handleValidation, aiMessageRules } = require('../../utils/validators');
const { param } = require('express-validator');

// All AI routes require auth and rate limiting
router.use(requireAuth, aiLimiter);

// GET /api/ai/quote — personalized daily quote
router.get('/quote', async (req, res, next) => {
  try {
    const quote = await aiService.getDailyQuote(req.user.id, req.user);
    res.json({ quote });
  } catch (e) {
    // Graceful fallback
    res.json({ quote: "The most powerful thing you can do today is decide, clearly, who you are becoming." });
  }
});

// GET /api/ai/insight — personalized daily insight
router.get('/insight', async (req, res, next) => {
  try {
    const insight = await aiService.getDailyInsight(req.user.id, req.user);
    res.json({ insight });
  } catch (e) {
    res.json({ insight: "Your focus window is most powerful in the first 90 minutes after waking. Protect that time ruthlessly." });
  }
});

// GET /api/ai/reading — daily long-form reading
router.get('/reading', async (req, res, next) => {
  try {
    const reading = await aiService.getDailyReading(req.user.id, req.user);
    res.json({ reading });
  } catch (e) {
    res.json({ reading: { title: 'The Power of Intentional Living', topic: 'Philosophy', content: 'Intentional living begins with a clear decision about who you wish to become.' } });
  }
});

// POST /api/ai/strategist — chat with AI strategist
router.post('/strategist', aiMessageRules, handleValidation, async (req, res, next) => {
  try {
    const { message, history } = req.body;

    // Fetch user's vault notes for context
    const vaultNotes = await contentService.getNotes(req.user.id).catch(() => []);

    const reply = await aiService.strategistChat(
      req.user.id,
      message,
      history || [],
      req.user,
      vaultNotes.slice(0, 5), // top 5 notes as context
    );
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: 'AI strategist unavailable. Please try again.' });
  }
});

// POST /api/ai/summarize/:noteId — AI summary for a vault note
router.post('/summarize/:noteId', [
  param('noteId').isUUID().withMessage('Invalid note ID'),
  handleValidation,
], async (req, res, next) => {
  try {
    const note = (await contentService.getNotes(req.user.id))
      .find(n => n.id === req.params.noteId);
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const summary = await aiService.summarizeNote(req.user.id, note.title, note.content || '');
    res.json({ summary });
  } catch (e) {
    res.status(500).json({ error: 'Summary unavailable.' });
  }
});

module.exports = router;
