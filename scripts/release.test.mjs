import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("an unknown option starts nothing: a typo must never run a release", () => {
  for (const bad of ["--wiat", "--dry-rn", "release"]) {
    const r = spawnSync(
      process.execPath,
      [new URL("./release.mjs", import.meta.url).pathname, bad],
      { encoding: "utf8" },
    );
    assert.equal(r.status, 2, bad);
    assert.match(r.stderr, /Unknown option/);
  }
});
