import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Alec, Nov 6 2026: "On the live site now we have an off white which I like
// but let's dial that in. I prefer off white than white." Two light
// neutrals, Laura's off-white #F9F7F2 and beige #EFE8DC, and nothing else.

test("every light colour on the site is one of Laura's two", () => {
  // check-palette.mjs now fails on any near-white that is not the off-white
  // or the beige, on pure-white text, and on the live homepage hero sheet.
  execFileSync(process.execPath, ["scripts/check-palette.mjs"], {
    cwd: ROOT,
    stdio: "pipe",
  });
});

test("the homepage hero says its words in the off-white, not pure white", () => {
  const css = read("src/css/hero-mosaic.css");
  assert.ok(!/color:\s*#fff\b/i.test(css));
  assert.ok(css.includes("color: var(--cream)"));
});

test("every Givebutter form sits on an off-white card that the blend can use", () => {
  const pages = readdirSync(join(ROOT, "public"))
    .filter((f) => f.endsWith(".html") && !/^hero-\d/.test(f))
    .filter((f) => read(`public/${f}`).includes("<givebutter-giving-form"));
  assert.ok(pages.length >= 3);
  for (const f of pages) {
    const html = read(`public/${f}`);
    for (const m of html.matchAll(/<givebutter-giving-form/g)) {
      const before = html.slice(Math.max(0, m.index - 1500), m.index);
      const opened = [...before.matchAll(/<div class="([^"]*)"/g)].map((x) => x[1]);
      assert.ok(
        opened.some((c) => /\bgb-card\b/.test(c)),
        `${f}: the form is not inside a .gb-card`,
      );
    }
    assert.ok(
      /src="\/js\/campaigns\.js/.test(html),
      `${f}: nothing turns the blend on`,
    );
  }
  const css = read("src/css/site.css");
  assert.ok(
    css.includes(
      ".gb-card.gb-ready givebutter-giving-form {\n  mix-blend-mode: multiply;",
    ),
  );
  assert.ok(css.includes(".gb-card.gb-ready .gb-boot {\n  display: none;"));
  assert.ok(read("public/js/campaigns.js").includes('card.classList.add("gb-ready")'));
});
