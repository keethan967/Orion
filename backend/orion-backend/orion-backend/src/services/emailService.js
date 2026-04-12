// src/services/emailService.js
const nodemailer = require('nodemailer');
const logger     = require('../config/logger');

// ── Transport factory ────────────────────────────────────────────
function createTransport() {
  if (process.env.NODE_ENV === 'test') {
    // In tests, use a no-op transport
    return { sendMail: async () => ({ messageId: 'test' }) };
  }

  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

const transport = createTransport();

const FROM = `"${process.env.EMAIL_FROM_NAME || 'Orion Observatory'}" <${process.env.EMAIL_FROM_ADDRESS || 'noreply@orion.app'}>`;

// ── Shared base HTML template ────────────────────────────────────
function baseTemplate(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@300;400&family=Lato:wght@300;400&display=swap');
  body { margin:0; padding:0; background:#07090e; font-family:'Lato',sans-serif; color:#e8dfc8; }
  .wrap { max-width:560px; margin:0 auto; padding:48px 24px; }
  .logo { text-align:center; margin-bottom:40px; }
  .logo-title { font-family:'Playfair Display',Georgia,serif; font-size:28px; font-weight:300; letter-spacing:0.22em; color:#e8dfc8; }
  .logo-sub { font-size:10px; letter-spacing:0.28em; text-transform:uppercase; color:rgba(212,175,100,0.55); margin-top:4px; font-style:italic; }
  .card { background:rgba(12,15,22,0.95); border:1px solid rgba(212,175,100,0.09); border-radius:12px; padding:36px 40px; margin-bottom:24px; }
  h1 { font-family:'Playfair Display',Georgia,serif; font-size:22px; font-weight:300; color:#e8dfc8; margin:0 0 16px; line-height:1.4; }
  p { font-size:14px; line-height:1.8; color:rgba(220,210,195,0.7); margin:0 0 16px; }
  .gold-btn { display:inline-block; padding:13px 32px; background:rgba(212,175,100,0.1); border:1px solid rgba(212,175,100,0.4); border-radius:6px; color:rgba(212,175,100,0.9); font-size:12px; letter-spacing:0.14em; text-transform:uppercase; text-decoration:none; font-family:'Lato',sans-serif; margin:8px 0; }
  .divider { height:1px; background:rgba(212,175,100,0.08); margin:24px 0; }
  .footer { text-align:center; font-size:11px; color:rgba(180,170,155,0.3); letter-spacing:0.08em; line-height:1.7; }
  .star { color:rgba(212,175,100,0.5); }
  .quote { font-family:'Playfair Display',Georgia,serif; font-size:15px; font-style:italic; color:rgba(212,175,100,0.75); border-left:2px solid rgba(212,175,100,0.2); padding-left:16px; margin:20px 0; line-height:1.65; }
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <div class="logo-title">✦ ORION</div>
    <div class="logo-sub">Celestial Self-Evolution</div>
  </div>
  <div class="card">${bodyHtml}</div>
  <div class="footer">
    <p>You are receiving this because you hold an account with Orion Observatory.</p>
    <p>© ${new Date().getFullYear()} Orion · Your private observatory</p>
  </div>
</div>
</body>
</html>`;
}

// ── Email senders ────────────────────────────────────────────────

/**
 * Verification email sent after registration
 */
async function sendVerificationEmail(user, token) {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;
  const html = baseTemplate('Verify your Orion account', `
    <h1>Welcome to your Observatory, ${user.name}.</h1>
    <p>Your journey begins with a single step. Verify your account to unlock your personal Orion experience — focused, intentional, and built around who you are becoming.</p>
    <div class="quote">"The first and best victory is to conquer self." — Plato</div>
    <p style="text-align:center; margin:28px 0;">
      <a href="${verifyUrl}" class="gold-btn">Verify My Account</a>
    </p>
    <div class="divider"></div>
    <p style="font-size:12px; color:rgba(180,170,155,0.4);">This link expires in 24 hours. If you did not create an account, you may safely ignore this email.</p>
  `);

  await transport.sendMail({
    from: FROM,
    to:   user.email,
    subject: 'Verify your Orion account',
    html,
    text: `Welcome to Orion, ${user.name}.\n\nVerify your account: ${verifyUrl}\n\nThis link expires in 24 hours.`,
  });
  logger.info(`[Email] Verification sent to ${user.email}`);
}

/**
 * Login alert — sent on every successful login
 */
async function sendLoginAlert(user, { ip, userAgent, time }) {
  const html = baseTemplate('New sign-in to your Observatory', `
    <h1>New sign-in detected.</h1>
    <p>A new session was initiated for your Orion account. Here are the details:</p>
    <table style="width:100%; border-collapse:collapse; margin:16px 0;">
      <tr><td style="padding:8px 0; color:rgba(180,170,155,0.5); font-size:12px; width:130px;">Time</td><td style="font-size:13px;">${time}</td></tr>
      <tr><td style="padding:8px 0; color:rgba(180,170,155,0.5); font-size:12px;">IP Address</td><td style="font-size:13px;">${ip || 'Unknown'}</td></tr>
      <tr><td style="padding:8px 0; color:rgba(180,170,155,0.5); font-size:12px;">Device</td><td style="font-size:13px; word-break:break-all;">${(userAgent || 'Unknown').slice(0, 80)}</td></tr>
    </table>
    <div class="divider"></div>
    <p>If this was you, no action is needed. If you do not recognise this activity, please reset your password immediately.</p>
    <p style="text-align:center; margin:20px 0;">
      <a href="${process.env.FRONTEND_URL}/reset-password" class="gold-btn">Secure My Account</a>
    </p>
  `);

  await transport.sendMail({
    from: FROM,
    to:   user.email,
    subject: 'New sign-in to your Orion Observatory',
    html,
    text: `New sign-in at ${time} from IP ${ip}. If this was not you, reset your password: ${process.env.FRONTEND_URL}/reset-password`,
  });
  logger.info(`[Email] Login alert sent to ${user.email}`);
}

/**
 * Password reset email
 */
async function sendPasswordResetEmail(user, token) {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  const html = baseTemplate('Reset your Orion password', `
    <h1>Password reset requested.</h1>
    <p>We received a request to reset the password for your Orion account. If this was you, click below to choose a new password.</p>
    <p style="text-align:center; margin:28px 0;">
      <a href="${resetUrl}" class="gold-btn">Reset My Password</a>
    </p>
    <div class="divider"></div>
    <p style="font-size:12px; color:rgba(180,170,155,0.4);">This link expires in 1 hour. If you did not request a reset, your account is safe — no changes were made.</p>
  `);

  await transport.sendMail({
    from: FROM,
    to:   user.email,
    subject: 'Reset your Orion password',
    html,
    text: `Reset your Orion password: ${resetUrl}\n\nExpires in 1 hour. If you did not request this, ignore this email.`,
  });
  logger.info(`[Email] Password reset sent to ${user.email}`);
}

/**
 * Daily reflection reminder — meant to be sent by a cron job each morning
 */
async function sendDailyReminder(user, { quote, insight, todayMinutes, weekMinutes }) {
  const html = baseTemplate("Today's Orion Briefing", `
    <h1>Good morning, ${user.name}.</h1>
    <p>Your Observatory is ready. Here is your daily briefing to begin with clarity and intention.</p>
    <div class="quote">${quote}</div>
    <div class="divider"></div>
    <p><span class="star">✦</span> <strong style="color:rgba(212,175,100,0.8);">Today's Insight</strong></p>
    <p>${insight}</p>
    <div class="divider"></div>
    <table style="width:100%; margin:4px 0;">
      <tr>
        <td style="text-align:center; padding:12px;">
          <div style="font-family:'Playfair Display',Georgia,serif; font-size:24px; color:rgba(212,175,100,0.85);">${todayMinutes}m</div>
          <div style="font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(180,170,155,0.4); margin-top:3px;">Today so far</div>
        </td>
        <td style="text-align:center; padding:12px;">
          <div style="font-family:'Playfair Display',Georgia,serif; font-size:24px; color:rgba(212,175,100,0.85);">${Math.round(weekMinutes/60)}h</div>
          <div style="font-size:10px; letter-spacing:0.12em; text-transform:uppercase; color:rgba(180,170,155,0.4); margin-top:3px;">This week</div>
        </td>
      </tr>
    </table>
    <p style="text-align:center; margin:24px 0;">
      <a href="${process.env.FRONTEND_URL}" class="gold-btn">Open My Observatory</a>
    </p>
  `);

  await transport.sendMail({
    from: FROM,
    to:   user.email,
    subject: `Your Orion briefing — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`,
    html,
    text: `Good morning ${user.name}.\n\n${quote}\n\n${insight}\n\nOpen Orion: ${process.env.FRONTEND_URL}`,
  });
  logger.info(`[Email] Daily reminder sent to ${user.email}`);
}

/**
 * Security alert — suspicious activity (multiple failed logins, etc.)
 */
async function sendSecurityAlert(user, reason) {
  const html = baseTemplate('Security alert — Orion Observatory', `
    <h1>Security alert on your account.</h1>
    <p>Unusual activity has been detected on your Orion account:</p>
    <p style="padding:14px 16px; background:rgba(200,80,60,0.06); border:1px solid rgba(200,80,60,0.15); border-radius:6px; color:rgba(220,150,130,0.85);">${reason}</p>
    <p>If this was you, no action is needed. If you do not recognise this activity, please reset your password immediately.</p>
    <p style="text-align:center; margin:24px 0;">
      <a href="${process.env.FRONTEND_URL}/reset-password" class="gold-btn">Secure My Account</a>
    </p>
  `);

  await transport.sendMail({
    from: FROM,
    to:   user.email,
    subject: '⚠ Security alert — Orion Observatory',
    html,
    text: `Security alert on your Orion account: ${reason}. Reset password: ${process.env.FRONTEND_URL}/reset-password`,
  });
  logger.info(`[Email] Security alert sent to ${user.email}`);
}

module.exports = {
  sendVerificationEmail,
  sendLoginAlert,
  sendPasswordResetEmail,
  sendDailyReminder,
  sendSecurityAlert,
};
