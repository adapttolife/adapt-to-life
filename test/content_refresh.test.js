import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLES, SHARED } from "../data/volunteer-roles.mjs";

const read = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const core = [
  "index",
  "about",
  "adaptive-sports-near-me",
  "apply",
  "contact",
  "donate",
  "hustle-and-heart",
  "karen",
  "promise",
  "roadmap",
  "sponsorship",
  "subscribe",
  "tim",
  "volunteer",
  "road",
  "popcorn",
];
const pages = [
  ...core.map((p) => `public/${p}.html`),
  ...ROLES.map((r) => `public/volunteer/${r.slug}.html`),
];

test("every reviewed page uses current shared navigation and the funding order", () => {
  assert.equal(pages.length, 42);
  for (const file of pages) {
    const html = read(file);
    assert.ok(
      !/equipment, travel,? and training|equipment, travel, training/i.test(html),
      file,
    );
    assert.ok(
      !html.includes("A free national directory of adaptive programs, opening soon"),
      file,
    );
    assert.ok(html.includes(">Photo and media release</a>"), file);
    assert.ok(html.includes(">How Giving Works<"), file);
    assert.ok(html.includes(">Apply for support<"), file);
  }
});

test("homepage tells participation story without the two-program comparison panel", () => {
  const html = read("public/index.html");
  assert.ok(html.includes('id="participation"'));
  assert.ok(html.includes("A chance to play should not come down to luck."));
  // The campaign module (scripts/build-module.mjs) follows the participation
  // story and comes before the next step.
  assert.ok(html.indexOf('id="participation"') < html.indexOf('id="campaign"'));
  assert.ok(html.indexOf('id="campaign"') < html.indexOf('id="next-step"'));
  assert.ok(!html.includes('id="homeResult"'));
  assert.ok(html.includes("C.module();"));
  const welcome = html.split('class="mw-mission')[1].split("</p>")[0];
  assert.ok(
    !welcome.includes("<a "),
    "mission does not branch into audience selection",
  );
  for (const target of ["/adaptive-sports-near-me", "/donate", "/volunteer"]) {
    assert.ok(
      html.split("<main")[0].includes(`href="${target}"`),
      "utility route stays in navigation",
    );
  }
  assert.ok(!html.includes('class="home-actions'));
  const closing = html
    .split('class="wrap center rb-copy rb-bottom"')[1]
    .split("</section>")[0];
  assert.equal((closing.match(/class="btn/g) || []).length, 1);
  assert.ok(closing.includes('href="/volunteer" class="textlink"'));
  const quote =
    "I got into this because someone handed me a brochure when I was six. Now it&rsquo;s our turn to be that for the next athlete.";
  assert.equal(html.split(quote).length, 2, "original founder quote appears once");
  assert.ok(html.includes("Help the next athlete find their place."));
  assert.ok(html.includes("We build more ways into adaptive sports."));
  assert.ok(html.includes("What we build will keep evolving with the community."));
  // The mission may carry emphasis tags; the words are what is guarded.
  assert.ok(
    html.replace(/<\/?b>/g, "").includes(
      "We expand access to adaptive sports so athletes can find their place.",
    ),
  );
  assert.ok(html.includes("Our upcoming store,"));
  assert.ok(!html.includes('class="fronts'));
  assert.ok(!html.includes("Two of them today"));
});

test("fund categories follow equipment, training, travel without unsupported price ranges", () => {
  const html = read("public/hustle-and-heart.html");
  const positions = ["Equipment", "Training", "Travel"].map((x) =>
    html.indexOf(`>${x}</h3>`),
  );
  assert.ok(positions.every((x) => x >= 0));
  assert.ok(positions[0] < positions[1] && positions[1] < positions[2]);
  assert.ok(!html.includes("$200&ndash;$8,000"));
});

test("campaign owns its target, and popcorn links instead of duplicating a budget", () => {
  // Nov 11 2026: the road is a season of tournament travel, about 21 trips
  // (Alec's number), never six athletes at $3,500. Nov 13 2026 (Alec): no
  // price per trip beside the count, so the reader never does the math.
  const campaign = read("public/road.html");
  assert.ok(
    campaign.includes(
      "About 21 tournament trips for the crew: $21,000 for the season.",
    ),
  );
  assert.ok(!campaign.includes("at about $1,000 each"));
  assert.ok(campaign.includes("Individual needs and costs will vary."));
  assert.ok(!/about \$(450|500|2,300)/.test(campaign));
  const popcorn = read("public/popcorn.html");
  assert.ok(popcorn.includes('href="/road">The Road to the US Open</a>'));
  assert.ok(!popcorn.includes("Send 6"), "the retired name is gone from the popcorn page");
  assert.ok(!popcorn.includes('class="s6-cost-n"'));
  assert.ok(!popcorn.includes("roughly five hundred"));
  assert.ok(popcorn.includes("50% of popcorn sales"));
});

test("volunteer interest is not automatic placement and the shared mission sentence is correct", () => {
  assert.ok(SHARED.apply.includes("We'll talk through the work"));
  assert.ok(SHARED.apply.includes("before you begin"));
  assert.ok(!SHARED.apply.includes("You're on the team"));
  assert.ok(SHARED.apply.includes("screening or credentials"));
  assert.ok(!SHARED.about.includes("keep athletes on the sidelines"));
  assert.ok(!SHARED.apply.includes("No interview"));
});

test("the removed staging banner cannot return through injected chrome", () => {
  const worker = read("src/staging.js");
  assert.ok(!worker.includes("staging-notice"));
  assert.ok(!worker.includes("CONTENT STAGING"));
  assert.ok(!worker.includes("padding-bottom:76px"));
  assert.ok(!worker.includes("stopImmediatePropagation"));
  assert.ok(!worker.includes("data-staging-disabled"));
});

test("share checks fetch the declared image URL rather than hiding a wrong host", () => {
  const checker = read("scripts/check-site.mjs");
  assert.ok(checker.includes("const r = await get(src);"));
  assert.ok(!checker.includes("get(`${BASE}${asset}?cb="));
});
