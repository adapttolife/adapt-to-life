-- Every public form also becomes a person in the Adapt To Life CRM.
--
--   cfrun npx wrangler d1 execute atl-waivers --remote \
--     --file schema/migrations/2026-09-04-crm-intake.sql
--
-- Re-runnable (CREATE TABLE IF NOT EXISTS), unlike the ALTER-based migrations.
--
-- WHY A TABLE AND NOT A DIRECT WRITE. The forms already answer the submitter in
-- ~1s and already write ClickUp. Appending to Google Sheets on that path would
-- put a third-party API between a member of the public and their confirmation,
-- and a fire-and-forget waitUntil would drop the row whenever Sheets is slow —
-- silently, because nobody is watching a form that says "thanks". So the row
-- lands here first (a D1 insert on the same continent) and the ten-minute cron
-- that files signed waivers drains it. D1 is the queue, the cron is the writer,
-- the sheet is the destination — the same shape the waiver archive uses, which
-- is the point: one pattern, not one per form.
--
-- payload holds the full submission as JSON so a tab can gain a column later
-- without having lost the data. It is NOT what gets written to the sheet.
CREATE TABLE IF NOT EXISTS crm_intake (
  id             TEXT PRIMARY KEY,        -- uuid; the idempotency key for the append
  kind           TEXT NOT NULL,           -- 'contact' | 'application' | 'volunteer'
  received_at    TEXT NOT NULL,           -- ISO timestamp
  name           TEXT,
  email          TEXT,
  phone          TEXT,
  organization   TEXT,
  source         TEXT,                    -- which page or site the form was on
  detail         TEXT,                    -- ONE short human line, per-kind (see crm_intake.js)
  clickup_id     TEXT,                    -- the task holding the full submission
  clickup_url    TEXT,
  payload        TEXT,                    -- full submission JSON, for later columns
  crm_synced_at  TEXT,                    -- set once the CRM tab has the row
  crm_error      TEXT,                    -- last failure, so a stuck row explains itself
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_crm_intake_pending ON crm_intake(crm_synced_at, created_at);
CREATE INDEX IF NOT EXISTS idx_crm_intake_email   ON crm_intake(email);
