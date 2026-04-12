// src/api/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');

const WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'); // 15 min

/**
 * General API rate limit — 100 req / 15 min per IP
 */
const apiLimiter = rateLimit({
  windowMs:  WINDOW_MS,
  max:       parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests. Please try again later.' },
});

/**
 * Strict limit for auth endpoints — 10 req / 15 min per IP
 * Prevents brute-force on login/register
 */
const authLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX || '10'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  skipSuccessfulRequests: true, // don't count successful logins
});

/**
 * AI endpoint limit — 30 req / 15 min per IP
 * Prevents API key abuse
 */
const aiLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max:      30,
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'AI rate limit reached. Please wait a moment.' },
});

module.exports = { apiLimiter, authLimiter, aiLimiter };
