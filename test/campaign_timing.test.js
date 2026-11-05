import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CAMPAIGN = "Send 6 to the US Open Spring 2027";

async function text(path) {
  return readFile(join(ROOT, path), "utf8");
}

test("Spring 2027 is part of the canonical Send 6 campaign name", async () => {
  const campaigns = JSON.parse(await text("public/data/campaigns.json"));
  const send6 = campaigns.campaigns.find(
    (campaign) => campaign.slug === "send-6-us-open",
  );
  assert.equal(send6?.name, CAMPAIGN);
  assert.equal(send6?.when, "Spring 2027, Naples, Florida");
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
  assert.ok(fund.includes(`>${CAMPAIGN}</p>`));
  assert.ok(
    fund.includes('href="/send-6" class="thermo-link">View the Send 6 campaign'),
  );
  assert.ok(popcorn.includes(`>${CAMPAIGN}</a>`));
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
  assert.ok(generator.includes(`Send 6 to the <em>US Open</em> Spring 2027.`));
});

// Nov 5 2026 (Alec): three separate campaigns. Send 6 keeps its goal and date;
// The Road is the year-round ask with no ceiling; the Classic has its own.
test("three campaigns: The Road has no ceiling, Send 6 keeps $21,000", async () => {
  const campaigns = JSON.parse(await text("public/data/campaigns.json")).campaigns;
  const road = campaigns.find((c) => c.slug === "the-road");
  const send6 = campaigns.find((c) => c.slug === "send-6-us-open");
  const classic = campaigns.find((c) => c.slug === "chicago-classic");
  assert.equal(campaigns[0].slug, "the-road", "the everyday ask is featured");
  assert.equal(road?.goal, null);
  assert.equal(send6?.goal, 21000);
  assert.ok(classic, "the Chicago Classic is its own campaign");
  const page = await text("public/road.html");
  assert.ok(page.includes('<h1 class="serif display reveal">The Road.</h1>'));
  assert.ok(page.includes('campaign="IXM5DR"'), "The Road gives to the fund's own campaign");
  assert.ok((await text("public/send-6.html")).includes('campaign="QTPT4L"'), "Send 6 has its own form");
  assert.ok((await text("public/chicago-classic.html")).includes('campaign="EJ307D"'), "the Classic has its own form");
});
