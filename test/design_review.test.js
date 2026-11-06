import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The Nov 6 2026 design review (Alec: "Fix everything you recommended. Take
// your time. Let's get this right.").
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const PAGES = [
  ...readdirSync(join(ROOT, "public"))
    .filter(
      (f) =>
        f.endsWith(".html") && !/^(hero-|campaign-concepts|review|photo-picks)/.test(f),
    )
    .map((f) => `public/${f}`),
  ...readdirSync(join(ROOT, "public/volunteer"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `public/volunteer/${f}`),
];

test("every image reserves its shape: width and height on every <img>", () => {
  for (const f of PAGES)
    for (const [tag] of read(f).matchAll(/<img [^>]*>/g))
      assert.ok(
        /\bwidth="\d+"/.test(tag) && /\bheight="\d+"/.test(tag),
        `${f}: ${tag.slice(0, 90)}`,
      );
  // Attributes give the shape, CSS keeps the size: a framed photo never stretches.
  assert.ok(/\.photo-frame img \{[^}]*height: auto;/.test(read("src/css/site.css")));
});

test("no page skips a heading level (the footer's titles are h2)", () => {
  for (const f of PAGES) {
    const html = read(f).replace(/<script[\s\S]*?<\/script>/g, "");
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => +m[1]);
    for (let i = 1; i < levels.length; i++)
      assert.ok(
        levels[i] <= levels[i - 1] + 1,
        `${f}: h${levels[i - 1]} then h${levels[i]}`,
      );
    assert.ok(
      !/<h4>(Organization|Get involved)<\/h4>/.test(html),
      `${f}: footer titles are h4`,
    );
  }
});
