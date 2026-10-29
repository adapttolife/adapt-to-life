// /social is where Instagram meets the site. It names organizations only:
// athletes and commenters from the feed stay off it unless they have said yes,
// so a name from the scan that is not an organization fails here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const html = read("social.html");
// The page's own content; the shared footer links to story pages people agreed to.
const main = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));

test("/social names no individual athlete or commenter", () => {
  for (const name of ["Robby", "Wolf", "Ben Lang", "Jason", "Sandor", "Swany", "Swanson", "Juan", "Amanda", "Kasey",
    "Ken ", "Brian", "Pete", "Autumn", "robbywolf32", "ben662845", "jaysay313", "bobbyswany", "pcklballpete", "autumnskye613"]) {
    assert.ok(!main.includes(name), `/social mentions ${name.trim()}`);
  }
});

test("/social links out to Instagram rather than embedding it", () => {
  assert.ok(html.includes('href="https://www.instagram.com/adapt_to_life_org/"'));
  assert.ok(!/instagram\.com\/embed|<iframe/.test(html), "no Instagram embeds or iframes");
  const reels = html.match(/href="https:\/\/www\.instagram\.com\/reel\/[\w-]+\/"/g) || [];
  assert.ok(reels.length >= 3, "at least three reels");
});

test("every public footer links to /social", () => {
  for (const f of readdirSync(pub).filter((f) => f.endsWith(".html"))) {
    const s = read(f);
    if (s.includes("noindex") || !s.includes('<footer class="footer">')) continue;
    const footer = s.slice(s.indexOf('<footer class="footer">'));
    assert.ok(footer.includes('href="/social"'), `${f} footer has no /social link`);
  }
});
