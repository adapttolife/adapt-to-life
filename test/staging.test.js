import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { isReviewPath } from '../src/staging.js';

const request = (path, method = 'GET') => new Request('https://staging.example'+path, { method });
const forbiddenAssets = { ASSETS: { fetch() { throw new Error('assets must not be reached'); } } };

test('content staging refuses every write method on every representative route before asset handling', async () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    for (const path of ['/', '/api/apply', '/api/contact', '/api/subscribe', '/api/volunteer', '/api/waiver', '/api/givebutter-webhook', '/api/shop-contact', '/images/logo.svg']) {
      const r = await worker.fetch(request(path, method), forbiddenAssets);
      assert.equal(r.status, 403);
      assert.equal((await r.json()).staging, true);
      assert.match(r.headers.get('Cache-Control'), /no-store/);
    }
  }
});

test('content staging has no admin, report, old design, or operational read surface', async () => {
  for (const path of ['/admin', '/admin/app/index.html', '/r/private', '/lib/private', '/api/waiver/doc', '/api/agent-mail', '/photo-picks', '/hero-1', '/preview/receipt']) {
    const r = await worker.fetch(request(path), forbiddenAssets);
    assert.equal(r.status, 404, path);
  }
});

test('one stable review route points into the actual website rather than an old tour', async () => {
  for (const path of ['/review', '/review.html']) {
    const r = await worker.fetch(request(path), forbiddenAssets);
    assert.equal(r.status, 302);
    assert.equal(r.headers.get('Location'), '/#participation');
  }
});

test('fundraising preview reads only a local, explicitly labelled snapshot', async () => {
  let seen;
  const fixture = { raised: 123, staging: true, snapshot_at: 'test-fixture-not-live' };
  const env = { ASSETS: { async fetch(req) { seen = new URL(req.url); return Response.json(fixture); } } };
  const r = await worker.fetch(request('/api/raised'), env);
  assert.equal(seen.pathname, '/data/staging-raised.json');
  assert.equal(seen.hostname, 'staging.example');
  assert.deepEqual(await r.json(), fixture);
});

test('search exclusions and content security cover responses, not merely HTML meta tags', async () => {
  const r = await worker.fetch(request('/robots.txt'), forbiddenAssets);
  assert.match(await r.text(), /Disallow: \//);
  assert.match(r.headers.get('X-Robots-Tag'), /noindex/);
  const csp = r.headers.get('Content-Security-Policy');
  for (const directive of ["connect-src 'self'", "frame-src 'none'", "form-action 'none'", "frame-ancestors 'none'"]) assert.ok(csp.includes(directive));
});

test('review allowlist covers real pages and excludes scripts or account areas outside public assets', () => {
  for (const p of ['/', '/about.html', '/volunteer/grant-writer', '/css/site.css', '/images/hero/panels/example.webp', '/build.txt']) assert.equal(isReviewPath(p), true, p);
  for (const p of ['/admin/app/assets/index.js', '/app', '/data/private.json', '/src/index.js', '/README.md']) assert.equal(isReviewPath(p), false, p);
});
