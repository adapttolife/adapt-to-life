import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import application from '../src/index.js';
import staging from '../src/staging.js';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));

test('staging shares production service bindings and has no scheduled handler or cron', () => {
  const preview = config.env.staging;
  for (const key of ['d1_databases', 'send_email', 'ratelimits']) {
    assert.deepEqual(preview[key], config[key], key);
  }
  for (const [key, value] of Object.entries(config.vars)) {
    if (key !== 'ENV_NAME') assert.equal(preview.vars[key], value, key);
  }
  assert.deepEqual(preview.triggers.crons, []);
  assert.ok(config.triggers.crons.length > 0);
  assert.deepEqual(Object.keys(staging), ['fetch']);
});

test('staging delegates writes, backend routes and HTML without modifying controls or widgets', async t => {
  const original = application.fetch;
  t.after(() => { application.fetch = original; });
  const body = '<form><input><button>Submit</button></form><givebutter-giving-form></givebutter-giving-form><iframe></iframe><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script><a href="https://example.com">External</a>';
  const env = { STAGING: '1', INTAKE: {} };
  const ctx = { waitUntil() {} };
  for (const [method, path] of [['GET', '/contact'], ['POST', '/api/contact'], ['POST', '/api/waiver'], ['GET', '/api/raised'], ['GET', '/admin/api/codes']]) {
    const request = new Request(`https://staging.example${path}`, { method });
    let called = false;
    application.fetch = async (received, bindings, context) => {
      assert.equal(received, request);
      assert.equal(bindings, env);
      assert.equal(context, ctx);
      called = true;
      return new Response(body, { status: 201, headers: { 'Content-Type': 'text/html' } });
    };
    const response = await staging.fetch(request, env, ctx);
    assert.equal(called, true);
    assert.equal(response.status, 201);
    assert.equal(await response.text(), body);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Content-Security-Policy'), null);
  }
});

test('real application routes remain available with normal validation and authentication', async () => {
  const env = { STAGING: '1', REPORT_LINK_BASE: 'https://reports.amelioration.is' };
  const contact = await staging.fetch(new Request('https://staging.example/api/contact'), env, {});
  assert.equal(contact.status, 405); // Normal application method validation, not staging's blanket 403/404.
  const admin = await staging.fetch(new Request('https://staging.example/admin/app'), env, {});
  assert.equal(admin.status, 403); // Authentication is still required.
  const report = await staging.fetch(new Request('https://staging.example/r/example'), env, {});
  assert.equal(report.status, 302);
  assert.equal(report.headers.get('Location'), 'https://reports.amelioration.is/r/example');
});
