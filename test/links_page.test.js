// /links is the page behind the Instagram bio and the Facebook Page website
// field (Alec, Nov 8 2026: "help convert social media to website"). It is
// generated (scripts/lib/links-page.mjs from data/links.mjs), so these guard
// the promises it makes: every tap is counted, the gifts say exactly what the
// site's picker says, the media it plays is on disk, and it stays out of search.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const html = read("public/links.html");
const main = html.slice(html.indexOf('<main class="lx'), html.indexOf("</main>"));

test("/links stays out of search and opens on the court", () => {
  assert.ok(html.includes('<meta name="robots" content="noindex, follow">'));
  const video = main.match(/<video class="lx-vid"[^>]*data-src="([^"]+)"[^>]*>/);
  assert.ok(video, "the hero video is there");
  assert.ok(/muted/.test(video[0]) && /playsinline/.test(video[0]), "muted and inline, so phones autoplay it");
  assert.ok(!/\bautoplay\b/.test(video[0]), "the script starts it, so Save-Data and reduced motion keep the poster");
  const poster = main.match(/poster="([^"]+)"/)[1];
  for (const f of [video[1], poster]) {
    assert.match(f, /\.[0-9a-f]{8}\.(mp4|webp)$/, `${f} is fingerprinted (media is cached for 30 days)`);
    assert.ok(existsSync(new URL(`../public${f}`, import.meta.url)), `${f} is on disk`);
  }
  assert.ok(main.includes('class="lx-vidbtn"'), "the video can be paused");
});

test("every link on /links is tagged, so a tap that becomes a gift is counted", () => {
  const hrefs = [...main.matchAll(/<a [^>]*href="(\/[^"#]*)[^"]*"/g)].map((m) => m[1]);
  assert.ok(hrefs.length >= 20, `found ${hrefs.length} internal links`);
  for (const m of main.matchAll(/<a [^>]*href="(\/[^"]*)"/g))
    assert.ok(m[1].includes("utm_source=link-in-bio"), `${m[1]} is untagged`);
  assert.ok(main.includes('data-source="links"'), "signups from /links name their source");
});

test("/links offers the picker's own gifts and lines", () => {
  const js = read("public/js/campaigns.js");
  const block = (freq) => {
    const i = js.indexOf(`${freq}: [`);
    return [...js.slice(i, js.indexOf("]", i)).matchAll(/a: (\d+),\s*t: "([^"]+)"/g)].map((m) => [+m[1], m[2]]);
  };
  const lines = new Map([...block("monthly"), ...block("once")].map(([a, t]) => [t, a]));
  const buttons = [...main.matchAll(/data-a="(\d+)" data-freq="(monthly|once)" data-t="([^"]+)"/g)];
  assert.ok(buttons.length >= 6, "monthly and one time amounts");
  for (const [, a, , t] of buttons) assert.equal(lines.get(t), +a, `$${a} says what the picker says`);
  const def = Number(js.match(/GIFT_DEFAULT = \{ monthly: (\d+)/)[1]);
  assert.ok(main.includes(`href="/donate?amount=${def}&amp;frequency=monthly&amp;utm_source=link-in-bio`), "Donate starts at the picker's default");
  assert.match(main, /class="btn" href="\/donate[^"]*" data-give-link>Donate /, "the money button says Donate");
});
