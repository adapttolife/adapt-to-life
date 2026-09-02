// The volunteer board and its 27 role pages are GENERATED from
// data/volunteer-roles.mjs by scripts/build-volunteer.mjs. These tests guard the
// two ways that arrangement fails.
//
// First, the tree going out of date. The generator lifts the nav and footer from
// a shipped page, so a site-wide nav edit changes what these pages SHOULD say
// without changing what they DO say. `--check` fails the suite instead.
//
// Second, and more important: 27 pages making one set of promises is exactly the
// shape that drifts. The honesty rules at the top of the data file are claims a
// reader could act on, so the ones that can be checked mechanically are checked
// here rather than trusted to review.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { LANES, ROLES, SHARED } from "../data/volunteer-roles.mjs";

const root = new URL("../", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");
const BOARD = read("public/volunteer.html");
const PAGES = new Map(ROLES.map((r) => [r.slug, read(`public/volunteer/${r.slug}.html`)]));
const body = (html) => html.slice(html.indexOf("<main>"), html.indexOf("</main>")).replace(/<!--[\s\S]*?-->/g, "");

// ---- 1. the tree matches the data ---------------------------------------

test("the generated tree is up to date", () => {
  // Regenerates in a scratch check and fails if anything on disk differs.
  execFileSync("node", ["scripts/build-volunteer.mjs", "--check"], {
    cwd: new URL(".", root).pathname, stdio: "pipe",
  });
});

test("every role has a page, and every page has a role", () => {
  for (const r of ROLES) {
    assert.ok(existsSync(new URL(`public/volunteer/${r.slug}.html`, root)), `no page for ${r.slug}`);
  }
});

test("every role card links to its own role page", () => {
  for (const r of ROLES) {
    assert.match(BOARD, new RegExp(`<a class="role-n" href="/volunteer/${r.slug}">`),
      `the board does not link ${r.slug}`);
  }
});

test("the card is no longer a label, so its title can be a link", () => {
  // The first version wrapped each card in a <label> around the checkbox, which
  // swallowed any click inside it. That is why the titles could not be links and
  // why the page shipped with no way out of it. If a label ever wraps a card
  // again, the role pages become unreachable from the board.
  assert.doesNotMatch(BOARD, /<label class="role["\s]/, "a card is wrapped in a label again");
  assert.match(BOARD, /<input class="role-cb"/);
  assert.match(BOARD, /<label class="role-pick" for="pick-/);
});

test("every role page deep-links back to the form with its role selected", () => {
  for (const [slug, html] of PAGES) {
    const r = ROLES.find((x) => x.slug === slug);
    const want = `/volunteer?role=${encodeURIComponent(r.name)}#signup`;
    assert.ok(html.includes(want), `${slug} does not deep-link its apply button`);
  }
});

test("every role page's share card exists on disk", () => {
  for (const [slug, html] of PAGES) {
    const m = html.match(/property="og:image" content="https:\/\/adapttolife\.org([^"]+)"/);
    assert.ok(m, `${slug} has no og:image`);
    assert.ok(existsSync(new URL(`public${m[1]}`, root)),
      `${slug} points at ${m[1]}, which is not in the tree (run npm run cards)`);
  }
});

// ---- 2. the promises hold on all 27 -------------------------------------

const SECTIONS = ["Why this role exists", "What you would own", "Your first month",
  "What helps", "What you do not need", "What this role is not"];

test("every role page carries the full job description", () => {
  for (const [slug, html] of PAGES) {
    for (const s of SECTIONS) assert.ok(html.includes(s), `${slug} is missing "${s}"`);
    assert.match(html, /class="jd-glance"/, `${slug} has no at-a-glance panel`);
    assert.match(html, /class="jd-payoff/, `${slug} has no payoff line`);
  }
});

test("every role page says it is unpaid and creates no employment relationship", () => {
  // A volunteer job description that reads like an employment contract creates
  // ambiguity a 501(c)(3) does not want. The line is written once in SHARED and
  // must reach every page.
  assert.match(SHARED.legal, /unpaid volunteer role and creates no employment relationship/);
  for (const [slug, html] of PAGES) {
    assert.ok(html.includes("creates no employment relationship"), `${slug} is missing the legal line`);
    assert.match(html, /Volunteer, unpaid/, `${slug} does not label itself unpaid`);
  }
});

test("every role page carries the shared culture blocks", () => {
  for (const [slug, html] of PAGES) {
    assert.ok(html.includes(SHARED.how.h), `${slug} is missing "how we work"`);
    assert.ok(html.includes(SHARED.get.h), `${slug} is missing "what you get"`);
    assert.ok(html.includes("hear back either way"), `${slug} drops the one promise the board makes`);
  }
});

test("no role page claims a grant has been made", () => {
  // Adapt To Life has NOT made its first grant. docs/CONTENT.md: a status claim
  // names the stage it is actually at, and founder history is never
  // organizational impact. These phrasings would each assert a track record.
  const banned = [
    /athletes we have funded/i,
    /grants we have (made|awarded)/i,
    /we have funded \d/i,
    /athletes funded so far/i,
  ];
  for (const [slug, html] of PAGES) {
    for (const re of banned) assert.doesNotMatch(body(html), re, `${slug} claims a track record`);
  }
});

test("no role page states a dollar figure", () => {
  // Each number lands once, in the place that proves it. A figure copied into 27
  // pages goes stale 27 times, and the fund's live position belongs in the
  // receipt email where it is read from src/fund.js.
  for (const [slug, html] of PAGES) {
    assert.doesNotMatch(body(html), /\$[\d,]/, `${slug} hardcodes a dollar figure`);
  }
  assert.doesNotMatch(body(BOARD), /\$[\d,]/, "the board hardcodes a dollar figure");
});

test("no em-dash in any generated copy", () => {
  for (const [slug, html] of PAGES) {
    assert.doesNotMatch(body(html), /—|&mdash;/, `em-dash on ${slug}`);
  }
  assert.doesNotMatch(body(BOARD), /—|&mdash;/, "em-dash on the board");
});

test("no role page emits JobPosting structured data", () => {
  // Google's job markup is for paid employment and expects a salary signal.
  // Emitting it for unpaid volunteer roles would surface these in job search
  // results as if they were jobs. The pages read like a posting on purpose; they
  // must not be indexed as one.
  for (const [slug, html] of PAGES) {
    assert.doesNotMatch(html, /JobPosting/, `${slug} emits JobPosting markup`);
  }
});

test("every role names a time cost in both places it appears", () => {
  for (const r of ROLES) {
    assert.ok(r.time && r.time.length > 2, `${r.slug} has no time chip`);
    assert.ok(r.commit && r.commit.length > 10, `${r.slug} has no commitment detail`);
    assert.match(BOARD, new RegExp(`<span class="role-t">${r.time.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</span>`),
      `${r.slug} card does not show its time`);
  }
});

test("the data model is complete and internally consistent", () => {
  const need = ["slug", "lane", "name", "card", "time", "commit", "where", "withWhom",
    "why", "own", "first", "helps", "notNeeded", "isNot", "payoff"];
  const lanes = new Set(LANES.map((l) => l.key));
  const slugs = new Set();
  for (const r of ROLES) {
    for (const k of need) assert.ok(r[k] && r[k].length, `${r.slug} is missing ${k}`);
    assert.ok(lanes.has(r.lane), `${r.slug} is in unknown lane ${r.lane}`);
    assert.ok(!slugs.has(r.slug), `duplicate slug ${r.slug}`);
    slugs.add(r.slug);
    assert.equal(r.slug, r.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
      `${r.slug} does not match its name`);
  }
  for (const l of LANES) {
    assert.ok(ROLES.some((r) => r.lane === l.key), `lane ${l.key} has no roles`);
  }
});
