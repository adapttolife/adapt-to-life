#!/usr/bin/env node
// Put printable QR artwork in the folder ALEC ACTUALLY OPENS (Spec 116).
//
//   node scripts/qr-to-drive.mjs out/shirt --surface="Shirt"
//   node scripts/qr-to-drive.mjs out/newthing --surface="Table tent" --new-surface
//
// Destination: HIS Drive → Work / Adapt To Life / Marketing / QR codes /
// Ready to print / <surface>. The local directory's shape is mirrored, so
// subfolders (e.g. "Black version — code on the fabric") come across as-is.
//
// WHY THIS SCRIPT EXISTS, in one paragraph, because it cost a real failure.
// There are two Google credentials and they are NOT interchangeable. The
// service account (scripts/qr-archive-backup.mjs) reaches only the "Adapt To
// Life" SHARED drive; it owns no storage and can never write to a personal
// Drive. On 2026-08-01 the shirt artwork was pushed with that script and
// therefore landed somewhere Alec does not browse — "clearly I cannot find
// them!". This script authenticates AS HIM with the user-OAuth refresh token,
// which is the only path to his Drive. The shared-drive copy is a backup for
// the day our software breaks. It is not the working folder.
//
// TOKEN: GOOGLE_OAUTH_TOKEN, a path to (or the JSON of) the user-OAuth token
// with client_id / client_secret / refresh_token. Defaults to the Stingel
// lane's ~/.config/agentos/google/google_token.json. No token, no upload — this
// script never falls back to the service account, because a "successful" push
// to the wrong drive is the exact failure it exists to prevent.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

// Pinned by ID, then checked by name. An ID survives a rename; the name check
// catches the case where the ID now points at something else entirely. Both,
// because a backup that silently lands in the wrong folder is the whole bug.
const QR_ROOT_ID = '1K6xH8yjjRDoXbufiQvjJpWs2s9VmGC_5';
const QR_ROOT_NAME = 'QR codes';
const READY = 'Ready to print';
const PRINTED = 'PRINTED — live in the world';

const argv = process.argv.slice(2);
const flag = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.split('=').slice(1).join('=') : d; };
const SRC = argv.find((a) => !a.startsWith('--'));
// One level, name only: a slash or a ".." would be an attempt to aim the upload
// somewhere other than the destination this file exists to pin down.
const SURFACE = flag('surface', '').replace(/[\\/]/g, ' ').trim();
const NEW_SURFACE = argv.includes('--new-surface');

if (!SRC || !fs.existsSync(SRC) || !SURFACE) {
  console.error('usage: qr-to-drive.mjs <local-dir> --surface="Shirt" [--new-surface]');
  console.error('surfaces today: Shirt, Chair sticker, Hand card, Event signage, Popcorn drive');
  process.exit(1);
}

const TOKEN_SRC = process.env.GOOGLE_OAUTH_TOKEN
  || path.join(os.homedir(), '.config/agentos/google/google_token.json');
let TOK;
try {
  TOK = JSON.parse(TOKEN_SRC.trim().startsWith('{') ? TOKEN_SRC : fs.readFileSync(TOKEN_SRC, 'utf8'));
} catch {
  console.error(`no user-OAuth token at ${TOKEN_SRC}`);
  console.error('this script writes to Alec\'s own Drive and there is no other way in.');
  console.error('mint one: python3 ~/.config/agentos/google/stingel-google-auth.py --auth-url');
  process.exit(1);
}

async function accessToken() {
  const r = await fetch(TOK.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: TOK.client_id, client_secret: TOK.client_secret,
      refresh_token: TOK.refresh_token, grant_type: 'refresh_token',
    }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j).slice(0, 300));
  return j.access_token;
}

const T = await accessToken();
const H = { Authorization: `Bearer ${T}` };
const JH = { ...H, 'Content-Type': 'application/json' };
const q = (s) => encodeURIComponent(s);
const api = async (url, init) => (await fetch(`https://www.googleapis.com/drive/v3/${url}`, { headers: H, ...init })).json();
const list = (query, fields = 'files(id,name,mimeType,size)') =>
  api(`files?q=${q(query)}&fields=${fields}&pageSize=200`);

// --- the destination is real and is what we think it is -------------------
const root = await api(`files/${QR_ROOT_ID}?fields=id,name,trashed,capabilities(canAddChildren)`);
if (root.error || root.trashed) {
  console.error(`the pinned QR folder ${QR_ROOT_ID} is gone or unreachable as ${TOK.account || 'this account'}.`);
  console.error(JSON.stringify(root.error || root).slice(0, 300));
  process.exit(1);
}
if (root.name !== QR_ROOT_NAME) {
  console.error(`the pinned folder is now named "${root.name}", not "${QR_ROOT_NAME}".`);
  console.error('someone reorganised. Confirm where artwork belongs before uploading, then update QR_ROOT_ID here.');
  process.exit(1);
}
if (root.capabilities && root.capabilities.canAddChildren === false) {
  console.error(`read-only on "${root.name}" as ${TOK.account}. This credential cannot write there.`);
  process.exit(1);
}

async function child(name, parent) {
  const r = await list(`name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents `
    + `and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  return r.files?.[0]?.id || null;
}
async function mkdir(name, parent) {
  const c = await api('files?fields=id', {
    method: 'POST', headers: JH,
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
  });
  if (!c.id) throw new Error(`could not create "${name}": ` + JSON.stringify(c).slice(0, 300));
  console.log(`  created folder  ${name}`);
  return c.id;
}

const readyId = await child(READY, QR_ROOT_ID);
if (!readyId) { console.error(`no "${READY}" folder under ${QR_ROOT_NAME} — refusing to guess a layout.`); process.exit(1); }

// A surface already in press is FROZEN: copies exist in the world that nobody
// can recall, so replacing its artwork would make the folder lie about what is
// printed. Refuse and say what to do instead.
const printedId = await child(PRINTED, QR_ROOT_ID);
if (printedId && await child(SURFACE, printedId)) {
  console.error(`"${SURFACE}" is already under "${PRINTED}". That artwork is frozen.`);
  console.error('Printed copies cannot be recalled. Change the DESTINATION at /admin/qr instead,');
  console.error('or push this as a NEW surface name if it is genuinely a new print run.');
  process.exit(1);
}

let surfaceId = await child(SURFACE, readyId);
if (!surfaceId) {
  // A typo here silently creates "Shirt " next to "Shirt" — two folders, one of
  // which is the one nobody finds. That is this whole bug, so it takes a flag.
  if (!NEW_SURFACE) {
    const have = await list(`'${readyId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    console.error(`no surface "${SURFACE}" under "${READY}".`);
    console.error(`existing: ${(have.files || []).map((f) => f.name).join(' | ') || '(none)'}`);
    console.error('if that is a typo, fix it. If it is genuinely new, pass --new-surface.');
    process.exit(1);
  }
  surfaceId = await mkdir(SURFACE, readyId);
}

// --- upload, mirroring the local tree -------------------------------------
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.pdf': 'application/pdf' };

async function upload(file, parent) {
  const name = path.basename(file);
  const ex = await list(`name='${name.replace(/'/g, "\\'")}' and '${parent}' in parents and trashed=false`, 'files(id)');
  for (const f of ex.files || []) await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE', headers: H });
  const boundary = 'atlqr' + crypto.randomBytes(8).toString('hex');
  const pre = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
    + `${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\n`
    + `Content-Type: ${MIME[path.extname(name)] || 'application/octet-stream'}\r\n\r\n`);
  const r = await (await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
    method: 'POST', headers: { ...H, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: Buffer.concat([pre, fs.readFileSync(file), Buffer.from(`\r\n--${boundary}--`)]),
  })).json();
  if (!r.id) throw new Error(`upload failed for ${name}: ` + JSON.stringify(r).slice(0, 300));
  return { id: r.id, name, local: file };
}

const sent = [];
async function push(dir, parent, indent = '  ') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.')) continue;
    const local = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const id = (await child(entry.name, parent)) || await mkdir(entry.name, parent);
      await push(local, id, indent + '  ');
    } else {
      sent.push(await upload(local, parent));
      console.log(`${indent}up  ${entry.name}`);
    }
  }
}
await push(SRC, surfaceId);

// --- read it back ---------------------------------------------------------
// Done is verified at the artifact the human touches. An upload that returns an
// id has proved that Google accepted a request, not that the file in the folder
// is the file we built — so fetch each one back and compare bytes.
console.log('\n  verifying by download…');
let bad = 0;
for (const f of sent) {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: H });
  const got = Buffer.from(await r.arrayBuffer());
  const want = fs.readFileSync(f.local);
  if (!got.equals(want)) { bad++; console.error(`  MISMATCH  ${f.name} (${want.length}b local, ${got.length}b in Drive)`); }
}
if (bad) { console.error(`\n  ${bad} file(s) did not come back byte-identical. Do not print from this folder yet.\n`); process.exit(1); }

console.log(`  ${sent.length} file(s) verified byte-identical\n`);
console.log(`  ${READY} / ${SURFACE}`);
console.log(`  https://drive.google.com/drive/folders/${surfaceId}\n`);
