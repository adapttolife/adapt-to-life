import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import application from '../src/index.js';
import staging from '../src/staging.js';

const config = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));

test('staging uses its ASNM staging binding, supports passwordless admin mail, and has no cron', () => {
  const preview = config.env.staging;
  assert.deepEqual(preview.ratelimits, config.ratelimits);
  assert.equal(preview.d1_databases.at(-1).database_name, 'asnm-db-staging');
  assert.deepEqual(preview.send_email, [{ name: 'SEND_EMAIL' }]);
  assert.equal(preview.vars.MAIL_TRANSPORT, 'gmail');
  for (const [key, value] of Object.entries(config.vars)) {
    if (key !== 'ENV_NAME' && key !== 'MAIL_TRANSPORT') assert.equal(preview.vars[key], value, key);
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
  for (const [method, path] of [['GET', '/contact'], ['POST', '/api/contact'], ['GET', '/api/waiver/doc'], ['GET', '/api/raised'], ['GET', '/admin/api/codes']]) {
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
  const env = { STAGING: '1', REPORT_LINK_BASE: 'https://reports.amelioration.is', ASSETS: { fetch: async () => new Response('admin') } };
  const contact = await staging.fetch(new Request('https://staging.example/api/contact'), env, {});
  assert.equal(contact.status, 405); // Normal application method validation, not staging's blanket 403/404.
  const admin = await staging.fetch(new Request('https://staging.example/admin/app'), env, {});
  assert.equal(admin.status, 200); // The passwordless login page is available on staging.
  const report = await staging.fetch(new Request('https://staging.example/r/example'), env, {});
  assert.equal(report.status, 302);
  assert.equal(report.headers.get('Location'), 'https://reports.amelioration.is/r/example');
});
