// Spec 116 — the QR platform.
//
// What is actually at stake here is unusual for a web test: the artifacts this
// code serves are PRINTED. A sticker on an athlete's chair cannot be recalled,
// re-deployed, or apologised to. So these tests are weighted toward the
// failures that would be permanent and invisible:
//
//   - a code in the wild returning anything but a working redirect
//   - a D1 outage taking the redirect down with it
//   - a slug being reused, silently repointing every sticker already printed
//   - the destination field becoming an open redirect on our own domain
//   - attribution being dropped, which turns the money question back into a
//     guess without ever looking broken
//
// Standalone `node --test` — no bindings are read at import time.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  handleQr, resolveDest, liveDrive, deviceOf, referrerHost,
  attributionParams, chicagoToday, _resetCaches,
} from "../src/qr.js";
import { validateDest, validateSlug } from "../src/qr_admin.js";
import { markerFrom } from "../src/qr_gifts.js";

const NOW = Date.UTC(2026, 7, 10, 15, 0, 0); // 2026-08-10, inside the popcorn drive

// A D1 stub that answers the one query src/qr.js makes, and records writes so a
// test can assert a scan was counted without a real database.
function db(rows, { failReads = false } = {}) {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      if (failReads && /SELECT/.test(sql)) throw new Error("D1 is down");
      return {
        bind(...args) { return this._b(args); },
        _b(args) {
          return {
            async all() { return { results: rows }; },
            async run() { writes.push({ sql, args }); return { success: true }; },
            async first() { return rows[0] || null; },
          };
        },
        async all() { return { results: rows }; },
        async run() { writes.push({ sql, args: [] }); return { success: true }; },
      };
    },
  };
}

const CAMPAIGNS = {
  drives: [
    { slug: "popcorn-2026-08", published: true, page: "/popcorn", opens: "2026-08-06", closes: "2026-08-13" },
    { slug: "old-drive", published: true, page: "/old", opens: "2026-01-01", closes: "2026-01-08" },
  ],
};

function env(rows, opts) {
  return {
    WAIVERS_DB: db(rows, opts),
    ASSETS: { fetch: async () => new Response(JSON.stringify(CAMPAIGNS), { status: 200 }) },
  };
}

function req(path, headers = {}) {
  return new Request(`https://adapttolife.org${path}`, { headers });
}

async function go(path, rows, opts, headers) {
  _resetCaches();
  const e = env(rows, opts);
  const r = await handleQr(req(path, headers), e, new URL(`https://adapttolife.org${path}`), { waitUntil: (p) => p });
  return { res: r, env: e, loc: new URL(r.headers.get("Location")) };
}

const CHAIR = { slug: "chair", dest: "/send-6", rule: null, label: "Chair sticker", surface: "chair-sticker", active: 1 };

// --- the promise the whole platform exists to keep -------------------------

test("repointing a code changes the destination with no code change", async () => {
  const before = await go("/q/chair", [CHAIR]);
  assert.equal(before.loc.pathname, "/send-6");

  // The only thing that changed is the row. No deploy, no reprint.
  const after = await go("/q/chair", [{ ...CHAIR, dest: "/ways-to-give" }]);
  assert.equal(after.loc.pathname, "/ways-to-give");
});

test("a slug nobody ever minted still lands on /donate, never a 404", async () => {
  const { res, loc } = await go("/q/never-existed-anywhere", [CHAIR]);
  assert.equal(res.status, 302);
  assert.equal(loc.pathname, "/donate");
  assert.equal(loc.searchParams.get("src"), "qr-unknown");
});

test("a RETIRED code keeps redirecting — the sticker is still on the chair", async () => {
  const { res, loc, env: e } = await go("/q/chair", [{ ...CHAIR, active: 0 }]);
  assert.equal(res.status, 302);
  assert.equal(loc.pathname, "/send-6", "retiring must not break codes already printed");
  const scan = e.WAIVERS_DB.writes.find((w) => /qr_scans/.test(w.sql));
  assert.equal(scan.args[1], "retired", "but it is logged as a retired scan, not a healthy one");
});

test("D1 being down falls back to the seed map instead of failing the scan", async () => {
  const { res, loc } = await go("/q/chair", [], { failReads: true });
  assert.equal(res.status, 302);
  assert.equal(loc.pathname, "/send-6");
});

test("the redirect is never cached — that is the entire point", async () => {
  const { res } = await go("/q/chair", [CHAIR]);
  assert.match(res.headers.get("Cache-Control"), /no-store/);
});

// --- attribution: the difference between a scan count and a fundraising tool -

test("a same-site destination carries every attribution marker", async () => {
  const { loc } = await go("/q/chair", [CHAIR]);
  assert.equal(loc.searchParams.get("src"), "qr-chair");
  assert.equal(loc.searchParams.get("utm_source"), "qr");
  assert.equal(loc.searchParams.get("utm_medium"), "chair-sticker");
  assert.equal(loc.searchParams.get("utm_campaign"), "qr-chair");
  // The one Givebutter actually reads.
  assert.equal(loc.searchParams.get("gba_source"), "qr-chair");
});

test("a vendor destination gets standard utm only, never our Givebutter marker", async () => {
  const { loc } = await go("/q/popcorn", [
    { slug: "popcorn", dest: "https://popup.doublegood.com/s/89fjuv65", rule: null, label: "Popcorn", surface: "print", active: 1 },
  ]);
  assert.equal(loc.host, "popup.doublegood.com");
  assert.equal(loc.searchParams.get("utm_source"), "qr");
  assert.equal(loc.searchParams.get("gba_source"), null);
  assert.equal(loc.searchParams.get("src"), null);
});

test("an existing query string on the destination survives", async () => {
  const { loc } = await go("/q/x", [{ slug: "x", dest: "/donate?amount=25", rule: null, label: "x", surface: "print", active: 1 }]);
  assert.equal(loc.searchParams.get("amount"), "25");
  assert.equal(loc.searchParams.get("gba_source"), "qr-x");
});

// --- campaign-follow --------------------------------------------------------

test("campaign-follow routes to the drive that is open today", () => {
  assert.equal(resolveDest({ dest: "/donate", rule: "campaign-follow" }, CAMPAIGNS, "2026-08-10"), "/popcorn");
});

test("campaign-follow falls back to its own destination when no drive is open", () => {
  assert.equal(resolveDest({ dest: "/send-6", rule: "campaign-follow" }, CAMPAIGNS, "2026-09-01"), "/send-6");
});

test("a drive is open on its first and last day, and not a day either side", () => {
  assert.equal(liveDrive(CAMPAIGNS, "2026-08-06").to, "/popcorn");
  assert.equal(liveDrive(CAMPAIGNS, "2026-08-13").to, "/popcorn");
  assert.equal(liveDrive(CAMPAIGNS, "2026-08-05"), null);
  assert.equal(liveDrive(CAMPAIGNS, "2026-08-14"), null);
});

test("an unpublished drive is never followed", () => {
  const c = { drives: [{ slug: "d", published: false, page: "/d", opens: "2026-08-01", closes: "2026-08-31" }] };
  assert.equal(liveDrive(c, "2026-08-10"), null);
});

test("drive dates are read in Chicago, not UTC", () => {
  // 2026-08-14 00:30 UTC is still the 13th in Chicago — the drive's last day.
  assert.equal(chicagoToday(Date.UTC(2026, 7, 14, 0, 30)), "2026-08-13");
  assert.equal(chicagoToday(Date.UTC(2026, 7, 14, 6, 30)), "2026-08-14");
});

// --- P5 scan detail ---------------------------------------------------------

test("device is recorded coarsely and nothing finer", () => {
  assert.equal(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "ios");
  assert.equal(deviceOf("Mozilla/5.0 (Linux; Android 13; Pixel 7)"), "android");
  assert.equal(deviceOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "desktop");
  assert.equal(deviceOf(null), "unknown");
});

test("only the referrer host is stored, never the query someone typed", () => {
  assert.equal(referrerHost("https://www.google.com/search?q=private+thing"), "www.google.com");
  assert.equal(referrerHost("garbage"), null);
  assert.equal(referrerHost(null), null);
});

test("a scan records place and device from what Cloudflare already knows", async () => {
  const { env: e } = await go("/q/chair", [CHAIR], undefined, {
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
  });
  const scan = e.WAIVERS_DB.writes.find((w) => /qr_scans/.test(w.sql));
  assert.equal(scan.args[0], "chair");
  assert.equal(scan.args[1], "known");
  assert.equal(scan.args[5], "ios");
});

// The bug this locks down cost a production drill to find. In a Workers
// isolate Date.now() is frozen at the last I/O, so the scan time computed in
// the handler was two minutes stale on the very first real scans. Let the
// database stamp it: SQLite's clock is the only one here that always moves.
test("the scan time comes from the database, not the isolate's frozen clock", async () => {
  const { env: e } = await go("/q/chair", [CHAIR]);
  const scan = e.WAIVERS_DB.writes.find((w) => /qr_scans/.test(w.sql));
  assert.match(scan.sql, /strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/);
  assert.equal(scan.args.length, 7, "scanned_at must not be bound from JS");
});

// Same root cause, worse blast radius: a wall-clock TTL on the codes cache
// could never expire on a quiet isolate, so a repointed sticker would keep
// serving its old destination indefinitely with nothing to see. Codes are read
// fresh every time. This test deliberately does NOT reset caches.
test("a repoint is visible on the very next request, with no cache reset", async () => {
  const rows = [{ ...CHAIR }];
  const e = env(rows);
  const hit = async () => {
    const u = new URL("https://adapttolife.org/q/chair");
    const r = await handleQr(req("/q/chair"), e, u, { waitUntil: (p) => p });
    return new URL(r.headers.get("Location")).pathname;
  };
  assert.equal(await hit(), "/send-6");
  rows[0].dest = "/ways-to-give";          // the only thing that changed
  assert.equal(await hit(), "/ways-to-give", "a stale isolate cache would fail here");
});

test("when D1 goes down mid-life, the last good answer is still served", async () => {
  _resetCaches();
  const good = env([{ ...CHAIR, dest: "/ways-to-give" }]);
  const u = new URL("https://adapttolife.org/q/chair");
  await handleQr(req("/q/chair"), good, u, { waitUntil: (p) => p });

  // Same isolate, D1 now refusing reads. The seed says /send-6; last-known-good
  // says /ways-to-give, and the more recent truth should win.
  const down = env([], { failReads: true });
  const r = await handleQr(req("/q/chair"), down, u, { waitUntil: (p) => p });
  assert.equal(new URL(r.headers.get("Location")).pathname, "/ways-to-give");
});

// --- the admin write path: where a permanent mistake would be made ----------

test("a destination cannot be turned into an open redirect", () => {
  assert.equal(validateDest("/send-6"), null);
  assert.equal(validateDest("https://popup.doublegood.com/s/abc"), null);
  assert.ok(validateDest("javascript:alert(1)"), "javascript: must be refused");
  assert.ok(validateDest("//evil.example.com"), "protocol-relative must be refused");
  assert.ok(validateDest("data:text/html,<script>"), "data: must be refused");
  assert.ok(validateDest(""), "empty must be refused");
});

test("slugs are constrained to what is safe to print and type", () => {
  assert.equal(validateSlug("chair"), null);
  assert.equal(validateSlug("athlete-01"), null);
  assert.ok(validateSlug("Chair"), "uppercase would not survive the lowercasing in handleQr");
  assert.ok(validateSlug("has space"));
  assert.ok(validateSlug("-leading"));
  assert.ok(validateSlug("x".repeat(33)));
});

test("attribution markers are stable — they end up printed in reports", () => {
  assert.deepEqual(attributionParams("chair", "chair-sticker", true), {
    src: "qr-chair",
    utm_source: "qr",
    utm_medium: "chair-sticker",
    utm_campaign: "qr-chair",
    gba_source: "qr-chair",
  });
  assert.equal(attributionParams("who-knows", null, false).utm_campaign, "qr-unknown");
});

// --- P6: reading the marker back off a real Givebutter transaction ----------

test("the QR marker is found in either shape Givebutter returns", () => {
  assert.equal(markerFrom({ utm_parameters: { utm_campaign: "qr-chair" }, attribution_data: [] }), "chair");
  assert.equal(markerFrom({ utm_parameters: {}, attribution_data: [{ key: "source", value: "qr-sign" }] }), "sign");
  assert.equal(markerFrom({ utm_parameters: {}, attribution_data: { source: "qr-card" } }), "card");
  assert.equal(markerFrom({ utm_parameters: {}, attribution_data: [] }), null);
  assert.equal(markerFrom({}), null);
});

test("an unattributed gift is not guessed at", () => {
  assert.equal(markerFrom({ utm_parameters: { utm_source: "facebook", utm_campaign: "spring" } }), null);
});
