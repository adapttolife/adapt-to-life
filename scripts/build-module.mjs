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
//   stats    false drops the six wins, for a page that already leads with
//            the same record (the crew page). Default true.
//   cta      {"href","label"} for the button. Default: Donate, carrying the
//            picker's default gift into the Givebutter form.
//
// The markup is src/partials/campaign-module.html, the look is the campaign
// module section of src/css/site.css and the live numbers come from
// public/js/campaigns.js (module()), which reads /api/raised?c=wbd.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

// One part's arithmetic as a receipt: what, how many times what, the total,
// and where the unit cost comes from.
function mathList(part) {
  const items = (part.math || []).map(
    (l) =>
      `<li><span class="cm-math-k">${esc(l.label)}</span><b>${usd(l.qty * l.unit)}</b>` +
      `<span class="cm-math-x">${l.qty} ${esc(l.of)} &times; ${l.about ? "about " : ""}${usd(l.unit)}</span>` +
      (l.note ? `<small>${l.note}</small>` : "") +
      "</li>",
  );
  return items.length
    ? `<ul class="cm-math" aria-label="How we got ${usd(part.goal)}">${items.join("")}</ul>`
    : "";
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
    href: o.give ? "/donate?amount=80&frequency=monthly" : "/donate",
    label: "Donate",
  };
  let html = PARTIAL;
  if (o.athlete === null) html = html.replace(/\n<!--bg-->[\s\S]*?<!--\/bg-->/, "");
  else html = html.replace(/\n<!--\/?bg-->/g, "");
  if (!o.give) html = html.replace(/\n<!--give-->[\s\S]*?<!--\/give-->/, "");
  else html = html.replace(/\n<!--\/?give-->/g, "");
  if (o.stats === false)
    html = html.replace(/\n<!--stats-->[\s\S]*?<!--\/stats-->/, "");
  else html = html.replace(/\n<!--\/?stats-->/g, "");
  const vars = {
    id: o.id,
    theme: o.theme,
    athlete: o.athlete,
    athleteW: w,
    athleteH: h,
    ctaHref: esc(cta.href),
    ctaLabel: esc(cta.label),
    goal: usd(CAMPAIGN.goal),
    outside: CAMPAIGN.outside,
  };
  return html.replace(/\{\{(\w+)(?::([\w-]+))?\}\}/g, (m, k, key) => {
    if (key) {
      const part = CAMPAIGN.parts.find((p) => p.key === key);
      if (!part) throw new Error(`${where}: no part "${key}" in campaigns.json`);
      if (k === "goal") return usd(part.goal);
      if (k === "math") return mathList(part);
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
    const body = render(opts, name)
      .split("\n")
      .map((l) => (l ? indent + l : l))
      .join("\n");
    return `${indent}<!-- campaign-module ${json} -->\n${body}\n${indent}<!-- /campaign-module -->`;
  });
  if (!found) return { html: page, found };
  // The look lives in site.css, so a page needs nothing more than the markup.
  const html = out.replace(
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
