// src/utils/validators.js
const { body, param, query, validationResult } = require('express-validator');

/**
 * Returns 422 with field errors if express-validator found issues
 */
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      error: 'Validation failed',
      fields: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

// ── Auth validators ──────────────────────────────────────────────
const registerRules = [
  body('name')
    .trim().notEmpty().withMessage('Name is required')
    .isLength({ max: 120 }).withMessage('Name too long'),
  body('email')
    .trim().normalizeEmail().isEmail().withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .isLength({ max: 128 }).withMessage('Password too long'),
];

const loginRules = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
];

const forgotPasswordRules = [
  body('email').trim().normalizeEmail().isEmail().withMessage('Valid email required'),
];

const resetPasswordRules = [
  body('token').trim().notEmpty().withMessage('Reset token required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .isLength({ max: 128 }),
];

// ── Focus session validators ─────────────────────────────────────
const focusSessionRules = [
  body('duration_mins')
    .isInt({ min: 1, max: 480 }).withMessage('Duration must be 1–480 minutes'),
  body('mode')
    .optional().trim()
    .isIn(['Deep Work', 'Study', 'Creative', 'Meditation', 'Custom'])
    .withMessage('Invalid session mode'),
  body('notes')
    .optional().trim().isLength({ max: 1000 }),
];

// ── Podcast progress validators ──────────────────────────────────
const podcastProgressRules = [
  param('id').isUUID().withMessage('Invalid podcast ID'),
  body('position_secs').isInt({ min: 0 }).withMessage('position_secs must be >= 0'),
  body('char_index').optional().isInt({ min: 0 }),
  body('total_chars').optional().isInt({ min: 0 }),
];

// ── Vault note validators ────────────────────────────────────────
const vaultNoteRules = [
  body('title').trim().notEmpty().withMessage('Title required')
    .isLength({ max: 200 }),
  body('content').optional().trim().isLength({ max: 20000 }),
  body('tags').optional().isArray({ max: 10 }),
  body('tags.*').optional().trim().isLength({ max: 50 }),
];

// ── Reflection validators ────────────────────────────────────────
const reflectionRules = [
  body('content').trim().notEmpty().withMessage('Content required')
    .isLength({ min: 5, max: 10000 }),
];

// ── AI strategist ────────────────────────────────────────────────
const aiMessageRules = [
  body('message').trim().notEmpty().withMessage('Message required')
    .isLength({ max: 2000 }).withMessage('Message too long (max 2000 chars)'),
  body('history').optional().isArray({ max: 20 }),
];

// ── Onboarding ───────────────────────────────────────────────────
const onboardingRules = [
  body('primaryGoal').optional().trim().isLength({ max: 120 }),
  body('dailyHours').optional().trim().isLength({ max: 60 }),
  body('biggestChallenge').optional().trim().isLength({ max: 120 }),
  body('morningType').optional().trim().isLength({ max: 80 }),
];

module.exports = {
  handleValidation,
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  focusSessionRules,
  podcastProgressRules,
  vaultNoteRules,
  reflectionRules,
  aiMessageRules,
  onboardingRules,
};
