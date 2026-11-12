import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Nov 5 2026 (Alec): "we should be consistent with a call to action, or it
// gets too confusing." Every money button says Donate. The Chicago Wheelie Big
// Dills is the name of what people fund, never a slogan on a button.
// The one exception is the donate page's own scroll-back button, which says
// "Choose an amount" (Alec, Sep 9: a Donate button on the donate page "feels
// weird").
const PAGES = readdirSync(join(ROOT, "public")).filter(
  (f) => f.endsWith(".html") && !/^hero-\d/.test(f),
);

function moneyButtons(html) {
  const out = [];
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = m[1];
    if (!/class="[^"]*\bbtn\b/.test(attrs)) continue;
    const href = (attrs.match(/href="([^"]*)"/) || [])[1] || "";
    if (!/^(\/donate|#give|#fund-donation|#givePanel)/.test(href)) continue;
    const label = m[2]
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    out.push({ href, label });
  }
  return out;
}

test("every money button on the site says Donate", () => {
  for (const file of PAGES) {
    for (const { href, label } of moneyButtons(read(`public/${file}`))) {
      if (file === "donate.html" && href === "#givePanel") {
        assert.equal(label, "Choose an amount", file);
        continue;
      }
      if (file === "popcorn.html" && label === "Buy popcorn") continue; // a purchase, not a gift
      assert.equal(label, "Donate", `${file} ${href}`);
    }
  }
});

test("the old giving slogans are gone", () => {
  for (const file of PAGES) {
    const html = read(`public/${file}`);
    for (const old of [
      "Back the crew",
      "Send Juan to Naples",
      ">Give now<",
      "Cover part of Juan",
    ]) {
      assert.ok(!html.includes(old), `${file} still says ${old}`);
    }
  }
  const camp = JSON.parse(read("public/data/campaigns.json")).campaigns;
  const crew = camp.find((c) => c.slug === "wheelie-big-dills");
  assert.equal(crew.cta_label, "Donate");
  assert.equal(crew.cta_url, "/donate");
});

test("the cost story uses the same real numbers on every page", () => {
  // Alec, Nov 5: a sport chair runs $4,000 to $6,000 and insurance doesn't
  // cover it; $3,500 is about what the US Open has cost per athlete the last
  // couple of years. A membership is $129 a month ($1,548 a year). The chair is a year-round cost,
  // so the Road page leaves it out (two_bars.test.js checks that).
  const crew = read("public/pickleball.html"),
    fund = read("public/hustle-and-heart.html"),
    road = read("public/road.html");
  assert.ok(crew.includes("$4,000 to $6,000"));
  assert.ok(fund.includes("$4,000&ndash;$6,000"));
  for (const html of [crew, fund]) {
    assert.ok(html.includes("<b>$129</b>") || html.includes(">$1,548<span>") || html.includes("<b>$1,548</b>"));
  }
  // Nov 11 2026: a tournament trip is about $1,000 an athlete (Alec); the US
  // Open, the road's last stop, has cost about $3,500. The crew's Compete card
  // leads with the trip; the fund's Travel card keeps the US Open figure.
  assert.ok(crew.includes("<b>$1,000</b>") && crew.includes("about $3,500"));
  // Nov 12 2026 (Alec): "$1k is ... year round support to travel"; $3,500 is
  // the US Open. The fund's Travel card leads with the trip.
  assert.ok(fund.includes(">$1,000<span>") && fund.includes("about $3,500"));
  assert.ok(road.includes("about 21 tournament trips at about $1,000 each"));
  assert.ok(road.includes("one athlete&rsquo;s US Open has cost about $3,500"));
  assert.ok(crew.includes("It takes skill and a little luck to get to the US Open."));
  assert.ok(road.includes("It takes skill and a little luck to get to the US Open."));
  assert.ok(fund.includes("Who gets to compete should come down to skill"));
});

test("Juan's page respects the US Open lottery", () => {
  const juan = read("public/juan.html");
  assert.ok(
    juan.includes("The US Open picks players by lottery, so nothing is guaranteed."),
  );
  assert.ok(!juan.includes("puts Juan on that court"));
  assert.ok(!juan.includes("Now it&rsquo;s Juan&rsquo;s turn"));
  assert.ok(!juan.includes("cannot go ahead"));
});
