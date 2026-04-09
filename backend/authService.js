// src/services/authService.js
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { query, getClient } = require('../config/database');
const { signAccessToken, generateRefreshToken, hashRefreshToken, refreshTokenExpiry } = require('../utils/jwt');
const emailService = require('./emailService');
const logger  = require('../config/logger');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

// ── Internal helpers ─────────────────────────────────────────────

function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

async function findUserByEmail(email) {
  const res = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  return res.rows[0] || null;
}

async function findUserById(id) {
  const res = await query('SELECT * FROM users WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function auditLog(userId, eventType, ip, userAgent, details = {}) {
  try {
    await query(
      `INSERT INTO audit_log (user_id, event_type, ip_address, user_agent, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId || null, eventType, ip || null, userAgent || null, JSON.stringify(details)]
    );
  } catch (e) {
    logger.warn('[Audit] Failed to write log:', e.message);
  }
}

// ── Public service methods ───────────────────────────────────────

/**
 * Register a new user.
 * Sends verification email — account inactive until verified.
 */
async function register({ name, email, password, ip, userAgent }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    // Don't reveal whether email exists — return same message
    return { ok: true, message: 'If this email is available, a verification link has been sent.' };
  }

  const passwordHash  = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const verifyToken   = generateToken();
  const verifyTokenExp = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  const res = await query(
    `INSERT INTO users (name, email, password_hash, verify_token, verify_token_exp)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email`,
    [name.trim(), email.toLowerCase().trim(), passwordHash, verifyToken, verifyTokenExp]
  );
  const user = res.rows[0];

  await emailService.sendVerificationEmail(user, verifyToken);
  await auditLog(user.id, 'REGISTER', ip, userAgent);
  logger.info(`[Auth] New registration: ${user.email}`);

  return { ok: true, message: 'Account created. Check your email to verify.' };
}

/**
 * Verify email with token from email link.
 */
async function verifyEmail(token) {
  const res = await query(
    `SELECT id, email, verify_token_exp FROM users
     WHERE verify_token = $1 AND is_verified = FALSE`,
    [token]
  );
  const user = res.rows[0];
  if (!user) return { ok: false, message: 'Invalid or expired verification link.' };

  if (new Date(user.verify_token_exp) < new Date()) {
    return { ok: false, message: 'Verification link has expired. Request a new one.' };
  }

  await query(
    `UPDATE users SET is_verified = TRUE, verify_token = NULL, verify_token_exp = NULL,
     updated_at = NOW() WHERE id = $1`,
    [user.id]
  );
  logger.info(`[Auth] Email verified: ${user.email}`);
  return { ok: true, message: 'Email verified. You may now sign in.' };
}

/**
 * Login: verify credentials, issue tokens, send login alert.
 */
async function login({ email, password, ip, userAgent }) {
  const user = await findUserByEmail(email);

  // Always hash-compare to prevent timing attacks, even when user not found
  const dummyHash = '$2a$12$invalidhashfortimingnnnnnnnnnnnnnnnnnnnnnnnnn';
  const hash      = user ? user.password_hash : dummyHash;
  const valid     = await bcrypt.compare(password, hash);

  if (!user || !valid) {
    await auditLog(user?.id, 'LOGIN_FAILED', ip, userAgent, { email });
    return { ok: false, message: 'Invalid email or password.' };
  }

  if (!user.is_verified) {
    return { ok: false, message: 'Please verify your email before signing in.' };
  }

  // Issue tokens
  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const { raw: refreshRaw, hash: refreshHash } = generateRefreshToken();

  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, refreshHash, ip || null, userAgent || null, refreshTokenExpiry()]
  );

  // Update last login
  await query(
    `UPDATE users SET last_login_at = NOW(), last_login_ip = $2, login_count = login_count + 1,
     updated_at = NOW() WHERE id = $1`,
    [user.id, ip || null]
  );

  await auditLog(user.id, 'LOGIN_SUCCESS', ip, userAgent);

  // Send login alert (fire-and-forget)
  emailService.sendLoginAlert(user, {
    ip,
    userAgent,
    time: new Date().toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' }),
  }).catch(e => logger.warn('[Email] Login alert failed:', e.message));

  return {
    ok: true,
    accessToken,
    refreshToken: refreshRaw,
    user: {
      id:             user.id,
      name:           user.name,
      email:          user.email,
      onboardingDone: user.onboarding_done,
      primaryGoal:    user.primary_goal,
      dailyHours:     user.daily_hours,
      biggestChallenge: user.biggest_challenge,
      morningType:    user.peak_time,
    },
  };
}

/**
 * Refresh access token using a valid refresh token.
 */
async function refreshAccessToken(rawToken, ip) {
  const hash = hashRefreshToken(rawToken);
  const res  = await query(
    `SELECT rt.*, u.email FROM refresh_tokens rt
     JOIN users u ON rt.user_id = u.id
     WHERE rt.token_hash = $1 AND rt.revoked = FALSE`,
    [hash]
  );
  const row = res.rows[0];
  if (!row || new Date(row.expires_at) < new Date()) {
    return { ok: false, message: 'Session expired. Please sign in again.' };
  }

  const accessToken = signAccessToken({ sub: row.user_id, email: row.email });
  return { ok: true, accessToken };
}

/**
 * Logout: revoke the refresh token.
 */
async function logout(rawToken) {
  if (!rawToken) return { ok: true };
  const hash = hashRefreshToken(rawToken);
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [hash]);
  return { ok: true };
}

/**
 * Initiate password reset — send email with token.
 */
async function forgotPassword({ email, ip }) {
  const user = await findUserByEmail(email);
  // Always return same message to prevent user enumeration
  if (!user) return { ok: true, message: 'If an account exists, a reset link has been sent.' };

  const resetToken    = generateToken();
  const resetTokenExp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await query(
    'UPDATE users SET reset_token = $1, reset_token_exp = $2, updated_at = NOW() WHERE id = $3',
    [resetToken, resetTokenExp, user.id]
  );

  await emailService.sendPasswordResetEmail(user, resetToken);
  await auditLog(user.id, 'PASSWORD_RESET_REQUEST', ip);
  return { ok: true, message: 'If an account exists, a reset link has been sent.' };
}

/**
 * Complete password reset with token + new password.
 */
async function resetPassword({ token, password, ip }) {
  const res = await query(
    `SELECT id, email FROM users WHERE reset_token = $1 AND reset_token_exp > NOW()`,
    [token]
  );
  const user = res.rows[0];
  if (!user) return { ok: false, message: 'Invalid or expired reset link.' };

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await query(
    `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_exp = NULL,
     updated_at = NOW() WHERE id = $2`,
    [passwordHash, user.id]
  );

  // Revoke all refresh tokens on password reset
  await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [user.id]);
  await auditLog(user.id, 'PASSWORD_RESET_COMPLETE', ip);
  logger.info(`[Auth] Password reset complete for ${user.email}`);
  return { ok: true, message: 'Password updated. Please sign in.' };
}

/**
 * Save onboarding answers to user profile.
 */
async function saveOnboarding(userId, answers) {
  await query(
    `UPDATE users SET
       primary_goal      = $2,
       daily_hours       = $3,
       biggest_challenge = $4,
       peak_time         = $5,
       onboarding_done   = TRUE,
       updated_at        = NOW()
     WHERE id = $1`,
    [userId, answers.primaryGoal, answers.dailyHours, answers.biggestChallenge, answers.morningType]
  );
  return { ok: true };
}

module.exports = {
  register,
  verifyEmail,
  login,
  refreshAccessToken,
  logout,
  forgotPassword,
  resetPassword,
  saveOnboarding,
  findUserById,
};
