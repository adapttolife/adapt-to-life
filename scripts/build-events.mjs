#!/usr/bin/env node
// scripts/build-events.mjs: /events without JavaScript.
//
// Alec, Nov 8 2026: "I want our events to do a better job at SEO." The
// calendar on /events was drawn entirely in the browser from
// public/data/campaigns.json, so a crawler that does not run scripts (and
// most AI answer engines) saw an empty page, and the Event structured data
// only existed after the script ran. This writes both into the HTML:
//
//   <!-- events:ld --> ... <!-- /events:ld -->    in <head>: one Event per
//       published calendar entry (past ones too: a record is still a fact),
//       plus a BreadcrumbList. Date-independent, so --check is stable.
//   <!-- events:list --> ... <!-- /events:list -->  in the Past events list:
//       every published entry as a plain row, newest first. The page script
//       clears it and draws the live cards and rows over it, as before.
//
//   node scripts/build-events.mjs          write public/events.html
//   node scripts/build-events.mjs --check  fail if events.html is stale
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = join(ROOT, "public/events.html");
const SITE = "https://adapttolife.org";
const data = JSON.parse(readFileSync(join(ROOT, "public/data/campaigns.json"), "utf8"));
const drives = data.drives.filter((d) => d.published !== false);

const start = (d) => d.starts_at || d.opens;
const end = (d) => d.ends_at || d.closes || start(d);
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function event(d) {
  const e = {
    "@type": d.type === "tournament" ? "SportsEvent" : "Event",
    name: d.name,
    startDate: start(d),
    endDate: end(d),
    eventStatus: "https://schema.org/EventScheduled",
    url: d.page ? SITE + d.page.split("#")[0] : d.cta_url || SITE + "/events",
  };
  if (d.summary) e.description = d.summary;
  if (d.image) e.image = SITE + d.image;
  if (d.venue || d.city) {
    e.eventAttendanceMode = "https://schema.org/OfflineEventAttendanceMode";
    const address = { "@type": "PostalAddress", addressLocality: d.city, addressRegion: d.state, addressCountry: "US" };
    if (d.address) {
      address.streetAddress = d.address.split(", ")[0];
      const zip = d.address.match(/\b(\d{5})\b/);
      if (zip) address.postalCode = zip[1];
    }
    e.location = { "@type": "Place", name: d.venue || d.city, address };
  } else {
    e.eventAttendanceMode = "https://schema.org/OnlineEventAttendanceMode";
    e.location = { "@type": "VirtualLocation", url: SITE + (d.page || "/events") };
  }
  e.organizer = d.host
    ? { "@type": "Organization", name: d.host }
    : { "@id": SITE + "/#org" };
  if (d.host && d.host_url) e.organizer.url = d.host_url;
  // Athletes we fund play these; Adapt To Life does not run them.
  if (d.relationship === "we_compete")
    e.performer = { "@type": "SportsTeam", name: "Chicago Pickleball: Wheelie Big Dills", url: SITE + "/pickleball" };
  if (d.type === "tournament") e.sport = "Wheelchair pickleball";
  return e;
}

const ld = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "CollectionPage",
      "@id": SITE + "/events#page",
      url: SITE + "/events",
      name: "Wheelchair Pickleball Tournaments and Events, Chicago",
      isPartOf: { "@id": SITE + "/#website" },
      publisher: { "@id": SITE + "/#org" },
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
        { "@type": "ListItem", position: 2, name: "Events", item: SITE + "/events" },
      ],
    },
    ...[...drives].sort((a, b) => start(a).localeCompare(start(b))).map(event),
  ],
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function when(d) {
  const [ay, am, ad] = start(d).split("-").map(Number);
  const [by, bm, bd] = end(d).split("-").map(Number);
  if (start(d) === end(d)) return `${MONTHS[am - 1]} ${ad}, ${ay}`;
  if (ay === by && am === bm) return `${MONTHS[am - 1]} ${ad}&ndash;${bd}, ${ay}`;
  return `${MONTHS[am - 1]} ${ad}&ndash;${MONTHS[bm - 1]} ${bd}, ${by}`;
}
const label = (d) => (d.type === "fundraiser" ? "Fundraiser" : d.type === "tournament" ? "Tournament" : "Event");
const place = (d) => [d.venue, [d.city, d.state].filter(Boolean).join(", ")].filter(Boolean).join(" &middot; ");
function row(d) {
  const res = [];
  if (d.result) res.push(`<span class="tag tag--win">${esc(d.result)}</span>`);
  if (typeof d.raised === "number" && d.raised > 0)
    res.push(`<span class="tag tag--good">$${d.raised.toLocaleString("en-US")} raised</span>`);
  const name = d.page
    ? `<a href="${esc(d.page)}">${esc(d.name)}</a>`
    : d.cta_url
      ? `<a href="${esc(d.cta_url)}" rel="noopener" target="_blank">${esc(d.name)}</a>`
      : esc(d.name);
  return `        <li class="ev-row"><p class="ev-when">${when(d)}</p><div><p class="ev-name">${name}</p>${
    res.length ? `<p class="ev-res">${res.join("")}</p>` : ""
  }<p class="ev-meta">${[label(d), place(d)].filter(Boolean).join(" &middot; ")}${
    d.host && d.host_url ? ` &middot; Hosted by <a class="ev-host" href="${esc(d.host_url)}" rel="noopener" target="_blank">${esc(d.host)}</a>` : ""
  }</p></div>${d.page ? `<a class="ev-go" href="${esc(d.page)}">${d.type === "fundraiser" ? "See the drive" : "Read the story"}</a>` : "<span></span>"}</li>`;
}
const rows = [...drives].sort((a, b) => start(b).localeCompare(start(a))).map(row).join("\n");

let html = readFileSync(FILE, "utf8");
const put = (name, body) => {
  const re = new RegExp(`(<!-- events:${name} -->)[\\s\\S]*?(<!-- /events:${name} -->)`);
  if (!re.test(html)) throw new Error(`events.html has no events:${name} markers`);
  html = html.replace(re, `$1\n${body}\n$2`);
};
put("ld", `<script type="application/ld+json">\n${JSON.stringify(ld, null, 2)}\n</script>`);
put("list", rows);

const current = readFileSync(FILE, "utf8");
if (process.argv.includes("--check")) {
  if (current !== html) {
    console.error("public/events.html is stale: run node scripts/build-events.mjs");
    process.exit(1);
  }
  console.log("events.html is up to date");
} else {
  writeFileSync(FILE, html);
  console.log(`events.html: ${drives.length} events written`);
}
