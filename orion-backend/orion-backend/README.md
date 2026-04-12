# Orion Backend

Production-grade Node.js/Express backend for the **Orion Celestial Self-Evolution Platform**.

## Architecture

```
src/
├── server.js               — Express app, middleware, route mounting
├── config/
│   ├── database.js         — PostgreSQL connection pool
│   └── logger.js           — Winston structured logger
├── api/
│   ├── middleware/
│   │   ├── auth.js         — JWT verification, req.user injection
│   │   ├── rateLimiter.js  — express-rate-limit configurations
│   │   └── errorHandler.js — Central error + 404 handler
│   └── routes/
│       ├── auth.js         — Register, login, verify, refresh, reset
│       ├── focus.js        — Sessions, daily/weekly tracking, analytics
│       ├── podcasts.js     — Library, daily picks, progress
│       ├── ai.js           — Quote, insight, reading, strategist, summary
│       └── content.js      — Vault notes, reflections
├── services/
│   ├── authService.js      — Auth business logic, bcrypt, tokens
│   ├── emailService.js     — Nodemailer with branded HTML templates
│   ├── focusService.js     — Session storage, analytics, scoring
│   ├── podcastService.js   — Catalog, progress, daily rotation
│   ├── aiService.js        — Anthropic API proxy with caching
│   └── contentService.js   — Notes and reflections
├── db/
│   ├── migrate.js          — Migration runner
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── seeds/
│       └── index.js        — Podcast catalog seed
└── utils/
    ├── jwt.js              — Token sign/verify/refresh utilities
    └── validators.js       — express-validator rules per route
```

## Quick Start

```bash
# Prerequisites: Node ≥18, PostgreSQL ≥14

# 1. Clone and install
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your DB credentials, JWT secret, SMTP settings, Anthropic key

# 3. Create database
createdb orion_db

# 4. Run migrations
npm run migrate

# 5. Seed podcast catalog
npm run seed

# 6. Start dev server
npm run dev
```

The server starts on **port 4000** by default.

## Security

| Feature                     | Implementation                                      |
|-----------------------------|-----------------------------------------------------|
| Password hashing            | bcrypt with configurable rounds (default 12)        |
| Authentication              | JWT access tokens (7d) + HttpOnly refresh cookies (30d) |
| Token refresh               | Opaque refresh tokens stored as SHA-256 hashes      |
| Rate limiting               | 100 req/15min general · 10/15min auth · 30/15min AI |
| CORS                        | Allowlist-only, credentials: true                   |
| HTTP headers                | Helmet (CSP, HSTS, X-Frame-Options, etc.)           |
| Input validation            | express-validator on all routes                     |
| SQL injection prevention    | Parameterized queries only (no string interpolation)|
| API key protection          | Anthropic key never sent to frontend                |
| Timing attack prevention    | bcrypt always runs even when user not found         |
| Audit logging               | All auth events stored in audit_log table           |
| Email alerts                | Login notifications + security alerts to users      |

## Email Templates

Five transactional emails, all Orion-branded:
- **Verification** — sent on registration, 24h expiry
- **Login alert** — sent on every successful login with IP/device
- **Password reset** — 1h token, secure reset flow
- **Daily briefing** — morning summary with quote, insight, focus stats
- **Security alert** — triggered by suspicious activity

## Database Tables

| Table                    | Purpose                                     |
|--------------------------|---------------------------------------------|
| `users`                  | Accounts, profile, verification tokens      |
| `refresh_tokens`         | Hashed refresh tokens with expiry           |
| `focus_sessions`         | Individual timed sessions with mode/notes   |
| `emotional_states`       | Logged mood states for target calibration   |
| `podcasts`               | Master podcast catalog                      |
| `podcast_progress`       | Per-user listening position (upsert)        |
| `daily_podcast_schedule` | Optional override for daily picks           |
| `ai_interactions`        | Cached AI responses (quote, insight, etc.)  |
| `vault_notes`            | User knowledge vault                        |
| `reflections`            | Evening reflection entries                  |
| `audit_log`              | Auth event log (logins, resets, etc.)       |

## Deployment

1. Set `NODE_ENV=production` in your environment
2. Ensure `JWT_SECRET` is a 64-char random string
3. Set `DB_SSL=true` for managed Postgres (Supabase, Neon, Railway)
4. Configure `FRONTEND_URL` to match your deployed frontend
5. Audio files in `/public/audio/` are served statically with `acceptRanges: true` for seek support

### Recommended providers
- **Database**: Supabase / Neon / Railway
- **Server**: Railway / Fly.io / Render
- **Email**: Gmail SMTP (dev) / Resend / Postmark (prod)
