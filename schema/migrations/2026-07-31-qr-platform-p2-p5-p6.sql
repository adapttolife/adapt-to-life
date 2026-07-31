-- Spec 116 P2/P5/P6 — bring the LIVE atl-waivers database up to schema/qr.sql.
--
--   cfrun npx wrangler d1 execute atl-waivers --remote \
--     --file schema/migrations/2026-07-31-qr-platform-p2-p5-p6.sql
--
-- Additive only: no column is dropped and no row is rewritten, so the running
-- redirect keeps serving throughout. The new tables use IF NOT EXISTS and are
-- re-runnable. The four ALTERs are NOT — SQLite has no ADD COLUMN IF NOT
-- EXISTS, so they fail loudly on a second run, which is the correct behaviour
-- for a migration that has already been applied.

CREATE TABLE IF NOT EXISTS qr_codes (
  slug        TEXT PRIMARY KEY,
  dest        TEXT NOT NULL,
  rule        TEXT,
  label       TEXT NOT NULL,
  surface     TEXT,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  retired_at  TEXT
);

CREATE TABLE IF NOT EXISTS qr_code_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  action     TEXT NOT NULL,
  old_dest   TEXT,
  new_dest   TEXT,
  actor      TEXT,
  detail     TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_code_events_slug ON qr_code_events (slug, at);

-- P5: the scan detail that answers "which surface actually works".
ALTER TABLE qr_scans ADD COLUMN country  TEXT;
ALTER TABLE qr_scans ADD COLUMN region   TEXT;
ALTER TABLE qr_scans ADD COLUMN city     TEXT;
ALTER TABLE qr_scans ADD COLUMN device   TEXT;
ALTER TABLE qr_scans ADD COLUMN referrer TEXT;
CREATE INDEX IF NOT EXISTS qr_scans_slug ON qr_scans (slug, scanned_at);

CREATE TABLE IF NOT EXISTS qr_gifts (
  transaction_id TEXT PRIMARY KEY,
  slug           TEXT NOT NULL,
  amount         REAL NOT NULL,
  donated        REAL NOT NULL,
  status         TEXT NOT NULL,
  transacted_at  TEXT NOT NULL,
  attribution    TEXT,
  synced_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_gifts_slug ON qr_gifts (slug, transacted_at);

CREATE TABLE IF NOT EXISTS qr_sync_state (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);

-- Seed the four codes that are already printed and already redirecting, with
-- the destinations src/qr.js hardcoded before this migration. They must land
-- here byte-identical: the table takes over from the code on the next deploy,
-- and a mismatch would repoint a sticker that is already in the world.
INSERT OR IGNORE INTO qr_codes (slug, dest, rule, label, surface, notes, active, created_at, updated_at)
VALUES
  ('chair',   '/send-6',  NULL, 'Chair sticker',  'chair-sticker', 'Stickers on athletes'' chairs. Points at the live campaign.',   1, '2026-07-25T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
  ('sign',    '/send-6',  NULL, 'Event signage',  'signage',       'Banners and table signs at tournaments. Points at the live campaign.', 1, '2026-07-25T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
  ('card',    '/send-6',  NULL, 'Hand card',      'hand-card',     'Printed cards handed out courtside. Points at the live campaign.', 1, '2026-07-25T00:00:00.000Z', '2026-07-31T00:00:00.000Z'),
  ('popcorn', '/popcorn', NULL, 'Popcorn drive',  'print',         'Anything promoting the current Double Good drive.',              1, '2026-07-25T00:00:00.000Z', '2026-07-31T00:00:00.000Z');

INSERT OR IGNORE INTO qr_code_events (slug, action, old_dest, new_dest, actor, detail, at)
VALUES
  ('chair',   'mint', NULL, '/send-6',  'script', 'Adopted from the hardcoded map in src/qr.js (Spec 116 P2).', '2026-07-31T00:00:00.000Z'),
  ('sign',    'mint', NULL, '/send-6',  'script', 'Adopted from the hardcoded map in src/qr.js (Spec 116 P2).', '2026-07-31T00:00:00.000Z'),
  ('card',    'mint', NULL, '/send-6',  'script', 'Adopted from the hardcoded map in src/qr.js (Spec 116 P2).', '2026-07-31T00:00:00.000Z'),
  ('popcorn', 'mint', NULL, '/popcorn', 'script', 'Adopted from the hardcoded map in src/qr.js (Spec 116 P2).', '2026-07-31T00:00:00.000Z');
