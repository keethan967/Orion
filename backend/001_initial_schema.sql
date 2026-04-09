-- ═══════════════════════════════════════════════════════════════
--  ORION DATABASE SCHEMA
--  Run via: psql -U orion_user -d orion_db -f 001_initial_schema.sql
-- ═══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── USERS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(120) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
  is_verified         BOOLEAN     NOT NULL DEFAULT FALSE,
  verify_token        VARCHAR(255),
  verify_token_exp    TIMESTAMPTZ,
  reset_token         VARCHAR(255),
  reset_token_exp     TIMESTAMPTZ,

  -- Onboarding profile
  primary_goal        VARCHAR(120),
  daily_hours         VARCHAR(60),
  biggest_challenge   VARCHAR(120),
  peak_time           VARCHAR(80),
  onboarding_done     BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Metadata
  last_login_at       TIMESTAMPTZ,
  last_login_ip       INET,
  login_count         INTEGER     NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_verify_token ON users(verify_token) WHERE verify_token IS NOT NULL;
CREATE INDEX idx_users_reset_token  ON users(reset_token)  WHERE reset_token  IS NOT NULL;

-- ── REFRESH TOKENS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL UNIQUE,
  ip_address  INET,
  user_agent  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ── FOCUS SESSIONS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode            VARCHAR(60) NOT NULL DEFAULT 'Deep Work',
  duration_mins   INTEGER     NOT NULL CHECK (duration_mins > 0),
  completed       BOOLEAN     NOT NULL DEFAULT TRUE,
  notes           TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_focus_sessions_user      ON focus_sessions(user_id);
CREATE INDEX idx_focus_sessions_started   ON focus_sessions(user_id, started_at DESC);

-- ── EMOTIONAL STATE LOGS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emotional_states (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  state           VARCHAR(40) NOT NULL,  -- calm | moderate | stressed | anxious | overwhelmed
  week_target_mins INTEGER,
  logged_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_emotional_states_user ON emotional_states(user_id, logged_at DESC);

-- ── PODCASTS (master catalog) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS podcasts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(200) NOT NULL,
  host            VARCHAR(120),
  description     TEXT,
  theme           VARCHAR(60) NOT NULL,   -- Calmness | Discipline | Reflection | Focus | Mindset
  duration_secs   INTEGER,
  audio_url       TEXT NOT NULL,          -- relative path or full URL
  transcript      TEXT,                   -- Full spoken text for TTS fallback
  published_on    DATE        NOT NULL DEFAULT CURRENT_DATE,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order      INTEGER     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_podcasts_theme  ON podcasts(theme);
CREATE INDEX idx_podcasts_active ON podcasts(is_active, published_on DESC);

-- ── PODCAST PROGRESS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS podcast_progress (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  podcast_id      UUID        NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  position_secs   INTEGER     NOT NULL DEFAULT 0,  -- seconds into audio
  char_index      INTEGER     NOT NULL DEFAULT 0,  -- TTS char position
  total_chars     INTEGER     NOT NULL DEFAULT 0,
  completed       BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, podcast_id)
);

CREATE INDEX idx_podcast_progress_user ON podcast_progress(user_id, updated_at DESC);

-- ── DAILY PODCAST SCHEDULE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_podcast_schedule (
  id          UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_date DATE NOT NULL,
  podcast_id  UUID  NOT NULL REFERENCES podcasts(id) ON DELETE CASCADE,
  slot        INTEGER NOT NULL DEFAULT 1,  -- 1 or 2 (up to 2 per day)
  UNIQUE(schedule_date, slot)
);

CREATE INDEX idx_daily_schedule_date ON daily_podcast_schedule(schedule_date);

-- ── AI INTERACTIONS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_interactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            VARCHAR(40) NOT NULL,   -- quote | insight | reading | strategist | weekly_target
  prompt_summary  TEXT,
  response_text   TEXT        NOT NULL,
  tokens_used     INTEGER,
  cache_key       VARCHAR(255),           -- for deduplication
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_interactions_user     ON ai_interactions(user_id, created_at DESC);
CREATE INDEX idx_ai_interactions_cache    ON ai_interactions(cache_key) WHERE cache_key IS NOT NULL;

-- ── VAULT NOTES ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  content     TEXT,
  tags        TEXT[]      NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vault_notes_user ON vault_notes(user_id, created_at DESC);

-- ── REFLECTIONS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reflections (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL,
  word_count  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reflections_user ON reflections(user_id, created_at DESC);

-- ── SYSTEM AUDIT LOG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL   PRIMARY KEY,
  user_id     UUID        REFERENCES users(id) ON DELETE SET NULL,
  event_type  VARCHAR(80) NOT NULL,
  ip_address  INET,
  user_agent  TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_user   ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_event  ON audit_log(event_type, created_at DESC);

-- ── AUTO-UPDATE updated_at TRIGGER ──────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_vault_notes_updated_at
  BEFORE UPDATE ON vault_notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_podcast_progress_updated_at
  BEFORE UPDATE ON podcast_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at();
