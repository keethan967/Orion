// src/api/middleware/auth.js
const { verifyAccessToken } = require('../../utils/jwt');
const { findUserById }      = require('../../services/authService');

/**
 * Require a valid JWT access token.
 * Attaches req.user = { id, email, name, ... } on success.
 */
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const user    = await findUserById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Optionally attach user if token is present — doesn't block if missing.
 */
async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    const user    = await findUserById(payload.sub);
    if (user) req.user = user;
  } catch {}
  next();
}

module.exports = { requireAuth, optionalAuth };
