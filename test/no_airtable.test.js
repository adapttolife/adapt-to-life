// Airtable was the prototype. Everything that lived there was test data, and on
// 2026-07-30 the line was cut: both public forms write to ClickUp, and the
// waiver + agent-mail mirrors are gone (their records are D1/R2/Drive and D1).
//
// This is the rung that keeps it cut. A mirror is the kind of thing that gets
// re-added one call site at a time, each one reasonable on its own, until there
// are two records again and neither is trusted. If a future change needs
// Airtable back, that is a decision — and deleting this test is how you make it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sourceFiles(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []
  );
}

// Deliberately about calls and configuration, not the word: the comments in
// receipts.js explaining why the receipt email lives in the Worker rather than in
// an Airtable automation are the history, and history should survive the cut.
test("no Worker source calls the Airtable API or reads an Airtable variable", () => {
  const offenders = sourceFiles(join(root, "src")).filter((f) => {
    const src = readFileSync(f, "utf8");
    return /api\.airtable\.com/.test(src) || /\bAIRTABLE_[A-Z_]+/.test(src);
  });
  assert.deepEqual(offenders, [], "Airtable is retired — these files still call it");
});

test("no Worker config carries Airtable variables", () => {
  const configs = readdirSync(root).filter((f) => /^wrangler.*\.jsonc$/.test(f));
  assert.ok(configs.length >= 3, "expected the site, reports and agent-mail configs");
  for (const c of configs) {
    assert.doesNotMatch(readFileSync(join(root, c), "utf8"), /AIRTABLE/, `${c} still carries Airtable config`);
  }
});
