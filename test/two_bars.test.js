import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { campaignPosition, CAMPAIGN_KEYS, YEAR_GOAL, ROAD_GOAL } from "../src/fund.js";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");

// Nov 5 2026 (Alec): "it should be two bars": one for sending people to the US
// Open, one for "the week-to-week, month-to-month, year-round support".
// Both are Givebutter funds inside the one Hustle & Heart Fund campaign.
// Equipment is raised per athlete, so it has no bar.

function withFunds(totals, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const id = String(url).split("/v1/funds/")[1];
    if (!(id in totals)) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ id, raised: totals[id] }), { status: 200 });
  };
  return fn().finally(() => {
    globalThis.fetch = real;
  });
}

const ENV = {
  GIVEBUTTER_API_KEY: "test",
  GIVEBUTTER_FUND_YEAR: "yearFund",
  GIVEBUTTER_FUND_ROAD: "roadFund",
  SEND6_SET_ASIDE: "4979",
};

test("the year-round bar reads its own fund", () =>
  withFunds({ yearFund: 1200, roadFund: 300 }, async () => {
    assert.ok(CAMPAIGN_KEYS.includes("year"));
    const p = await campaignPosition(ENV, "year");
    assert.equal(p.raised, 1200);
    assert.equal(p.goal, YEAR_GOAL);
    assert.equal(YEAR_GOAL, 13500);
    assert.equal(p.live, true);
  }));

test("the Road bar is the Send 6 set-aside plus its own fund, never the year-round money", () =>
  withFunds({ yearFund: 1200, roadFund: 300 }, async () => {
    const p = await campaignPosition(ENV, "send-6");
    assert.equal(p.raised, 4979 + 300);
    assert.equal(p.offline, 4979);
    assert.equal(p.goal, ROAD_GOAL);
  }));

test("with Givebutter down, the Road still shows the set-aside and year-round shows nothing it can't vouch for", () =>
  withFunds({}, async () => {
    assert.equal((await campaignPosition(ENV, "send-6")).raised, 4979);
    const y = await campaignPosition(ENV, "year");
    assert.equal(y.raised, 0);
    assert.equal(y.live, false);
  }));

test("pages show two bars, and gifts on Road pages go to the Road fund", () => {
  const camp = JSON.parse(read("public/data/campaigns.json")).campaigns;
  const year = camp.find((c) => c.slug === "wheelie-big-dills");
  const road = camp.find((c) => c.slug === "send-6-us-open");
  assert.equal(year.goal, 13500);
  assert.equal(year.raised_key, "year");
  assert.equal(road.goal, 21000);
  assert.equal(road.raised_key, "send-6");
  assert.ok(!("part_of" in road), "two separate bars, not one inside the other");

  const fund = read("public/hustle-and-heart.html");
  assert.ok(fund.includes('data-thermo data-goal="13500" data-key="year"'));
  assert.ok(fund.includes('data-thermo data-goal="21000" data-key="send-6"'));
  assert.ok(fund.includes("querySelectorAll('[data-thermo]')"));

  const crew = read("public/pickleball.html");
  assert.ok(crew.includes('data-bar data-key="year" data-goal="13500"'));
  assert.ok(crew.includes('data-bar data-key="send-6" data-goal="21000"'));

  // The widget takes the fund from the page URL only (tested Nov 5), so the
  // Road page adds ?fund=73139 before the widget script runs.
  const s6 = read("public/send-6.html");
  const pre = s6.indexOf("fund=73139");
  const widget = s6.indexOf("widgets.givebutter.com/latest.umd.cjs");
  assert.ok(pre > 0 && pre < widget, "Road preselect runs before the widget");
  const juan = read("public/juan.html");
  assert.equal(juan.match(/href="\/donate\?fund=73139&amp;/g)?.length, 2);
});

test("equipment stays out of the Road campaign, and the chair number is Alec's", () => {
  const s6 = read("public/send-6.html"),
    fund = read("public/hustle-and-heart.html"),
    crew = read("public/pickleball.html");
  assert.ok(
    !s6.includes("sport chair runs") && !s6.includes("$4,000"),
    "no chair cost on the Road",
  );
  assert.ok(!s6.includes(">Equipment</h3>"));
  assert.ok(
    s6.includes("Training and equipment aren&#39;t part of this campaign") ||
      s6.includes("Training and equipment aren't part of this campaign"),
  );
  assert.ok(fund.includes("$4,000&ndash;$6,000"));
  assert.ok(crew.includes("$4,000 to $6,000, and insurance doesn&rsquo;t cover it"));
  for (const html of [fund, crew, s6]) assert.ok(!html.includes("$5,300"));
});
