// The sitemap lists every page we want found, and nothing that is not a page.
// A new page that skips it fails here; so does a noindex page that sneaks in.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const xml = readFileSync(new URL("sitemap.xml", pub), "utf8");
const listed = [...xml.matchAll(/<loc>https:\/\/adapttolife\.org\/([^<]*)<\/loc>/g)].map((m) => m[1] || "index");

function pages(dir, prefix = "") {
  return readdirSync(new URL(dir, pub)).filter((f) => f.endsWith(".html")).map((f) => prefix + f.slice(0, -5));
}
const indexable = [...pages("./"), ...pages("volunteer/", "volunteer/")].filter(
  (p) => !readFileSync(new URL(p + ".html", pub), "utf8").includes("noindex")
);

test("every indexable page is in the sitemap", () => {
  for (const p of indexable) assert.ok(listed.includes(p), `${p} is missing from public/sitemap.xml`);
});

test("every sitemap URL is a real, indexable page", () => {
  for (const p of listed) {
    assert.ok(existsSync(new URL(p + ".html", pub)), `${p} has no page`);
    assert.ok(indexable.includes(p), `${p} is noindex and must not be listed`);
  }
});

test("robots.txt points at the sitemap", () => {
  assert.ok(readFileSync(new URL("robots.txt", pub), "utf8").includes("Sitemap: https://adapttolife.org/sitemap.xml"));
});
