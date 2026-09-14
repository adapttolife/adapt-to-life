-- Signed-release record index + audit trail. The signed PDF lives in Google Drive;
-- this table is the queryable, tamper-checkable log of who signed what, when,
-- from where, and how. No real rows exist yet, so this is the full schema.
DROP TABLE IF EXISTS waivers;
CREATE TABLE waivers (
  id              TEXT PRIMARY KEY,        -- uuid, also the unguessable download token
  org             TEXT NOT NULL,           -- 'atl' | 'asnm' (which site they signed from)
  waiver_version  TEXT NOT NULL,           -- document version at signing time
  signer_name     TEXT NOT NULL,           -- adult participant, or guardian's name
  signer_email    TEXT NOT NULL,
  signed_at       TEXT NOT NULL,           -- ISO timestamp
  signature_type  TEXT,                    -- 'drawn' | 'typed'
  signer_kind     TEXT,                    -- 'adult' | 'guardian'
  minor_name      TEXT,                    -- participant name when a guardian signs
  relationship    TEXT,                    -- guardian's relationship to the minor
  program         TEXT,                    -- optional program/event
  consent         INTEGER NOT NULL DEFAULT 1,
  ip              TEXT,
  user_agent      TEXT,
  country         TEXT,
  region          TEXT,
  city            TEXT,
  doc_sha256      TEXT,                    -- hash of the exact text agreed to
  pdf_sha256      TEXT,                    -- hash of the stored PDF (tamper-evidence)
  drive_file_id   TEXT,
  drive_link      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_waivers_email ON waivers(signer_email);
CREATE INDEX idx_waivers_org   ON waivers(org, signed_at);
