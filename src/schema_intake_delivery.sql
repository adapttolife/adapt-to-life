CREATE TABLE IF NOT EXISTS intake_delivery_claims (
  intake_id TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','done','review')),
  started_at TEXT,
  completed_at TEXT,
  error TEXT
);
