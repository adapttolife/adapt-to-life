import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");

// Alec, Nov 6 2026: "Option C is awesome. Let's take this moment to see how we
// can update and make the overall website." The campaign module goes
// site-wide, generated from one partial so every page shows the same numbers.
const MARK = /<!-- campaign-module (\{.*?\}) -->/g;
const carriers = () =>
  readdirSync(join(ROOT, "public"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => ({ f, html: read(`public/${f}`) }))
    .filter(({ html }) => html.includes("<!-- campaign-module {"));

test("the module on every page is generated and current", () => {
  execFileSync(process.execPath, ["scripts/build-module.mjs", "--check"], {
    cwd: ROOT,
    stdio: "pipe",
  });
});

test("the module replaces the band on home, donate, promise and roadmap", () => {
  const files = carriers().map((c) => c.f);
  for (const f of ["index.html", "donate.html", "promise.html", "roadmap.html"])
    assert.ok(files.includes(f), `${f} carries the module`);
  for (const { f, html } of carriers()) {
    assert.ok(!html.includes("camp-pending"), `${f} still reserves a band`);
    assert.ok(
      !html.includes("campaign-module.css"),
      `${f} spends a request on the module`,
    );
    assert.ok(/src="\/js\/campaigns\.js\?v=[0-9a-f]+"/.test(html), f);
    assert.ok(/\.module\(\)/.test(html), `${f} never hydrates the module`);
  }
});

test("a different athlete behind the module on every page", () => {
  const seen = new Map();
  for (const { f, html } of carriers()) {
    for (const m of html.matchAll(MARK)) {
      const o = JSON.parse(m[1]);
      assert.ok(["dark", "light"].includes(o.theme), f);
      if (o.athlete === null) continue; // no figure behind it on this page
      assert.ok(
        !seen.has(o.athlete),
        `${f} repeats ${o.athlete} from ${seen.get(o.athlete)}`,
      );
      seen.set(o.athlete, f);
    }
  }
});

test("the module states the goal from campaigns.json and never a $0", () => {
  const wbd = JSON.parse(read("public/data/campaigns.json")).campaigns[0];
  const usd = (n) => "$" + n.toLocaleString("en-US");
  const part = (k) => wbd.parts.find((p) => p.key === k).goal;
  for (const { f, html } of carriers()) {
    const mod = html.slice(
      html.indexOf('<section class="cm"'),
      html.indexOf("<!-- /campaign-module -->"),
    );
    assert.ok(mod.includes(`data-cm-total>${usd(wbd.goal)}<`), f);
    assert.ok(mod.includes(`>${usd(part("year"))} a year<`), f);
    assert.ok(mod.includes(`>${usd(part("send-6"))}<`), f);
    assert.ok(!/>\$0</.test(mod), `${f} prints $0`);
    // The Road's percentage is live only: no stale figure in the markup.
    assert.ok(/data-part-pct="send-6" hidden><\/span>/.test(mod), f);
    assert.ok(mod.includes("EIN 41-3213344"), f);
  }
});

test("every gift line is a verified unit cost", () => {
  const js = read("public/js/campaigns.js");
  // $5 a night at ACE, up to 15 for $75; $960 a year for a membership; about
  // $3,500 for a US Open; monthly lines are the same costs over 12 months.
  assert.equal(5 * 15, 75);
  assert.equal(80 * 12, 960);
  assert.equal(325 * 12, 75 * 52);
  assert.ok(Math.abs(22 * 12 - 5 * 52) <= 5, "$22 a month is about $5 a week");
  for (const line of [
    "$22 a month keeps one athlete on court every week of the year.",
    "$80 a month can keep one athlete training all year.",
    "$325 a month covers a night at ACE every week for up to 15 athletes.",
    "$5 puts one athlete on court for a night.",
    "$75 covers up to 15 athletes for a night at ACE.",
    "$960 can keep one athlete training all year.",
    "$3,500 covers about what one athlete's US Open costs.",
  ])
    assert.ok(js.includes(line), line);
  // The US Open is a lottery: a gift never promises a seat.
  assert.ok(!/send one athlete to the US Open/.test(js));
});

test("the donate page's module points back to the form", () => {
  const html = read("public/donate.html");
  const mod = html.slice(
    html.indexOf('<section class="cm"'),
    html.indexOf("<!-- /campaign-module -->"),
  );
  assert.ok(mod.includes('href="#givePanel" data-give-link>Choose an amount</a>'));
  assert.ok(!mod.includes("data-give>"), "no second picker beside the real form");
  assert.ok(html.includes('id="givePanel"'));
});
