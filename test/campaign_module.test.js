import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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
  // $15 a night at ACE, up to 15 for $225; $129 a month ($1,548 a year) for a membership; about
  // $3,500 for a US Open; monthly lines are the same costs over 12 months.
  assert.equal(15 * 15, 225);
  assert.equal(129 * 12, 1548);
  assert.equal(975 * 12, 225 * 52);
  assert.equal(65 * 12, 15 * 52, "$65 a month is exactly $15 a week");
  for (const line of [
    "$65 a month: one athlete at $15 a night, every week.",
    "$129 a month: unlimited sessions for one athlete to compete.",
    "$975 a month: up to 15 athletes at $15 a night, every week.",
    "$15 puts one athlete on court for a night.",
    "$225 covers up to 15 athletes for a night at ACE.",
    "$1,548 covers a year of unlimited sessions for one athlete.",
    "$3,500 covers about what one athlete’s US Open costs.",
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

test("the math lives on /numbers, and every module links to it", () => {
  // Alec, Nov 6: "it's powerful to show how we got all of our numbers for our
  // fundraising - brings awareness to the reality of how expensive it is."
  // Then, seeing it inside the module: "Maybe we add a button that takes them
  // to a 'numbers breakdown' page? I feel like it's getting too messy."
  // A practice night is 10 to 15 athletes; at $15 each at ACE, up to 15 is $225.
  const wbd = JSON.parse(read("public/data/campaigns.json")).campaigns[0];
  const usd = (n) => "$" + n.toLocaleString("en-US");
  for (const p of wbd.parts) {
    assert.ok(p.math && p.math.length, `${p.key} has no math`);
    assert.equal(
      p.math.reduce((t, l) => t + l.qty * l.unit, 0),
      p.goal,
      `${p.key}: the lines add up to the goal`,
    );
  }
  assert.equal(
    wbd.parts.reduce((t, p) => t + p.goal, 0),
    wbd.goal,
  );
  const year = wbd.parts.find((p) => p.key === "year").math;
  assert.deepEqual(
    year.map((l) => [l.qty, l.unit]),
    [
      [52, 225],
      [10, 1548],
    ],
    "every week: 52 nights at $225, ten memberships at $1,548",
  );
  assert.equal(225, 15 * 15, "$225 is up to 15 athletes at $15 each");
  assert.ok(/10 to 15 athletes/.test(year[0].note));

  // The breakdown page: generated from the same data, in the sitemap.
  const nb = read("public/numbers.html");
  const list = nb.slice(
    nb.indexOf("<!-- campaign-numbers -->"),
    nb.indexOf("<!-- /campaign-numbers -->"),
  );
  for (const p of wbd.parts) {
    assert.ok(list.includes(`<h3>${p.label}</h3>`), p.label);
    for (const l of p.math) {
      assert.ok(list.includes(`<b>${usd(l.qty * l.unit)}</b>`), l.label);
      assert.ok(
        list.includes(
          `${l.qty} ${l.of} &times; ${l.about ? "about " : ""}${usd(l.unit)}`,
        ),
        `${l.label} shows its multiplication`,
      );
    }
  }
  assert.ok(list.includes(`<span>Every week + the road</span><b>${usd(wbd.goal)}</b>`));
  assert.ok(nb.includes(`>${usd(wbd.goal)}, <em`), "the heading states the goal");
  assert.ok(
    list.includes("The US Open picks players by lottery, so nothing is guaranteed."),
  );
  assert.ok(
    nb.includes("$4,000 to $6,000") && nb.includes("Insurance doesn&rsquo;t cover"),
  );
  assert.ok(
    read("public/sitemap.xml").includes("<loc>https://adapttolife.org/numbers</loc>"),
  );
  // Every gift line on the page is the picker's line, word for word.
  const js = read("public/js/campaigns.js");
  for (const m of nb.matchAll(/<li><b>(\$[\d,]+)<\/b><span>([^<]+)<\/span><\/li>/g)) {
    const line = `${m[1]} ${m[2]}`
      .replace(/&rsquo;/g, "’")
      .replace(/&nbsp;/g, "\u00a0");
    assert.ok(js.includes(line), `gift line not in the picker: ${line}`);
  }

  // The module stays clean: no receipt, one button to the breakdown.
  for (const { f, html } of carriers()) {
    const mod = html.slice(
      html.indexOf('<section class="cm"'),
      html.indexOf("<!-- /campaign-module -->"),
    );
    assert.ok(!mod.includes("cm-math"), `${f}: the receipt is back in the module`);
    if (f === "numbers.html")
      assert.ok(!mod.includes('href="/numbers"'), "no button to the page you are on");
    else
      assert.ok(
        mod.includes('<a class="cm-more" href="/numbers">See the numbers breakdown'),
        `${f}: no button to the breakdown`,
      );
    assert.ok(mod.includes("maybe the country"), `${f}: the ambition`);
  }
  // The record tiles carry the practice-night size where they appear, marked
  // blue as court time (the money tile green, the wins yellow).
  const home = read("public/index.html");
  assert.ok(
    home.includes(
      '<li class="is-court"><b>10&ndash;15</b><span><i class="sym sym--courts" aria-hidden="true"></i>athletes, every week</span></li>',
    ),
  );
  assert.ok(home.includes('<li class="is-gift"><b>$3,004</b>'));
  // Every record tile names its kind with a symbol, so colour never works alone.
  const stats = home.slice(
    home.indexOf('<ul class="cm-stats"'),
    home.indexOf("</ul>", home.indexOf('<ul class="cm-stats"')),
  );
  assert.equal((stats.match(/<li\b/g) || []).length, 6);
  assert.equal((stats.match(/class="sym sym--/g) || []).length, 6);
});

// Alec, Nov 7 2026: "don't say first priority"; the six seats are the six on
// the crew page, by name and photo; /numbers reads as one route.
test("no First priority, six named seats, and the numbers as a route", () => {
  const data = JSON.parse(read("public/data/campaigns.json"));
  const road = data.campaigns
    .find((c) => c.slug === "wheelie-big-dills")
    .parts.find((p) => p.key === "send-6");
  const names = road.seats.map((s) => s.name);
  assert.deepEqual(names, ["Juan", "Brian", "Bob", "Robby", "Ken", "Amanda"]);
  const crew = read("public/pickleball.html");
  for (const s of road.seats) {
    assert.ok(crew.includes(`<h3>${s.name}</h3>`), `${s.name} is on the crew page`);
    assert.ok(
      existsSync(join(ROOT, `public/images/pickleball/seats/${s.slug}.webp`)),
      `${s.name} has a seat picture`,
    );
  }
  assert.ok(existsSync(join(ROOT, "public/images/pickleball/seats/faces.webp")));
  const road6 = read("public/send-6.html");
  const tiles = road6.slice(
    road6.indexOf("<!-- campaign-seats -->"),
    road6.indexOf("<!-- /campaign-seats -->"),
  );
  assert.equal((tiles.match(/class="s6-seat"/g) || []).length, 6);
  for (const n of names) assert.ok(tiles.includes(`>${n}<`), `${n} names a seat`);
  assert.ok(!road6.includes("Seat 2"), "no anonymous seats");
  for (const f of readdirSync(join(ROOT, "public")).filter(
    // the concept labs and hero labs are review-only, as in the other page tests
    (x) =>
      x.endsWith(".html") && !/^(hero-|campaign-concepts|review|photo-picks)/.test(x),
  ))
    assert.ok(
      !read(`public/${f}`).includes("First priority"),
      `${f} says First priority`,
    );
  const home = read("public/index.html");
  assert.ok(
    home.includes(
      `aria-label="The six seats: Juan, Brian, Bob, Robby, Ken and Amanda"`,
    ),
  );
  const nums = read("public/numbers.html");
  const route = nums.slice(
    nums.indexOf('<ol class="nb-route"'),
    nums.indexOf("</ol>", nums.indexOf('<ol class="nb-route"')),
  );
  const order = [...route.matchAll(/<li class="nb-stop([^"]*)"/g)].map((m) =>
    m[1].trim(),
  );
  assert.deepEqual(order, ["nb-stop--now", "", "nb-stop--finish", "nb-stop--next"]);
});

// The Donate link a page ships with (before the picker runs, or without
// script) starts at the picker's own default, so no stale amount survives.
// It was $80, left from the old $5-based buttons (Nov 7, 2026).
test("the Donate link starts at the picker's default amount", () => {
  const js = read("public/js/campaigns.js");
  const def = Number(js.match(/GIFT_DEFAULT = \{ monthly: (\d+)/)[1]);
  assert.ok(
    new RegExp(`\\{\\s*a: ${def},\\s*t: "`).test(js),
    "the default is one of the buttons",
  );
  for (const { f, html } of carriers()) {
    for (const m of html.matchAll(/href="\/donate\?amount=(\d+)[^"]*" data-give-link/g))
      assert.equal(Number(m[1]), def, `${f}: the Donate link starts at $${m[1]}`);
  }
  const email = read("src/newsletter-series.js");
  for (const m of email.matchAll(/\/donate\?amount=(\d+)/g))
    assert.equal(Number(m[1]), def, `an email asks for $${m[1]}`);
});
