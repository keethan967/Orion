// src/utils/jwt.js
const jwt  = require('jsonwebtoken');
const { createHash, randomBytes } = require('crypto');

const SECRET       = process.env.JWT_SECRET;
const EXPIRES_IN   = process.env.JWT_EXPIRES_IN       || '7d';
const REFRESH_EXP  = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

if (!SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
const DEV_SECRET = 'orion-dev-secret-do-not-use-in-prod-32chars!!';

/**
 * Sign an access token for a user
 */
function signAccessToken(payload) {
  return jwt.sign(payload, SECRET || DEV_SECRET, {
    expiresIn: EXPIRES_IN,
    algorithm: 'HS256',
  });
}

/**
 * Verify and decode an access token.
 * Throws if invalid or expired.
 */
function verifyAccessToken(token) {
  return jwt.verify(token, SECRET || DEV_SECRET, { algorithms: ['HS256'] });
}

/**
 * Generate a random opaque refresh token (URL-safe base64).
 * Returns { raw, hash } — store hash in DB, send raw to client.
 */
function generateRefreshToken() {
  const raw  = randomBytes(40).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

/**
 * Hash a raw refresh token for lookup
 */
function hashRefreshToken(raw) {
  return createHash('sha256').update(raw).digest('hex');
}

/**
 * Calculate expiry date from REFRESH_EXP string (e.g. "30d")
 */
function refreshTokenExpiry() {
  const days = parseInt(REFRESH_EXP) || 30;
  return new Date(Date.now() + days * 86400 * 1000);
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
};
