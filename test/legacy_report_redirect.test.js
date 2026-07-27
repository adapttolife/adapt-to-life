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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { makeReportToken, makeLibraryToken } from "../src/report_view.js";

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
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  assert.equal(res.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
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

test("with no report origin configured, the retired route fails closed instead of rendering locally", async () => {
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

// ---- the viewer is retired from this Worker entirely ------------------------
//
// Redirecting the two published hostnames was only half the move. The ATL
// Worker also answers on sign.adapttolife.org and on its workers.dev URL, and
// neither is behind the Cloudflare Access policy that protects
// reports.amelioration.is. A token that verifies is a valid capability on ANY
// host that still runs the viewer — so as long as this Worker can render a
// report at all, those hostnames are an unauthenticated way around Access.
//
// The tests above only ever probed with "garbage", which the token check
// rejects before it reaches D1. They pass against a Worker that happily serves
// a real report to a real token. These probe with valid tokens, which is the
// only shape that shows the bypass.

const CONFIDENTIAL = "Liberty One quarterly numbers";

// A D1 that would serve a real report, and records every query it is asked
// for. A stub that throws would 404 by accident (the handlers catch D1 errors)
// and hide the bypass rather than prove it closed.
function servingEnv(queries, extra = {}) {
  const row = {
    id: MSG_ID,
    thread_id: "thread-1",
    subject: "Q3 report",
    from_addr: "charlie@agents.adapttolife.org",
    created_at: "2026-07-01T12:00:00Z",
    body_markdown: `# Report\n\n${CONFIDENTIAL}\n`,
  };
  return env({
    AGENT_MAIL_DB: {
      prepare(sql) {
        queries.push(sql);
        return {
          bind: () => ({
            first: async () => row,
            all: async () => ({ results: [row] }),
          }),
        };
      },
    },
    ...extra,
  });
}

// Every hostname this Worker answers on that Access does not cover.
const UNPROTECTED_HOSTS = [
  "sign.adapttolife.org",
  "adapt-to-life.alec-af3.workers.dev",
  "adapt-to-life-staging.alec-af3.workers.dev",
  "localhost:8787",
];

test("a VALID report token on the unprotected hosts 404s and never reaches D1", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  for (const host of UNPROTECTED_HOSTS) {
    const queries = [];
    const res = await fetchUrl(`https://${host}/r/${token}`, {}, servingEnv(queries));
    assert.equal(res.status, 404, `${host} served a report to a valid token`);
    assert.equal(res.headers.get("Location"), null, `${host} redirected instead of 404ing`);
    assert.deepEqual(queries, [], `${host} read D1 for a report`);
    const body = await res.text();
    assert.ok(!body.includes(CONFIDENTIAL), `${host} leaked report content`);
  }
});

test("a VALID library token on the unprotected hosts 404s and never reaches D1", async () => {
  const token = await makeLibraryToken(SECRET, "reader@example.org");
  for (const host of UNPROTECTED_HOSTS) {
    const queries = [];
    const res = await fetchUrl(`https://${host}/lib/${token}`, {}, servingEnv(queries));
    assert.equal(res.status, 404, `${host} served a library to a valid token`);
    assert.equal(res.headers.get("Location"), null, `${host} redirected instead of 404ing`);
    assert.deepEqual(queries, [], `${host} read D1 for a library`);
    const body = await res.text();
    assert.ok(!body.includes("reader@example.org"), `${host} leaked the recipient address`);
  }
});

test("the fail-closed 404 is the generic one: no-store, noindex, nothing to fingerprint", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  for (const url of [
    `https://sign.adapttolife.org/r/${token}`,
    `https://adapt-to-life.alec-af3.workers.dev/lib/anything`,
  ]) {
    const res = await fetchUrl(url, {}, servingEnv([]));
    assert.equal(res.status, 404);
    assert.equal(await res.text(), "Not found");
    assert.match(res.headers.get("Cache-Control") || "", /no-store/);
    assert.match(res.headers.get("X-Robots-Tag") || "", /noindex/);
  }
});

test("a valid token on a host that no longer runs the viewer is indistinguishable from a bogus one", async () => {
  // Same status, same body, same headers — a prober cannot use these hosts to
  // learn which tokens are real and then replay them somewhere that answers.
  const token = await makeReportToken(SECRET, MSG_ID);
  const good = await fetchUrl(`https://sign.adapttolife.org/r/${token}`, {}, servingEnv([]));
  const bad = await fetchUrl("https://sign.adapttolife.org/r/garbage", {}, servingEnv([]));
  assert.equal(good.status, bad.status);
  assert.equal(await good.text(), await bad.text());
  assert.deepEqual([...good.headers].sort(), [...bad.headers].sort());
});

test("non-GET requests to a report path on an unprotected host also fail closed", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  for (const method of ["POST", "PUT", "DELETE"]) {
    const queries = [];
    const res = await fetchUrl(`https://sign.adapttolife.org/r/${token}`, { method }, servingEnv(queries));
    assert.equal(res.status, 404, `${method} was answered`);
    assert.deepEqual(queries, [], `${method} read D1`);
  }
});

test("the apex and www still forward a VALID token, unchanged, without reading D1", async () => {
  const rToken = await makeReportToken(SECRET, MSG_ID);
  const libToken = await makeLibraryToken(SECRET, "reader@example.org");
  const cases = [
    [`https://adapttolife.org/r/${rToken}?print=1`, `${REPORTS}/r/${rToken}?print=1`],
    [`https://www.adapttolife.org/r/${rToken}`, `${REPORTS}/r/${rToken}`],
    [`https://adapttolife.org/lib/${libToken}?utm_source=email`, `${REPORTS}/lib/${libToken}?utm_source=email`],
    [`https://www.adapttolife.org/lib/${libToken}`, `${REPORTS}/lib/${libToken}`],
  ];
  for (const [from, to] of cases) {
    const queries = [];
    const res = await fetchUrl(from, {}, servingEnv(queries));
    assert.equal(res.status, 302, `${from} did not forward`);
    assert.equal(res.headers.get("Location"), to);
    assert.deepEqual(queries, [], `${from} read D1 on its way out`);
  }
});

test("neighbouring paths on the unprotected hosts still serve the site, exactly as before", async () => {
  for (const host of UNPROTECTED_HOSTS) {
    for (const p of ["/reports", "/r", "/rx/tok", "/library/tok", "/lib", "/libs/tok", "/about"]) {
      const res = await fetchUrl(`https://${host}${p}`, {}, servingEnv([]));
      assert.equal(res.status, 200, `${host}${p} stopped serving`);
      assert.equal(await res.text(), ASSET_MARKER, `${host}${p} did not fall through to the site`);
    }
  }
});

test("the signing hub and the QR namespace are untouched", async () => {
  const hub = await fetchUrl("https://sign.adapttolife.org/", {}, servingEnv([]));
  assert.equal(hub.status, 302);
  assert.equal(hub.headers.get("Location"), "https://sign.adapttolife.org/waiver");

  const waiver = await fetchUrl("https://sign.adapttolife.org/waiver", {}, servingEnv([]));
  assert.equal(waiver.status, 200);
  assert.equal(await waiver.text(), ASSET_MARKER);
});

// ---- the source pin ---------------------------------------------------------

test("the public Worker no longer imports or calls the report viewers", () => {
  // The redirect and the fail-closed 404 are only as good as the absence of a
  // second way in. If src/index.js can still reach handleReportView, one
  // `if (pathname.startsWith("/r/"))` reintroduces the bypass — and it would
  // also drag the report renderer, its charts and its fonts back into the
  // public bundle. Pin it in the source, not just in the behaviour.
  const src = readFileSync(fileURLToPath(new URL("../src/index.js", import.meta.url)), "utf8");
  assert.ok(!/handleReportView/.test(src), "src/index.js still references handleReportView");
  assert.ok(!/handleLibraryView/.test(src), "src/index.js still references handleLibraryView");
  assert.ok(
    !/^\s*import[^;]*from\s+["']\.\/report_view\.js["']/m.test(src),
    "src/index.js still imports from ./report_view.js"
  );
});

test("the dedicated reports Worker keeps the viewers — this move retires one copy, not the feature", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/reports_worker.js", import.meta.url)), "utf8");
  assert.match(src, /handleReportView/);
  assert.match(src, /handleLibraryView/);
});
