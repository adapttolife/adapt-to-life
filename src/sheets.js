// Appending a row to a Google Sheet, once, for everything in this Worker.
//
// The rule this file exists to hold (it is the house rule for the CRM, written
// down in skills/relationship-machine): **automation proposes, a person
// curates.** Machines append to their OWN intake tab. The curated People tab is
// a human's; a machine may only stamp the narrow columns it owns, and only when
// the human has not written something else there.
//
// Adding a new form to the CRM should be: define headers, define a row, add a
// line to BOOKS. It should never be another copy of "mint a token, find the
// tab, escape the formulas".

import { sheetsApi } from "./google.js";

// Every spreadsheet this Worker may write to, by name. A book that is not here
// is not writable — which is the point. Ids are not secrets; access is granted
// per-file to the service account, and that grant is the real control.
export const BOOKS = {
  // "Adapt To Life CRM" — My Drive > Work > Adapt To Life > CRM. NOT in the
  // Shared Drive, so it carries an explicit Editor grant to the service account.
  atlCrm: "1ahXuu11mV3bJVtyqXrhVz4lFCSSWpl7jX52SqlcJFLE",
};

export function bookId(env, name) {
  return (env.SHEET_BOOKS && JSON.parse(env.SHEET_BOOKS)[name]) || BOOKS[name];
}

// Create the tab and its header row on first use, so a new intake needs no
// manual setup in the spreadsheet. Returns nothing; throws if the book is not
// reachable, which is the whole-run condition worth failing on.
export async function ensureTab(token, sheetId, tab, headers) {
  const meta = await sheetsApi(token, `${sheetId}?fields=sheets(properties(sheetId,title))`);
  if ((meta.sheets || []).some((s) => s.properties.title === tab)) return;
  const created = await sheetsApi(token, `${sheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: tab, gridProperties: { rowCount: 1000, columnCount: headers.length, frozenRowCount: 1 } } } }] }),
  });
  const newId = created.replies[0].addSheet.properties.sheetId;
  await sheetsApi(token, `${sheetId}/values/${range(tab, "A1")}?valueInputOption=RAW`, {
    method: "PUT", body: JSON.stringify({ values: [headers] }),
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

export async function appendRow(token, sheetId, tab, row) {
  await sheetsApi(token, `${sheetId}/values/${range(tab, "A1")}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
    method: "POST", body: JSON.stringify({ values: [row] }),
  });
}

export async function readGrid(token, sheetId, tab, a1 = "A1:Z1000") {
  return (await sheetsApi(token, `${sheetId}/values/${range(tab, a1)}`)).values || [];
}

// Stamp ONE cell on a human-curated tab, matched by a key column, and only when
// the target cell is empty or already carries this job's own prefix. A human's
// note in that cell is theirs; silently overwriting it is how an automation
// loses the right to touch a sheet at all.
export async function stampByKey(token, sheetId, tab, { keyHeader, keyValue, stampHeader, value, ownPrefix }) {
  const key = String(keyValue || "").trim().toLowerCase();
  if (!key) return false;
  const grid = await readGrid(token, sheetId, tab);
  if (!grid.length) return false;
  const header = grid[0].map((h) => String(h).trim().toLowerCase());
  const keyCol = header.indexOf(keyHeader.toLowerCase());
  const stampCol = header.indexOf(stampHeader.toLowerCase());
  if (keyCol < 0 || stampCol < 0) return false;

  for (let i = 1; i < grid.length; i++) {
    if (String(grid[i][keyCol] || "").trim().toLowerCase() !== key) continue;
    const existing = String(grid[i][stampCol] || "").trim();
    if (existing && !existing.toLowerCase().startsWith(ownPrefix.toLowerCase())) return false;
    await sheetsApi(token, `${sheetId}/values/${range(tab, `${colLetter(stampCol)}${i + 1}`)}?valueInputOption=RAW`, {
      method: "PUT", body: JSON.stringify({ values: [[value]] }),
    });
    return true;
  }
  return false;
}

// Rows are appended as USER_ENTERED so link columns can be real hyperlinks.
// That makes every other cell a formula someone could have typed into a public
// form: a "name" of =IMPORTXML(...) would run inside the CRM on arrival. A
// leading ' tells Sheets "this is text" and is not shown in the cell.
export function text(v) {
  const s = String(v == null ? "" : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

export function hyperlink(url, label) {
  return url ? `=HYPERLINK("${String(url).replace(/"/g, "")}","${label}")` : "";
}

export function colLetter(i) {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function range(tab, a1) {
  return encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${a1}`);
}
