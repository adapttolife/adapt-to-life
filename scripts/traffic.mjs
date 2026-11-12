#!/usr/bin/env node
// scripts/traffic.mjs: what people read on adapttolife.org, from Cloudflare
// Web Analytics (on for the zone since Sep 14 2026; no cookies, real browsers
// only). Alec, Nov 12 2026: "The numbers don't lie", then "Do 4": measure which
// posts get read and what brings people in.
//
//   cfrun npm run traffic              the last 30 days
//   cfrun npm run traffic -- --days 7
//
// Needs CLOUDFLARE_API_TOKEN, which cfrun provides. Prints views and visits for
// the top pages and for every page the blog lists, then where visitors came
// from and their countries. Web Analytics samples, so small counts come out
// rounded (10, 20, 30).
import { blogIndex } from "./lib/blog-index.mjs";

const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("Needs CLOUDFLARE_API_TOKEN: run it as cfrun npm run traffic");
  process.exit(2);
}
const at = process.argv.indexOf("--days");
const days = at > 0 ? Number(process.argv[at + 1]) : 30;
const HOST = "adapttolife.org";

const api = async (path, body) => {
  const r = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return r.json();
};

const zone = (await api(`/zones?name=${HOST}`)).result?.[0];
if (!zone) {
  console.error(`This token can't see the ${HOST} zone.`);
  process.exit(1);
}
const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19) + "Z";
const group = (alias, dim, limit) =>
  `${alias}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, filter: {datetime_geq: "${since}", requestHost: "${HOST}"}, orderBy: [count_DESC]) { count sum { visits } dimensions { ${dim} } }`;
const res = await api("/graphql", {
  query: `query { viewer { accounts(filter: {accountTag: "${zone.account.id}"}) { ${group("pages", "requestPath", 200)} ${group("refs", "refererHost", 15)} ${group("countries", "countryName", 10)} } } }`,
});
if (res.errors?.length) {
  console.error(JSON.stringify(res.errors));
  process.exit(1);
}
const { pages, refs, countries } = res.data.viewer.accounts[0];

const row = (a, b, label) => `${String(a).padStart(7)}  ${String(b).padStart(7)}  ${label}`;
console.log(`${HOST}, the last ${days} days (Cloudflare Web Analytics)\n`);
console.log(row("views", "visits", "top pages"));
for (const p of pages.slice(0, 15)) console.log(row(p.count, p.sum.visits, p.dimensions.requestPath));

const byPath = new Map(pages.map((p) => [p.dimensions.requestPath, p]));
console.log(`\n${row("views", "visits", "the blog")}`);
for (const e of [{ href: "/blog", title: "the hub" }, ...blogIndex()]) {
  const p = byPath.get(e.href);
  console.log(row(p ? p.count : 0, p ? p.sum.visits : 0, `${e.href}  ${e.title}`));
}

console.log(`\n${row("views", "", "came from")}`);
for (const r of refs) console.log(row(r.count, "", r.dimensions.refererHost || "(direct, an app, or no referrer)"));
console.log(`\n${row("views", "", "countries")}`);
for (const c of countries) console.log(row(c.count, "", c.dimensions.countryName));
