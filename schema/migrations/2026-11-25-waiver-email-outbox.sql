-- The signed-waiver email outbox (src/waiver.js processWaiverEmail;
-- docs/EMAIL.md, "How a site sends"). Apply with:
--
--   cfrun npx wrangler d1 execute atl-waivers --remote \
--     --file schema/migrations/2026-11-25-waiver-email-outbox.sql
-- (atl-waivers lives in the Adapt To Life Cloudflare account.)
--
-- Additive only: one new table and its index, safe with the code on main and on
-- staging at once (they share this database). Code that does not know the table
-- never touches it. Releases signed before it are not enrolled or re-mailed.
--
-- Run BEFORE the code that writes it deploys: handleWaiver queues the email in
-- the same batch as the release, so without this table a signing would fail.
-- The release's schema gate (`cfrun node scripts/check-d1-schema.mjs
-- atl-waivers`) refuses to release until it is applied. Safe to run twice.
CREATE TABLE IF NOT EXISTS waiver_emails (
  waiver_id          TEXT PRIMARY KEY REFERENCES waivers(id),
  env                TEXT NOT NULL DEFAULT 'production',
  state              TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','review')),
  attempts           INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  started_at         TEXT,
  completed_at       TEXT,
  first_attempted_at TEXT,
  next_attempt_at    TEXT,
  rendered           TEXT,
  receipt            TEXT,
  error              TEXT
);
CREATE INDEX IF NOT EXISTS waiver_emails_due ON waiver_emails(env, state, next_attempt_at);
