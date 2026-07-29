// Unit tests for src/receipts.js — the contact and grant-application receipts.
//
// What this pins, in order of how much it would hurt to get wrong:
//   1. A receipt can NEVER throw. By the time it runs the record is already in
//      ClickUp, so a thrown error would turn a saved grant application into a
//      "could not save" for the applicant. Every failure mode is swallowed.
//   2. The bcc to hello@ is present, because that single header is the entire
//      internal-notification mechanism. Losing it silently returns us to the
//      state Alec found: submissions landing with nobody told.
//   3. User text is escaped into the HTML body.
//
// Standalone `node --test` with a stub binding — same no-new-deps convention as
// the other tests here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendContactReceipt, sendApplyReceipt } from "../src/receipts.js";

function stubEnv({ throws = false } = {}) {
  const sent = [];
  return {
    sent,
    env: {
      SEND_EMAIL: {
        send(msg) {
          if (throws) throw new Error("simulated Email Service outage");
          sent.push(msg);
          return {};
        },
      },
    },
  };
}

test("contact receipt sends to the person and bccs the house address", async () => {
  const { env, sent } = stubEnv();
  const ok = await sendContactReceipt(env, {
    name: "Alec Tranel", email: "someone@example.com", message: "Hello", type: "Giving or sponsoring",
  });
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.equal(m.to, "someone@example.com");
  assert.equal(m.bcc, "hello@adapttolife.org");
  assert.equal(m.replyTo, "hello@adapttolife.org");
  assert.match(m.from, /hello@adapttolife\.org/);
  assert.ok(m.subject.length > 0);
  assert.ok(m.text.includes("Alec"), "greets by first name only");
  assert.ok(!m.text.includes("Tranel"), "does not use the full name in the greeting");
});

test("apply receipt names the next step and bccs the house address", async () => {
  const { env, sent } = stubEnv();
  const ok = await sendApplyReceipt(env, {
    name: "Jordan Rivers", email: "jordan@example.com", sport: "Wheelchair basketball", need: "Sport chair",
  });
  assert.equal(ok, true);
  const m = sent[0];
  assert.equal(m.bcc, "hello@adapttolife.org");
  assert.ok(/a person reads/i.test(m.text), "tells the applicant a person reads it");
  assert.ok(m.html.includes("Wheelchair basketball"));
  assert.ok(m.html.includes("Sport chair"));
});

// --- expectation-management copy -------------------------------------------
// These four pin sentences, which is unusual for a test suite and deliberate.
// The fund has a few hundred dollars in it and no grant has ever been made, so
// the receipt an applicant gets is the org's most consequential promise. Each
// line below was added to solve a specific failure: someone planning around a
// grant that is months away, or believing that fundraising buys consideration.
// A future copy edit that drops one should have to say so out loud.

test("apply receipt states the stage and refuses to promise a grant", async () => {
  const { env, sent } = stubEnv();
  await sendApplyReceipt(env, { name: "Jordan", email: "j@example.com" });
  const m = sent[0];
  assert.match(m.text, /not a promise of a grant/i, "must not imply funding is coming");
  assert.match(m.text, /still filling/i, "must name the stage the fund is actually at");
  assert.match(m.html, /not a promise of a grant/i);
});

test("apply receipt severs the fundraising invitation from the application", async () => {
  const { env, sent } = stubEnv();
  await sendApplyReceipt(env, { name: "Jordan", email: "j@example.com" });
  const m = sent[0];
  // An applicant must never believe that helping raise money buys them
  // consideration. This is a control, not a courtesy.
  assert.match(m.text, /no bearing on your application/i);
  assert.match(m.html, /no bearing on your application/i);
});

test("apply receipt quotes no fund figure when Givebutter is unreadable", async () => {
  const { env, sent } = stubEnv();
  // No GIVEBUTTER_API_KEY on this env, so fundPosition returns live:false.
  await sendApplyReceipt(env, { name: "Jordan", email: "j@example.com" });
  assert.ok(
    !/\$\d/.test(sent[0].text.replace(/EIN [\d-]+/g, "")),
    "a guessed dollar figure in writing to an applicant is worse than none"
  );
});

test("GRANTS_INBOX routes the application copy away from the shared inbox", async () => {
  const { env, sent } = stubEnv();
  env.GRANTS_INBOX = "grants@adapttolife.org";
  await sendApplyReceipt(env, { name: "Jordan", email: "j@example.com" });
  assert.equal(sent[0].bcc, "grants@adapttolife.org");
  assert.equal(sent[0].replyTo, "grants@adapttolife.org");
  // The contact form is ordinary correspondence and stays on hello@.
  await sendContactReceipt(env, { name: "Jordan", email: "j@example.com", message: "hi" });
  assert.equal(sent[1].bcc, "hello@adapttolife.org");
});

test("a send failure never throws — the submission is already saved", async () => {
  const { env } = stubEnv({ throws: true });
  const a = await sendContactReceipt(env, { name: "A", email: "a@example.com", message: "x" });
  const b = await sendApplyReceipt(env, { name: "B", email: "b@example.com" });
  assert.equal(a, false);
  assert.equal(b, false);
});

test("a missing SEND_EMAIL binding is quiet, not fatal — staging has none", async () => {
  const a = await sendContactReceipt({}, { name: "A", email: "a@example.com", message: "x" });
  const b = await sendApplyReceipt({}, { name: "B", email: "b@example.com" });
  assert.equal(a, false);
  assert.equal(b, false);
});

test("user text is escaped into the html body", async () => {
  const { env, sent } = stubEnv();
  await sendContactReceipt(env, {
    name: "X", email: "x@example.com", message: '<img src=x onerror="alert(1)">',
  });
  const html = sent[0].html;
  assert.ok(!html.includes("<img src=x"), "raw tag must not survive");
  assert.ok(html.includes("&lt;img"), "escaped form is present");
});

test("a missing name still produces a sane greeting", async () => {
  const { env, sent } = stubEnv();
  await sendContactReceipt(env, { name: "", email: "x@example.com", message: "hi" });
  assert.ok(sent[0].text.startsWith("Hi there,"));
});
