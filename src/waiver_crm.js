// Signed-release archive: Google Drive folder + the Adapt To Life CRM sheet.
//
// The compliance record is still D1 (index) + R2 (the signed PDF). This module is
// the human-facing half: every signed release gets filed into ONE Drive folder
// under a name a person can read, and one row in the CRM's "Waivers" tab that
// links to it. Staff look people up in the CRM, so that is where the waiver has
// to be findable — the row carries the signer's details and a link, never a copy
// of the PDF.
//
// It runs on the cron, off the signing hot path, so a Google outage can never
// block or slow down someone signing. Every step is idempotent and driven by
// three D1 columns (drive_file_id, drive_filed_at, crm_synced_at), so a row that
// fails half way is picked up on the next pass and finished, not duplicated.
//
// Google identity: the same service account as before (a Shared Drive member, so
// uploads have somewhere to live — service accounts own no storage of their own).
// The CRM spreadsheet lives in Alec's Drive, so it must be shared with that
// service account as an Editor; until it is, the Drive half still runs and the
// CRM half retries every cron until access appears.

const FOLDER_NAME = "Signed Waivers";
const CRM_TAB = "Waivers";
const CRM_HEADERS = [
  "Signed", "Participant", "Signed by", "Relationship", "Email", "Phone",
  "Program or event", "Source", "Signer type", "Release version",
  "Signed waiver", "Document ID", "Verify", "Filed",
];
const SOURCE_LABEL = { atl: "Adapt To Life", asnm: "Adaptive Sports Near Me" };
const VERIFY_BASE = "https://sign.adapttolife.org/api/waiver";
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

  let token;
  try { token = await getGoogleAccessToken(env); }
  catch (err) { console.error("waiver archive: token mint failed:", err); return; }

  let folderId;
  try { folderId = await ensureFolder(token, env.WAIVERS_DRIVE_ID); }
  catch (err) { console.error("waiver archive: folder resolve failed:", err); return; }

  // Resolved once, not once per row: nine of ten calls would only re-learn that
  // the tab is still there. A failure here is almost always "the CRM has not
  // been shared with the service account yet", which is a whole-run condition,
  // and it must not stop the Drive half from filing anything.
  let crmReady = null;
  if (env.ATL_CRM_SHEET_ID) {
    try { await ensureTab(token, env.ATL_CRM_SHEET_ID); crmReady = true; }
    catch (err) { crmReady = `CRM unavailable (is the sheet shared with the service account as an Editor?): ${err}`; }
  }

  for (const row of rows) {
    try {
      const filed = await fileToDrive(env, token, folderId, row);
      await syncToCrm(env, token, { ...row, ...filed }, crmReady);
    } catch (err) {
      console.error("waiver archive: failed for", row.id, err);
      await note(env, row.id, String(err).slice(0, 400));
    }
  }
}

// --- Drive -----------------------------------------------------------------

// One folder, resolved by name so nobody has to paste an id into config. If a
// human renames or moves it, the next run makes a new one rather than throwing:
// losing the tidy grouping is recoverable, losing a signed release is not.
async function ensureFolder(token, driveId) {
  const q = `name = '${FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and '${driveId}' in parents and trashed = false`;
  const found = await driveApi(token, `files?q=${encodeURIComponent(q)}&corpora=drive&driveId=${driveId}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id)`);
  if (found.files && found.files.length) return found.files[0].id;
  const made = await driveApi(token, "files?supportsAllDrives=true&fields=id", {
    method: "POST",
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder", parents: [driveId] }),
  });
  return made.id;
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

  // Already uploaded (before this folder existed, or by an earlier half-done
  // pass): move and rename it in place rather than uploading a second copy.
  // A file on a Shared Drive has exactly one parent, so the move has to name the
  // parent it is leaving — read it rather than assuming the drive root, or the
  // one file that was already tidied by hand breaks the whole backlog.
  if (row.drive_file_id) {
    const current = await driveApi(token, `files/${row.drive_file_id}?supportsAllDrives=true&fields=id,parents,name,webViewLink`);
    const leaving = (current.parents || []).filter((p) => p !== folderId);
    const move = leaving.length ? `&addParents=${folderId}&removeParents=${leaving.join(",")}` : "";
    const file = await driveApi(token, `files/${row.drive_file_id}?supportsAllDrives=true&fields=id,webViewLink${move}`, {
      method: "PATCH", body: JSON.stringify({ name }),
    });
    const link = file.webViewLink || current.webViewLink || row.drive_link;
    await env.WAIVERS_DB.prepare("UPDATE waivers SET drive_link = ?, drive_filed_at = ? WHERE id = ?")
      .bind(link, new Date().toISOString(), row.id).run();
    return { drive_link: link };
  }

  const obj = await env.WAIVERS_BUCKET.get(row.r2_key);
  if (!obj) throw new Error("R2 object missing: " + row.r2_key);
  const bytes = new Uint8Array(await obj.arrayBuffer());
  const file = await driveUpload(token, folderId, name, bytes);
  const link = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
  await env.WAIVERS_DB.prepare("UPDATE waivers SET drive_file_id = ?, drive_link = ?, drive_filed_at = ? WHERE id = ?")
    .bind(file.id, link, new Date().toISOString(), row.id).run();
  return { drive_file_id: file.id, drive_link: link };
}

// --- CRM -------------------------------------------------------------------

async function syncToCrm(env, token, row, crmReady) {
  if (crmReady === null) return;              // Drive-only deployment: nothing owed.
  if (row.crm_synced_at) return;
  if (crmReady !== true) throw new Error(crmReady);
  if (!row.drive_link) throw new Error("no drive link yet");

  const now = new Date().toISOString();
  await sheetsApi(token, `${env.ATL_CRM_SHEET_ID}/values/${encodeURIComponent(`'${CRM_TAB}'!A1`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [crmRow(row, now)] }),
  });
  await env.WAIVERS_DB.prepare("UPDATE waivers SET crm_synced_at = ?, crm_error = NULL WHERE id = ?").bind(now, row.id).run();

  // Best effort, and deliberately after the row is recorded: stamping an
  // existing People row is a convenience, and it must never cost us the
  // register entry that is the actual compliance artifact.
  try { await stampPerson(token, env.ATL_CRM_SHEET_ID, row); }
  catch (err) { console.error("waiver archive: People stamp failed for", row.id, err); }
}

export function crmRow(row, filedAt) {
  const guardian = row.signer_kind === "guardian";
  const link = (url, label) => (url ? `=HYPERLINK("${String(url).replace(/"/g, "")}","${label}")` : "");
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
    link(row.drive_link, "Open PDF"),
    row.id,
    link(`${VERIFY_BASE}/${row.id}/verify`, "Verify"),
    filedAt.slice(0, 19).replace("T", " ") + "Z",
  ];
}

// The rows are appended as USER_ENTERED so the two link columns are real
// hyperlinks. That makes every other cell a formula the signer could have typed:
// a "name" of =IMPORTXML(...) would run inside the CRM the moment it landed.
// Leading ' tells Sheets "this is text" and is not shown in the cell.
function text(v) {
  const s = String(v == null ? "" : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// Create the tab on first use, so the CRM needs no manual setup beyond sharing
// it with the service account.
async function ensureTab(token, sheetId) {
  const meta = await sheetsApi(token, `${sheetId}?fields=sheets(properties(sheetId,title))`);
  if ((meta.sheets || []).some((s) => s.properties.title === CRM_TAB)) return;
  const created = await sheetsApi(token, `${sheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CRM_TAB, gridProperties: { rowCount: 1000, columnCount: CRM_HEADERS.length, frozenRowCount: 1 } } } }] }),
  });
  const newId = created.replies[0].addSheet.properties.sheetId;
  await sheetsApi(token, `${sheetId}/values/${encodeURIComponent(`'${CRM_TAB}'!A1`)}?valueInputOption=RAW`, {
    method: "PUT", body: JSON.stringify({ values: [CRM_HEADERS] }),
  });
  await sheetsApi(token, `${sheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{
      repeatCell: {
        range: { sheetId: newId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    }] }),
  });
}

// Mark the Consent column on an existing People row, matched by email. Only an
// empty cell or one this job wrote before is touched — a human's note there is
// theirs, and silently overwriting it would be the kind of "helpful" edit that
// makes people stop trusting an automation with their sheet.
async function stampPerson(token, sheetId, row) {
  const email = String(row.signer_email || "").trim().toLowerCase();
  if (!email) return;
  const grid = (await sheetsApi(token, `${sheetId}/values/${encodeURIComponent("'People'!A1:Z1000")}`)).values || [];
  if (!grid.length) return;
  const header = grid[0].map((h) => String(h).trim().toLowerCase());
  const emailCol = header.indexOf("email");
  const consentCol = header.indexOf("consent");
  if (emailCol < 0 || consentCol < 0) return;

  for (let i = 1; i < grid.length; i++) {
    if (String(grid[i][emailCol] || "").trim().toLowerCase() !== email) continue;
    const existing = String(grid[i][consentCol] || "").trim();
    if (existing && !/^media release/i.test(existing)) return;
    const a1 = `'People'!${colLetter(consentCol)}${i + 1}`;
    await sheetsApi(token, `${sheetId}/values/${encodeURIComponent(a1)}?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ values: [[`Media release ${String(row.signed_at).slice(0, 10)}`]] }),
    });
    return;
  }
}

export function colLetter(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

async function note(env, id, message) {
  try { await env.WAIVERS_DB.prepare("UPDATE waivers SET crm_error = ? WHERE id = ?").bind(message, id).run(); }
  catch { /* the console line above is the record of record here */ }
}

// --- Google plumbing -------------------------------------------------------

async function getGoogleAccessToken(env) {
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: "RS256", typ: "JWT" });
  const scope = "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets";
  const claim = enc({ iss: sa.client_email, scope, aud: sa.token_uri, iat: now, exp: now + 3600 });
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${claim}`));
  const jwt = `${head}.${claim}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch(sa.token_uri, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("no access_token: " + JSON.stringify(data));
  return data.access_token;
}

async function driveApi(token, path, init = {}) {
  return await googleJson(token, `https://www.googleapis.com/drive/v3/${path}`, init);
}
async function sheetsApi(token, path, init = {}) {
  return await googleJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${path}`, init);
}
async function googleJson(token, url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${url.split("?")[0]} -> ${res.status} ${await res.text().catch(() => "")}`.slice(0, 400));
  return res.status === 204 ? {} : await res.json();
}

async function driveUpload(token, parentId, filename, bytes) {
  const boundary = "atlbnd" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: filename, parents: [parentId] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Uint8Array([...new TextEncoder().encode(head), ...bytes, ...new TextEncoder().encode(tail)]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error("drive upload " + res.status + " " + await res.text().catch(() => ""));
  return await res.json();
}

function b64url(bytes) {
  let s = ""; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemToDer(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s+/g, "");
  const bin = atob(b64); const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der.buffer;
}
