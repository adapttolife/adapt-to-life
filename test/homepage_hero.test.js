// The homepage carries the chosen header, and carries it once.
//
// This test exists because the header was silently reverted and nothing
// noticed. `git checkout -- public/*.html`, run to undo a bad rollout of the
// INTERIOR page band, also rolled back index.html — and every gate still went
// green, because check-site.mjs asserts that pages load, link, fit a budget and
// do not overflow, but never that a particular design is on them. The site was
// correct and shipped the wrong front page.
//
// Design decisions need assertions too, or they are only as durable as whoever
// last remembered them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("the homepage hero is the mosaic", () => {
  assert.match(html, /<section class="hero-wall-photo[^"]*" id="heroStage" data-variant="1">/,
    'index.html is not carrying variant 1. Run: node scripts/apply-hero.mjs 1');
});

test("the hero stylesheet is linked exactly once", () => {
  const links = html.match(/<link rel="stylesheet" href="\/css\/hero-[a-z]+\.css">/g) || [];
  assert.equal(links.length, 1, `expected one hero stylesheet, found ${links.length}`);
  assert.equal(links[0], '<link rel="stylesheet" href="/css/hero-mosaic.css">');
});

test("the hero script block is present and not duplicated", () => {
  assert.equal((html.match(/<!-- hero:script -->/g) || []).length, 1);
  assert.equal((html.match(/<!-- \/hero:script -->/g) || []).length, 1);
});

test("every panel the hero references is a file that exists", () => {
  const panels = JSON.parse(readFileSync(
    new URL("../public/images/hero/panels/panels.json", import.meta.url), "utf8"));
  const used = [...html.matchAll(/\/images\/hero\/panels\/([a-z0-9-]+)\.webp/g)].map((m) => m[1]);
  assert.ok(used.length >= 10, `hero references only ${used.length} panels`);
  for (const name of new Set(used)) {
    assert.ok(panels[name], `hero references "${name}" which is not in panels.json`);
  }
});
