// The reports Worker (src/reports_worker.js) is the amelioration.is migration's
// first slice: a SEPARATE Worker that serves the two report surfaces and
// nothing else, behind Cloudflare Access on reports.amelioration.is.
//
// What is worth testing here is not "the report page renders" — report_view.js
// already owns that — but the BOUNDARY: everything the ATL Worker can do that
// this one must not. Static assets, forms, waivers, the agent-mail API, the
// signing-hub and /review redirects: each must come back as the same plain 404
// a bad token gets, and none of them may reach a binding. The env stubs below
// therefore THROW if touched, so a leak fails loudly instead of silently
// serving.
//
// Standalone `node --test` with stub D1 — same no-new-deps convention as the
// other tests here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  makeReportToken,
  makeLibraryToken,
  handleReportView,
} from "../src/report_view.js";
import worker from "../src/reports_worker.js";

const SECRET = "report-secret-for-tests";
const MSG_ID = "5b2f2a10-9d1c-4f4e-8a30-1c2d3e4f5a6b";
const EMAIL = "nick@example.com";

const REPORT_MD = ["# Daily brief", "", "A short paragraph of report body."].join("\n");

const ROW = {
  id: MSG_ID,
  subject: "Daily brief <Liberty One>",
  from_addr: "charlie@agents.adapttolife.org",
  created_at: "2026-07-18 12:00:00",
  body_markdown: REPORT_MD,
};

// D1 stub covering both surfaces: the message-by-id read (/r/) and the
// per-recipient list (/lib/).
function db(row, rows) {
  return {
    prepare(sql) {
      return {
        bind() {
          return {
            async first() {
              return /FROM messages WHERE id = \?/.test(sql) ? row : null;
            },
            async all() {
              return { results: /lower\(to_addr\) = \?/.test(sql) ? rows : [] };
            },
          };
        },
      };
    },
  };
}

// Every binding the ATL Worker has that this one must not use. Touching one is
// the failure.
function env(extra = {}) {
  const boom = (name) => new Proxy({}, {
    get() { throw new Error(`reports Worker touched ${name}`); },
  });
  return {
    REPORT_LINK_SECRET: SECRET,
    REPORT_LINK_BASE: "https://reports.amelioration.is",
    AGENT_MAIL_DB: db(ROW, [ROW]),
    ASSETS: { fetch() { throw new Error("reports Worker served a static asset"); } },
    WAIVERS_DB: boom("WAIVERS_DB"),
    WAIVERS_BUCKET: boom("WAIVERS_BUCKET"),
    AGENT_MAIL_BUCKET: boom("AGENT_MAIL_BUCKET"),
    SEND_EMAIL: boom("SEND_EMAIL"),
    ...extra,
  };
}

function get(path, init = {}) {
  return worker.fetch(new Request(`https://reports.amelioration.is${path}`, init), env(), {});
}

// The one 404 every failure mode must be indistinguishable from: the one a
// tampered token already gets from handleReportView.
async function canonical404() {
  const req = new Request("https://reports.amelioration.is/r/garbage");
  return handleReportView(req, env(), new URL(req.url));
}

async function assertSame404(res) {
  const want = await canonical404();
  assert.equal(res.status, 404);
  assert.equal(await res.clone().text(), await want.clone().text());
  for (const [k, v] of want.headers) {
    assert.equal(res.headers.get(k), v, `404 header ${k} differs`);
  }
  assert.equal([...res.headers].length, [...want.headers].length, "404 has extra headers");
}

// ---- the two surfaces that DO exist ----------------------------------------

test("GET /r/<token> serves the report page through handleReportView", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const res = await get(`/r/${token}`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/html/);
  assert.equal(res.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(res.headers.get("Cache-Control"), "private, no-store");
  assert.match(await res.text(), /Daily brief/);
});

test("GET /lib/<token> serves the report library through handleLibraryView", async () => {
  const token = await makeLibraryToken(SECRET, EMAIL);
  const res = await get(`/lib/${token}`);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Report library/);
  assert.match(html, /nick@example\.com/);
  // Links minted on this Worker point at this Worker's own origin.
  assert.match(html, /https:\/\/reports\.amelioration\.is\/r\//);
});

test("HEAD /r/<token> answers with the GET status and headers, no body", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const res = await get(`/r/${token}`, { method: "HEAD" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type"), /text\/html/);
  assert.equal(await res.text(), "");
});

test("HEAD /lib/<token> answers with the GET status and headers, no body", async () => {
  const token = await makeLibraryToken(SECRET, EMAIL);
  const res = await get(`/lib/${token}`, { method: "HEAD" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});

// ---- no regression of report-token behavior --------------------------------

test("token discipline is unchanged: garbage, tampered, empty → the same 404", async () => {
  await assertSame404(await get("/r/garbage"));
  const token = await makeReportToken(SECRET, MSG_ID);
  const flipped = token.slice(0, 5) + (token[5] === "A" ? "B" : "A") + token.slice(6);
  await assertSame404(await get(`/r/${flipped}`));
  await assertSame404(await get("/r/"));
  await assertSame404(await get("/lib/garbage"));
  await assertSame404(await get("/lib/"));
});

test("a token valid for one surface is not valid for the other", async () => {
  const report = await makeReportToken(SECRET, MSG_ID);
  const library = await makeLibraryToken(SECRET, EMAIL);
  await assertSame404(await get(`/lib/${report}`));
  await assertSame404(await get(`/r/${library}`));
});

test("a nested path under a surface is not a token", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  await assertSame404(await get(`/r/${token}/extra`));
});

test("no secret configured → the same 404 for a well-formed token", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const e = env();
  delete e.REPORT_LINK_SECRET;
  const res = await worker.fetch(new Request(`https://reports.amelioration.is/r/${token}`), e, {});
  assert.equal(res.status, 404);
});

// ---- the boundary: everything the ATL Worker does that this one must not ----

test("no static assets: the site root and any asset path 404 without touching ASSETS", async () => {
  await assertSame404(await get("/"));
  await assertSame404(await get("/index.html"));
  await assertSame404(await get("/apply"));
  await assertSame404(await get("/assets/site.css"));
  await assertSame404(await get("/build.txt"));
});

test("no forms: the API routes 404 rather than answering or 405-ing", async () => {
  for (const path of ["/api/contact", "/api/apply", "/api/subscribe", "/api/raised"]) {
    await assertSame404(await get(path, { method: "POST", body: "{}" }));
    await assertSame404(await get(path));
  }
});

test("no waivers", async () => {
  await assertSame404(await get("/api/waiver", { method: "POST", body: "{}" }));
  await assertSame404(await get("/api/waiver/doc"));
  await assertSame404(await get("/api/waiver/abc123"));
  await assertSame404(await get("/waiver"));
});

test("no agent-mail API, even with a bearer token", async () => {
  const init = { method: "POST", headers: { Authorization: "Bearer whatever" }, body: "{}" };
  await assertSame404(await get("/api/agent-mail/threads", init));
  await assertSame404(await get("/api/agent-mail/send", init));
  await assertSame404(await get("/api/agent-mail/threads"));
});

test("no QR redirects", async () => {
  await assertSame404(await get("/q/chair-42"));
});

test("no redirect behavior: nothing here 3xx-es", async () => {
  for (const path of ["/", "/review", "/review.html", "/r", "/lib", "/r/../api/contact"]) {
    const res = await get(path);
    assert.ok(res.status < 300 || res.status >= 400, `${path} redirected (${res.status})`);
    assert.equal(res.headers.get("Location"), null);
  }
});

test("the signing hub's root redirect does not exist on this Worker", async () => {
  const res = await worker.fetch(new Request("https://sign.adapttolife.org/"), env(), {});
  await assertSame404(res);
});

test("legacy hostnames get no special treatment: only /r/ and /lib/ are served", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  const ok = await worker.fetch(new Request(`https://adapttolife.org/r/${token}`), env(), {});
  assert.equal(ok.status, 200);
  await assertSame404(await worker.fetch(new Request("https://adapttolife.org/"), env(), {}));
});

test("unsupported methods on a valid token → the same 404", async () => {
  const token = await makeReportToken(SECRET, MSG_ID);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    await assertSame404(await get(`/r/${token}`, { method }));
    await assertSame404(await get(`/lib/${token}`, { method }));
  }
});

// ---- least privilege, structurally -----------------------------------------

test("the Worker exposes fetch only — no email, no cron", () => {
  assert.equal(typeof worker.fetch, "function");
  assert.equal(worker.email, undefined, "an email handler would accept inbound mail here");
  assert.equal(worker.scheduled, undefined, "a cron handler would run the Drive backlog here");
});

test("the Worker imports report rendering and nothing else (source pin)", () => {
  const src = readFileSync(fileURLToPath(new URL("../src/reports_worker.js", import.meta.url)), "utf8");
  const imports = [...src.matchAll(/^import[^\n]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
  assert.deepEqual(imports, ["./report_view.js"]);
});
