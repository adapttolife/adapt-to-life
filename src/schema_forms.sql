-- Raw forms stay in the existing restricted operational DB (WAIVERS_DB).
-- The shared intake/CRM mirror receives only the deliberately limited projection.
CREATE TABLE IF NOT EXISTS form_submissions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('contact','apply','volunteer')),
  payload TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS form_deliveries (
  submission_id TEXT NOT NULL REFERENCES form_submissions(id),
  channel TEXT NOT NULL CHECK(channel IN ('clickup','intake','receipt')),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  receipt TEXT,
  error TEXT,
  -- Resend move (Nov 2026, schema/migrations/2026-11-24-form-outbox-resend.sql):
  -- the environment that wrote the row (each Worker sends only its own), the
  -- retry clock, and the receipt exactly as rendered on the first attempt.
  env TEXT NOT NULL DEFAULT 'production',
  first_attempted_at TEXT,
  next_attempt_at TEXT,
  rendered TEXT,
  PRIMARY KEY(submission_id,channel)
);
CREATE INDEX IF NOT EXISTS form_deliveries_pending ON form_deliveries(state,started_at);
CREATE INDEX IF NOT EXISTS form_deliveries_due ON form_deliveries(env,state,next_attempt_at);
-- Additive rollout: existing submissions are NOT enrolled or re-mailed.
CREATE TABLE IF NOT EXISTS form_record_deliveries (
  submission_id TEXT PRIMARY KEY REFERENCES form_submissions(id),
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','running','done','review')),
  attempts INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  completed_at TEXT,
  receipt TEXT,
  error TEXT,
  mirrored_at TEXT,
  env TEXT NOT NULL DEFAULT 'production',
  first_attempted_at TEXT,
  next_attempt_at TEXT
);
CREATE INDEX IF NOT EXISTS form_records_pending ON form_record_deliveries(state,mirrored_at);
CREATE INDEX IF NOT EXISTS form_records_due ON form_record_deliveries(env,state,next_attempt_at);
