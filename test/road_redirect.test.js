// The road page moved from /send-6 to /road on Nov 11 2026, when Alec retired
// the "send six athletes to the US Open" story. Chair, sign and card QR codes,
// old shares and emails still carry /send-6, so it permanently redirects to
// /road with the query string (QR attribution rides in it).
//
// Standalone `node --test`: the Worker module reads nothing at import time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const worker = (await import("../src/index.js")).default;

function fetchPath(path, init = {}) {
  return worker.fetch(new Request(`https://adapttolife.org${path}`, init), {
    ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  }, { waitUntil() {} });
}

test("/send-6 permanently redirects to /road, in every form", async () => {
  for (const path of ["/send-6", "/send-6.html", "/send-6/"]) {
    const res = await fetchPath(path);
    assert.equal(res.status, 301, path);
    const loc = new URL(res.headers.get("Location"));
    assert.equal(loc.origin, "https://adapttolife.org", path);
    assert.equal(loc.pathname, "/road", path);
  }
});

test("/send-6 keeps the query string, so QR attribution survives the move", async () => {
  const res = await fetchPath("/send-6?utm_campaign=qr-chair&gba_source=qr-chair");
  assert.equal(res.status, 301);
  const loc = new URL(res.headers.get("Location"));
  assert.equal(loc.pathname, "/road");
  assert.equal(loc.search, "?utm_campaign=qr-chair&gba_source=qr-chair");
});

test("the road page lives at /road, and nothing on the site links /send-6", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  assert.ok(existsSync(new URL("../public/road.html", import.meta.url)));
  assert.ok(!existsSync(new URL("../public/send-6.html", import.meta.url)), "a static send-6.html would shadow the redirect");
  const road = read("public/road.html");
  assert.ok(road.includes('<link rel="canonical" href="https://adapttolife.org/road">'));
  assert.ok(read("public/sitemap.xml").includes("<loc>https://adapttolife.org/road</loc>"));
});
