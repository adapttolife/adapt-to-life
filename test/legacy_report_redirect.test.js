// Old report emails carry adapttolife.org/r/<token> and /lib/<token> links, and
// an email is not editable after it is sent. Once reports move to
// reports.amelioration.is, those links must keep working — so the ATL Worker
// forwards the two legacy namespaces to the configured report origin with a
// temporary redirect, query string intact.
//
// The security-relevant part is what does NOT redirect. The destination is
// built from env.REPORT_LINK_BASE only; no part of it comes from the request's
// host, so a forged Host header cannot turn this into an open redirect. And the
// forward is scoped to exactly /r/ and /lib/ on exactly the two public ATL
// hostnames: sign.adapttolife.org and the staging/workers.dev hosts serve as
// before.
//
// Standalone `node --test` — the Worker module reads nothing at import time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeReportToken } from "../src/report_view.js";

const worker = (await import("../src/index.js")).default;

const SECRET = "report-secret-for-tests";
const MSG_ID = "5b2f2a10-9d1c-4f4e-8a30-1c2d3e4f5a6b";
const REPORTS = "https://reports.amelioration.is";

const ASSET_MARKER = "STATIC-ASSET";

function env(extra = {}) {
  return {
    REPORT_LINK_SECRET: SECRET,
    REPORT_LINK_BASE: REPORTS,
    ASSETS: { fetch: async () => new Response(ASSET_MARKER, { status: 200 }) },
    // Any D1 read on this path is a bug — the legacy host should redirect
    // before it ever looks a token up.
    AGENT_MAIL_DB: {
      prepare() { throw new Error("legacy host read D1 instead of redirecting"); },
    },
    ...extra,
  };
}

function fetchUrl(url, init = {}, e = env()) {
  return worker.fetch(new Request(url, init), e, { waitUntil() {} });
}

// ---- the forward ------------------------------------------------------------

test("adapttolife.org/r/<token> temporarily redirects to the report origin", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const res = await fetchUrl(`https://adapttolife.org/r/${token}`);
  assert.equal(res.status, 302, "temporary — the old URL is not being retired, just moved");
  assert.equal(res.headers.get("Location"), `${REPORTS}/r/${token}`);
});

test("adapttolife.org/lib/<token> redirects too", async () => {
  const res = await fetchUrl("https://adapttolife.org/lib/abc123");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), `${REPORTS}/lib/abc123`);
});

test("www redirects the same way as the apex", async () => {
  const res = await fetchUrl("https://www.adapttolife.org/r/abc123");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), `${REPORTS}/r/abc123`);
});

test("the query string survives the move", async () => {
  const res = await fetchUrl("https://adapttolife.org/r/abc123?utm_source=email&print=1");
  assert.equal(res.headers.get("Location"), `${REPORTS}/r/abc123?utm_source=email&print=1`);
  const lib = await fetchUrl("https://adapttolife.org/lib/tok?q=liberty%20one#frag");
  assert.equal(lib.headers.get("Location"), `${REPORTS}/lib/tok?q=liberty%20one`);
});

test("HEAD redirects as well, so link checkers follow the move", async () => {
  const res = await fetchUrl("https://adapttolife.org/r/abc123", { method: "HEAD" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), `${REPORTS}/r/abc123`);
});

// ---- the destination is ours, whatever the request says ---------------------

test("the destination origin is the configured one, never anything from the path", async () => {
  const paths = [
    "/r/abc@evil.com",
    "/r/abc123?next=https://evil.com/",
    "/r/%2F%2Fevil.com%2Fx",
    "/lib/tok%00https://evil.com",
    "/r/..%2F..%2Fevil",
  ];
  for (const p of paths) {
    const res = await fetchUrl(`https://adapttolife.org${p}`);
    assert.equal(res.status, 302, `${p} should redirect`);
    const dest = new URL(res.headers.get("Location"));
    assert.equal(dest.origin, REPORTS, `${p} escaped the configured origin`);
    assert.ok(dest.pathname.startsWith("/r/") || dest.pathname.startsWith("/lib/"), p);
  }
});

test("a forged Host header cannot steer the destination", async () => {
  const req = new Request("https://adapttolife.org/r/abc123", {
    headers: { "X-Forwarded-Host": "evil.com", "X-Forwarded-Proto": "http" },
  });
  const res = await worker.fetch(req, env(), { waitUntil() {} });
  assert.equal(new URL(res.headers.get("Location")).origin, REPORTS);
});

// ---- what must NOT redirect -------------------------------------------------

test("sign.adapttolife.org does not redirect report paths", async () => {
  const res = await fetchUrl("https://sign.adapttolife.org/r/garbage");
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Location"), null);
});

test("staging and workers.dev hosts do not redirect", async () => {
  for (const host of [
    "adapt-to-life-staging.alec-af3.workers.dev",
    "adapt-to-life.alec-af3.workers.dev",
    "localhost:8787",
  ]) {
    const res = await fetchUrl(`https://${host}/r/garbage`);
    assert.equal(res.status, 404, `${host} redirected`);
    assert.equal(res.headers.get("Location"), null, `${host} redirected`);
  }
});

test("only the exact legacy namespaces move; neighbouring paths still serve the site", async () => {
  for (const p of ["/reports", "/r", "/rx/tok", "/library/tok", "/lib", "/libs/tok", "/"]) {
    const res = await fetchUrl(`https://adapttolife.org${p}`);
    assert.equal(res.headers.get("Location"), null, `${p} redirected`);
    assert.equal(await res.text(), ASSET_MARKER, `${p} did not fall through to the site`);
  }
});

test("non-GET/HEAD requests to a legacy report path are not redirected", async () => {
  // The viewer is GET-only; a POST here answered the same 404 before this
  // change and must keep doing so rather than learning a new behaviour.
  const res = await fetchUrl("https://adapttolife.org/r/garbage", { method: "POST" });
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Location"), null);
});

test("with no report origin configured, nothing redirects — the legacy Worker serves as before", async () => {
  const e = env();
  delete e.REPORT_LINK_BASE;
  e.AGENT_MAIL_DB = { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) }) };
  const res = await fetchUrl("https://adapttolife.org/r/garbage", {}, e);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Location"), null);
});

test("a report origin pointing back at this host does not loop", async () => {
  const e = env({ REPORT_LINK_BASE: "https://adapttolife.org/" });
  e.AGENT_MAIL_DB = { prepare: () => ({ bind: () => ({ first: async () => null, all: async () => ({ results: [] }) }) }) };
  const res = await fetchUrl("https://adapttolife.org/r/garbage", {}, e);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get("Location"), null);
});
