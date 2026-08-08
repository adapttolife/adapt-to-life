-- ClickUp is a projection, not the donor system of record. This table stores
-- only the projection cursor and an optional pre-webhook baseline imported from
-- Givebutter, so repeat gifts can update one relationship task without sending
-- old donors a late transactional email.
CREATE TABLE IF NOT EXISTS donor_clickup_projection (
  donor_key               TEXT PRIMARY KEY,
  clickup_task_id          TEXT,
  baseline_name            TEXT,
  baseline_email           TEXT,
  baseline_gift_count      INTEGER NOT NULL DEFAULT 0 CHECK (baseline_gift_count >= 0),
  baseline_total           REAL NOT NULL DEFAULT 0 CHECK (baseline_total >= 0),
  baseline_first_gift_at   TEXT,
  baseline_latest_gift_at  TEXT,
  baseline_cutoff_at       TEXT,
  baseline_recurring       INTEGER NOT NULL DEFAULT 0 CHECK (baseline_recurring IN (0,1)),
  baseline_opt_in          INTEGER NOT NULL DEFAULT 0 CHECK (baseline_opt_in IN (0,1)),
  source_watermark         INTEGER CHECK (source_watermark IS NULL OR source_watermark > 0),
  last_synced_at           TEXT,
  sync_error               TEXT,
  claim_token              TEXT,
  claimed_at               TEXT,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS donor_clickup_projection_task
  ON donor_clickup_projection (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS donor_clickup_projection_pending
  ON donor_clickup_projection (last_synced_at, sync_error, claimed_at);
