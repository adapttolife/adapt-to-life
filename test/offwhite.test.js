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

test("one background for every light section; the lighter white is only a card", () => {
  // Alec, Nov 6: "I see multiple different whites... Should the website have
  // two different whites? I like the off white better." Full-width bands are
  // all the warm page colour; #F9F7F2 lives only on cards that sit on it.
  const css = read("src/css/site.css");
  const tint = css.match(/\n\.tint \{([^}]*)\}/);
  assert.ok(tint, "the .tint rule exists");
  assert.ok(/background:\s*var\(--canvas\)/.test(tint[1]), ".tint is the page colour");
  assert.ok(!/var\(--paper\)/.test(tint[1]), ".tint is not the lighter white");
  assert.ok(
    read("public/index.html").includes(
      ".hm-partners{ padding:clamp(2.2rem,5vw,3.4rem) 0; background:var(--canvas);",
    ),
  );
  for (const f of readdirSync(join(ROOT, "public")).filter(
    (x) => x.endsWith(".html") && !/^hero-/.test(x),
  )) {
    const html = read(`public/${f}`);
    for (const m of html.matchAll(
      /<section class="([^"]*)"[^>]*style="[^"]*background:\s*(var\(--paper\)|#f9f7f2)/gi,
    ))
      assert.fail(`${f}: a full-width section in the lighter white (${m[1]})`);
  }
});

test("the nav stays black when the page scrolls", () => {
  const css = read("src/css/site.css");
  assert.ok(
    !css.includes(".nav.over-dark:not(.scrolled)"),
    "no light nav after scrolling",
  );
  // Black: the warm photo black of Night & Orange (Nov 2026), the same black
  // as the photo wall under it.
  assert.ok(
    /\.nav\.over-dark \{[^}]*background-color: var\(--photo-black\);/.test(css),
  );
  const pb = css.match(/--photo-black:\s*#([0-9a-f]{6})/i);
  assert.ok(pb, "--photo-black is defined");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(pb[1].slice(i, i + 2), 16));
  assert.ok(Math.max(r, g, b) <= 0x18, "the nav black is a near-black");
});

test("Night & Orange: one warm near-black, orange does every accent job", () => {
  // Alec, Nov 6: "I like option B - what can we do to make it better?"
  const css = read("src/css/site.css");
  const hex = (name) =>
    (css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i")) || [])[1];
  const lum = (h) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };
  const [night, orange, display, ink, page, card] = [
    hex("night"),
    hex("orange"),
    hex("orange-display"),
    hex("orange-ink"),
    hex("canvas"),
    hex("paper"),
  ];
  assert.ok(night && display && ink, "the Night & Orange tokens are defined");
  assert.ok(ratio(orange, night) >= 4.5, "orange reads as small text on night");
  assert.ok(
    ratio(display, page) >= 3,
    "display orange clears large-text AA on the page",
  );
  assert.ok(ratio(ink, page) >= 4.5, "orange ink clears small-text AA on the page");
  assert.ok(ratio(card, ink) >= 4.5, "off-white on an orange-ink button clears AA");
  // The teal switch is gone: orange stays orange inside dark sections.
  assert.ok(!/--orange:\s*var\(--teal-on-dark\)/.test(css));
  assert.ok(!/rgba\(0, ?183, ?189/.test(css), "no teal glows in the stylesheet");
});
