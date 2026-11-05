import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  campaignPosition,
  CAMPAIGN_KEYS,
  YEAR_GOAL,
  ROAD_GOAL,
  WBD_GOAL,
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
      : new Response(JSON.stringify({ raised: online }), { status: 200 });
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
  assert.equal(YEAR_GOAL, 13500);
  assert.equal(ROAD_GOAL, 21000);
  assert.equal(WBD_GOAL, 34500);
});

test("today: nothing new yet, so every week is empty and the road holds the Send 6 money", () =>
  withCampaign(1975, async () => {
    const w = await campaignPosition(ENV, "wbd");
    assert.equal(w.raised, 4979);
    assert.equal(w.goal, 34500);
    assert.equal(w.parts.year.raised, 0);
    assert.equal(w.parts["send-6"].raised, 4979);
  }));

test("new gifts fill every week first", () =>
  withCampaign(1975 + 5000, async () => {
    const w = await campaignPosition(ENV, "wbd");
    assert.equal(w.raised, 4979 + 5000);
    assert.equal(w.parts.year.raised, 5000);
    assert.equal(w.parts["send-6"].raised, 4979);
    assert.equal((await campaignPosition(ENV, "year")).raised, 5000);
  }));

test("once every week is funded, gifts move to the road", () =>
  withCampaign(1975 + 20000, async () => {
    const w = await campaignPosition(ENV, "wbd");
    assert.equal(w.parts.year.raised, 13500);
    assert.equal(w.parts["send-6"].raised, 4979 + 6500);
    assert.equal((await campaignPosition(ENV, "send-6")).raised, 4979 + 6500);
  }));

test("with Givebutter down the bar shows only what we hold ourselves", () =>
  withCampaign(null, async () => {
    const w = await campaignPosition(ENV, "wbd");
    assert.equal(w.raised, 4979);
    assert.equal(w.parts.year.raised, 0);
    assert.equal(w.live, false);
  }));

test("pages draw one bar with its parts, and no gift is steered to a fund", () => {
  const camp = JSON.parse(read("public/data/campaigns.json")).campaigns;
  const wbd = camp[0];
  assert.equal(wbd.slug, "wheelie-big-dills");
  assert.equal(wbd.goal, 34500);
  assert.equal(wbd.raised_key, "wbd");
  assert.deepEqual(
    wbd.parts.map((p) => [p.key, p.goal]),
    [
      ["year", 13500],
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

  const fund = read("public/hustle-and-heart.html");
  assert.ok(fund.includes('data-thermo data-goal="34500" data-key="wbd"'));
  assert.ok(
    fund.includes('data-seg-fill="year"') && fund.includes('data-seg-fill="send-6"'),
  );
  const crew = read("public/pickleball.html");
  assert.ok(crew.includes('data-goal-box data-key="wbd"'));
  const list = crew.slice(crew.indexOf('<ol class="pb-prio pb-cadence">'));
  const order = [
    ">Every week <",
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
    read("public/send-6.html").includes(
      "every week first, then the road to the US Open",
    ),
  );
});

test("equipment stays out of the goal and the Road, and the chair number is Alec's", () => {
  const s6 = read("public/send-6.html"),
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
