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
  // The hero-* pages are the internal hero lab, left as they are.
  const out = readdirSync(pub).filter((f) => f.endsWith(".html") && !f.startsWith("hero-"));
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

// Brand marks and decorative art drawn for one page are not icons; everything
// else on a public page is a dictionary icon or logo.
const NOT_ICONS = /class="(brand-logo|bh-atl|bh-x|bh-bricks)"/;
test("no public page draws its own icon", () => {
  for (const f of pages()) {
    const html = readFileSync(new URL(f, pub), "utf8");
    for (const m of html.matchAll(/<svg\b[^>]*>/g)) {
      const tag = m[0];
      if (/data-(icon|logo)=/.test(tag) || NOT_ICONS.test(tag)) continue;
      // An <svg> written inside a script string is the script's own business
      // only if it comes from the generated icons:start block.
      const before = html.slice(Math.max(0, m.index - 4000), m.index);
      if (before.lastIndexOf("<script") > before.lastIndexOf("</script>")) continue;
      assert.fail(`${f}: a hand-drawn <svg> (${tag.slice(0, 80)}); use icon() or logo() from data/icons.mjs`);
    }
  }
});

test("links use the dictionary arrow, not a typed one", () => {
  // The AMP photo-print caption on /adaptive-sports-near-me is handwriting-style
  // type on purpose; it keeps its typed arrow.
  for (const f of pages()) {
    const html = readFileSync(new URL(f, pub), "utf8").replace(/<span class="amp-note">[\s\S]*?<\/span>/g, "");
    const body = html.replace(/<script[\s\S]*?<\/script>/g, "");
    // Arrows in a sentence ("twelve → six") are text; only links and buttons are checked.
    for (const m of body.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      assert.doesNotMatch(m[2], /&rarr;|→|&larr;|←/, `${f} has a typed arrow in a link or button; npm run icons converts it`);
    }
  }
});

test("the page scripts and the stylesheet draw from the dictionary", () => {
  for (const f of ["public/js/campaigns.js", "public/js/add-to-calendar.js"]) {
    const js = readFileSync(new URL(f, root), "utf8");
    const block = js.slice(js.indexOf("/* icons:start */"), js.indexOf("/* icons:end */"));
    assert.match(block, /data-(icon|logo)=/, `${f} icon block is empty or hand-drawn`);
  }
  const css = readFileSync(new URL("src/css/site.css", root), "utf8");
  assert.match(css, /--icon-check: url\("data:image\/svg\+xml,/);
  for (const f of ["src/css/site.css", "src/css/sponsor-sheet.css"]) {
    const sheet = readFileSync(new URL(f, root), "utf8");
    assert.doesNotMatch(sheet, /content:\s*"(\\2713|\\2212|\+)"/, `${f}: a stylesheet glyph check or plus is back; use the --icon- masks`);
  }
});
