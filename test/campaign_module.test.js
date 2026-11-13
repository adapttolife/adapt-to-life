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
// The header lab (hero-1 ... hero-9) is staging-only copies of the home page,
// module and all, so it is not a page of its own here (as in the other tests).
const carriers = () =>
  readdirSync(join(ROOT, "public"))
    .filter((f) => f.endsWith(".html") && !/^hero-\d/.test(f))
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
    assert.ok(!/>\$0</.test(mod), `${f} prints $0`);
    // Under Donate, only what a donor needs at that moment (Alec, Nov 7): the
    // EIN is in every footer and on /donate, and a donor count belongs on
    // /numbers, where both kinds of supporter can be shown honestly.
    assert.ok(
      mod.includes(
        '<p class="cm-trust"><span>Tax-deductible</span><span>Secure checkout by Givebutter</span></p>',
      ),
      `${f}: the line under Donate`,
    );
    assert.ok(!mod.includes("EIN"), `${f}: the EIN is back in the card`);
    assert.ok(!/donors/i.test(mod), `${f}: a donor count is back in the card`);
    // /numbers shows every bar above its card, so its card leaves them out.
    if (f === "numbers.html") {
      assert.ok(!mod.includes('class="cm-rows"'), "the bars repeat on /numbers");
      continue;
    }
    assert.ok(mod.includes(`>${usd(part("year"))} a year<`), f);
    assert.ok(mod.includes(`>${usd(part("send-6"))}<`), f);
    // The Road's percentage is live only: no stale figure in the markup.
    assert.ok(/data-part-pct="send-6" hidden><\/span>/.test(mod), f);
  }
});

test("every gift line is a verified unit cost", () => {
  const js = read("public/js/campaigns.js");
  // $15 a night at ACE, up to 15 for $225; $129 a month ($1,548 a year) for a membership; about
  // $3,500 for a US Open; a month of nights is four nights.
  assert.equal(15 * 15, 225);
  assert.equal(129 * 12, 1548);
  assert.equal(900, 4 * 225, "$900 a month is four nights at $225");
  assert.equal(60, 4 * 15, "$60 a month is four nights at $15");
  for (const line of [
    "Four nights on court every month for one athlete.",
    "Unlimited sessions every month for one athlete to compete.",
    "Four nights on court every month for up to 15 athletes.",
    "One night on court for one athlete.",
    "Four nights on court for one athlete.",
    "One night on court for up to 15 athletes.",
    "A year of unlimited sessions for one athlete.",
    "About one athlete’s US Open: entry, travel and a room.",
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

// Alec, Nov 12 2026: "No calculator needed to understand anything throughout
// the whole website ... If our audience doesn't understand it, they won't trust
// us. If they don't trust us, they won't donate." No page multiplies dollars
// or converts a price for the reader.
// A unit price beside a count makes the reader multiply: "at $15 each", "at
// about $1,000 each", "at $225 a night". Nov 13 2026 (Alec): the old check,
// / at \$[\d,]+ each/, missed "at about $1,000 each", which sat on /road. A
// simple contrast stays fine: a trip about $1,000, one athlete's US Open
// about $3,500. A price tacked on after a description (", at about $1,000.")
// counts too: the /numbers road note put one beside its count and total.
const UNIT_PRICE =
  /\$[\d,]+(?:\.\d\d)?k?(?:\s|&nbsp;)+(?:each|apiece)\b(?!(?:\s|&nbsp;)+(?:month|year|week|day|time|season)\b)|\bat (?:about |around |roughly |nearly |almost |approximately |just over |just under |under |over )?\$[\d,]+(?:\.\d\d)?k?(?:\s|&nbsp;)+(?:a|an|per) (?:trip|tournament|stop|athlete|player|person|night|session|head|seat)\b|,(?:\s|&nbsp;)+at (?:about |around |roughly |nearly |almost |approximately )?\$[\d,]+(?:\.\d\d)?k?(?=[.;:!?)]|(?:\s|&nbsp;)*<)/i;

test("no page asks the reader to do math", () => {
  const pages = [
    ...readdirSync(new URL("../public/", import.meta.url)).filter(
      (f) => f.endsWith(".html") && !f.startsWith("hero-review"),
    ),
    ...readdirSync(new URL("../public/events/", import.meta.url))
      .filter((f) => f.endsWith(".html"))
      .map((f) => "events/" + f),
    ...readdirSync(new URL("../public/blog/", import.meta.url))
      .filter((f) => f.endsWith(".html"))
      .map((f) => "blog/" + f),
  ];
  for (const f of pages) {
    const html = read("public/" + f);
    assert.ok(!/(&times;|×)\s*(about )?\$/.test(html), `${f} multiplies dollars`);
    assert.ok(!UNIT_PRICE.test(html), `${f} prices per unit ("at about $N each")`);
    assert.ok(
      !/\$129 a month, or \$1,548 a year/.test(html),
      `${f} converts a membership`,
    );
  }
});

test("the unit price guard catches the old /road and /numbers lines, not simple contrasts", () => {
  // This line was live on /road until Nov 13 2026 and passed the old check.
  assert.ok(
    UNIT_PRICE.test(
      "$21,000 for the season: about 21 tournament trips at about $1,000 each.",
    ),
  );
  for (const bad of [
    "ten athletes at $15 each",
    "52 nights at $225 a night",
    "21 trips at about $1,000 a tournament",
    "21 trips at $1,000&nbsp;each",
    // The /numbers road note until Nov 13 2026, beside "about 21 trips" and $21,000.
    "A trip is one athlete at one tournament: entry fees, travel and an accessible room, at about $1,000.",
  ]) {
    assert.ok(UNIT_PRICE.test(bad), bad);
  }
  // Simple contrasts and one amount per idea stay allowed.
  for (const ok of [
    "A tournament trip runs about $1,000 an athlete; one athlete&rsquo;s US Open has cost about $3,500 the last couple of years.",
    "About 21 tournament trips for the crew: $21,000 for the season.",
    "A night on court is $225, for 10 to 15 athletes.",
    "Give $60 each month.",
    "Monthly giving starts at $60 a month.",
    "A trip is one athlete at one tournament: entry fees, travel and an accessible room.",
  ]) {
    assert.ok(!UNIT_PRICE.test(ok), ok);
  }
});

test("the math lives on /numbers, and every module links to it", () => {
  // Alec, Nov 6: "it's powerful to show how we got all of our numbers for our
  // fundraising - brings awareness to the reality of how expensive it is."
  // Then, seeing it inside the module: "Maybe we add a button that takes them
  // to a 'numbers breakdown' page? I feel like it's getting too messy."
  // A practice night is 10 to 15 athletes; at $15 each at ACE, up to 15 is $225.
  const wbd = JSON.parse(read("public/data/campaigns.json")).campaigns[0];
  const usd = (n) => "$" + n.toLocaleString("en-US");
  // A line is arithmetic (qty x unit) or, since Nov 11 2026, a budget: the
  // road is one line, its travel budget for the year, because Alec retired
  // "6 athletes x $3,500" and no per-trip cost is on record.
  const lineTotal = (l) => (l.amount != null ? l.amount : l.qty * l.unit);
  for (const p of wbd.parts) {
    assert.ok(p.math && p.math.length, `${p.key} has no math`);
    assert.equal(
      p.math.reduce((t, l) => t + lineTotal(l), 0),
      p.goal,
      `${p.key}: the lines add up to the goal`,
    );
  }
  // Alec, Nov 12 2026: "Just say 50k. 48,180 is a stupid number. Just round
  // up." A round $50,000: every week and the road come first ($48,180
  // between them), and gifts past them start the Chicago Classic.
  assert.equal(wbd.goal, 50000);
  assert.ok(
    wbd.parts.reduce((t, p) => t + p.goal, 0) <= wbd.goal,
    "the parts come first, inside the goal",
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
      assert.ok(list.includes(`<b>${usd(lineTotal(l))}</b>`), l.label);
      // Alec, Nov 12 2026: "No calculator needed to understand anything
      // throughout the whole website." Every line says what it is in words;
      // qty and unit stay in the data only so the sums above are checked.
      assert.ok(
        l.calc && list.includes(`<span class="nb-calc">${l.calc}</span>`),
        `${l.label} says what it is in words`,
      );
    }
  }
  assert.ok(!list.includes("&times;"), "no multiplication on /numbers");
  assert.ok(
    list.includes(
      `<span>Every week, the road, and the rest toward the Classic</span><b>${usd(wbd.goal)}</b>`,
    ),
  );
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
  // The gift lines on /numbers say what each gift does in words; the test
  // "/donate says what a gift does; /numbers shows how we got it" checks them.

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
  // Alec, Nov 7: "all of this is too messy... Where to look and what to care
  // about". The card keeps the total, two bars, the next goal and the gift:
  // no record tiles (the record lives on the crew section and /pickleball),
  // no gifts-plus-court-time line, and each percentage where its bar ends,
  // never in a badge on the title line.
  for (const { f, html } of carriers()) {
    const mod = html.slice(
      html.indexOf('<section class="cm"'),
      html.indexOf("<!-- /campaign-module -->"),
    );
    assert.ok(!mod.includes("cm-stats"), `${f}: the record tiles are back`);
    assert.ok(!mod.includes("data-cm-split"), `${f}: the gifts line is back`);
    assert.ok(!/cm-badge[^"]*" data-part-pct/.test(mod), `${f}: a percentage badge`);
    // Alec, Nov 7: a short description for each part; the Chicago Classic
    // joins the card when it starts; one fill per bar (the split, with its
    // key, is on /numbers).
    assert.ok(
      !mod.includes("Chicago Classic"),
      `${f}: the Classic is back in the card`,
    );
    assert.ok(!mod.includes("data-part-kind"), `${f}: the court-time stripe is back`);
    assert.ok(!mod.includes("got it started"), `${f}: the long note is back`);
    if (f === "numbers.html") continue;
    // Nov 11 2026: the notes say the crew's scale (10 to 15 athletes a night),
    // so "10 athletes" stops reading as the size of the crew, and the road is
    // a season of tournament travel, never six athletes.
    assert.ok(
      mod.includes(
        '<p class="cm-note">A year of court time for 10 to 15 athletes a night, plus memberships for 10.</p>',
      ),
      f,
    );
    assert.ok(
      mod.includes(
        '<p class="cm-note">A season of tournament travel for the crew, through the 2027 US Open. <a href="/road">See the road</a></p>',
      ),
      f,
    );
    for (const k of ["year", "send-6"])
      assert.ok(
        new RegExp(
          `</div><span class="cm-pct" data-part-pct="${k}" hidden></span></div>`,
        ).test(mod),
        `${f}: the ${k} percentage ends its bar`,
      );
  }
});

// Alec, Nov 7 2026: "don't say first priority". Alec, Nov 11 2026: retire
// "sending six people to the U.S. Open"; the road is the crew's tournaments
// through the year, so it has no seats, no head count and no price per head.
// /numbers reads as one route, and the road's stops are the season's
// tournaments, the US Open last.
test("no First priority, no six seats, and the numbers as a route", () => {
  const data = JSON.parse(read("public/data/campaigns.json"));
  const road = data.campaigns
    .find((c) => c.slug === "wheelie-big-dills")
    .parts.find((p) => p.key === "send-6");
  assert.equal(road.seats, undefined, "the road has no seats");
  for (const l of road.math)
    assert.ok(
      !("qty" in l && /athlete/.test(l.of || "")),
      "the road is not athletes x a price",
    );
  const stops = road.stops;
  assert.ok(Array.isArray(stops) && stops.length >= 2, "the road lists its stops");
  const last = stops.at(-1);
  assert.equal(last.name, "The US Open", "the US Open is the last stop");
  assert.ok(last.finish);
  for (const st of stops.filter((x) => typeof x === "string")) {
    const d = data.drives.find((x) => x.slug === st);
    assert.ok(
      d && d.relationship === "we_compete",
      `${st} is a tournament the crew played`,
    );
  }
  const pages = readdirSync(join(ROOT, "public")).filter(
    // the concept labs and hero labs are review-only, as in the other page tests
    (x) =>
      x.endsWith(".html") && !/^(hero-|campaign-concepts|review|photo-picks)/.test(x),
  );
  const RETIRED = [
    /six seats/i,
    /one seat each/i,
    /first seat/i,
    /first of six/i,
    /send six/i,
    /Send 6/,
    /six athletes on the road/i,
    /six athletes, about \$3,500/i,
    /6 athletes &times;/,
    /campaign-seats/,
    /seats\/faces\.webp/,
  ];
  for (const f of pages) {
    const html = read(`public/${f}`);
    assert.ok(!html.includes("First priority"), `${f} says First priority`);
    for (const re of RETIRED)
      assert.ok(!re.test(html), `${f} still carries the retired six story: ${re}`);
  }
  const road6 = read("public/road.html");
  const list = road6.slice(
    road6.indexOf("<!-- campaign-stops -->"),
    road6.indexOf("<!-- /campaign-stops -->"),
  );
  assert.ok(list.includes(">The US Open<"), "the road page lists the stops");
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

// /numbers says who gave, honestly: Givebutter's online donors (live) and the
// popcorn drive's supporters (campaigns.json), side by side, never summed.
test("/numbers names who gave, without counting anyone twice", () => {
  const data = JSON.parse(read("public/data/campaigns.json"));
  const popcorn = data.drives.find((d) => d.slug === "popcorn-2026-08");
  assert.equal(popcorn.supporters, 83);
  const nums = read("public/numbers.html");
  assert.ok(
    nums.includes(
      '<span class="nb-ledger-k">Gifts<small class="nb-people" data-nb-people hidden>From <span data-nb-donors></span> online and 83 popcorn supporters</small></span>',
    ),
    "who gave sits under the gifts line",
  );
  assert.ok(read("public/js/campaigns.js").includes('"[data-nb-people]"'));
});

// Alec, Nov 7 2026, on the finish card's old legend: "This looks horrible. We
// can do better." Under the bar now: one ledger in the bar's order (court time,
// then gifts), each with a swatch of its segment, then so far and to go under a
// rule, every amount in one right-hand column.
test("/numbers: the finish card's ledger adds up top to bottom", () => {
  const nums = read("public/numbers.html");
  const a = nums.indexOf('<ul class="nb-ledger">');
  const ledger = nums.slice(a, nums.indexOf("</ul>", a));
  assert.ok(a > 0, "the ledger is there");
  const order = ["kind", "gifts", "so", "left"].map((k) =>
    ledger.indexOf(`data-nb-sum="${k}"`),
  );
  assert.ok(
    order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])),
    "bar order, then the sums",
  );
  assert.ok(
    ledger.includes(
      '<i class="nb-swatch nb-swatch--kind" aria-hidden="true"></i><span class="nb-ledger-k">Court time<small>From a partner club</small></span>',
    ),
  );
  assert.ok(ledger.includes('<span class="nb-ledger-k">So far</span>'));
  assert.ok(ledger.includes('<span class="nb-ledger-k">To go</span>'));
  assert.ok(!/nb-legend|nb-key/.test(nums), "the old legend and its chips are gone");
  const js = read("public/js/campaigns.js");
  assert.ok(!/nb-legend|function key\(/.test(js));
  assert.ok(js.includes("left: Math.max(0, goal - gifts - kind)"));
  assert.ok(js.includes("so: gifts + kind"));
});

// Alec, Nov 7 2026: /donate and /numbers complement each other. /donate says
// what each gift does, in the picker's own words; /numbers shows how we got
// each amount. Same amounts on both, Monthly first, and every product adds up.
test("/donate says what a gift does; /numbers shows how we got it", () => {
  const js = read("public/js/campaigns.js");
  const picker = (freq) => {
    const block = js.slice(
      js.indexOf(`${freq}: [`),
      js.indexOf("]", js.indexOf(`${freq}: [`)),
    );
    return [...block.matchAll(/a: (\d+),\s*t: "([^"]+)"/g)].map((m) => ({
      a: +m[1],
      t: m[2],
    }));
  };
  const monthly = picker("monthly");
  const once = picker("once");
  assert.deepEqual(
    monthly.map((g) => g.a),
    [60, 129, 900],
  );
  assert.deepEqual(
    once.map((g) => g.a),
    // Nov 12 2026: about $1,000 is one athlete's tournament trip (Alec).
    [15, 60, 225, 1000, 1548, 3500],
  );
  const money = (n) => "$" + n.toLocaleString("en-US");
  const plain = (h) =>
    h
      .replace(/<[^>]+>/g, "")
      .replace(/&rsquo;/g, "’")
      .replace(/&times;/g, "×")
      .replace(/&nbsp;/g, " ");

  // /donate: two lists, Monthly then One time, each line the picker's line.
  const don = read("public/donate.html");
  const impact = don.slice(
    don.indexOf('id="impact"'),
    don.indexOf("</section>", don.indexOf('id="impact"')),
  );
  assert.ok(
    impact.indexOf(">Monthly<") < impact.indexOf(">One time<"),
    "Monthly first",
  );
  const lines = [
    ...impact.matchAll(
      /<li><b>(\$[\d,]+)<small>(a month|one time)<\/small><\/b><span>(.*?)<\/span><\/li>/g,
    ),
  ].map((m) => ({ amount: m[1], often: m[2], line: plain(m[3]) }));
  assert.deepEqual(
    lines.map((l) => l.line),
    [...monthly, ...once].map((g) => g.t),
    "/donate's lines are the picker's",
  );
  assert.deepEqual(
    lines.map((l) => l.amount),
    [...monthly, ...once].map((g) => money(g.a)),
  );
  assert.deepEqual(
    lines.map((l) => l.often),
    [...monthly.map(() => "a month"), ...once.map(() => "one time")],
  );
  // Alec, Nov 7: each line says what the gift buys, how often and for whom,
  // and never repeats the amount the button already shows.
  for (const g of [...monthly, ...once])
    assert.ok(!/\$/.test(g.t.split(" at ")[0]), g.t);
  for (const g of monthly) assert.ok(g.t.includes("every month"), g.t);
  assert.ok(impact.includes('href="/numbers#gifts"'), "/donate hands off to the math");
  assert.ok(!impact.includes("$4,000"), "the chair is a way to give, not a gift line");

  // /numbers: the same amounts in the same order, each with what it does in
  // words (Nov 12 2026: no calculator needed anywhere on the site).
  const nums = read("public/numbers.html");
  const gifts = nums.slice(
    nums.indexOf('id="gifts"'),
    nums.indexOf("</section>", nums.indexOf('id="gifts"')),
  );
  const rows = [
    ...gifts.matchAll(
      /<li><b>(\$[\d,]+)<small>(a month|one time)<\/small><\/b><span class="nb-gift-calc">(.*?)<\/span>/g,
    ),
  ].map((m) => ({ amount: m[1], often: m[2], calc: plain(m[3]) }));
  assert.deepEqual(
    rows.map((r) => r.amount),
    [...monthly, ...once].map((g) => money(g.a)),
  );
  // Every amount says how often (Alec, Nov 7: "Should it say monthly?"), and a
  // monthly line's arithmetic says "a month" too.
  assert.deepEqual(
    rows.map((r) => r.often),
    [...monthly.map(() => "a month"), ...once.map(() => "one time")],
  );
  for (const { amount, often, calc } of rows) {
    if (often === "a month")
      assert.ok(calc.includes("a month"), `${calc} says a month`);
    assert.ok(
      !calc.includes("×") && !/\$/.test(calc),
      `${amount}: "${calc}" needs no math`,
    );
  }
  const whats = [...gifts.matchAll(/<span class="nb-gift-what">(.*?)<\/span>/g)].map(
    (m) => plain(m[1]),
  );
  assert.deepEqual(
    whats,
    [...monthly, ...once].map((g) => g.t),
    "/numbers says the same line",
  );
  assert.ok(gifts.includes('href="/donate"'), "/numbers hands back to the donate page");
});
