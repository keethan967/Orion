// src/api/routes/auth.js
const express = require('express');
const router  = express.Router();
const authService = require('../../services/authService');
const { requireAuth } = require('../middleware/auth');
const { authLimiter }  = require('../middleware/rateLimiter');
const {
  handleValidation,
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  onboardingRules,
} = require('../../utils/validators');

function clientInfo(req) {
  return {
    ip:        req.ip || req.connection?.remoteAddress,
    userAgent: req.headers['user-agent'],
  };
}

// POST /api/auth/register
router.post('/register', authLimiter, registerRules, handleValidation, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const result = await authService.register({ name, email, password, ...clientInfo(req) });
    res.status(201).json(result);
  } catch (e) { next(e); }
});

// GET /api/auth/verify-email?token=...
router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required' });
    const result = await authService.verifyEmail(token);
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/auth/login
router.post('/login', authLimiter, loginRules, handleValidation, async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await authService.login({ email, password, ...clientInfo(req) });
    if (!result.ok) return res.status(401).json(result);

    // Set refresh token as HttpOnly cookie
    res.cookie('orion_rt', result.refreshToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      ok:          true,
      accessToken: result.accessToken,
      user:        result.user,
    });
  } catch (e) { next(e); }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.orion_rt || req.body?.refreshToken;
    if (!rawToken) return res.status(401).json({ error: 'No refresh token' });
    const result = await authService.refreshAccessToken(rawToken, req.ip);
    if (!result.ok) return res.status(401).json(result);
    res.json({ ok: true, accessToken: result.accessToken });
  } catch (e) { next(e); }
});

// POST /api/auth/logout
router.post('/logout', async (req, res, next) => {
  try {
    const rawToken = req.cookies?.orion_rt || req.body?.refreshToken;
    await authService.logout(rawToken);
    res.clearCookie('orion_rt');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, forgotPasswordRules, handleValidation, async (req, res, next) => {
  try {
    const result = await authService.forgotPassword({ email: req.body.email, ip: req.ip });
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/auth/reset-password
router.post('/reset-password', authLimiter, resetPasswordRules, handleValidation, async (req, res, next) => {
  try {
    const result = await authService.resetPassword({ token: req.body.token, password: req.body.password, ip: req.ip });
    if (!result.ok) return res.status(400).json(result);
    res.json(result);
  } catch (e) { next(e); }
});

// GET /api/auth/me — returns current user profile
router.get('/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({
    id:               u.id,
    name:             u.name,
    email:            u.email,
    onboardingDone:   u.onboarding_done,
    primaryGoal:      u.primary_goal,
    dailyHours:       u.daily_hours,
    biggestChallenge: u.biggest_challenge,
    morningType:      u.peak_time,
    loginCount:       u.login_count,
    createdAt:        u.created_at,
  });
});

// POST /api/auth/onboarding
router.post('/onboarding', requireAuth, onboardingRules, handleValidation, async (req, res, next) => {
  try {
    await authService.saveOnboarding(req.user.id, req.body);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
