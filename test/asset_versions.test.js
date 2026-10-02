// Every page asks for the exact CSS and JS it was released with
// (scripts/version-assets.mjs). Without a version, a returning visitor can get
// new HTML and JS with a stylesheet cached from the last release; on
// 2026-10-02 that broke the event cards on Alec's phone.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assetVersions, versionHtml, htmlFiles } from "../scripts/version-assets.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const versions = assetVersions();
const pages = htmlFiles();

test("every stylesheet and script reference carries a version", () => {
  for (const p of pages) {
    const bare = [...readFileSync(p, "utf8").matchAll(/(?:href|src)="(\/(?:css|js)\/[^"?]+)"/g)].map((m) => m[1]).filter((u) => versions.has(u));
    assert.deepEqual(bare, [], `${relative(root, p)} requests ${bare.join(", ")} without a version; run npm run assets`);
  }
});

test("every version matches the file it names", () => {
  for (const p of pages) {
    const html = readFileSync(p, "utf8");
    assert.equal(versionHtml(html, versions), html, `${relative(root, p)} names an out of date CSS or JS version; run npm run assets`);
  }
});
