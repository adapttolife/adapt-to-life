-- Form outbox for the Resend move (docs/EMAIL.md, "How a site sends").
--
--   cfrun npx wrangler d1 execute atl-waivers --remote \
--     --file schema/migrations/2026-11-24-form-outbox-resend.sql
-- (atl-waivers lives in the Adapt To Life Cloudflare account.)
--
-- Additive only, so it is safe with the code on main and on staging at once
-- (staging and production share this database): new columns with defaults or
-- NULL, and two new indexes. Code that does not know these columns keeps
-- working; every row it writes gets env='production', which is what it is.
--
--   env              the environment that wrote the row; each Worker sends only
--                    its own, so a staging submission is never mailed by
--                    production's cron
--   first_attempt_at when the first send began: the 23-hour retry clock
--   next_attempt_at  when a retryable failure may try again (backoff)
--   rendered         the receipt exactly as first rendered (JSON), resent
--                    byte-identical under the same Idempotency-Key
--
-- Run once, BEFORE the code that uses it deploys (SQLite has no ADD COLUMN IF
-- NOT EXISTS; a second run fails harmlessly on the first ALTER). Then
-- `cfrun node scripts/check-d1-schema.mjs atl-waivers` must report ok.
ALTER TABLE form_deliveries ADD COLUMN env TEXT NOT NULL DEFAULT 'production';
ALTER TABLE form_deliveries ADD COLUMN first_attempt_at TEXT;
ALTER TABLE form_deliveries ADD COLUMN next_attempt_at TEXT;
ALTER TABLE form_deliveries ADD COLUMN rendered TEXT;
CREATE INDEX IF NOT EXISTS form_deliveries_due ON form_deliveries(env,state,next_attempt_at);
ALTER TABLE form_record_deliveries ADD COLUMN env TEXT NOT NULL DEFAULT 'production';
ALTER TABLE form_record_deliveries ADD COLUMN first_attempt_at TEXT;
ALTER TABLE form_record_deliveries ADD COLUMN next_attempt_at TEXT;
CREATE INDEX IF NOT EXISTS form_records_due ON form_record_deliveries(env,state,next_attempt_at);
