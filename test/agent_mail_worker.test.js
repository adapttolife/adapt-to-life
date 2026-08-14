// Dedicated agent-mail Worker boundary tests.
//
// The Worker owns exactly the authenticated machine API and Cloudflare Email
// Worker event. Everything else must look absent so the private hostname cannot
// accidentally grow public-site, waiver, report-viewer, QR, cron, or asset
// behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/agent_mail_worker.js";
import { forwardHumanMirror, handleEmail } from "../src/agent_mail.js";

function authDb(agent = null) {
  return {
    prepare() {
      return {
        bind() { return this; },
        async first() { return agent ? { agent } : null; },
      };
    },
  };
}

test("machine API namespace reaches the shared handler and keeps app-layer auth", async () => {
  const env = { AGENT_MAIL_DB: authDb(), AGENT_MAIL_TOKEN: "operator-secret" };
  const res = await worker.fetch(new Request("https://api.amelioration.is/api/agent-mail/list"), env);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { outcome: "error", error: "unauthorized" });
});

test("every off-surface HTTP path returns the same no-store 404", async () => {
  for (const [method, path] of [
    ["GET", "/"],
    ["GET", "/r/token"],
    ["GET", "/lib/token"],
    ["GET", "/api/contact"],
    ["POST", "/api/waiver"],
    ["GET", "/q/test"],
    ["GET", "/api/agent-mail"],
  ]) {
    const res = await worker.fetch(new Request(`https://api.amelioration.is${path}`, { method }), {});
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.equal(await res.text(), "Not found");
  }
});

test("unsupported methods inside the API namespace are handled by the API, not assets", async () => {
  const env = { AGENT_MAIL_DB: authDb(), AGENT_MAIL_TOKEN: "operator-secret" };
  const res = await worker.fetch(new Request("https://api.amelioration.is/api/agent-mail/list", {
    method: "PUT",
    headers: { Authorization: "Bearer operator-secret" },
  }), env);
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { outcome: "error", error: "not found" });
});

test("the entrypoint exposes inbound email and lifecycle queue, but no scheduled handler", () => {
  assert.equal(typeof worker.email, "function");
  assert.equal(typeof worker.queue, "function");
  assert.equal(worker.scheduled, undefined);
});

test("Stingel inbound mail is mirrored to Alec with provenance", async () => {
  const calls = [];
  const message = {
    to: "Stingel@AlecTranel.com",
    async forward(destination, headers) {
      calls.push({ destination, headers });
    },
  };

  await forwardHumanMirror(message);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].destination, "alec@alecability.com");
  assert.equal(calls[0].headers.get("X-Agent-Mail-Original-Recipient"), "stingel@alectranel.com");
});

test("other agent inboxes are not mirrored to Alec", async () => {
  let forwarded = false;
  await forwardHumanMirror({
    to: "julia@alectranel.com",
    async forward() { forwarded = true; },
  });
  assert.equal(forwarded, false);
});

test("Stingel mirror failures remain loud for platform retry", async () => {
  const message = {
    to: "stingel@alectranel.com",
    async forward() {
      throw new Error("simulated destination failure");
    },
  };

  await assert.rejects(
    forwardHumanMirror(message),
    /simulated destination failure/,
  );
});

test("handleEmail archives and records before forwarding Stingel mail", async () => {
  const events = [];
  const thread = {
    id: "thread-1",
    inbox: "stingel@alectranel.com",
    assigned_agent: null,
  };
  const db = {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() {
          if (sql.includes("FROM inbox_locks")) return { results: [] };
          if (sql.includes("FROM threads WHERE inbox")) return { results: [] };
          return { results: [] };
        },
        async first() {
          if (sql.includes("SELECT default_agent FROM inboxes")) return null;
          if (sql.includes("SELECT * FROM threads WHERE id")) return thread;
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO messages")) events.push("message");
          return { success: true };
        },
      };
    },
  };
  const raw = [
    "From: Vendor <billing@vendor.example>",
    "To: stingel@alectranel.com",
    "Subject: Receipt canary",
    "Message-ID: <receipt-canary@example>",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Synthetic receipt body",
  ].join("\r\n");
  const message = {
    from: "billing@vendor.example",
    to: "stingel@alectranel.com",
    raw: new Response(raw).body,
    async forward() { events.push("forward"); },
  };
  const env = {
    AGENT_MAIL_DB: db,
    AGENT_MAIL_BUCKET: {
      async put() { events.push("archive"); },
    },
  };

  await handleEmail(message, env, { waitUntil() {} });

  assert.deepEqual(events, ["archive", "message", "forward"]);
});
