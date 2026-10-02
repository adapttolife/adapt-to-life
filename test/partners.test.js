// Every partner on /sponsorship gets its own page, the way /brickhouse works.
// A partner card that points nowhere, a partner page that shares with the
// generic home card, or one with no way back to Partners fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const partners = read("sponsorship.html");
const cards = [...partners.matchAll(/<article class="partner[^"]*">([\s\S]*?)<\/article>/g)].map((m) => m[1]);
const pages = cards.map((c) => (c.match(/class="partner-more" href="\/([a-z0-9-]+)"/) || [])[1]);

test("/sponsorship lists at least one partner, each with a page link", () => {
  assert.ok(cards.length >= 1, "no partner cards");
  pages.forEach((p, i) => assert.ok(p, `partner card ${i + 1} has no partner-more link`));
});

for (const slug of pages.filter(Boolean)) {
  test(`partner page /${slug} is complete`, () => {
    assert.ok(existsSync(new URL(`${slug}.html`, pub)), `public/${slug}.html is missing`);
    const html = read(`${slug}.html`);
    const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || "";
    const tw = (html.match(/<meta name="twitter:image" content="([^"]+)"/) || [])[1] || "";
    assert.ok(og && !/\/og\/home-/.test(og), `/${slug} shares with the default card (${og}); give it its own`);
    assert.equal(tw, og, "twitter:image matches og:image");
    assert.ok(existsSync(new URL(og.replace("https://adapttolife.org/", ""), pub)), `${og} was never rendered`);
    assert.ok(html.includes('href="/sponsorship"'), `/${slug} links back to Partners`);
    assert.ok(read("sitemap.xml").includes(`https://adapttolife.org/${slug}</loc>`), `/${slug} is in the sitemap`);
  });
}
