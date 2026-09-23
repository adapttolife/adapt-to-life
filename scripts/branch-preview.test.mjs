import assert from 'node:assert/strict';
import test from 'node:test';
import { previewAlias } from './branch-preview.mjs';

test('simple branches keep their expected stable URLs', () => {
  assert.equal(previewAlias('staging'), 'staging');
  assert.equal(previewAlias('main'), 'main');
});

test('branch aliases are valid DNS labels, bounded and deterministic', () => {
  for (const branch of ['feature/new-page', '123', 'UPPERCASE', '日本語', 'fix/' + 'x'.repeat(100), 'trailing-']) {
    const alias = previewAlias(branch);
    assert.match(alias, /^[a-z][a-z0-9-]*[a-z0-9]$/);
    assert.ok(`${alias}-adapt-to-life`.length <= 63);
    assert.equal(previewAlias(branch), alias);
  }
});

test('normalization does not merge common distinct branch names', () => {
  const branches = ['feature/a', 'feature-a', 'feature_a', 'Feature/a', 'fix/' + 'x'.repeat(100), 'fix/' + 'x'.repeat(99) + 'y'];
  assert.equal(new Set(branches.map(previewAlias)).size, branches.length);
});

test('missing branch information fails instead of overwriting another alias', () => {
  assert.throws(() => previewAlias(''));
  assert.throws(() => previewAlias('HEAD'));
});
