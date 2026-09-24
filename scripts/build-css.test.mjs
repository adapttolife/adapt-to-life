import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stripCss } from './build-css.mjs';

test('CSS CLI actually generates every stylesheet on the current platform', () => {
  const output = execFileSync(process.execPath, [fileURLToPath(new URL('./build-css.mjs', import.meta.url))], {
    encoding: 'utf8',
  });
  assert.match(output, /TOTAL/); // A silently skipped entrypoint must fail even with stale files present.
  const source = new URL('../src/css/', import.meta.url);
  const built = new URL('../public/css/', import.meta.url);
  for (const name of readdirSync(source).filter(name => name.endsWith('.css'))) {
    const css = readFileSync(new URL(name, built), 'utf8');
    assert.ok(css.trim().length > 0, `${name} must not be empty`);
    assert.equal(css, stripCss(readFileSync(new URL(name, source), 'utf8')), `${name} must be current`);
  }
});
