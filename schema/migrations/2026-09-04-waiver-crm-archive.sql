-- Signed releases: file into a Drive FOLDER and mirror into the Adapt To Life CRM.
--
--   cfrun npx wrangler d1 execute atl-waivers --remote \
--     --file schema/migrations/2026-09-04-waiver-crm-archive.sql
--
-- Additive only. SQLite has no ADD COLUMN IF NOT EXISTS, so a second run fails
-- loudly — the correct behaviour for a migration that has already been applied.
--
-- signer_phone   optional contact number captured at signing, for the CRM row.
-- drive_filed_at set once the PDF sits in the "Signed Waivers" folder under a
--                readable name. Existing rows have drive_file_id but were
--                dropped in the Shared Drive root, so leaving this NULL is what
--                makes the next cron move and rename them.
-- crm_synced_at  set once the row exists in the CRM's Waivers tab. NULL on every
--                existing row on purpose: the same pass backfills them.
-- crm_error      last failure text, so a stuck row explains itself in the table
--                rather than only in a Worker log that ages out.
ALTER TABLE waivers ADD COLUMN signer_phone   TEXT;
ALTER TABLE waivers ADD COLUMN drive_filed_at TEXT;
ALTER TABLE waivers ADD COLUMN crm_synced_at  TEXT;
ALTER TABLE waivers ADD COLUMN crm_error      TEXT;
