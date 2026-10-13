-- Signed waivers: capture first, archive second.
--
-- Apply to the LIVE atl-waivers database BEFORE the Worker that reads these
-- columns is deployed (the new /api/waiver refuses to say "signed" unless this
-- capture write succeeds, so deploying first would fail every signing, loudly):
--   cfrun npx wrangler d1 execute atl-waivers --remote \
--     --file schema/migrations/2026-10-03-waiver-capture-first.sql
--
-- Before this change /api/waiver uploaded the PDF to Drive, swallowed a Drive
-- failure, then inserted the D1 row and swallowed a D1 failure too, so a signer
-- could be told "done" while no copy of the signed PDF existed anywhere. Now the
-- audit row and the PDF bytes commit together in one D1 batch first; Drive is a
-- retried step driven by drive_status. Additive only: no row is deleted.
ALTER TABLE waivers ADD COLUMN drive_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE waivers ADD COLUMN drive_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE waivers ADD COLUMN drive_last_attempt_at TEXT;
ALTER TABLE waivers ADD COLUMN drive_done_at TEXT;
ALTER TABLE waivers ADD COLUMN drive_error TEXT;

-- Existing rows: archived ones are done. The rest never reached Drive and have
-- no stored bytes (the PDF was lost at signing time); mark them honestly so the
-- backlog skips them and an operator can see exactly which releases need a
-- re-sign.
UPDATE waivers SET drive_status = 'done', drive_done_at = COALESCE(drive_done_at, created_at)
  WHERE COALESCE(drive_file_id, '') <> '';
UPDATE waivers SET drive_status = 'unrecoverable', drive_error = 'pre-2026-10-03: Drive upload failed at signing and no copy was kept'
  WHERE COALESCE(drive_file_id, '') = '';

CREATE INDEX IF NOT EXISTS idx_waivers_drive ON waivers(drive_status, drive_last_attempt_at);

CREATE TABLE IF NOT EXISTS waiver_documents (
  waiver_id   TEXT PRIMARY KEY REFERENCES waivers(id),
  pdf         BLOB NOT NULL,
  pdf_sha256  TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
