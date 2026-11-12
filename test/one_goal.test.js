import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  campaignPosition,
  CAMPAIGN_KEYS,
  YEAR_GOAL,
  ROAD_GOAL,
  WBD_GOAL,
  YEAR_INKIND,
} from "../src/fund.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// Nov 5 2026 (Alec): "one campaign bar... puts together all of the initiatives
// into one big number... Then it shows how much of this pays for the year and
// how much of this pays for the U.S. Open." Every gift goes to one program,
// the Chicago Wheelie Big Dills. New gifts fill every week first, then the
// road. Money raised under Send 6 keeps its terms and sits on the road.

function withCampaign(online, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async () =>
    online === null
      ? new Response("{}", { status: 503 })
      : new Response(JSON.stringify({ raised: online, donors: 23 }), { status: 200 });
  return fn().finally(() => {
    globalThis.fetch = real;
  });
}

const ENV = {
  GIVEBUTTER_API_KEY: "test",
  GIVEBUTTER_CAMPAIGN_ID: "683765",
  SEND6_SET_ASIDE: "4979",
  SEND6_ONLINE_COUNTED: "1975",
};

test("one goal is every week plus the road", () => {
  assert.ok(CAMPAIGN_KEYS.includes("wbd"));
  assert.equal(YEAR_GOAL, 27180);
  assert.equal(ROAD_GOAL, 21000);
  assert.equal(WBD_GOAL, 48180);
});

test("today: every week starts with the club's court time, and the road holds the Send 6 money", () =>
  withCampaign(1975, async () => {
    const w = await campaignPosition(ENV, "wbd");
    assert.equal(w.raised, 4979, "gifts only; court time is kept apart");
    assert.equal(w.inkind, 5200);
    assert.equal(w.goal, 48180);
    assert.equal(w.parts.year.raised, 5200);
    assert.equal(w.parts.year.inkind, 5200);
    assert.equal(w.parts["send-6"].raised, 4979);
    assert.equal(w.donors, 23, "the donor count comes through for social proof");
  }));

test("new gifts fill every week first", () =>
  withCampaign(1975 + 5000, async () => {
    const w = await campaignPosition(ENV, "wbd");
    assert.equal(w.raised, 4979 + 5000);
    assert.equal(w.parts.year.raised, 5200 + 5000);
    assert.equal(w.parts["send-6"].raised, 4979);
    assert.equal((await campaignPosition(ENV, "year")).raised, 5200 + 5000);
  }));

test("once every week is funded, gifts move to the road", () =>
  withCampaign(1975 + 30000, async () => {
    const w = await campaignPosition(ENV, "wbd");
    // Every week needs $27,180 - $5,200 = $21,980 in gifts; the other $8,020 goes on.
    assert.equal(w.parts.year.raised, 27180);
    assert.equal(w.parts["send-6"].raised, 4979 + 8020);
    assert.equal((await campaignPosition(ENV, "send-6")).raised, 4979 + 8020);
  }));

// Alec, Nov 12 2026, "yes to both": a sponsor whose name goes on a part pays
// for that part. A Champion's money sits on the road from the start, like the
// Send 6 set-aside, and gifts still fill every week first.
test("a Champion's sponsorship sits on the road from the start", () =>
  withCampaign(1975 + 5000, async () => {
    const env = { ...ENV, ROAD_NAMED: "21000" };
    const w = await campaignPosition(env, "wbd");
    assert.equal(w.raised, 4979 + 21000 + 5000);
    assert.equal(w.parts.year.raised, 5200 + 5000, "gifts still fill every week first");
    assert.equal(w.parts["send-6"].raised, 21000, "the road is paid for");
    assert.equal(
      (await campaignPosition(env, "fund")).raised,
      1975 + 5000 + 21000,
      "a check or transfer counts in the fund total",
    );
  }));

test("a Champion who pays through Givebutter is not counted twice", () =>
  withCampaign(1975 + 21000 + 5000, async () => {
    const env = { ...ENV, ROAD_NAMED: "21000", ROAD_NAMED_ONLINE: "21000" };
    const w = await campaignPosition(env, "wbd");
    assert.equal(w.raised, 4979 + 21000 + 5000);
    assert.equal(w.parts.year.raised, 5200 + 5000);
    assert.equal(w.parts["send-6"].raised, 21000);
    assert.equal((await campaignPosition(env, "fund")).raised, 1975 + 21000 + 5000);
  }));

test("with Givebutter down the bar shows only what we hold ourselves", () =>
  withCampaign(null, async () => {
    const w = await campaignPosition(ENV, "wbd");
    assert.equal(w.raised, 4979);
    assert.equal(
      w.parts.year.raised,
      5200,
      "the club's court time does not depend on Givebutter",
    );
    assert.equal(w.live, false);
  }));

test("pages draw one bar with its parts, and no gift is steered to a fund", () => {
  const camp = JSON.parse(read("public/data/campaigns.json")).campaigns;
  const wbd = camp[0];
  assert.equal(wbd.slug, "wheelie-big-dills");
  assert.equal(wbd.goal, 48180);
  assert.equal(wbd.raised_key, "wbd");
  assert.deepEqual(
    wbd.parts.map((p) => [p.key, p.goal]),
    [
      ["year", 27180],
      ["send-6", 21000],
    ],
  );
  assert.equal(
    wbd.parts.reduce((t, p) => t + p.goal, 0),
    wbd.goal,
  );
  assert.equal(
    camp.find((c) => c.slug === "send-6-us-open").part_of,
    "wheelie-big-dills",
  );

  // The fund page and the crew page draw the goal with the campaign module
  // (scripts/build-module.mjs), one row per part, filled from /api/raised?c=wbd.
  const fund = read("public/hustle-and-heart.html");
  const crew = read("public/pickleball.html");
  for (const html of [fund, crew]) {
    assert.ok(html.includes('<section class="cm" '));
    assert.ok(
      html.includes('data-part-fill="year"') &&
        html.includes('data-part-fill="send-6"'),
    );
    assert.ok(html.includes("window.ATLCampaigns.module();"));
  }
  assert.ok(crew.includes('id="support" data-cm'), "/pickleball#support lands on it");
  const list = crew.slice(crew.indexOf('<ol class="pb-prio pb-cadence">'));
  const order = [
    ">Every week<", // no "First" tag (Alec: never "First priority")
    ">The Road to the US Open<",
    ">The Chicago Classic <",
  ].map((t) => list.indexOf(t));
  assert.ok(
    order[0] >= 0 && order[0] < order[1] && order[1] < order[2],
    "every week, the road, the Classic",
  );

  for (const f of readdirSync(new URL("../public/", import.meta.url)).filter((f) =>
    f.endsWith(".html"),
  ))
    assert.ok(
      !read("public/" + f).includes("fund=73139"),
      `${f} steers a gift to a fund`,
    );
  assert.ok(
    read("public/road.html").includes("every week first, then the road to the US Open"),
  );
});

test("equipment stays out of the goal and the Road, and the chair number is Alec's", () => {
  const s6 = read("public/road.html"),
    fund = read("public/hustle-and-heart.html"),
    crew = read("public/pickleball.html");
  assert.ok(
    !s6.includes("sport chair runs") && !s6.includes("$4,000"),
    "no chair cost on the Road",
  );
  assert.ok(!s6.includes(">Equipment</h3>"));
  assert.ok(fund.includes("$4,000&ndash;$6,000"));
  assert.ok(crew.includes("$4,000 to $6,000, and insurance doesn&rsquo;t cover it"));
  assert.ok(crew.includes("Equipment sits outside the goal."));
  for (const html of [fund, crew, s6]) assert.ok(!html.includes("$5,300"));
});

test("the club's court time: $10 a night for 10 athletes, 52 nights, never named on a page", () => {
  // Alec, Nov 7 2026: the drop in is $15, we pay $5, the club gives $10. "Just
  // keep it average": 10 athletes a week for 52 weeks.
  assert.equal(YEAR_INKIND, 10 * 10 * 52);
  // The /numbers ledger says "a partner club", never the club's name.
  assert.ok(
    read("public/numbers.html").includes(
      '<span class="nb-ledger-k">Court time<small>From a partner club</small></span>',
    ),
  );
  for (const f of [
    "public/js/campaigns.js",
    "src/partials/campaign-module.html",
    "public/ace.html",
    "public/numbers.html",
  ]) {
    const t = read(f);
    assert.ok(!/\$10 (an|a|per) (athlete|person|drop)/i.test(t), f + " names the rate");
    assert.ok(
      !/\$5 (an|a|per) (athlete|person|drop)/i.test(t),
      f + " names what we pay",
    );
  }
});

test("/api/raised?c=wbd hands the court time to the page beside the gifts", async () => {
  const { default: worker } = await import("../src/index.js");
  const real = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ raised: 1975, donors: 23 }), { status: 200 });
  try {
    const res = await worker.fetch(
      new Request("https://adapttolife.org/api/raised?c=wbd"),
      ENV,
      { waitUntil() {} },
    );
    const d = await res.json();
    assert.equal(d.raised, 4979, "gifts only");
    assert.equal(d.inkind, 5200, "court time, apart");
    assert.equal(d.parts.year.inkind, 5200);
  } finally {
    globalThis.fetch = real;
  }
});
