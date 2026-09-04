// Signed-release archive: one Drive folder, one CRM row per signing.
//
// The compliance record is still D1 (index) + R2 (the signed PDF). This is the
// human-facing half: every signed release gets filed into ONE Drive folder under
// a name a person can read, and one row in the CRM's "Waivers" tab that links to
// it. Staff look people up in the CRM, so that is where the waiver has to be
// findable — the row carries the signer's details and a LINK, never a copy.
//
// It runs on the cron, off the signing hot path, so a Google outage can never
// block or slow down someone signing. Every step is idempotent and driven by
// three D1 columns (drive_file_id, drive_filed_at, crm_synced_at), so a row that
// fails half way is finished by the next pass, not duplicated.
//
// The Google plumbing is in google.js and the sheet contract is in sheets.js.
// Everything below is what makes a WAIVER different from the next intake.

import { googleToken, ensureFolder, driveUpload, driveFileInto } from "./google.js";
import { bookId, ensureTab, appendRow, stampByKey, text, hyperlink } from "./sheets.js";

const FOLDER_NAME = "Signed Waivers";
const CRM_TAB = "Waivers";
export const CRM_HEADERS = [
  "Signed", "Participant", "Signed by", "Relationship", "Email", "Phone",
  "Program or event", "Source", "Signer type", "Release version",
  "Signed waiver", "Document ID", "Verify", "Filed",
];
const SOURCE_LABEL = { atl: "Adapt To Life", asnm: "Adaptive Sports Near Me" };
const VERIFY_BASE = "https://sign.adapttolife.org/api/waiver";
const CONSENT_PREFIX = "Media release";
// Batch size per cron tick. Ten signings in ten minutes would be a very good
// day; the cap exists so one bad row can never spend the whole invocation.
const BATCH = 10;

export async function runWaiverArchive(env) {
  if (!env.GOOGLE_SA_JSON || !env.WAIVERS_DRIVE_ID) { console.error("waiver archive not configured"); return; }

  let rows;
  try {
    rows = (await env.WAIVERS_DB.prepare(
      `SELECT id, org, r2_key, signer_name, signer_email, signer_phone, signed_at, signer_kind,
              minor_name, relationship, program, waiver_version, drive_file_id, drive_link,
              drive_filed_at, crm_synced_at
         FROM waivers
        WHERE drive_file_id IS NULL OR drive_file_id = ''
           OR drive_filed_at IS NULL
           OR crm_synced_at IS NULL
        ORDER BY created_at ASC LIMIT ?`
    ).bind(BATCH).all()).results || [];
  } catch (err) { console.error("waiver archive: D1 query failed:", err); return; }
  if (!rows.length) return;

  let token, folderId;
  try {
    token = await googleToken(env);
    folderId = await ensureFolder(token, env.WAIVERS_DRIVE_ID, FOLDER_NAME);
  } catch (err) { console.error("waiver archive: Drive unavailable:", err); return; }

  // Resolved once, not once per row: nine of ten calls would only re-learn that
  // the tab is still there. A failure here is almost always "the CRM is not
  // shared with the service account", which is a whole-run condition, and it
  // must not stop the Drive half from filing anything.
  const sheetId = bookId(env, "atlCrm");
  let crmReady = null;
  if (sheetId) {
    try { await ensureTab(token, sheetId, CRM_TAB, CRM_HEADERS); crmReady = true; }
    catch (err) { crmReady = `CRM unavailable: ${err}`; }
  }

  for (const row of rows) {
    try {
      const filed = await fileToDrive(env, token, folderId, row);
      await syncToCrm(env, token, sheetId, { ...row, ...filed }, crmReady);
    } catch (err) {
      console.error("waiver archive: failed for", row.id, err);
      await note(env, row.id, String(err).slice(0, 400));
    }
  }
}

// "2026-09-04 Alec Tranel — release 2d0c35bc.pdf". A folder of release-<uuid>.pdf
// is technically a complete archive and practically unusable.
export function archiveFilename(row) {
  const who = (row.signer_kind === "guardian" && row.minor_name ? row.minor_name : row.signer_name) || "Unnamed";
  const safe = who.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${String(row.signed_at).slice(0, 10)} ${safe} — release ${String(row.id).slice(0, 8)}.pdf`;
}

async function fileToDrive(env, token, folderId, row) {
  if (row.drive_file_id && row.drive_filed_at) return {};
  const name = archiveFilename(row);
  const now = new Date().toISOString();

  // Already uploaded (before this folder existed, or by an earlier half-done
  // pass): move and rename it rather than uploading a second copy.
  if (row.drive_file_id) {
    const file = await driveFileInto(token, row.drive_file_id, folderId, name);
    const link = file.webViewLink || row.drive_link;
    await env.WAIVERS_DB.prepare("UPDATE waivers SET drive_link = ?, drive_filed_at = ? WHERE id = ?")
      .bind(link, now, row.id).run();
    return { drive_link: link };
  }

  const obj = await env.WAIVERS_BUCKET.get(row.r2_key);
  if (!obj) throw new Error("R2 object missing: " + row.r2_key);
  const file = await driveUpload(token, folderId, name, new Uint8Array(await obj.arrayBuffer()));
  const link = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
  await env.WAIVERS_DB.prepare("UPDATE waivers SET drive_file_id = ?, drive_link = ?, drive_filed_at = ? WHERE id = ?")
    .bind(file.id, link, now, row.id).run();
  return { drive_file_id: file.id, drive_link: link };
}

async function syncToCrm(env, token, sheetId, row, crmReady) {
  if (crmReady === null) return;              // Drive-only deployment: nothing owed.
  if (row.crm_synced_at) return;
  if (crmReady !== true) throw new Error(crmReady);
  if (!row.drive_link) throw new Error("no drive link yet");

  const now = new Date().toISOString();
  await appendRow(token, sheetId, CRM_TAB, crmRow(row, now));
  await env.WAIVERS_DB.prepare("UPDATE waivers SET crm_synced_at = ?, crm_error = NULL WHERE id = ?").bind(now, row.id).run();

  // Best effort, and deliberately AFTER the row is recorded: stamping the
  // curated People tab is a convenience, and it must never cost us the register
  // entry that is the actual compliance artifact.
  try {
    await stampByKey(token, sheetId, "People", {
      keyHeader: "Email", keyValue: row.signer_email,
      stampHeader: "Consent", ownPrefix: CONSENT_PREFIX,
      value: `${CONSENT_PREFIX} ${String(row.signed_at).slice(0, 10)}`,
    });
  } catch (err) { console.error("waiver archive: People stamp failed for", row.id, err); }
}

export function crmRow(row, filedAt) {
  const guardian = row.signer_kind === "guardian";
  return [
    String(row.signed_at).slice(0, 10),
    text(guardian ? row.minor_name : row.signer_name),
    text(row.signer_name),
    guardian ? text(row.relationship) : "Self",
    text(row.signer_email),
    text(row.signer_phone),
    text(row.program),
    SOURCE_LABEL[row.org] || text(row.org),
    guardian ? "Parent / guardian" : "Adult",
    text(row.waiver_version),
    hyperlink(row.drive_link, "Open PDF"),
    row.id,
    hyperlink(`${VERIFY_BASE}/${row.id}/verify`, "Verify"),
    filedAt.slice(0, 19).replace("T", " ") + "Z",
  ];
}

async function note(env, id, message) {
  try { await env.WAIVERS_DB.prepare("UPDATE waivers SET crm_error = ? WHERE id = ?").bind(message, id).run(); }
  catch { /* the console line at the call site is the record of record here */ }
}
