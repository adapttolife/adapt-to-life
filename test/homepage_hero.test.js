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
import { readFileSync, existsSync } from "node:fs";

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

test("the homepage hero is the mosaic", () => {
  assert.match(
    html,
    /<section class="hero-wall-photo[^"]*" id="heroStage" data-variant="1">/,
    "index.html is not carrying variant 1. Run: node scripts/apply-hero.mjs 1",
  );
});

test("the hero stylesheet is linked exactly once", () => {
  // Stylesheet links carry ?v=<hash> (scripts/version-assets.mjs); the check is
  // about WHICH sheet and HOW MANY, so the version is allowed but not required.
  const links =
    html.match(
      /<link rel="stylesheet" href="\/css\/hero-[a-z]+\.css(?:\?v=[0-9a-f]+)?">/g,
    ) || [];
  assert.equal(links.length, 1, `expected one hero stylesheet, found ${links.length}`);
  assert.match(
    links[0],
    /^<link rel="stylesheet" href="\/css\/hero-mosaic\.css(?:\?v=[0-9a-f]+)?">$/,
  );
});

test("the hero script block is present and not duplicated", () => {
  assert.equal((html.match(/<!-- hero:script -->/g) || []).length, 1);
  assert.equal((html.match(/<!-- \/hero:script -->/g) || []).length, 1);
});

test("every panel the hero references exists, and is fingerprinted", () => {
  // The fingerprint is the point, not a detail. public/_headers caches media
  // for 30 days and tells you to rename an image if you replace it. Overwriting
  // the interior band in place under that policy cost four review rounds: every
  // fix shipped, and Alec's browser kept serving the first version. A URL
  // without a content hash in it is that bug waiting to happen again.
  const used = [
    ...html.matchAll(/\/images\/hero\/panels\/([a-z0-9-]+\.[0-9a-f]{8}\.webp)/g),
  ].map((m) => m[1]);
  assert.ok(
    used.length >= 10,
    `hero references only ${used.length} fingerprinted panels`,
  );
  const plain = [...html.matchAll(/\/images\/hero\/panels\/([a-z0-9-]+)\.webp/g)].map(
    (m) => m[1],
  );
  assert.equal(
    plain.length,
    0,
    `hero references un-fingerprinted panels: ${plain.join(", ")}`,
  );
  for (const file of new Set(used)) {
    assert.ok(
      existsSync(new URL(`../public/images/hero/panels/${file}`, import.meta.url)),
      `hero references "${file}" which is not on disk`,
    );
  }
});

test("no wall panel is cut from a frame showing GLASA's shirts", () => {
  // GLASA is never named on this site, and that includes what people are
  // wearing. Until Nov 6 2026 the wall's "profile" panel was JLA_5989, a man in
  // a "Great Lakes Games" shirt (GLASA's event), visible on desktop. It is
  // JLA_6011 now (Alec approved the swap). These frames from the same ACE shoot
  // show the Great Lakes Games shirt or GLASA's staff shirt; none of them may
  // become a homepage panel.
  const GLASA_SHIRTS = new Set([
    "JLA_5989.jpg",
    "JLA_5990.jpg",
    "JLA_5991.jpg",
    "JLA_6136.jpg",
    "JLA_6192.jpg",
    "JLA_6193.jpg",
  ]);
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const panels = JSON.parse(read("public/images/hero/panels/panels.json"));
  const hashes = JSON.parse(read("public/images/hero/panels/hashes.json"));
  for (const [name, p] of Object.entries(panels)) {
    assert.ok(!GLASA_SHIRTS.has(p.src), `panel "${name}" is cut from ${p.src}`);
  }
  assert.equal(panels.profile.src, "JLA_6011.jpg");
  assert.ok(html.includes(`/images/hero/panels/${hashes["profile.webp"]}`));

  // The rolling closing strips are built from their own lists (STRIPS in
  // scripts/build-hero-panels.py), not panels.json, so the check above never
  // saw them. Until Nov 11 2026 column 7 of the homepage strip was JLA_5989,
  // the Great Lakes Games shirt, live at the bottom of the front page.
  const py = read("scripts/build-hero-panels.py");
  const strips = py.match(/STRIPS = \{([\s\S]*?)\n    \}/);
  assert.ok(strips, "STRIPS is defined in build-hero-panels.py");
  const frames = strips[1].match(/JLA_\d+\.jpg/g) || [];
  assert.equal(frames.length, 16, "two strips of eight frames");
  for (const f of frames) assert.ok(!GLASA_SHIRTS.has(f), `a roll strip is cut from ${f}`);
  for (const f of GLASA_SHIRTS) assert.ok(py.includes(`"${f}"`), `BANNED_FRAMES lists ${f}`);
  assert.ok(html.includes(`/images/hero/panels/${hashes["roll-strip-home.webp"]}`));
});
