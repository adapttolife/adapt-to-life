-- Spec 116 — the QR platform. Lives in the atl-waivers D1 (binding WAIVERS_DB).
--
-- Apply to a fresh database with:
--   cfrun npx wrangler d1 execute atl-waivers --remote --file schema/qr.sql
--
-- This file is the canonical definition. The live production database predates
-- it: qr_scans was created ad hoc on 2026-07-25 with only (slug, kind,
-- scanned_at) and never written down, which is exactly the drift this file
-- closes. To bring an existing database up to this shape, run the migration in
-- schema/migrations/ instead — it is additive and safe to re-run.

-- ---------------------------------------------------------------------------
-- qr_codes — the destinations, as DATA.
--
-- This table is the whole point of the platform. A printed sticker encodes
-- adapttolife.org/q/<slug> and lives on an athlete's chair for years; the row
-- below is what that sticker points at TODAY, and changing it is an UPDATE,
-- not a deploy and never a reprint.
--
-- A slug is printed matter. It is never reused and never deleted (D4): reuse
-- would silently send every sticker already in the world somewhere wrong.
-- Retiring a code sets active = 0 and retired_at — it keeps redirecting,
-- it just stops being offered for new print runs.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_codes (
  slug        TEXT PRIMARY KEY,
  -- Where it points today. Site-relative ("/send-6") or absolute for a vendor.
  dest        TEXT NOT NULL,
  -- Optional routing rule. NULL = always dest. 'campaign-follow' = point at
  -- whichever drive is open today and fall back to dest when none is.
  rule        TEXT,
  label       TEXT NOT NULL,
  -- The physical thing it is stuck to. Doubles as utm_medium, so "chair-sticker"
  -- and "banner" show up as separate channels in Givebutter.
  surface     TEXT,
  notes       TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  retired_at  TEXT
);

-- ---------------------------------------------------------------------------
-- qr_code_events — the audit trail.
--
-- Repointing a code changes where physical objects in the world send people.
-- That is a consequential act performed through a browser page by whoever is
-- logged in, so every mint, repoint, and retire is recorded with the identity
-- Cloudflare Access asserted. Without this, "who sent the chair stickers to
-- the wrong page in October" has no answer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_code_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  action     TEXT NOT NULL,      -- mint | repoint | retire | restore | edit
  old_dest   TEXT,
  new_dest   TEXT,
  actor      TEXT,               -- Access-verified email, or 'script'
  detail     TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_code_events_slug ON qr_code_events (slug, at);

-- ---------------------------------------------------------------------------
-- qr_scans — one row per scan. No cookies, no fingerprinting; every column
-- below is something Cloudflare already hands the Worker about the request.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_scans (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  slug       TEXT NOT NULL,
  kind       TEXT NOT NULL,      -- known | unknown | retired
  scanned_at TEXT NOT NULL,
  country    TEXT,
  region     TEXT,
  city       TEXT,
  device     TEXT,               -- ios | android | desktop | other | unknown
  referrer   TEXT                -- host only; a camera scan usually has none
);
CREATE INDEX IF NOT EXISTS qr_scans_slug ON qr_scans (slug, scanned_at);

-- ---------------------------------------------------------------------------
-- qr_gifts — P6, the point of the whole build.
--
-- Givebutter is the system of record for the money; this is a local mirror of
-- just the gifts that carry QR attribution, so "the chair stickers raised $X"
-- is a join and not a wish. Keyed by Givebutter's own transaction id, so the
-- sync is idempotent and re-running it can never double-count a gift.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS qr_gifts (
  transaction_id TEXT PRIMARY KEY,
  slug           TEXT NOT NULL,
  amount         REAL NOT NULL,   -- what the donor paid
  donated        REAL NOT NULL,   -- what reaches the org
  status         TEXT NOT NULL,
  transacted_at  TEXT NOT NULL,
  attribution    TEXT,            -- the raw marker we matched on, for auditing
  synced_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS qr_gifts_slug ON qr_gifts (slug, transacted_at);

-- Sync bookkeeping: how far the Givebutter pull has read, so each run is
-- incremental and a missed run catches up rather than skipping gifts.
CREATE TABLE IF NOT EXISTS qr_sync_state (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT
);
