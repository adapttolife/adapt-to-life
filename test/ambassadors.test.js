// Every ambassador on /ambassadors gets their own page, the way /juan works.
// A card that points nowhere, a page that is hidden from search, shares with
// the default card, or has no way back to the program fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const page = read("ambassadors.html");
const cards = [...page.matchAll(/<article class="am-card[^"]*">([\s\S]*?)<\/article>/g)].map((m) => m[1]);
const slugs = cards.map((c) => (c.match(/class="am-more" href="\/([a-z0-9-]+)"/) || [])[1]);

test("/ambassadors lists at least one ambassador, each with a page link", () => {
  assert.ok(cards.length >= 1, "no ambassador cards");
  slugs.forEach((s, i) => assert.ok(s, `ambassador card ${i + 1} has no am-more link`));
});

for (const slug of slugs.filter(Boolean)) {
  test(`ambassador page /${slug} is complete and public`, () => {
    assert.ok(existsSync(new URL(`${slug}.html`, pub)), `public/${slug}.html is missing`);
    const html = read(`${slug}.html`);
    assert.ok(!/noindex/.test(html), `/${slug} is hidden from search`);
    const og = (html.match(/<meta property="og:image" content="([^"]+)"/) || [])[1] || "";
    assert.ok(og && !/\/og\/home-/.test(og), `/${slug} shares with the default card`);
    assert.ok(existsSync(new URL(og.replace("https://adapttolife.org/", ""), pub)), `${og} was never rendered`);
    assert.ok(html.includes('href="/ambassadors"'), `/${slug} links back to Ambassadors`);
    assert.ok(read("sitemap.xml").includes(`https://adapttolife.org/${slug}</loc>`), `/${slug} is in the sitemap`);
  });
}

test("Ambassadors is the first thing on the volunteer board", () => {
  const v = read("volunteer.html");
  const amb = v.indexOf('href="/ambassadors">Meet our ambassadors');
  assert.ok(amb > 0, "volunteer links to /ambassadors");
  assert.ok(amb < v.indexOf("Before you scroll"), "the ambassador band comes before the role board");
});
