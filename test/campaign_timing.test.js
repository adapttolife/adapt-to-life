import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// Nov 5 2026 (Alec): sending six athletes to the US Open is packaged as The
// Road to the US Open. Send 6 is the goal inside it; the popcorn drive's
// history still names the campaign it paid into.
const CAMPAIGN = "The Road to the US Open";
const HISTORY = "Send 6 to the US Open Spring 2027";

async function text(path) {
  return readFile(join(ROOT, path), "utf8");
}

test("the road is the canonical campaign, and it keeps Spring 2027", async () => {
  const campaigns = JSON.parse(await text("public/data/campaigns.json"));
  const road = campaigns.campaigns.find((c) => c.slug === "send-6-us-open");
  assert.equal(road?.name, CAMPAIGN);
  assert.equal(road?.when, "Spring 2027, Naples, Florida");
  assert.equal(road?.goal, 21000);
});

test("campaign page and supporting cards name the road", async () => {
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
  assert.ok(page.includes("spring 2027"), "the page dates the destination");
  assert.ok(
    page.includes("lottery"),
    "the US Open is a lottery; the page never promises a spot",
  );
  assert.ok(fund.includes(`>${CAMPAIGN}</p>`));
  assert.ok(fund.includes('href="/send-6" class="thermo-link">See the road'));
  assert.ok(
    popcorn.includes(`>${HISTORY}</a>`),
    "popcorn history names what it paid into",
  );
});

test("social metadata and generated card source carry the road", async () => {
  const [wire, generator] = await Promise.all([
    text("scripts/wire-og.mjs"),
    text("scripts/make-og.mjs"),
  ]);
  assert.match(wire, new RegExp(`"send-6":\\s*"${CAMPAIGN}\\. Adapt To Life\\.`));
  assert.ok(generator.includes(`The Road to the <em>US Open</em>.`));
});

// Nov 5 2026 (Alec): "we tell the story with different campaigns, but at the
// end of the day, it all goes to one fund." One Givebutter campaign behind
// every form; the Chicago Classic is a goal with no form yet. Later that day:
// "it should be two bars", year-round and the Road, as two designated funds
// inside that one campaign.
test("one fund: every giving form is the Hustle & Heart Fund, and the Classic has none", async () => {
  const campaigns = JSON.parse(await text("public/data/campaigns.json")).campaigns;
  assert.equal(campaigns[0].slug, "wheelie-big-dills", "the year-round ask leads");
  assert.equal(campaigns[0].goal, 13500, "year-round has its own bar");
  assert.equal(campaigns[0].raised_key, "year");
  for (const f of [
    "public/donate.html",
    "public/hustle-and-heart.html",
    "public/send-6.html",
  ]) {
    const html = await text(f);
    const forms = [
      ...html.matchAll(/<givebutter-giving-form campaign="([A-Z0-9]+)"/g),
    ].map((m) => m[1]);
    assert.ok(forms.length >= 1, `${f} has a giving form`);
    assert.ok(
      forms.every((c) => c === "IXM5DR"),
      `${f} gives to the one fund`,
    );
  }
  assert.ok(
    !/givebutter-giving-form/.test(await text("public/chicago-classic.html")),
    "no Classic form yet",
  );
});
