#!/usr/bin/env node
// scripts/build-module.mjs — stamp the campaign module into every page that
// carries it.
//
//   node scripts/build-module.mjs          write the pages
//   node scripts/build-module.mjs --check  fail if any page is out of date
//
// Alec, Nov 6 2026, on the module: "Option C is awesome... let's make sure the
// rest of the website is the best it can be." One module, the same numbers on
// every page, so it is generated rather than pasted: a pasted copy is a copy
// somebody forgets to update. A page opts in with a marker pair, and
// everything between the two markers belongs to this script:
//
//   <!-- campaign-module {"id":"campaign","theme":"dark","athlete":"brian"} -->
//   <!-- /campaign-module -->
//
// Options:
//   id       the section id (the heading gets id-title). Required.
//   theme    "dark" (L1, slate and teal) or "light" (L3, beige). Required.
//   athlete  the faded figure behind the module, a file in
//            public/images/pickleball/ghost/<athlete>-gray.webp. Required.
//            A different athlete per page (test/campaign_module.test.js);
//            null for none.
//   give     false drops the monthly/one-time picker (the donate page has the
//            real form right there). Default true.
//   cta      {"href","label"} for the button. Default: Donate, carrying the
//            picker's default gift into the Givebutter form.
//   numbers  false drops the "See the numbers breakdown" button (on /numbers,
//            which is the breakdown). Default true.
//   rows     false drops the two progress bars, leaving the total and the
//            gift (on /numbers, where the page above already shows every bar).
//            Default true.
//   mirror   false keeps the figure the way it was photographed on a desktop,
//            where the others are flipped to face the page. For a photo with
//            lettering (Ryan's shirt and cap), which would read backwards.
//            Default true.
//
// The markup is src/partials/campaign-module.html, the look is the campaign
// module section of src/css/site.css and the live numbers come from
// public/js/campaigns.js (module()), which reads /api/raised?c=wbd.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { smarten } from "./smart-quotes.mjs";
import { icon } from "./lib/icons.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const PARTIAL = readFileSync(
  join(ROOT, "src/partials/campaign-module.html"),
  "utf8",
).trimEnd();
const GHOST = join(PUB, "images/pickleball/ghost");
const MARKER =
  /([ \t]*)<!-- campaign-module (\{.*?\}) -->\n[\s\S]*?<!-- \/campaign-module -->/g;

// Width and height from the WebP header, so the img reserves its box without
// a hand-kept table of sizes.
export function webpSize(file) {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP")
    throw new Error(`${file} is not a WebP`);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === "VP8 ")
    return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
  }
  throw new Error(`${file}: unknown WebP chunk ${chunk}`);
}

// The numbers come from public/data/campaigns.json, the same file the rest of
// the site reads, and so does the arithmetic behind them (Alec, Nov 6: "it's
// powerful to show how we got all of our numbers... brings awareness to the
// reality of how expensive it is"). The build refuses math that does not add
// up to the goal it explains.
const CAMPAIGN = JSON.parse(
  readFileSync(join(PUB, "data/campaigns.json"), "utf8"),
).campaigns.find((c) => c.slug === "wheelie-big-dills");
const usd = (n) => "$" + Number(n).toLocaleString("en-US");
{
  if (!CAMPAIGN) throw new Error("campaigns.json has no wheelie-big-dills campaign");
  let sum = 0;
  for (const p of CAMPAIGN.parts) {
    const math = (p.math || []).reduce((t, l) => t + l.qty * l.unit, 0);
    if (math !== p.goal)
      throw new Error(
        `campaigns.json: ${p.key} math adds to ${usd(math)}, goal is ${usd(p.goal)}`,
      );
    sum += p.goal;
  }
  if (sum !== CAMPAIGN.goal)
    throw new Error(
      `campaigns.json: parts add to ${usd(sum)}, goal is ${usd(CAMPAIGN.goal)}`,
    );
}

// THE NUMBERS BREAKDOWN (/numbers). Alec, Nov 6: the receipt inside the module
// was "getting too messy", so the module carries one button and the full math
// lives on its own page, rendered from the same campaigns.json: each part, the
// arithmetic behind it (how many, times what, where the unit cost comes from),
// the next goal and the total. A page opts in with
//   <!-- campaign-numbers --> ... <!-- /campaign-numbers -->
const NUMBERS =
  /([ \t]*)<!-- campaign-numbers -->\n[\s\S]*?<!-- \/campaign-numbers -->/g;
// The road's seat tiles (/send-6) opt in the same way:
//   <!-- campaign-seats --> ... <!-- /campaign-seats -->
const SEAT_TILES =
  /([ \t]*)<!-- campaign-seats -->\n[\s\S]*?<!-- \/campaign-seats -->/g;

function mathLines(part) {
  return (part.math || [])
    .map(
      (l) =>
        `      <li><span class="nb-k">${esc(l.label)}</span>` +
        `<span class="nb-calc">${l.qty} ${esc(l.of)} &times; ${l.about ? "about " : ""}${usd(l.unit)}</span>` +
        `<b>${usd(l.qty * l.unit)}</b>` +
        (l.note ? `<small>${l.note}</small>` : "") +
        "</li>",
    )
    .join("\n");
}

// Each part wears the symbol of the cost it pays for, the same three the
// fund's cost cards use (data/icons.mjs): every week is training, the road is
// travel, the Classic is a tournament.
const PART_SYMBOL = { year: "training", "send-6": "travel", next: "tournament" };
const flag = `<i class="sym sym--finished nb-flag" aria-hidden="true"></i>`;
// The road's six seats are six athletes from the crew page (Alec, Nov 7:
// "it's the same as the six on meet the wheelie big dills crew page"), named
// in campaigns.json and pictured by scripts/build-seats.mjs. The road is one
// pool, so a seat never shows as paid before the others: all six rise together.
const ROAD = CAMPAIGN.parts.find((p) => p.key === "send-6");
// Who gave, for /numbers: the drives that count their supporters (Double
// Good does). Givebutter's online donors arrive live; the two stay apart.
const DRIVES = JSON.parse(
  readFileSync(join(PUB, "data/campaigns.json"), "utf8"),
).drives;
const COUNTED = DRIVES.filter((d) => typeof d.supporters === "number");
const SUPPORTERS = COUNTED.reduce((n, d) => n + d.supporters, 0);
const SUPPORTER_LABEL = COUNTED.every((d) => d.slug.startsWith("popcorn"))
  ? "popcorn supporters"
  : "supporters of our drives";
const SEATS = (ROAD && ROAD.seats) || [];
const roadMath = ROAD && (ROAD.math || [])[0];
if (roadMath && SEATS.length !== roadMath.qty)
  throw new Error(
    `campaigns.json: the road has ${SEATS.length} seats and ${roadMath.qty} athletes`,
  );
const andList = (names) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
const SEAT_NAMES = andList(SEATS.map((s) => s.name));
// One face from the strip (seats/faces.webp): --i picks it, the stylesheet
// paints it once the row is near view.
const face = (s, i, cls = "face") =>
  `<i class="${cls}" style="--i:${i}" title="${esc(s.name)}"></i>`;
export function renderFaces() {
  return (
    `<span class="cm-faces" role="img" aria-label="The six seats: ${esc(SEAT_NAMES)}">` +
    SEATS.map((s, i) => face(s, i)).join("") +
    `</span>`
  );
}
const nbCrew = () =>
  `<ul class="nb-crew" aria-label="The six seats">` +
  SEATS.map(
    (s, i) =>
      `<li>${face(s, i)}<span>${s.page ? `<a href="${s.page}">${esc(s.name)}</a>` : esc(s.name)}</span></li>`,
  ).join("") +
  `</ul>`;

// The seat tiles on /send-6: the athlete in the chair, the name, the share.
// campaigns.js fills every tile to the road's level.
export function renderSeats() {
  return SEATS.map(
    (s) =>
      `<li class="s6-seat"><span class="s6-seat-fill"></span>` +
      `<img class="s6-seat-img" src="/images/pickleball/seats/${s.slug}.webp" alt="" width="${seatSize(s.slug)[0]}" height="${seatSize(s.slug)[1]}" loading="lazy" decoding="async">` +
      `<p class="s6-seat-n">${s.page ? `<a href="${s.page}">${esc(s.name)}</a>` : esc(s.name)}</p>` +
      `<p class="s6-seat-amt">${usd(roadMath ? roadMath.unit : 0)}</p></li>`,
  ).join("\n");
}
const seatSize = (slug) => webpSize(join(PUB, `images/pickleball/seats/${slug}.webp`));

// The numbers as one journey (Alec, Nov 7: "turning /numbers into a route
// map, from every week to the road to the Classic"): a line through a station
// for each stop, in the order the money goes. Every week, then the road, then
// the finish of this year's goal (the total), then the dashed leg to the next
// goal, the Classic.
export function renderNumbers() {
  const n2 = (i) => String(i + 1).padStart(2, "0");
  const station = (k, cls = "") =>
    `<span class="nb-station${cls}" aria-hidden="true">${icon(PART_SYMBOL[k], "duotone")}</span>`;
  const stops = CAMPAIGN.parts.map((p, i) => {
    const link = p.page ? ` <a href="${p.page}">See the road</a>` : "";
    const road = p.key === "send-6";
    return [
      `  <li class="nb-stop${i === 0 ? " nb-stop--now" : ""}">`,
      `    ${station(p.key)}`,
      `    <div class="nb-part">`,
      `    <div class="nb-part-top"><span class="nb-n">${n2(i)}</span><h3>${esc(p.label)}</h3>` +
        `<b class="nb-sum">${usd(p.goal)}${p.key === "year" ? "<small> a year</small>" : ""}</b></div>`,
      `    <p class="nb-detail">${p.detail || ""}${link}</p>`,
      `    <div class="nb-prog" data-nb-row="${p.key}" hidden>` +
        `<div class="nb-prog-top"><span class="nb-prog-k">Covered so far</span><span class="nb-prog-fig" data-nb-fig="${p.key}"></span></div>` +
        `<div class="nb-lane"><div class="nb-track${road ? " nb-track--seats" : ""}"><span class="nb-fill nb-fill--kind" data-nb-kind="${p.key}"></span><span class="nb-fill" data-nb-fill="${p.key}"></span></div><span class="nb-pct" data-nb-pct="${p.key}"></span></div>` +
        `</div>`,
      `    <ul class="nb-lines" aria-label="How we got ${usd(p.goal)}">`,
      mathLines(p),
      `    </ul>`,
      ...(road && SEATS.length ? [`    ${nbCrew()}`] : []),
      `    </div>`,
      `  </li>`,
    ].join("\n");
  });
  stops.push(
    [
      `  <li class="nb-stop nb-stop--finish">`,
      `    <span class="nb-station nb-station--finish" aria-hidden="true">${flag.replace("nb-flag", "nb-station-flag")}</span>`,
      `    <div class="nb-total"><p class="nb-total-top"><span>${CAMPAIGN.parts.map((p) => esc(p.label === "The Road to the US Open" ? "the road" : p.label)).join(" + ")}</span><b>${usd(CAMPAIGN.goal)}</b></p>` +
        // Under the bar, one small ledger in the bar's order: each part with a
        // swatch of its segment, then so far and to go under a rule. Every
        // amount sits in one right-hand column, so it adds up at a glance
        // (Alec, Nov 7 2026: "This looks horrible. We can do better.").
        `<div class="nb-total-prog" data-nb-total hidden><div class="nb-track nb-track--lg"><span class="nb-fill nb-fill--kind" data-nb-kind="total"></span><span class="nb-fill" data-nb-fill="total"></span></div>` +
        `<ul class="nb-ledger">` +
        `<li data-nb-part="kind" hidden><i class="nb-swatch nb-swatch--kind" aria-hidden="true"></i><span class="nb-ledger-k">Court time<small>From a partner club</small></span><span class="nb-ledger-v" data-nb-sum="kind"></span></li>` +
        `<li><i class="nb-swatch" aria-hidden="true"></i><span class="nb-ledger-k">Gifts` +
        (SUPPORTERS
          ? `<small class="nb-people" data-nb-people hidden>From <span data-nb-donors></span> online and ${SUPPORTERS} ${SUPPORTER_LABEL}</small>`
          : "") +
        `</span><span class="nb-ledger-v" data-nb-sum="gifts"></span></li>` +
        `<li class="nb-ledger-sum nb-ledger-so"><span class="nb-ledger-k">So far</span><span class="nb-ledger-v" data-nb-sum="so"></span></li>` +
        `<li class="nb-ledger-sum"><span class="nb-ledger-k">To go</span><span class="nb-ledger-v" data-nb-sum="left"></span></li>` +
        `</ul></div></div>`,
      `  </li>`,
    ].join("\n"),
  );
  const nx = CAMPAIGN.next;
  if (nx)
    stops.push(
      [
        `  <li class="nb-stop nb-stop--next">`,
        `    ${station("next", " nb-station--next")}`,
        `    <div class="nb-part nb-part--next">`,
        `    <div class="nb-part-top"><span class="nb-n">${n2(CAMPAIGN.parts.length)}</span><h3>${esc(nx.label.replace(/^the /, "The "))}</h3><span class="nb-badge nb-badge--info"><i class="sym sym--goal" aria-hidden="true"></i>Next goal</span><b class="nb-sum nb-sum--tbd">Date to come</b></div>`,
        `    <p class="nb-detail">${nx.detail || ""}${nx.page ? ` <a href="${nx.page}">See the Classic</a>` : ""}</p>`,
        `    </div>`,
        `  </li>`,
      ].join("\n"),
    );
  return [
    `<ol class="nb-route" aria-label="The journey: every week, then the road, then the Chicago Classic">`,
    ...stops,
    `</ol>`,
  ].join("\n");
}

const esc = (s) =>
  String(s)
    .replace(/&(?!amp;|#\d+;|[a-z]+;)/g, "&amp;")
    .replace(/"/g, "&quot;");

export function render(opts, where = "page") {
  const o = { give: true, ...opts };
  if (!/^[a-z][a-z0-9-]*$/.test(o.id || ""))
    throw new Error(`${where}: id is required`);
  if (o.theme !== "dark" && o.theme !== "light")
    throw new Error(`${where}: theme must be "dark" or "light"`);
  // athlete: null leaves the module without a figure behind it (the donate
  // page, where it is in view on load and every kilobyte is budgeted).
  let w = 0;
  let h = 0;
  if (o.athlete !== null) {
    const img = join(GHOST, `${o.athlete}-gray.webp`);
    if (!o.athlete || !existsSync(img))
      throw new Error(`${where}: no ghost image for athlete "${o.athlete}"`);
    [w, h] = webpSize(img);
  }
  const cta = o.cta || {
    href: o.give ? "/donate?amount=60&frequency=monthly" : "/donate",
    label: "Donate",
  };
  let html = PARTIAL;
  if (o.athlete === null) html = html.replace(/\n<!--bg-->[\s\S]*?<!--\/bg-->/, "");
  else html = html.replace(/\n<!--\/?bg-->/g, "");
  if (o.mirror === false)
    html = html.replace('class="cm-bg"', 'class="cm-bg cm-bg--true"');
  if (!o.give) html = html.replace(/\n<!--give-->[\s\S]*?<!--\/give-->/, "");
  else html = html.replace(/\n<!--\/?give-->/g, "");
  if (o.rows === false) html = html.replace(/\n<!--rows-->[\s\S]*?<!--\/rows-->/, "");
  else html = html.replace(/\n<!--\/?rows-->/g, "");
  // numbers: false drops the button to the breakdown (on /numbers itself).
  if (o.numbers === false)
    html = html.replace(/\n<!--numbers-->[\s\S]*?<!--\/numbers-->/, "");
  else html = html.replace(/\n<!--\/?numbers-->/g, "");
  const vars = {
    id: o.id,
    theme: o.theme,
    athlete: o.athlete,
    athleteW: w,
    athleteH: h,
    ctaHref: esc(cta.href),
    ctaLabel: esc(cta.label),
    goal: usd(CAMPAIGN.goal),
    faces: renderFaces(),
  };
  return html.replace(/\{\{(\w+)(?::([\w-]+))?\}\}/g, (m, k, key) => {
    if (key) {
      const part = CAMPAIGN.parts.find((p) => p.key === key);
      if (!part) throw new Error(`${where}: no part "${key}" in campaigns.json`);
      if (k === "goal") return usd(part.goal);
      throw new Error(`${where}: partial asks for {{${k}:${key}}}`);
    }
    if (!(k in vars)) throw new Error(`${where}: partial asks for {{${k}}}`);
    return String(vars[k]);
  });
}

export function stamp(page, name = "page") {
  let found = 0;
  const out = page.replace(MARKER, (m, indent, json) => {
    found++;
    let opts;
    try {
      opts = JSON.parse(json);
    } catch {
      throw new Error(`${name}: campaign-module options are not JSON: ${json}`);
    }
    // typographer's quotes in the copy, as on every page (smart-quotes.mjs)
    const body = smarten(render(opts, name))
      .split("\n")
      .map((l) => (l ? indent + l : l))
      .join("\n");
    return `${indent}<!-- campaign-module ${json} -->\n${body}\n${indent}<!-- /campaign-module -->`;
  });
  const withNumbers = out.replace(NUMBERS, (m, indent) => {
    found++;
    const body = smarten(renderNumbers())
      .split("\n")
      .map((l) => (l ? indent + l : l))
      .join("\n");
    return `${indent}<!-- campaign-numbers -->\n${body}\n${indent}<!-- /campaign-numbers -->`;
  });
  const withSeats = withNumbers.replace(SEAT_TILES, (m, indent) => {
    found++;
    const body = smarten(renderSeats())
      .split("\n")
      .map((l) => (l ? indent + l : l))
      .join("\n");
    return `${indent}<!-- campaign-seats -->\n${body}\n${indent}<!-- /campaign-seats -->`;
  });
  if (!found) return { html: page, found };
  // The look lives in site.css, so a page needs nothing more than the markup.
  const html = withSeats.replace(
    /\n<link rel="stylesheet" href="\/css\/campaign-module\.css[^"]*">/g,
    "",
  );
  return { html, found };
}

function pages() {
  return readdirSync(PUB)
    .filter((f) => f.endsWith(".html"))
    .map((f) => join(PUB, f));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes("--check");
  const stale = [];
  let count = 0;
  for (const file of pages()) {
    const before = readFileSync(file, "utf8");
    const { html, found } = stamp(before, file.slice(PUB.length + 1));
    if (!found) continue;
    count++;
    if (html !== before) {
      if (check) stale.push(file.slice(ROOT.length + 1));
      else writeFileSync(file, html);
    }
  }
  if (check && stale.length) {
    console.error(
      "build-module --check FAILED. Run `npm run module` and commit the result.\n  " +
        stale.join("\n  "),
    );
    process.exit(1);
  }
  console.log(`build-module${check ? " --check" : ""} ok (${count} pages)`);
}
