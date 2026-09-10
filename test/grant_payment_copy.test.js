import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES } from '../data/volunteer-roles.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const core = ['index','about','adaptive-sports-near-me','apply','contact','donate','hustle-and-heart','karen','promise','roadmap','send-6','popcorn','subscribe','tim','volunteer','sponsorship','waiver'];
const pages = [...core.map(p => `public/${p}.html`), ...ROLES.map(r => `public/volunteer/${r.slug}.html`)];

for (const slug of ['promise','hustle-and-heart','about','apply']) {
  test(`${slug} explains both payment methods`, () => {
    const html = read(`public/${slug}.html`);
    assert.match(html, /direct (?:payment|payments)|paid directly/);
    assert.match(html, /reimbursement/);
    assert.match(html, /approved/);
  });
}

test('all current public pages avoid the superseded vendor-only promises', () => {
  assert.equal(pages.length, 43);
  for (const p of pages) {
    const text = read(p).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
    for (const obsolete of [
      'Approved grants. Direct payments.',
      'Approved grants go straight to the provider.',
      'Approved athlete grants are paid directly',
      'We pay the vendor or program directly for approved athlete grants.',
      'Approved grants are paid straight to the vendor',
      'you never handle the money',
      'we do not reimburse gear already purchased',
      'How every dollar works',
    ]) assert.ok(!text.toLowerCase().includes(obsolete.toLowerCase()), `${p}: ${obsolete}`);
  }
});

test('past-expense application guidance allows review but never guarantees reimbursement', () => {
  const html = read('public/apply.html');
  assert.ok(html.includes('Can I apply for an expense I have already paid?'));
  assert.ok(html.includes('Past expenses may be considered case by case'));
  assert.ok(html.includes('does not guarantee reimbursement'));
  assert.ok(html.includes('Estimated cost or amount already paid (optional)'));
  assert.ok(html.includes('id="cost" name="cost" type="text"'));
});

test('internal guidance supports both methods without claiming new controls are already operational', () => {
  const rubric = read('docs/grant-review-rubric.md');
  assert.match(rubric, /Direct payment/);
  assert.match(rubric, /Reimbursement for approved expenses/);
  assert.match(rubric, /Proposed approval and recordkeeping controls/);
  assert.match(rubric, /not public copy or evidence that every control below is already implemented/);
  assert.ok(!rubric.includes('We do not send money to the athlete'));
  assert.ok(!rubric.includes('Gear bought before applying (we pay the vendor directly'));
  assert.ok(!read('README.md').includes('direct-to-vendor payment policy'));
  assert.ok(!read('public/js/campaigns.js').includes('Every dollar of it goes to'));
});
