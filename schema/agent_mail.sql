-- agent_mail — D1 schema for Spec 32 (Cloudflare-native agent email).
-- Source of truth the agent works against; R2 holds raw .eml + attachments (r2_key).
-- Contract: agentos specs/32-cloudflare-agent-email/contracts/agent_mail_schema.sql
-- Pattern: ./waivers.sql

CREATE TABLE IF NOT EXISTS inboxes (
  address       TEXT PRIMARY KEY,                 -- e.g. 'julia@agents.adapttolife.org'
  kind          TEXT NOT NULL,                    -- 'agent' | 'shared'
  default_agent TEXT,                             -- shared inboxes: optional router default owner
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS threads (
  id             TEXT PRIMARY KEY,                -- uuid
  inbox          TEXT NOT NULL REFERENCES inboxes(address),
  assigned_agent TEXT,                            -- owner; NULL until routed (shared inboxes)
  status         TEXT NOT NULL DEFAULT 'new',     -- new | agent_working | needs_review | human | replied | resolved
  subject        TEXT,
  from_addr      TEXT NOT NULL,
  airtable_id    TEXT,                            -- mirror row id (write-through; humans only)
  last_at        TEXT NOT NULL DEFAULT (datetime('now')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_threads_inbox_status ON threads(inbox, status);
CREATE INDEX IF NOT EXISTS idx_threads_assigned     ON threads(assigned_agent, status);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,                   -- uuid
  thread_id   TEXT NOT NULL REFERENCES threads(id),
  direction   TEXT NOT NULL,                      -- 'in' | 'out'
  from_addr   TEXT NOT NULL,
  to_addr     TEXT NOT NULL,
  subject     TEXT,
  body_text   TEXT,                               -- plain-text body (raw .eml lives in R2)
  body_markdown TEXT,                             -- Spec 53: outbound markdown as composed by the agent (NULL for inbound / legacy sends)
  body_html   TEXT,                               -- Spec 53: rendered (or explicitly supplied) reading-view HTML; the archive keeps what was actually sent
  r2_key      TEXT,                               -- pointer to raw .eml / attachments in R2
  message_id  TEXT,                               -- RFC822 Message-ID (threading)
  in_reply_to TEXT,                               -- In-Reply-To / References stitching
  is_machine  INTEGER NOT NULL DEFAULT 0,         -- Spec 33 loop guard: bounce/auto-reply/no-reply inbound; never a reply target
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, created_at);
-- Migration for deployments created before is_machine (run once):
--   ALTER TABLE messages ADD COLUMN is_machine INTEGER NOT NULL DEFAULT 0;
-- Migration for deployments created before body_markdown/body_html (Spec 53, run once):
--   ALTER TABLE messages ADD COLUMN body_markdown TEXT;
--   ALTER TABLE messages ADD COLUMN body_html TEXT;

-- Seed the v1 inboxes (idempotent).
INSERT OR IGNORE INTO inboxes (address, kind, default_agent) VALUES
  ('hello@agents.adapttolife.org', 'shared', 'julia'),
  ('julia@agents.adapttolife.org', 'agent',  'julia');

-- Per-agent API tokens (Spec 33 hardening, 2026-07-02). One token per AGENT (an
-- agent may own several inboxes). Only the SHA-256 hex of the token lands here;
-- the plaintext lives in that agent's own 1Password vault ('Agent Mail Token')
-- and its profile .env. The AGENT_MAIL_TOKEN worker secret remains the unscoped
-- OPERATOR credential. Rotation: insert the new hash, update vault + .env,
-- delete the old row.
CREATE TABLE IF NOT EXISTS agent_tokens (
  token_hash TEXT PRIMARY KEY,                    -- sha256 hex of the bearer token
  agent      TEXT NOT NULL,                       -- e.g. 'julia'
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
