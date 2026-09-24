import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/staging.js';

const request = (path, method = 'GET') => new Request('https://staging.example'+path, { method });
const html = '<form action="/api/contact"><input name="email"><button>Submit</button></form><givebutter-giving-form></givebutter-giving-form><iframe src="https://example.com"></iframe><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script><a href="https://example.com">Link</a>';
const env = { STAGING: '1', ASSETS: { fetch: async () => new Response(html, { headers: { 'Content-Type': 'text/html' } }) } };

test('staging serves forms, widgets, scripts and outbound links unchanged', async () => {
  for (const path of ['/contact', '/donate', '/waiver', '/adapt-body-shop', '/review', '/photo-picks']) {
    const response = await worker.fetch(request(path), env, {});
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get('Content-Security-Policy'), null);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.match(response.headers.get('X-Robots-Tag'), /noindex/);
  }
});

test('staging backend routes use normal method validation rather than a blanket denial', async () => {
  for (const path of ['/api/contact', '/api/apply', '/api/volunteer', '/api/subscribe', '/api/waiver']) {
    const response = await worker.fetch(request(path), env, {});
    assert.equal(response.status, 405, path);
  }
});

test('staging serves build metadata and arbitrary new public assets', async () => {
  const data = { commit: 'test-commit' };
  let seen;
  const assets = { ...env, ASSETS: { fetch: async req => { seen = new URL(req.url).pathname; return Response.json(data); } } };
  for (const path of ['/build.json', '/new-public-page', '/css/site.css']) {
    const response = await worker.fetch(request(path), assets, {});
    assert.equal(seen, path);
    assert.deepEqual(await response.json(), data);
  }
});

test('staging excludes indexing and exports no scheduled or email handler', async () => {
  const response = await worker.fetch(request('/robots.txt'), env, {});
  assert.match(await response.text(), /Disallow: \//);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(Object.keys(worker), ['fetch']);
});
