// The two form gates in src/turnstile.js. Each test is one policy statement
// that could fail: fail-closed on a missing secret, explicit off, token
// required, the limiter's refuse/allow/missing-binding behaviour.
import test from "node:test";
import assert from "node:assert/strict";
import { verifyTurnstile, overFormLimit, RATE_LIMITED } from "../src/turnstile.js";

function stubFetch(t, handler) {
  const real = globalThis.fetch;
  globalThis.fetch = handler;
  t.after(() => { globalThis.fetch = real; });
}

test("turnstile: no secret and no explicit off -> refused (fails closed)", async (t) => {
  let called = false;
  stubFetch(t, async () => { called = true; return new Response("{}"); });
  assert.equal(await verifyTurnstile({}, "any-token", "1.2.3.4"), false);
  assert.equal(await verifyTurnstile({ TURNSTILE_MODE: "on" }, "any-token", "1.2.3.4"), false);
  assert.equal(called, false, "must not even call siteverify without a secret");
});

test('turnstile: TURNSTILE_MODE="off" is the one way to run without a secret', async (t) => {
  stubFetch(t, async () => { throw new Error("must not be called"); });
  assert.equal(await verifyTurnstile({ TURNSTILE_MODE: "off" }, "", ""), true);
  // A secret present wins over "off": the widget is verified when it can be.
  stubFetch(t, async () => new Response(JSON.stringify({ success: false })));
  assert.equal(await verifyTurnstile({ TURNSTILE_MODE: "off", TURNSTILE_SECRET_KEY: "s" }, "tok", ""), false);
});

test("turnstile: with a secret, a missing token is refused before any network call", async (t) => {
  let called = false;
  stubFetch(t, async () => { called = true; return new Response("{}"); });
  assert.equal(await verifyTurnstile({ TURNSTILE_SECRET_KEY: "s" }, "", "1.2.3.4"), false);
  assert.equal(called, false);
});

test("turnstile: siteverify decides, and is called with secret + token + ip", async (t) => {
  let seen = null;
  stubFetch(t, async (url, init) => {
    seen = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ success: true }));
  });
  assert.equal(await verifyTurnstile({ TURNSTILE_SECRET_KEY: "sek" }, "tok", "9.9.9.9"), true);
  assert.equal(seen.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.deepEqual(seen.body, { secret: "sek", response: "tok", remoteip: "9.9.9.9" });
  stubFetch(t, async () => { throw new Error("network down"); });
  assert.equal(await verifyTurnstile({ TURNSTILE_SECRET_KEY: "sek" }, "tok", ""), false, "a verify error is a refusal");
});

test("rate limit: keyed on CF-Connecting-IP, refuses when the limiter says no", async () => {
  const keys = [];
  const env = { FORM_LIMITER: { limit: async ({ key }) => { keys.push(key); return { success: keys.length <= 2 }; } } };
  const req = new Request("https://x/api/subscribe", { method: "POST", headers: { "CF-Connecting-IP": "5.5.5.5" } });
  assert.equal(await overFormLimit(env, req), false);
  assert.equal(await overFormLimit(env, req), false);
  assert.equal(await overFormLimit(env, req), true, "third call is over the stubbed limit");
  assert.deepEqual(keys, ["5.5.5.5", "5.5.5.5", "5.5.5.5"]);
  assert.equal(RATE_LIMITED.ok, false);
});

test("rate limit: a missing binding or a limiter error never blocks a person", async () => {
  const req = new Request("https://x/api/subscribe", { method: "POST" });
  assert.equal(await overFormLimit({}, req), false);
  assert.equal(await overFormLimit({ FORM_LIMITER: { limit: async () => { throw new Error("boom"); } } }, req), false);
});
