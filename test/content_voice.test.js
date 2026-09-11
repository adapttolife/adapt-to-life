import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES } from '../data/volunteer-roles.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('giving retains concrete program costs and an unambiguous safety standard', () => {
  const html = read('public/promise.html');
  for (const text of ['Safety is not overhead.', 'Insurance for a clinic.', 'SafeSport certification.',
    'Coach training and background checks.', 'These are program costs, not optional extras.',
    "If a program can't meet the safety standards its athletes need, it isn't a program we fund.",
    'A coach at practice.', 'A mechanic fixing a chair.', 'the tank of gas a coach already paid for']) {
    assert.ok(html.includes(text), text);
  }
});

test('the giving and story pages explain the approach rather than application contingencies', () => {
  for (const p of ['promise', 'about', 'index', 'hustle-and-heart', 'roadmap', 'send-6']) {
    const html = read(`public/${p}.html`);
    for (const obsolete of ['not a promise to fund every request', 'does not guarantee funding',
      'Campaign progress is not a promise of an individual award', 'appropriate participant safeguards']) {
      assert.ok(!html.includes(obsolete), `${p}: ${obsolete}`);
    }
  }
  const about = read('public/about.html');
  assert.ok(about.includes('href="/promise"'));
  assert.ok(about.includes('There are people doing good work in adaptive sports all over the country.'));
  assert.ok(about.includes('What we build next should come from what the community needs.'));
  assert.ok(!about.includes('reimbursement'), 'About links to methods instead of repeating them');
});

test('all volunteer pages keep the invitation and necessary safeguards together', () => {
  assert.equal(ROLES.length, 26);
  for (const role of ROLES) {
    const html = read(`public/volunteer/${role.slug}.html`);
    assert.ok(html.includes('screening or credentials before you begin.'), role.slug);
    assert.ok(html.includes('Unpaid volunteer role'), role.slug);
    assert.ok(!html.includes('does not confirm a placement'), role.slug);
    assert.ok(!html.includes('published grant rubric'), role.slug);
  }
});

test('humaner copy does not erase tax, application or professional-role information', () => {
  assert.ok(read('public/sponsorship.html').includes('check with your tax advisor on the deductible portion'));
  assert.ok(read('public/donate.html').includes('tax-deductible to the extent allowed by law'));
  assert.ok(read('public/apply.html').includes('Applying does not guarantee an award.'));
  assert.ok(read('public/apply.html').includes('no bearing on your application'));
  assert.ok(read('public/volunteer/nonprofit-attorney.html').includes('appropriately licensed counsel'));
});
