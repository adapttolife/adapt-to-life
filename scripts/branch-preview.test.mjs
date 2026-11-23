import assert from "node:assert/strict";
import test from "node:test";
import {
  STAGING_URL,
  STAGING_WORKER,
  assertSeparateStagingWorker,
  readWranglerConfig,
  wranglerArgs,
} from "./branch-preview.mjs";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("env.staging names its own Worker, never the production one", () => {
  const config = readWranglerConfig();
  assert.ok(config.env.staging.name, "env.staging needs a name");
  assert.notEqual(
    config.env.staging.name,
    config.name,
    "env.staging must not share the production Worker name (2026-11-23 incident)",
  );
  assert.equal(config.env.staging.name, STAGING_WORKER);
  assert.equal(assertSeparateStagingWorker(config), STAGING_WORKER);
});

test("the guard refuses a staging name that matches production or is missing", () => {
  assert.throws(() =>
    assertSeparateStagingWorker({ name: "adapt-to-life", env: { staging: { name: "adapt-to-life" } } }),
  );
  assert.throws(() => assertSeparateStagingWorker({ name: "adapt-to-life", env: { staging: {} } }));
  assert.throws(() => assertSeparateStagingWorker({ name: "adapt-to-life" }));
});

test("staging has no routes or custom domains, so no production domain", () => {
  const config = readWranglerConfig();
  assert.deepEqual(config.env.staging.routes, []);
  assert.equal(config.env.staging.workers_dev, true);
  assert.equal(STAGING_URL, "https://adapt-to-life-staging.adapt-to-life.workers.dev");
});

test("only staging deploys; every other branch builds and tests without uploading", () => {
  assert.deepEqual(wranglerArgs("staging", { deploy: true }), ["deploy", "--env", "staging"]);
  assert.equal(wranglerArgs("staging").at(-1), "--dry-run");
  assert.equal(wranglerArgs("staging", { deploy: true, dryRun: true }).at(-1), "--dry-run");
  for (const branch of ["picklr-mount-prospect-logo", "feature/x", "review", "main"])
    assert.equal(wranglerArgs(branch, { deploy: true }).at(-1), "--dry-run", branch);
  for (const args of [wranglerArgs("staging", { deploy: true }), wranglerArgs("main")]) {
    assert.ok(!args.includes("versions"), "no versions upload onto any Worker");
    assert.deepEqual(args.slice(1, 3), ["--env", "staging"]);
  }
});

test("npm scripts: preview only validates, deploy:staging is the one deploying entry", () => {
  assert.equal(pkg.scripts.preview, "node scripts/branch-preview.mjs");
  assert.equal(pkg.scripts["deploy:staging"], "node scripts/branch-preview.mjs --deploy");
});
