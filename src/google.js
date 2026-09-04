// Google plumbing, shared by everything in this Worker that touches Drive or
// Sheets. ONE service account, one token mint, one error shape.
//
// The identity is the `GOOGLE_SA_JSON` service account. It is a member of the
// "Adapt To Life" Shared Drive, and it must be granted Editor on any file that
// lives outside that drive — a 403 here means "not shared with the service
// account", never a bad token and never a missing scope.

let cachedToken = null;   // { token, expiresAt } — per isolate, not per request

export async function googleToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) return cachedToken.token;

  const sa = JSON.parse(env.GOOGLE_SA_JSON);
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
  if (!data.access_token) throw new Error("google token mint failed: " + JSON.stringify(data).slice(0, 200));
  cachedToken = { token: data.access_token, expiresAt: now + (data.expires_in || 3600) };
  return cachedToken.token;
}

export async function driveApi(token, path, init = {}) {
  return await googleJson(token, `https://www.googleapis.com/drive/v3/${path}`, init);
}

export async function sheetsApi(token, path, init = {}) {
  return await googleJson(token, `https://sheets.googleapis.com/v4/spreadsheets/${path}`, init);
}

async function googleJson(token, url, init) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const hint = res.status === 403 ? " — is the file shared with the service account as an Editor?" : "";
    throw new Error(`${init.method || "GET"} ${url.split("?")[0]} -> ${res.status}${hint} ${body}`.slice(0, 400));
  }
  return res.status === 204 ? {} : await res.json();
}

// Resolve a folder by NAME inside a Shared Drive, creating it if absent, so no
// human has to paste a folder id into config for every new pile of files.
export async function ensureFolder(token, driveId, name) {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and '${driveId}' in parents and trashed = false`;
  const found = await driveApi(token, `files?q=${encodeURIComponent(q)}&corpora=drive&driveId=${driveId}&includeItemsFromAllDrives=true&supportsAllDrives=true&fields=files(id)`);
  if (found.files && found.files.length) return found.files[0].id;
  const made = await driveApi(token, "files?supportsAllDrives=true&fields=id", {
    method: "POST",
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [driveId] }),
  });
  return made.id;
}

export async function driveUpload(token, parentId, filename, bytes, contentType = "application/pdf") {
  const boundary = "atlbnd" + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: filename, parents: [parentId] });
  const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--`;
  const body = new Uint8Array([...new TextEncoder().encode(head), ...bytes, ...new TextEncoder().encode(tail)]);
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` }, body,
  });
  if (!res.ok) throw new Error("drive upload " + res.status + " " + await res.text().catch(() => ""));
  return await res.json();
}

// Move a Drive file into a folder and rename it. A file on a Shared Drive has
// exactly ONE parent, so the move has to name the parent it is leaving — read
// it rather than assuming, or a file someone already tidied by hand throws.
export async function driveFileInto(token, fileId, folderId, name) {
  const current = await driveApi(token, `files/${fileId}?supportsAllDrives=true&fields=id,parents,name,webViewLink`);
  const leaving = (current.parents || []).filter((p) => p !== folderId);
  const move = leaving.length ? `&addParents=${folderId}&removeParents=${leaving.join(",")}` : "";
  const file = await driveApi(token, `files/${fileId}?supportsAllDrives=true&fields=id,webViewLink${move}`, {
    method: "PATCH", body: JSON.stringify({ name }),
  });
  return { id: fileId, webViewLink: file.webViewLink || current.webViewLink };
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
