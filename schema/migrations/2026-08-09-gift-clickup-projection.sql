-- Gift-level ClickUp projection and append-only allocation evidence.
-- Givebutter remains the transaction source; accounting evidence remains in D1.
CREATE TABLE IF NOT EXISTS donor_gift_clickup_projection (
  transaction_id             TEXT PRIMARY KEY,
  donor_key                   TEXT NOT NULL,
  clickup_task_id             TEXT,
  parent_task_id              TEXT,
  historical                  INTEGER NOT NULL DEFAULT 0 CHECK (historical IN (0,1)),
  baseline_name               TEXT,
  baseline_email              TEXT,
  baseline_amount             REAL CHECK (baseline_amount IS NULL OR baseline_amount >= 0),
  baseline_campaign_id        TEXT,
  baseline_campaign_title     TEXT,
  baseline_transacted_at      TEXT,
  baseline_recurring          INTEGER NOT NULL DEFAULT 0 CHECK (baseline_recurring IN (0,1)),
  baseline_opt_in             INTEGER NOT NULL DEFAULT 0 CHECK (baseline_opt_in IN (0,1)),
  source_watermark            INTEGER CHECK (source_watermark IS NULL OR source_watermark > 0),
  allocation_watermark        INTEGER CHECK (allocation_watermark IS NULL OR allocation_watermark > 0),
  last_synced_at              TEXT,
  sync_error                  TEXT,
  claim_token                 TEXT,
  claimed_at                  TEXT,
  created_at                  TEXT NOT NULL,
  updated_at                  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS donor_gift_clickup_projection_task
  ON donor_gift_clickup_projection (clickup_task_id)
  WHERE clickup_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS donor_gift_clickup_projection_donor
  ON donor_gift_clickup_projection (donor_key, baseline_transacted_at);
CREATE INDEX IF NOT EXISTS donor_gift_clickup_projection_pending
  ON donor_gift_clickup_projection (last_synced_at, sync_error, claimed_at);

CREATE TABLE IF NOT EXISTS gift_projection_changes (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id  TEXT NOT NULL,
  changed_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gift_projection_changes_transaction
  ON gift_projection_changes (transaction_id, id);
CREATE TRIGGER IF NOT EXISTS gift_projection_changes_insert
AFTER INSERT ON donor_gifts
BEGIN
  INSERT INTO gift_projection_changes (transaction_id, changed_at)
  VALUES (NEW.transaction_id, datetime('now'));
END;
CREATE TRIGGER IF NOT EXISTS gift_projection_changes_update
AFTER UPDATE ON donor_gifts
BEGIN
  INSERT INTO gift_projection_changes (transaction_id, changed_at)
  VALUES (NEW.transaction_id, datetime('now'));
END;
INSERT INTO gift_projection_changes (transaction_id, changed_at)
SELECT g.transaction_id, datetime('now')
  FROM donor_gifts g
 WHERE NOT EXISTS (
   SELECT 1 FROM gift_projection_changes c WHERE c.transaction_id = g.transaction_id
 );

CREATE TABLE IF NOT EXISTS gift_allocation_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id    TEXT NOT NULL,
  expense_source    TEXT NOT NULL,
  expense_id        TEXT NOT NULL,
  evidence_url      TEXT,
  amount            REAL NOT NULL CHECK (amount <> 0),
  note              TEXT,
  verified_by       TEXT NOT NULL,
  verified_at       TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS gift_allocation_events_transaction
  ON gift_allocation_events (transaction_id, id);
CREATE INDEX IF NOT EXISTS gift_allocation_events_expense
  ON gift_allocation_events (expense_source, expense_id);
CREATE TRIGGER IF NOT EXISTS gift_allocation_events_no_update
BEFORE UPDATE ON gift_allocation_events
BEGIN
  SELECT RAISE(ABORT, 'gift allocation events are append-only');
END;
CREATE TRIGGER IF NOT EXISTS gift_allocation_events_no_delete
BEFORE DELETE ON gift_allocation_events
BEGIN
  SELECT RAISE(ABORT, 'gift allocation events are append-only');
END;
