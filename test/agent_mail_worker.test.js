// Dedicated agent-mail Worker boundary tests.
//
// The Worker owns exactly the authenticated machine API and Cloudflare Email
// Worker event. Everything else must look absent so the private hostname cannot
// accidentally grow public-site, waiver, report-viewer, QR, cron, or asset
// behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/agent_mail_worker.js";

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

test("the entrypoint exposes inbound email but no scheduled handler", () => {
  assert.equal(typeof worker.email, "function");
  assert.equal(worker.scheduled, undefined);
});
