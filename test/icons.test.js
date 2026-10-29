// The symbol dictionary (data/icons.mjs) is the only source of icons on the
// site. These checks keep it that way: the generated registry matches the
// dictionary, every meaning resolves to one distinct drawing, and every icon
// on a public page came out of icon() or logo() rather than being pasted in.
// That last one is the check the retired custom set (brand/obsolete/
// icons-2026-10-custom) never had.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { MEANINGS, LOGOS } from "../data/icons.mjs";
import { ICONS, icon, logo } from "../scripts/lib/icons.mjs";

const root = new URL("../", import.meta.url);
const pub = new URL("public/", root);

test("the registry and the checking sheet are up to date with the dictionary", () => {
  execFileSync(process.execPath, ["scripts/build-icons.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("every meaning resolves, and no two meanings share a drawing", () => {
  const seen = new Map();
  for (const [name, m] of Object.entries(MEANINGS)) {
    assert.ok(ICONS[name]?.styles?.regular?.body, `${name} has no drawing`);
    assert.ok(m.means && m.means.length > 8, `${name} does not say what it means`);
    const key = `${m.src}:${m.icon}`;
    assert.ok(!seen.has(key), `${name} and ${seen.get(key)} are the same picture; one meaning, one picture`);
    seen.set(key, name);
  }
});

function pages() {
  const out = readdirSync(pub).filter((f) => f.endsWith(".html"));
  return out.concat(readdirSync(new URL("volunteer/", pub)).filter((f) => f.endsWith(".html")).map((f) => "volunteer/" + f));
}

test("every icon on a public page came from icon() or logo()", () => {
  let n = 0;
  for (const f of pages()) {
    const html = readFileSync(new URL(f, pub), "utf8");
    for (const m of html.matchAll(/<svg class="([^"]+)"[^>]*data-(icon|logo)="([a-z-]+)"[^>]*>[\s\S]*?<\/svg>/g)) {
      const [svg, cls, kind, name] = m;
      if (kind === "icon") {
        assert.ok(MEANINGS[name], `${f}: data-icon="${name}" is not a meaning in data/icons.mjs`);
        const ok = ["regular", "duotone", "bold", "fill"].some((s) => icon(name, s, cls) === svg);
        assert.ok(ok, `${f}: the ${name} icon does not match the registry; regenerate the page`);
      } else {
        assert.ok(LOGOS[name], `${f}: data-logo="${name}" is not in LOGOS`);
        assert.equal(svg, logo(name, cls), `${f}: the ${name} logo does not match the registry`);
      }
      n++;
    }
  }
  assert.ok(n > 40, `expected the index pages to carry dictionary icons, found ${n}`);
});

test("no page carries a retired icon", () => {
  // The custom set drew with a 24-unit, 2px-stroke wrapper and class ix-svg;
  // the dictionary's icons fill instead. An ix-svg with stroke-width is retired.
  for (const f of pages()) {
    const html = readFileSync(new URL(f, pub), "utf8");
    assert.doesNotMatch(html, /<svg class="ix-svg"[^>]*stroke-width="2"/, `${f} still uses a retired custom icon`);
    assert.doesNotMatch(html, /class="so-cover"/, `${f} still uses a retired reel cover`);
  }
});
