// SEO guards, Nov 8 2026 (Alec: "level up our SEO", events, partners, a
// Bread & Butter page for Juan, and "a better job at linking").
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const pub = new URL("public/", root);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const pages = readdirSync(pub).filter((f) => f.endsWith(".html"));
const ldBlocks = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) =>
    JSON.parse(m[1]),
  );

test("/events carries its record and structured data in the HTML", () => {
  execFileSync(process.execPath, ["scripts/build-events.mjs", "--check"], { cwd: root, stdio: "pipe" });
  const html = read("events.html");
  const data = JSON.parse(read("data/campaigns.json"));
  const graph = ldBlocks(html).flatMap((j) => j["@graph"] || [j]);
  for (const d of data.drives.filter((x) => x.published !== false)) {
    assert.ok(html.includes(d.name.replace(/&/g, "&amp;")), `${d.slug} is not in the static list`);
    assert.ok(graph.some((n) => n.name === d.name && n.startDate), `${d.slug} has no Event node`);
  }
});

test("breadandbutterpickleball.com is parked; the store is bnbpickleball.com", () => {
  for (const f of pages)
    assert.ok(!read(f).includes("breadandbutterpickleball.com"), `${f} links the parked domain`);
});

test("every Bread & Butter shop link is marked sponsored (a commission rides on it)", () => {
  let n = 0;
  for (const f of pages)
    for (const m of read(f).matchAll(/<a\b[^>]*href="https:\/\/www\.bnbpickleball\.com[^"]*"[^>]*>/g)) {
      assert.match(m[0], /rel="[^"]*\bsponsored\b/, `${f}: ${m[0].slice(0, 90)}`);
      n++;
    }
  assert.ok(n >= 10, `expected the Bread & Butter page's shop links, found ${n}`);
});

test("the Bread & Butter page discloses the commission and links back to Juan", () => {
  const html = read("bread-and-butter.html");
  assert.ok(html.includes("pays him a commission"));
  assert.ok(html.includes('href="/juan"'));
  assert.ok(read("juan.html").includes('href="/bread-and-butter"'));
});

test("every structured-data block parses, and the home NGO stays first", () => {
  for (const f of pages) ldBlocks(read(f));
  const first = ldBlocks(read("index.html"))[0];
  assert.equal(first["@type"], "NGO");
});

test("Juan's page names his outside coverage in structured data", () => {
  const person = ldBlocks(read("juan.html"))
    .flatMap((j) => j["@graph"] || [j])
    .find((n) => n["@type"] === "Person");
  assert.equal(person["@id"], "https://adapttolife.org/juan#person");
  assert.ok(person.subjectOf.length >= 2);
});
