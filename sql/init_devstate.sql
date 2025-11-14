-- init_devstate.sql
-- PostgreSQL schema for MCP DevState (DB as Source of Truth)
-- Includes append-only history constraints and hmac_prev chain enforcement

-- Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- State: single-row current state
CREATE TABLE IF NOT EXISTS state_current (
  id INTEGER PRIMARY KEY,
  json JSONB NOT NULL,
  checksum TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM state_current WHERE id = 1) THEN
    INSERT INTO state_current(id, json, checksum)
    VALUES (1, '{}'::jsonb, 'sha256:0000000000000000000000000000000000000000000000000000000000000000');
  END IF;
END$$;

-- History: append-only audit with HMAC chain
CREATE TABLE IF NOT EXISTS history_entries (
  id BIGSERIAL PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  cp_from TEXT,
  cp_to TEXT,
  state_checksum TEXT,
  hmac_prev TEXT,
  hmac TEXT NOT NULL,
  metadata JSONB
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_history_ts ON history_entries (ts DESC);
CREATE INDEX IF NOT EXISTS idx_history_actor ON history_entries (actor);
CREATE INDEX IF NOT EXISTS idx_history_action ON history_entries (action);

-- Prevent UPDATE and DELETE on history_entries (append-only)
CREATE OR REPLACE FUNCTION prevent_history_modify() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'history_entries is append-only; UPDATE/DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'history_entries_no_update'
  ) THEN
    CREATE TRIGGER history_entries_no_update
      BEFORE UPDATE ON history_entries
      FOR EACH ROW EXECUTE FUNCTION prevent_history_modify();
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'history_entries_no_delete'
  ) THEN
    CREATE TRIGGER history_entries_no_delete
      BEFORE DELETE ON history_entries
      FOR EACH ROW EXECUTE FUNCTION prevent_history_modify();
  END IF;
END$$;

-- Enforce hmac_prev chain continuity (matches last inserted hmac)
CREATE OR REPLACE FUNCTION enforce_hmac_prev_chain() RETURNS trigger AS $$
DECLARE
  last_hmac TEXT;
BEGIN
  SELECT hmac INTO last_hmac FROM history_entries ORDER BY id DESC LIMIT 1;
  IF last_hmac IS NULL THEN
    -- First record: allow NULL or empty hmac_prev
    RETURN NEW;
  END IF;
  IF NEW.hmac_prev IS NULL OR NEW.hmac_prev <> last_hmac THEN
    RAISE EXCEPTION 'hmac_prev mismatch: expected % but got %', last_hmac, NEW.hmac_prev;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'history_entries_enforce_prev'
  ) THEN
    CREATE TRIGGER history_entries_enforce_prev
      BEFORE INSERT ON history_entries
      FOR EACH ROW EXECUTE FUNCTION enforce_hmac_prev_chain();
  END IF;
END$$;

-- Optional: lightweight locks for state operations
CREATE TABLE IF NOT EXISTS devstate_locks (
  lock_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope TEXT NOT NULL,
  actor TEXT,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devstate_locks_scope ON devstate_locks (scope);
CREATE INDEX IF NOT EXISTS idx_devstate_locks_expires ON devstate_locks (expires_at);

-- Helper view: latest history summary
CREATE OR REPLACE VIEW history_latest AS
SELECT id, ts, actor, action, cp_from, cp_to, state_checksum, hmac
FROM history_entries
ORDER BY id DESC
LIMIT 100;

-- Notes:
-- * HMAC calculation is performed in the application using BEAMLINE_HMAC_SECRET.
-- * This schema enforces chain continuity via hmac_prev but does not verify HMAC correctness.
-- * Transactions should combine append_history and update_state when needed.

