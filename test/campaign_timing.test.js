import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Nov 5 2026 (Alec): the campaign became The Road to the US Open, a year-round
// season with Send 6 as its finale. The finale keeps its name and its date.
const CAMPAIGN = "The Road to the US Open";
const FINALE = "Send 6 to the US Open Spring 2027";

async function text(path) {
  return readFile(join(ROOT, path), "utf8");
}

test("the road is the canonical campaign, and its finale keeps Spring 2027", async () => {
  const campaigns = JSON.parse(await text("public/data/campaigns.json"));
  const send6 = campaigns.campaigns.find(
    (campaign) => campaign.slug === "send-6-us-open",
  );
  assert.equal(send6?.name, CAMPAIGN);
  assert.equal(send6?.when, "Spring 2027, Naples, Florida");
  assert.equal(send6?.goal, 34500, "nights $3,900 + training $9,600 + Send 6 $21,000");
});

test("campaign page and supporting cards name Spring 2027", async () => {
  const [page, fund, popcorn] = await Promise.all([
    text("public/send-6.html"),
    text("public/hustle-and-heart.html"),
    text("public/popcorn.html"),
  ]);

  assert.ok(page.includes(`<title>${CAMPAIGN} | Adapt To Life</title>`));
  assert.ok(
    page.includes(`<meta property="og:title" content="${CAMPAIGN} | Adapt To Life">`),
  );
  assert.ok(
    page.includes(`<meta name="twitter:title" content="${CAMPAIGN} | Adapt To Life">`),
  );
  assert.ok(page.includes(`<h1 class="serif display reveal">${CAMPAIGN}.</h1>`));
  assert.ok(page.includes("spring 2027"), "the page still dates the finale");
  assert.ok(page.includes("The finale: Send 6"));
  assert.ok(fund.includes(`>${CAMPAIGN}</p>`));
  assert.ok(
    fund.includes('href="/send-6" class="thermo-link">See the road'),
  );
  assert.ok(popcorn.includes(`>${FINALE}</a>`), "popcorn history names the finale it paid into");
  assert.ok(fund.includes('data-goal="34500"'), "the fund thermometer and campaigns.json agree");
});

test("social metadata and generated card source carry Spring 2027", async () => {
  const [wire, generator] = await Promise.all([
    text("scripts/wire-og.mjs"),
    text("scripts/make-og.mjs"),
  ]);

  // OPENS WITH, no longer EQUALS. From 2026-09-09 the alt text continues past
  // the campaign line into a description of the photograph, because the cards
  // became photographs and alt that describes a picture nobody can see is the
  // whole point of alt. The invariant this test exists for is untouched: the
  // campaign name AND its date still have to reach the share metadata, so the
  // closing quote is dropped and nothing else.
  assert.match(wire, new RegExp(`"send-6":\\s*"${CAMPAIGN}\\. Adapt To Life\\.`));
  assert.ok(generator.includes(`The Road to the <em>US Open</em>.`));
});
