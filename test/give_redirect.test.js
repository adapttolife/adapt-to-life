// adaptbodyshop.com/promise links to adapttolife.org/give. That path was never
// a page, so it 404'd. It now permanently redirects to /donate, trailing slash
// included, query string intact. Same map as /ways-to-give.
//
// Standalone `node --test` — the Worker module reads nothing at import time.
import { test } from "node:test";
import assert from "node:assert/strict";

const worker = (await import("../src/index.js")).default;

function fetchPath(path, init = {}) {
  return worker.fetch(new Request(`https://adapttolife.org${path}`, init), {
    ASSETS: { fetch: async () => new Response("asset", { status: 200 }) },
  }, { waitUntil() {} });
}

test("/give and /give/ permanently redirect to /donate", async () => {
  for (const path of ["/give", "/give/"]) {
    const res = await fetchPath(path);
    assert.equal(res.status, 301, path);
    const loc = new URL(res.headers.get("Location"));
    assert.equal(loc.origin, "https://adapttolife.org", path);
    assert.equal(loc.pathname, "/donate", path);
    assert.equal(loc.search, "", path);
  }
});

test("/give keeps the query string, with or without a trailing slash", async () => {
  for (const path of ["/give?amount=25&utm=shop", "/give/?amount=25&utm=shop"]) {
    const res = await fetchPath(path);
    assert.equal(res.status, 301, path);
    const loc = new URL(res.headers.get("Location"));
    assert.equal(loc.pathname, "/donate", path);
    assert.equal(loc.search, "?amount=25&utm=shop", path);
  }
});

test("HEAD /give redirects, so link checkers follow it", async () => {
  for (const path of ["/give", "/give/"]) {
    const res = await fetchPath(path, { method: "HEAD" });
    assert.equal(res.status, 301, path);
    assert.equal(new URL(res.headers.get("Location")).pathname, "/donate", path);
  }
});

test("/ways-to-give still permanently redirects to /donate", async () => {
  for (const path of ["/ways-to-give", "/ways-to-give.html"]) {
    const res = await fetchPath(path);
    assert.equal(res.status, 301, path);
    assert.equal(new URL(res.headers.get("Location")).pathname, "/donate", path);
  }
});
