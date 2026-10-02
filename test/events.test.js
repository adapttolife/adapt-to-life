// /events is an index: every dated entry in campaigns.json shows there, and
// each one with its own page links to it. These checks keep that promise.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const data = JSON.parse(readFileSync(new URL("data/campaigns.json", pub), "utf8"));
const TYPES = ["fundraiser", "tournament", "event"];

test("every calendar entry has a known type (QR campaign-follow trusts it)", () => {
  for (const d of data.drives) assert.ok(TYPES.includes(d.type), `${d.slug}: type "${d.type}" must be one of ${TYPES.join(", ")}`);
});

test("every calendar entry has a date and a name", () => {
  for (const d of data.drives) {
    assert.ok(d.name, `${d.slug}: name`);
    assert.ok(d.opens || d.starts_at, `${d.slug}: a start date`);
  }
});

test("every entry with its own page links to a page that exists", () => {
  for (const d of data.drives.filter((x) => x.page)) {
    assert.ok(existsSync(new URL(d.page.slice(1).split("#")[0] + ".html", pub)), `${d.slug}: ${d.page} has no page`);
  }
});

test("only fundraisers feed a campaign", () => {
  for (const d of data.drives.filter((x) => x.campaign)) assert.equal(d.type, "fundraiser", `${d.slug} feeds a campaign`);
});

test("Events is in the nav and the sitemap", () => {
  const html = readFileSync(new URL("index.html", pub), "utf8");
  assert.ok(html.includes('<a class="m-sub" href="/events">Events</a>'), "mobile menu");
  assert.ok(html.includes('href="/events"><span class="np-t">Events</span>'), "desktop menu");
  assert.ok(readFileSync(new URL("sitemap.xml", pub), "utf8").includes("https://adapttolife.org/events</loc>"));
});
