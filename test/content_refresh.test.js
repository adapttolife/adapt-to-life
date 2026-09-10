import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES, SHARED } from '../data/volunteer-roles.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const core = ['index', 'about', 'adaptive-sports-near-me', 'apply', 'contact', 'donate', 'hustle-and-heart', 'karen', 'promise', 'roadmap', 'sponsorship', 'subscribe', 'tim', 'volunteer', 'send-6', 'popcorn'];
const pages = [...core.map(p => `public/${p}.html`), ...ROLES.map(r => `public/volunteer/${r.slug}.html`)];

test('every reviewed page uses current shared navigation and the funding order', () => {
  assert.equal(pages.length, 42);
  for (const file of pages) {
    const html = read(file);
    assert.ok(!/equipment, travel,? and training|equipment, travel, training/i.test(html), file);
    assert.ok(!html.includes('A free national directory of adaptive programs, opening soon'), file);
    assert.ok(html.includes('>Photo and media release</a>'), file);
    assert.ok(html.includes('>How Giving Works<'), file);
    assert.ok(html.includes('>Apply for support<'), file);
  }
});

test('homepage tells participation story without the two-program comparison panel', () => {
  const html = read('public/index.html');
  assert.ok(html.includes('id="participation"'));
  assert.ok(html.includes('More people playing. More often.'));
  assert.ok(!html.includes('class="fronts'));
  assert.ok(!html.includes('Two of them today'));
});

test('fund categories follow equipment, training, travel without unsupported price ranges', () => {
  const html = read('public/hustle-and-heart.html');
  const positions = ['Equipment', 'Training', 'Travel'].map(x => html.indexOf(`>${x}</h3>`));
  assert.ok(positions.every(x => x >= 0));
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
  assert.ok(!html.includes('$200&ndash;$8,000'));
});

test('campaign owns its target, and popcorn links instead of duplicating a budget', () => {
  const campaign = read('public/send-6.html');
  assert.ok(campaign.includes('fundraising target, not a fixed price'));
  assert.ok(!/about \$(450|500|2,300)/.test(campaign));
  const popcorn = read('public/popcorn.html');
  assert.ok(popcorn.includes('href="/send-6">Send 6 to the US Open Spring 2027</a>'));
  assert.ok(!popcorn.includes('class="s6-cost-n"'));
  assert.ok(!popcorn.includes('roughly five hundred'));
  assert.ok(popcorn.includes('50% of popcorn sales'));
});

test('volunteer interest is not automatic placement and the shared mission sentence is correct', () => {
  assert.ok(SHARED.apply.includes('does not confirm a placement'));
  assert.ok(SHARED.apply.includes('screening or credentials'));
  assert.ok(!SHARED.about.includes('keep athletes on the sidelines'));
  assert.ok(!SHARED.apply.includes('No interview'));
});

test('the removed staging banner cannot return through injected chrome', () => {
  const worker = read('src/staging.js');
  assert.ok(!worker.includes('staging-notice'));
  assert.ok(!worker.includes('CONTENT STAGING'));
  assert.ok(!worker.includes('padding-bottom:76px'));
  assert.ok(worker.includes('stopImmediatePropagation'));
  assert.ok(worker.includes("new URL(a.getAttribute('href'),location.href).origin!==location.origin"));
});

test('share checks fetch the declared image URL rather than hiding a wrong host', () => {
  const checker = read('scripts/check-site.mjs');
  assert.ok(checker.includes('const r = await get(src);'));
  assert.ok(!checker.includes('get(`${BASE}${asset}?cb='));
  const worker = read('src/staging.js');
  assert.ok(worker.includes('meta[property="og:image"]'));
  assert.ok(worker.includes('meta[name="twitter:image"]'));
  assert.ok(worker.includes('target.host = url.host'));
});
