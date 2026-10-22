// Staging is a version of the production Worker and shares the production
// donor database and Worker secrets. These pin the two boundaries that keep a
// staging preview from touching donors or sending mail of its own.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import worker from '../src/staging.js';
import { mailConfigured, sendMail } from '../src/mail-transport.js';

function parseJsonc(text) {
  let out = '';
  let inString = false, inLine = false, inBlock = false, escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], next = text[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === '*' && next === '/') { inBlock = false; i += 1; } continue; }
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '/' && next === '/') { inLine = true; continue; }
    if (c === '/' && next === '*') { inBlock = true; i += 1; continue; }
    if (c === '"') inString = true;
    out += c;
  }
  return JSON.parse(out);
}
const atl = parseJsonc(readFileSync(fileURLToPath(new URL('../wrangler.jsonc', import.meta.url)), 'utf8'));
const staging = atl.env.staging;

// Worker secrets are shared by every version, so staging sees the same mail
// credentials as production. Model that with placeholder values.
const SHARED_SECRETS = {
  GMAIL_CLIENT_ID: 'test-client', GMAIL_CLIENT_SECRET: 'test-secret', GMAIL_REFRESH_TOKEN: 'test-refresh',
  GIVEBUTTER_WEBHOOK_SECRET: 'test-webhook-secret',
};

function recordingDb(calls) {
  const stmt = (sql) => ({
    bind: (...args) => ({
      run: async () => { calls.push(sql); return { meta: { changes: 1 } }; },
      first: async () => { calls.push(sql); return null; },
      all: async () => { calls.push(sql); return { results: [] }; },
    }),
  });
  return { prepare: (sql) => stmt(sql) };
}

test('staging returns 404 for the Givebutter webhook and never touches the donor database', async () => {
  const dbCalls = [];
  const mailCalls = [];
  const env = {
    ...staging.vars, ...SHARED_SECRETS,
    WAIVERS_DB: recordingDb(dbCalls),
    SEND_EMAIL: { send: async (m) => { mailCalls.push(m); return {}; } },
    ASSETS: { fetch: async () => new Response('asset') },
  };
  const body = JSON.stringify({
    event: 'transaction.succeeded',
    data: { id: 'tx-staging-test', status: 'succeeded', transacted_at: '2099-01-01T00:00:00Z', email: 'donor@example.test', amount: 5 },
  });
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  for (const path of ['/api/givebutter-webhook', '/api/givebutter-webhook/']) {
    const response = await worker.fetch(new Request('https://staging.example' + path, {
      method: 'POST', headers: { Signature: SHARED_SECRETS.GIVEBUTTER_WEBHOOK_SECRET, 'Content-Type': 'application/json' }, body,
    }), env, ctx);
    assert.equal(response.status, 404, path);
  }
  await Promise.allSettled(waits);
  assert.deepEqual(dbCalls, []);
  assert.deepEqual(mailCalls, []);
});

test('staging config disables its own mail transport and has no send_email binding', async () => {
  assert.equal(staging.vars.MAIL_TRANSPORT, 'none');
  assert.equal(staging.send_email, undefined);
  assert.equal(atl.vars.MAIL_TRANSPORT, 'gmail', 'production transport is unchanged');
  assert.deepEqual(atl.send_email, [{ name: 'SEND_EMAIL' }], 'production binding is unchanged');
});

test('staging mail with transport none sends nothing, even with shared credentials present', async () => {
  const mailCalls = [];
  const fetchCalls = [];
  const env = { ...staging.vars, ...SHARED_SECRETS };
  if (staging.send_email) env.SEND_EMAIL = { send: async (m) => { mailCalls.push(m); return {}; } };
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => { fetchCalls.push(String(url)); return Response.json({ access_token: 'x', token_type: 'Bearer', id: 'sent' }); };
  try {
    assert.equal(mailConfigured(env), false);
    await assert.rejects(sendMail(env, { from: 'hello@adapttolife.org', to: 'someone@example.test', subject: 's', text: 't' }), /not configured/);
  } finally {
    globalThis.fetch = old;
  }
  assert.deepEqual(fetchCalls, []);
  assert.deepEqual(mailCalls, []);
});

test('staging receipt preview renders from the capturing stub and never reaches a mail provider', async () => {
  const fetchCalls = [];
  const env = {
    ...staging.vars, ...SHARED_SECRETS,
    ASSETS: { fetch: async () => new Response('asset') },
  };
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => { fetchCalls.push(String(url)); return new Response('{}', { status: 503 }); };
  try {
    for (const type of ['apply', 'contact', 'volunteer']) {
      const response = await worker.fetch(new Request('https://staging.example/preview/receipt?type=' + type), env, { waitUntil() {} });
      assert.equal(response.status, 200, type);
      assert.match(await response.text(), /Staging preview of the real send/, type);
    }
  } finally {
    globalThis.fetch = old;
  }
  const mailHosts = fetchCalls.filter((u) => /googleapis\.com|gmail/.test(u));
  assert.deepEqual(mailHosts, []);
});
