// Google service-account auth for the Worker — one minter, any scope.
//
// This started life inside waiver.js, minting a Drive token so signed releases
// could be filed to the Shared Drive. The shop contact form needs the SAME
// service account against the Sheets API instead, and the wrong fix would have
// been a second near-identical copy of the JWT dance with one string changed.
// So the scope is a parameter and this is the only place a Google credential is
// turned into a bearer token.
//
// The credential is env.GOOGLE_SA_JSON (a Worker secret). Two things about it
// are worth knowing before you wire anything new to it:
//
//   1. A service account owns no Drive storage. It can create files inside a
//      SHARED drive, and it can edit any file explicitly shared with it, but a
//      native create in someone's My Drive returns a misleading 403.
//   2. The Adapt To Life CRM sheet lives in Alec's PERSONAL Drive, so the
//      service account reaches it only because that one file is shared with it
//      as an editor. Shared-drive membership buys nothing there. If a CRM write
//      starts returning 403/404, check the file's sharing before anything else.

const TOKEN_TTL = 3600;

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export async function getGoogleAccessToken(env, scope = DRIVE_SCOPE) {
  if (!env.GOOGLE_SA_JSON) throw new Error("GOOGLE_SA_JSON not configured");
  const sa = JSON.parse(env.GOOGLE_SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ alg: "RS256", typ: "JWT" });
  const claim = enc({
    iss: sa.client_email,
    scope,
    aud: sa.token_uri,
    iat: now,
    exp: now + TOKEN_TTL,
  });
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${head}.${claim}`)
  );
  const jwt = `${head}.${claim}.${b64url(new Uint8Array(sig))}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("no access_token: " + JSON.stringify(data));
  return data.access_token;
}

function b64url(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der.buffer;
}
