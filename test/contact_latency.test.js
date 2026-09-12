// Pins the regression Alec caught by using his own contact form: the receipt was
// awaited before the response, so a live Email Service round-trip sat on the
// critical path and the form hung while the submitter watched a spinner.
//
// The fix is ctx.waitUntil, and the thing worth testing is not "waitUntil was
// called" but the property that matters: THE RESPONSE DOES NOT WAIT FOR THE
// SEND. So the send here is deliberately slow, and the test asserts the handler
// returns long before it finishes.
//
// Standalone `node --test` with a stubbed global fetch (ClickUp) and a stubbed
// SEND_EMAIL binding — same no-new-deps convention as the other tests here.
import { test } from "node:test";
import assert from "node:assert/strict";
import {formBindings} from "./helpers/form-db.js";

const SLOW_MS = 1500;

// The Worker module reads nothing at import time, so a plain dynamic import
// after installing the fetch stub is enough.
async function loadWorker() {
  return (await import("../src/index.js")).default;
}

function stubFetch() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    // ClickUp task create — the only outbound call on this path.
    if (String(url).includes("api.clickup.com")) {
      return new Response(JSON.stringify({ id: "86bTEST", url: "https://app.clickup.com/t/86bTEST" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error("unexpected fetch to " + url);
  };
  return () => { globalThis.fetch = realFetch; };
}

function env(sendStarted, sendFinished) {
  return {
    ...formBindings(),
    CLICKUP_TOKEN: "tok", CLICKUP_CONTACTS_LIST_ID: "901418639884",
    // No TURNSTILE_SECRET_KEY; verifyTurnstile fails CLOSED unless a lane says
    // so explicitly. This test is about latency, not the challenge.
    TURNSTILE_MODE: "off",
    SEND_EMAIL: {
      async send() {
        sendStarted.push(Date.now());
        await new Promise((r) => setTimeout(r, SLOW_MS));
        sendFinished.push(Date.now());
        return {};
      },
    },
  };
}

function contactRequest() {
  return new Request("https://adapttolife.org/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fn: "Alec", ln: "Tranel", em: "a@example.com", msg: "Hello", rsn: "" }),
  });
}

test("the contact response does not wait for the receipt to send", async () => {
  const restore = stubFetch();
  try {
    const worker = await loadWorker();
    const started = [], finished = [];
    const scheduled = [];
    const ctx = { waitUntil: (p) => scheduled.push(p) };

    const t0 = Date.now();
    const res = await worker.fetch(contactRequest(), env(started, finished), ctx);
    const elapsed = Date.now() - t0;

    assert.equal(res.status, 200);
    const result = await res.json();
    assert.equal(result.ok, true);
    assert.match(result.receipt, /^[0-9a-f-]{36}$/);

    // The whole point. A 1.5s send must not show up in the response time.
    assert.ok(elapsed < SLOW_MS / 2,
      `response took ${elapsed}ms with a ${SLOW_MS}ms send — the receipt is back on the critical path`);
    assert.equal(finished.length, 0, "send had not finished when the response was returned");
    // One durable dispatcher; raw record + independent steps already exist.
    // Losing waitUntil cannot lose the work: scheduled recovery reads the outbox.
    assert.equal(scheduled.length, 1, "one durable dispatcher accelerates the persisted work");

    // And it does still actually complete afterwards.
    await Promise.all(scheduled);
    assert.equal(finished.length, 1, "the receipt still sends after the response");
  } finally {
    restore();
  }
});

test("a missing ctx does not break or delay the submission", async () => {
  const restore = stubFetch();
  try {
    const worker = await loadWorker();
    const started = [], finished = [];
    const t0 = Date.now();
    // No ctx at all — must not throw on ctx.waitUntil, must not hang.
    const res = await worker.fetch(contactRequest(), env(started, finished), undefined);
    const elapsed = Date.now() - t0;
    assert.equal(res.status, 200);
    assert.ok(elapsed < SLOW_MS / 2, `response took ${elapsed}ms without a ctx`);
  } finally {
    restore();
  }
});
