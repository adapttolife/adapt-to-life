import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { isReviewPath } from '../src/staging.js';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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
  for (const path of ['/admin', '/admin/app/index.html', '/r/private', '/lib/private', '/api/waiver/private-id', '/api/agent-mail', '/photo-picks', '/hero-1', '/preview/receipt']) {
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

test('fundraising and unsigned release previews read only local, explicitly labelled snapshots', async () => {
  for (const [path, file] of [['/api/raised', '/data/staging-raised.json'], ['/api/waiver/doc', '/data/staging-waiver.json']]) {
  let seen;
  const fixture = { raised: 123, staging: true, snapshot_at: 'test-fixture-not-live' };
  const env = { ASSETS: { async fetch(req) { seen = new URL(req.url); return Response.json(fixture); } } };
  const r = await worker.fetch(request(path), env);
  assert.equal(seen.pathname, file);
  assert.equal(seen.hostname, 'staging.example');
  assert.deepEqual(await r.json(), fixture);
  }
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

// A page can exist in public/ and still 404 here with "Not available in content
// staging", because PAGES is an allowlist on purpose. That is the gate working,
// but it means every new page needs a row, and the first athlete profile
// (2026-09-19) was built, deployed to staging and 404'd for exactly that
// reason. This walks the real directory so the omission fails in `npm test`
// rather than at the review URL. The exclusions are the pages the router above
// deliberately hides from staging (tours, pickers, hero candidates).
test('every public page is either on the review allowlist or deliberately hidden from staging', () => {
  const dir = fileURLToPath(new URL('../public/', import.meta.url));
  const HIDDEN = new Set(['review', 'photo-picks', 'hero-review']);
  const missing = readdirSync(dir)
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace(/\.html$/, ''))
    .filter((p) => !HIDDEN.has(p) && !p.startsWith('hero-'))
    .filter((p) => !isReviewPath(p === 'index' ? '/' : '/' + p));
  assert.deepEqual(missing, [], 'pages in public/ with no review allowlist row: ' + missing.join(', '));
});
