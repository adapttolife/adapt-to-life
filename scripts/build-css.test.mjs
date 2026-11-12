import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { stripCss, resolvePanels } from "./build-css.mjs";

test("CSS CLI actually generates every stylesheet on the current platform", () => {
  const output = execFileSync(
    process.execPath,
    [fileURLToPath(new URL("./build-css.mjs", import.meta.url))],
    {
      encoding: "utf8",
    },
  );
  assert.match(output, /TOTAL/); // A silently skipped entrypoint must fail even with stale files present.
  const source = new URL("../src/css/", import.meta.url);
  const built = new URL("../public/css/", import.meta.url);
  // Panel image names resolve to their fingerprinted files (hashes.json).
  const hashes = JSON.parse(
    readFileSync(
      new URL("../public/images/hero/panels/hashes.json", import.meta.url),
      "utf8",
    ),
  );
  for (const name of readdirSync(source).filter((name) => name.endsWith(".css"))) {
    const css = readFileSync(new URL(name, built), "utf8");
    assert.ok(css.trim().length > 0, `${name} must not be empty`);
    assert.equal(
      css,
      stripCss(
        resolvePanels(readFileSync(new URL(name, source), "utf8"), name, hashes),
      ),
      `${name} must be current`,
    );
  }
});

test("a stylesheet naming a panel by its plain name gets the fingerprinted file", () => {
  const hashes = { "big-ryan.webp": "big-ryan.2b97a6b0.webp" };
  assert.equal(
    resolvePanels(
      'a{background:url("/images/hero/panels/big-ryan.webp")}',
      "t.css",
      hashes,
    ),
    'a{background:url("/images/hero/panels/big-ryan.2b97a6b0.webp")}',
  );
  // an already fingerprinted name is left alone
  const done = 'a{background:url("/images/hero/panels/big-ryan.2b97a6b0.webp")}';
  assert.equal(resolvePanels(done, "t.css", hashes), done);
  // a panel the manifest does not know stops the build instead of 404ing
  assert.throws(
    () =>
      resolvePanels(
        "a{background:url(/images/hero/panels/nope.webp)}",
        "t.css",
        hashes,
      ),
    /not in images\/hero\/panels\/hashes\.json/,
  );
});
