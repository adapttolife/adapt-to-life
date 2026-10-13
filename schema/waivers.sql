-- Signed-release record index + audit trail: the queryable, tamper-checkable log
-- of who signed what, when, from where, and how. The signed PDF bytes are
-- captured in waiver_documents in the same D1 batch, before the signer is told
-- "done"; Google Drive is the long-term archive filed from that copy (see
-- runDriveBacklog in src/waiver.js). This is the full schema for a fresh
-- database. A LIVE database is upgraded by
-- migrations/2026-10-03-waiver-capture-first.sql, never by this file: the DROP
-- below would destroy signed releases.
DROP TABLE IF EXISTS waiver_documents;
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
  drive_status    TEXT NOT NULL DEFAULT 'pending', -- uploading | pending | done | failed | unrecoverable
  drive_attempts  INTEGER NOT NULL DEFAULT 0,
  drive_last_attempt_at TEXT,
  drive_done_at   TEXT,
  drive_error     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_waivers_email ON waivers(signer_email);
CREATE INDEX idx_waivers_org   ON waivers(org, signed_at);
CREATE INDEX idx_waivers_drive ON waivers(drive_status, drive_last_attempt_at);

-- The signed PDF exactly as hashed into waivers.pdf_sha256. Deleted 30 days
-- after Drive confirmed the archived file.
CREATE TABLE waiver_documents (
  waiver_id   TEXT PRIMARY KEY REFERENCES waivers(id),
  pdf         BLOB NOT NULL,
  pdf_sha256  TEXT NOT NULL,
  byte_length INTEGER NOT NULL,
  created_at  TEXT NOT NULL
);
