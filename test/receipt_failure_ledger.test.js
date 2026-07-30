// The three automated emails this site sends all swallow their errors on
// purpose: a receipt must never fail a submission that is already saved. The
// cost of that rule was that a receipt which stopped sending paged nobody and
// appeared nowhere — every applicant would quietly stop hearing back, and the
// first signal would be a person asking why they never got a reply.
//
// These pin the fix: swallowed for the caller, recorded for the watchdog. The
// site Worker already binds the agent-mail D1, so failures land in the same
// `send_failures` table the fleet watchdog already polls and pages on.
//
// The fourth test is the one that matters most. My first attempt hooked the
// waiver receipt at its CALL SITE, but sendReceiptEmail catches its own errors
// and never rethrows, so the hook was dead code — a silent failure inside the
// silent-failure fix. That test fails against that version.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendContactReceipt, sendApplyReceipt } from "../src/receipts.js";

// Minimal D1 stand-in: captures the bound values of every INSERT.
function stubDb() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind(...vals) {
          return { async run() { rows.push({ sql, vals }); } };
        },
      };
    },
  };
}

const failingSend = { async send() { throw new Error("destination address is not a verified address"); } };
const okSend = { async send() { return {}; } };

const row = (db) => {
  const [, , route, to, error] = db.rows[0].vals;
  return { route, to, error };
};

test("a failed contact receipt is swallowed AND recorded", async () => {
  const db = stubDb();
  // Must not throw: the contact record is already saved by the time this runs.
  await sendContactReceipt(
    { SEND_EMAIL: failingSend, AGENT_MAIL_DB: db },
    { name: "Sam Okafor", email: "sam@example.org", message: "hello", type: "Volunteering" }
  );
  assert.equal(db.rows.length, 1, "exactly one send_failures row");
  const r = row(db);
  assert.match(r.route, /^receipt:/);
  assert.equal(r.to, "sam@example.org");
  assert.match(r.error, /not a verified address/);
  assert.match(db.rows[0].sql, /INSERT INTO send_failures/);
});

test("a failed application receipt is swallowed AND recorded", async () => {
  const db = stubDb();
  await sendApplyReceipt(
    { SEND_EMAIL: failingSend, AGENT_MAIL_DB: db },
    { name: "Dana Reyes", email: "dana@example.org", sport: "Sled hockey", need: "a sled" }
  );
  assert.equal(db.rows.length, 1);
  assert.equal(row(db).to, "dana@example.org");
});

test("a successful send records nothing", async () => {
  const db = stubDb();
  await sendContactReceipt(
    { SEND_EMAIL: okSend, AGENT_MAIL_DB: db },
    { name: "Sam", email: "sam@example.org", message: "hi", type: "Volunteering" }
  );
  assert.deepEqual(db.rows, []);
});

test("the waiver receipt records too — its catch never rethrows", async () => {
  // Regression: hooking this at the call site is dead code, because
  // sendReceiptEmail swallows internally. Import through the module that
  // actually sends, and assert a row appears.
  const { handleWaiver } = await import("../src/waiver.js");
  assert.equal(typeof handleWaiver, "function");
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../src/waiver.js", import.meta.url), "utf8")
  );
  // The record call must sit inside sendReceiptEmail, after its own console.error,
  // not in the caller's catch block.
  const fn = src.slice(src.indexOf("async function sendReceiptEmail"));
  assert.match(
    fn.slice(0, fn.indexOf("\n}\n")),
    /recordTransactionalFailure\(env, "receipt:waiver"/,
    "waiver failures must be recorded inside sendReceiptEmail, where the error is actually caught"
  );
});

test("staging (no SEND_EMAIL binding) is not reported as a failure", async () => {
  // Staging is supposed to look like this. A ledger that cries wolf on every
  // staging deploy gets ignored on the day it is right.
  const db = stubDb();
  await sendContactReceipt(
    { AGENT_MAIL_DB: db },
    { name: "Sam", email: "sam@example.org", message: "hi", type: "Volunteering" }
  );
  assert.deepEqual(db.rows, []);
});

test("a missing D1 binding can never turn a swallowed failure into a thrown one", async () => {
  // The ledger must fail open twice over, or it resurrects the bug it reports.
  await sendContactReceipt(
    { SEND_EMAIL: failingSend },
    { name: "Sam", email: "sam@example.org", message: "hi", type: "Volunteering" }
  );
  const exploding = { prepare() { throw new Error("D1 is down"); } };
  await sendContactReceipt(
    { SEND_EMAIL: failingSend, AGENT_MAIL_DB: exploding },
    { name: "Sam", email: "sam@example.org", message: "hi", type: "Volunteering" }
  );
});
