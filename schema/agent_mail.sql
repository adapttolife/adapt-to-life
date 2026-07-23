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

-- Inbox-specific admission policy. If an inbox has one or more rows, inbound
-- mail from every other sender is captured but quarantined resolved/no-bell.
-- Patterns are exact lowercase addresses or '@domain' suffixes. Spec 108 adds
-- eng-intake as a separate Julia-only lane without weakening stingel@.
CREATE TABLE IF NOT EXISTS inbox_locks (
  inbox      TEXT NOT NULL REFERENCES inboxes(address),
  pattern    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (inbox, pattern)
);

-- Global token-protection list for bells. This is not sender authority; inbox
-- locks above are the lane-specific fail-closed boundary.
CREATE TABLE IF NOT EXISTS allowed_senders (
  pattern    TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
-- Spec 70 P4: GET /api/agent-mail/reports and the /lib/ library view both scan
-- messages filtered on direction='out' ordered by created_at.
CREATE INDEX IF NOT EXISTS idx_messages_out_created ON messages(direction, created_at);
-- Migration for deployments created before is_machine (run once):
--   ALTER TABLE messages ADD COLUMN is_machine INTEGER NOT NULL DEFAULT 0;
-- Migration for deployments created before body_markdown/body_html (Spec 53, run once):
--   ALTER TABLE messages ADD COLUMN body_markdown TEXT;
--   ALTER TABLE messages ADD COLUMN body_html TEXT;

-- Seed the v1 inboxes (idempotent).
INSERT OR IGNORE INTO inboxes (address, kind, default_agent) VALUES
  ('hello@agents.adapttolife.org', 'shared', 'julia'),
  ('julia@agents.adapttolife.org', 'agent',  'julia'),
  ('eng-intake@alectranel.com',    'agent',  'stingel');

-- Spec 108 v1: only Julia may enter the engineering intake loop. Stingel's
-- Alec-only decision lock remains a separate row set and is never widened here.
INSERT OR IGNORE INTO inbox_locks (inbox, pattern) VALUES
  ('eng-intake@alectranel.com', 'julia@alectranel.com');

-- Julia is already covered by the live '@alectranel.com' global bell allowlist.
-- Keep that global list operator-managed; the inbox lock above is the authority.

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

-- Spec 33 §6 — send-failure ledger (2026-07-12). One row per FAILED outbound
-- step on the agent-mail lanes: route 'cfSend' (Email Sending), 'mirror'
-- (Airtable cockpit write-through), 'bell' (Spec 47 webhook wake). Inserts are
-- fail-open by contract — recording never breaks the send it rides on. The
-- fleet watchdog polls GET /api/agent-mail/send-failures?since=<epoch>
-- (operator token) every 15 min and pages one bullet per row.
-- Migration for existing deployments (run once — the whole file is idempotent):
--   cfrun wrangler d1 execute agent-mail --remote --file=schema/agent_mail.sql
CREATE TABLE IF NOT EXISTS send_failures (
  id      TEXT PRIMARY KEY,                       -- uuid
  ts      INTEGER NOT NULL,                       -- epoch seconds (the watchdog's cursor)
  route   TEXT NOT NULL,                          -- 'cfSend' | 'mirror' | 'bell'
  to_addr TEXT,                                   -- counterparty: recipient / inbox / agent name
  error   TEXT
);
CREATE INDEX IF NOT EXISTS idx_send_failures_ts ON send_failures(ts);
