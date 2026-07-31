#!/usr/bin/env node
// Push the QR artwork archive into the ATL Shared Drive (Spec 116).
//
//   op run -- node scripts/qr-archive-to-drive.mjs public/qr/archive-2026-07-31
//
// Needs GOOGLE_SA_JSON (the same service account the waiver archive uses) as
// either a path or the JSON itself.
//
// Destination: "Adapt To Life" shared drive → Marketing → QR codes. It is
// spelled out here rather than passed on the command line so that re-running
// this refreshes the folder Alec actually looks in, instead of quietly
// creating a second copy somewhere else — a backup nobody can find is not a
// backup. Same-named files are replaced, not duplicated.
//
// Note the folder is "Marketing", not "ATL Marketing": inside a drive already
// called Adapt To Life the prefix stutters, and the sibling folder is "Design".

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DRIVE_ID = '0AIG-pWrds0g7Uk9PVA';       // shared drive "Adapt To Life"
const TRAIL = ['Marketing', 'QR codes'];

const SRC = process.argv[2];
if (!SRC || !fs.existsSync(SRC)) {
  console.error('usage: qr-archive-to-drive.mjs <archive-dir>');
  console.error('build one first: node scripts/make-qr-archive.mjs');
  process.exit(1);
}

const raw = process.env.GOOGLE_SA_JSON || '';
const SA = JSON.parse(raw.trim().startsWith('{') ? raw : fs.readFileSync(raw, 'utf8'));

const b64u = (b) => Buffer.from(b).toString('base64url');
async function token() {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({
    iss: SA.client_email, scope: 'https://www.googleapis.com/auth/drive',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const sig = crypto.createSign('RSA-SHA256').update(`${head}.${claim}`).sign(SA.private_key);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${b64u(sig)}` }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error('auth failed: ' + JSON.stringify(j).slice(0, 300));
  return j.access_token;
}

const T = await token();
const H = { Authorization: `Bearer ${T}` };
const JH = { ...H, 'Content-Type': 'application/json' };
const q = (s) => encodeURIComponent(s);
const listUrl = (query, fields) =>
  `https://www.googleapis.com/drive/v3/files?q=${q(query)}&supportsAllDrives=true`
  + `&includeItemsFromAllDrives=true&corpora=drive&driveId=${DRIVE_ID}&fields=${fields}&pageSize=200`;

async function folder(name, parent) {
  const r = await (await fetch(listUrl(
    `name='${name}' and '${parent}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    'files(id)'), { headers: H })).json();
  if (r.files?.length) return r.files[0].id;
  const c = await (await fetch('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id', {
    method: 'POST', headers: JH,
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
  })).json();
  if (!c.id) throw new Error(`could not create "${name}": ` + JSON.stringify(c).slice(0, 300));
  console.log(`  created folder ${name}`);
  return c.id;
}

const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.pdf': 'application/pdf' };

async function upload(file, parent) {
  const name = path.basename(file);
  const ex = await (await fetch(listUrl(`name='${name}' and '${parent}' in parents and trashed=false`, 'files(id)'), { headers: H })).json();
  for (const f of ex.files || []) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?supportsAllDrives=true`, { method: 'DELETE', headers: H });
  }
  const boundary = 'atlqr' + crypto.randomBytes(8).toString('hex');
  const pre = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`
    + `${JSON.stringify({ name, parents: [parent] })}\r\n--${boundary}\r\n`
    + `Content-Type: ${MIME[path.extname(name)] || 'application/octet-stream'}\r\n\r\n`);
  const r = await (await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id', {
    method: 'POST', headers: { ...H, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: Buffer.concat([pre, fs.readFileSync(file), Buffer.from(`\r\n--${boundary}--`)]),
  })).json();
  if (!r.id) throw new Error(`upload failed for ${name}: ` + JSON.stringify(r).slice(0, 300));
}

let parent = DRIVE_ID;
for (const name of TRAIL) parent = await folder(name, parent);

const files = fs.readdirSync(SRC).filter((f) => !f.startsWith('.'));
for (const f of files) await upload(path.join(SRC, f), parent);

console.log(`\n  ${files.length} files → ${TRAIL.join(' / ')}`);
console.log(`  https://drive.google.com/drive/folders/${parent}\n`);
