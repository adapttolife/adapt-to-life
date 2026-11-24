// The form outbox on Resend (src/forms.js, src/form-records.js; docs/EMAIL.md
// "How a site sends"): rows belong to the environment that wrote them, the
// receipt is rendered once and resent byte-identical under one key, retryable
// failures back off inside 23 hours, and the D1 change is additive.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { formBindings, sqliteD1 } from "./helpers/form-db.js";
import { acceptForm, processForm, sweepForms, retryDelayMs } from "../src/forms.js";
import {
  claimAndThank,
  recordGift,
  recoverDonorEmails,
} from "../src/givebutter_webhook.js";
import { windowOpen, windowRefusal } from "../src/mail-window.js";
import { sendBetaTesterInvitation } from "../src/index.js";
import { sendMail } from "../src/mail-transport.js";
import { sendAdminLink } from "../src/asnm_admin_auth.js";
import { notifyIntakeRow } from "../src/intake.js";
import {
  D1_SCHEMAS,
  buildExpected,
  describeLocal,
  diffSchema,
} from "../scripts/lib/d1-schema.mjs";

const sub = {
  name: "Offline Applicant",
  email: "applicant@example.com",
  message: "Hello",
  sport: "Pickleball",
  need: "A sport chair",
  type: "General question",
  source: "Contact page",
};
const RESEND = {
  MAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "re_test",
  MAIL_FROM_DOMAINS: "mail.adapttolife.org,mail.adaptbodyshop.com",
};

// Resend stand-in: `plan` is a list of responses (status numbers or "throw");
// after it runs out, every call is accepted.
let calls, plan;
let originalFetch;
beforeEach(() => {
  calls = [];
  plan = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (url !== "https://api.resend.com/emails")
      throw Error("Offline test forbids " + url);
    const key = init.headers["Idempotency-Key"];
    calls.push({ key, body: JSON.parse(init.body), raw: init.body });
    // The plan applies to everything but the contact form's original copy,
    // which runs alongside the receipt in no fixed order.
    const next = key.startsWith("contact-original-") ? undefined : plan.shift();
    if (next === "throw") throw new DOMException("timed out", "TimeoutError");
    if (typeof next === "number")
      return Response.json({ name: "err" }, { status: next });
    return Response.json({ id: "re-" + calls.length });
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function env(extra = {}) {
  return {
    ...formBindings(),
    ...RESEND,
    ENV_NAME: "production",
    AGENT_MAIL_DB: sqliteD1(
      "CREATE TABLE send_failures (id TEXT PRIMARY KEY, ts INTEGER, route TEXT, to_addr TEXT, error TEXT);",
    ),
    ...extra,
  };
}
const receiptRow = (e) =>
  e.WAIVERS_DB.sql
    .prepare("SELECT * FROM form_deliveries WHERE channel='receipt'")
    .get();
const receiptCalls = () => calls.filter((c) => c.key.startsWith("receipt-"));
const failures = (e) =>
  e.AGENT_MAIL_DB.sql.prepare("SELECT * FROM send_failures").all();

test("a row records the environment that wrote it, and only that environment sends it", async () => {
  const staging = env({
    ENV_NAME: "staging",
    MAIL_ALLOW: "hello@adapttolife.org,@adapttolife.org",
  });
  const a = await acceptForm(staging, "contact", sub);
  assert(a.ok);
  const envs = staging.WAIVERS_DB.sql
    .prepare(
      "SELECT env FROM form_deliveries UNION ALL SELECT env FROM form_record_deliveries",
    )
    .all()
    .map((r) => r.env);
  assert.deepEqual(envs, ["staging", "staging", "staging"]);

  // Production shares the database: its sweep and a direct dispatch both skip it.
  const production = { ...staging, ENV_NAME: "production" };
  delete production.MAIL_ALLOW;
  await processForm(production, a.id);
  await sweepForms(production);
  assert.equal(calls.length, 0, "production never mails a staging row");
  assert.equal(receiptRow(staging).state, "pending");

  // Staging sends its own: the applicant is not on the allow list (dropped, done,
  // with a note); the original copy to hello@ is, so it goes.
  await processForm(staging, a.id);
  const r = receiptRow(staging);
  assert.equal(r.state, "done");
  assert.match(r.error, /^Not sent: dropped outside production \(not-allowed\)/);
  assert.deepEqual(JSON.parse(r.receipt), { dropped: true, reason: "not-allowed" });
  assert.equal(receiptCalls().length, 0);
  assert.deepEqual(
    calls.map((c) => c.key),
    [`contact-original-${a.id}`],
  );
  const original = calls[0].body;
  assert.deepEqual(original.to, ["hello@adapttolife.org"]);
  assert.deepEqual(
    original.tags.map((t) => [t.name, t.value]),
    [
      ["brand", "adapttolife"],
      ["kind", "contact-original"],
      ["env", "staging"],
    ],
  );
});

test("a staging submission stays out of the shared intake (and so the CRM)", async () => {
  const staging = env({ ENV_NAME: "staging", MAIL_ALLOW: "@adapttolife.org" });
  const a = await acceptForm(staging, "contact", sub);
  await processForm(staging, a.id);
  const intake = staging.WAIVERS_DB.sql
    .prepare("SELECT * FROM form_deliveries WHERE channel='intake'")
    .get();
  assert.equal(intake.state, "done");
  assert.match(intake.error, /^Not mirrored: staging rows stay out/);
  assert.equal(staging.INTAKE.sql.prepare("SELECT count(*) n FROM intake").get().n, 0);
  assert.equal(
    staging.INTAKE.sql.prepare("SELECT count(*) n FROM intake_delivery_claims").get().n,
    0,
  );
  const original = staging.WAIVERS_DB.sql
    .prepare("SELECT * FROM form_record_deliveries")
    .get();
  assert.equal(original.state, "done");
  assert.ok(original.mirrored_at, "closed without touching the shared intake");
});

test("rows written before the env column count as production's", async () => {
  const e = env();
  const a = await acceptForm(e, "volunteer", { ...sub, roles: ["Event crew"] });
  e.WAIVERS_DB.sql.exec("UPDATE form_deliveries SET env='production'");
  await processForm(e, a.id);
  assert.equal(receiptRow(e).state, "done");
  const legacy = env({ ENV_NAME: undefined });
  const b = await acceptForm(legacy, "volunteer", { ...sub, roles: ["Event crew"] });
  assert.equal(
    legacy.WAIVERS_DB.sql.prepare("SELECT DISTINCT env FROM form_deliveries").get().env,
    "production",
  );
  assert.ok(b.ok);
});

test("the receipt is rendered once and every retry sends exactly that, under one key", async () => {
  const e = env();
  const a = await acceptForm(e, "apply", sub);
  plan = [503];
  await processForm(e, a.id);
  let r = receiptRow(e);
  assert.equal(r.state, "pending");
  assert.equal(r.attempts, 1);
  assert.ok(r.first_attempted_at);
  assert.ok(r.rendered, "the rendered email is stored on the first attempt");
  const due = Date.parse(r.next_attempt_at) - Date.now();
  assert.ok(due > 9 * 60e3 && due <= 10 * 60e3, "backs off ten minutes");
  assert.equal(failures(e).length, 1, "the first failed send is reported");

  // Not due yet: a sweep leaves it alone.
  await sweepForms(e);
  assert.equal(receiptCalls().length, 1);

  // The stored copy wins over a fresh render (say the fund total moved).
  const stored = JSON.parse(r.rendered);
  stored.text = stored.text.replace("Your application reached us.", "FROZEN COPY.");
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE form_deliveries SET rendered=?, next_attempt_at=? WHERE channel='receipt'",
    )
    .run(JSON.stringify(stored), new Date(Date.now() - 1000).toISOString());
  await sweepForms(e);
  r = receiptRow(e);
  assert.equal(r.state, "done");
  assert.equal(r.attempts, 2);
  const [first, second] = receiptCalls();
  assert.equal(first.key, `receipt-apply-${a.id}`);
  assert.equal(second.key, first.key);
  // The second send is the stored copy, field for field, not a fresh render.
  assert.match(second.body.text, /^Hi Offline,\n\nFROZEN COPY\./);
  assert.equal(second.body.text, stored.text);
  assert.equal(second.body.html, stored.html);
  assert.equal(second.body.subject, stored.subject);
  assert.notEqual(
    second.body.text,
    first.body.text,
    "a fresh render would not say FROZEN",
  );
  const receipt = JSON.parse(r.receipt);
  assert.equal(receipt.messageId, "re-" + (calls.indexOf(second) + 1));
  assert.equal(receipt.provider, "resend");
});

test("an unchanged row resends byte-identical JSON", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  plan = ["throw"];
  await processForm(e, a.id);
  e.WAIVERS_DB.sql.exec(
    `UPDATE form_deliveries SET next_attempt_at='${new Date(Date.now() - 1).toISOString()}' WHERE channel='receipt'`,
  );
  await sweepForms(e);
  const [first, second] = receiptCalls();
  assert.equal(second.raw, first.raw);
  assert.equal(receiptRow(e).state, "done");
});

const ago = (ms) => new Date(Date.now() - ms).toISOString();
const HOUR = 3600e3;

test("past 23 hours from the first attempt, a due receipt is never sent: it goes to review", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  plan = [503];
  await processForm(e, a.id);
  assert.equal(receiptCalls().length, 1);
  // The row is due again, but its window has closed.
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE form_deliveries SET first_attempted_at=?, next_attempt_at=? WHERE channel='receipt'",
    )
    .run(ago(23 * HOUR + 1000), ago(1000));
  await sweepForms(e);
  assert.equal(receiptCalls().length, 1, "ZERO sends after 23 hours");
  const r = receiptRow(e);
  assert.equal(r.state, "review");
  assert.match(r.error, /Retry window closed/);
  assert.equal(r.next_attempt_at, null);
  assert.ok(
    failures(e).some((f) => /Retry window closed/.test(f.error)),
    "the person who reviews it is told",
  );
});

test("a retry is never scheduled past the cutoff, and none is scheduled when no time is left", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  plan = ["throw"];
  await processForm(e, a.id);
  // Fail again at 22h50m: a 20-minute backoff would land past 23 hours.
  const first = ago(22 * HOUR + 50 * 60e3);
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE form_deliveries SET first_attempted_at=?, next_attempt_at=? WHERE channel='receipt'",
    )
    .run(first, ago(1000));
  plan = [503];
  await sweepForms(e);
  let r = receiptRow(e);
  assert.equal(r.state, "pending");
  assert.ok(
    Date.parse(r.next_attempt_at) <= Date.parse(first) + 23 * HOUR - 60e3,
    "clamped a minute inside the cutoff",
  );
  // Fail at 22h59m30s: no try fits, so review now, not a doomed schedule.
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE form_deliveries SET first_attempted_at=?, next_attempt_at=? WHERE channel='receipt'",
    )
    .run(ago(23 * HOUR - 30e3), ago(1000));
  plan = [503];
  await sweepForms(e);
  r = receiptRow(e);
  assert.equal(r.state, "review");
  assert.equal(r.next_attempt_at, null);
});

test("the clock starts only once mail is configured, and the first failed send alerts whatever the attempt number", async () => {
  const e = env({ RESEND_API_KEY: "" });
  const a = await acceptForm(e, "contact", sub);
  await processForm(e, a.id);
  let r = receiptRow(e);
  assert.equal(r.state, "pending");
  assert.equal(r.first_attempted_at, null, "no clock while nothing could be sent");
  assert.equal(r.rendered, null);
  const original = () =>
    e.WAIVERS_DB.sql.prepare("SELECT * FROM form_record_deliveries").get();
  assert.equal(original().first_attempted_at, null);
  assert.equal(calls.length, 0);
  // Configured now; attempt 2 is the first real send, and it fails.
  e.RESEND_API_KEY = "re_test";
  plan = [503];
  await processForm(e, a.id);
  r = receiptRow(e);
  assert.equal(r.attempts, 2);
  assert.ok(r.first_attempted_at);
  assert.equal(r.state, "pending");
  assert.ok(original().first_attempted_at);
  assert.equal(
    failures(e).filter((f) => f.route === "receipt:contact receipt").length,
    1,
    "alerted on the first failed send although it was attempt 2",
  );
});

test("a non-retryable failure goes straight to review", async () => {
  const e = env();
  const a = await acceptForm(e, "volunteer", { ...sub, roles: ["Coach"] });
  plan = [422];
  await processForm(e, a.id);
  const r = receiptRow(e);
  assert.equal(r.state, "review");
  assert.match(r.error, /422/);
  await sweepForms(e);
  assert.equal(receiptCalls().length, 1, "never retried");
  assert.equal(failures(e).length, 1);
  assert.equal(failures(e)[0].route, "receipt:volunteer receipt");
});

test("backoff doubles from ten minutes and is capped at three hours", () => {
  assert.equal(retryDelayMs(1), 10 * 60e3);
  assert.equal(retryDelayMs(2), 20 * 60e3);
  assert.equal(retryDelayMs(5), 160 * 60e3);
  assert.equal(retryDelayMs(9), 3 * 3600e3);
});

test("an interrupted Resend receipt with its frozen copy is delivered once on the next sweep", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  // Attempt 1 froze the copy and then the isolate died mid-send.
  plan = ["throw"];
  await processForm(e, a.id);
  const frozen = receiptRow(e).rendered;
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE form_deliveries SET state='running', started_at=?, next_attempt_at=NULL WHERE channel='receipt'",
    )
    .run(ago(20 * 60e3));
  await sweepForms(e);
  const sends = receiptCalls();
  assert.equal(sends.length, 2, "the interrupted receipt went out on this sweep");
  assert.equal(sends[1].key, sends[0].key, "under the same key");
  assert.equal(sends[1].body.text, JSON.parse(frozen).text, "the frozen copy");
  assert.equal(receiptRow(e).state, "done");
  assert.equal(failures(e).filter((f) => /interrupted/.test(f.route)).length, 0);
});

test("an interrupted send with no frozen copy goes to review, and a person is told", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE form_deliveries SET state='running', started_at=? WHERE channel='receipt'",
    )
    .run(ago(20 * 60e3));
  e.WAIVERS_DB.sql
    .prepare("UPDATE form_record_deliveries SET state='running', started_at=?")
    .run(ago(20 * 60e3));
  await sweepForms(e);
  assert.equal(receiptRow(e).state, "review");
  assert.equal(receiptCalls().length, 0);
  const routes = failures(e)
    .map((f) => f.route)
    .sort();
  assert.deepEqual(routes, [
    "receipt:interrupted contact original",
    "receipt:interrupted receipt",
  ]);
  void a;
});

test("past 23 hours, the contact original copy is never sent either", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  e.WAIVERS_DB.sql
    .prepare("UPDATE form_record_deliveries SET first_attempted_at=?")
    .run(ago(23 * HOUR + 1000));
  // Keep the receipt out of it.
  e.WAIVERS_DB.sql.exec("UPDATE form_deliveries SET next_attempt_at='9999'");
  await processForm(e, a.id);
  assert.equal(calls.filter((c) => c.key.startsWith("contact-original-")).length, 0);
  const o = e.WAIVERS_DB.sql.prepare("SELECT * FROM form_record_deliveries").get();
  assert.equal(o.state, "review");
  assert.match(o.error, /Retry window closed/);
});

test("the contact original copy retries a retryable failure with backoff", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  plan = [];
  // Fail only the original copy.
  globalThis.fetch = async (url, init) => {
    const key = init.headers["Idempotency-Key"];
    calls.push({ key, body: JSON.parse(init.body) });
    if (
      key.startsWith("contact-original-") &&
      calls.filter((c) => c.key === key).length === 1
    )
      return Response.json({}, { status: 502 });
    return Response.json({ id: "re-" + calls.length });
  };
  await processForm(e, a.id);
  let o = e.WAIVERS_DB.sql.prepare("SELECT * FROM form_record_deliveries").get();
  assert.equal(o.state, "pending");
  assert.ok(o.next_attempt_at && o.first_attempted_at);
  e.WAIVERS_DB.sql.exec(
    `UPDATE form_record_deliveries SET next_attempt_at='${new Date(Date.now() - 1).toISOString()}'`,
  );
  await sweepForms(e);
  o = e.WAIVERS_DB.sql.prepare("SELECT * FROM form_record_deliveries").get();
  assert.equal(o.state, "done");
  assert.deepEqual(
    calls.filter((c) => c.key.startsWith("contact-original-")).map((c) => c.key),
    [`contact-original-${a.id}`, `contact-original-${a.id}`],
  );
});

// The live shape before this PR: today's files, with checked-in snapshots for
// the two this PR changes and without the table it adds. No git in tests:
// Workers Builds runs npm test on a shallow clone.
const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const BEFORE = {
  "src/schema_forms.sql": () => fixture("schema_forms.before-resend.sql"),
  "schema/donor_gifts.sql": () => fixture("donor_gifts.before-resend.sql"),
  "schema/resend_events.sql": () => "",
};
const MIGRATIONS = {
  "atl-waivers": [
    "schema/migrations/2026-11-24-form-outbox-resend.sql",
    "schema/migrations/2026-11-24-donor-gifts-first-attempt.sql",
  ],
  "agent-mail": ["schema/migrations/2026-11-24-resend-events.sql"],
};
function liveBefore(db) {
  const live = new DatabaseSync(":memory:");
  for (const file of D1_SCHEMAS[db])
    live.exec(
      BEFORE[file]
        ? BEFORE[file]()
        : readFileSync(new URL(`../${file}`, import.meta.url), "utf8"),
    );
  return live;
}

test("the migrations take the live tables exactly to the schema files", () => {
  for (const [db, migrations] of Object.entries(MIGRATIONS)) {
    const live = liveBefore(db);
    // Before them, the drift check must see the gap (so the fixture is real).
    assert.notDeepEqual(
      diffSchema(buildExpected(db), describeLocal(live)).problems,
      [],
      db,
    );
    for (const m of migrations)
      live.exec(readFileSync(new URL(`../${m}`, import.meta.url), "utf8"));
    assert.deepEqual(
      diffSchema(buildExpected(db), describeLocal(live)).problems,
      [],
      db,
    );
  }
});

test("the migration keeps existing rows and gives them env='production'", () => {
  const live = new DatabaseSync(":memory:");
  live.exec(fixture("schema_forms.before-resend.sql"));
  live.exec(
    "INSERT INTO form_submissions VALUES ('s1','contact','{}','2026-11-01');" +
      "INSERT INTO form_deliveries (submission_id,channel,state) VALUES ('s1','receipt','review');" +
      "INSERT INTO form_record_deliveries (submission_id) VALUES ('s1');",
  );
  live.exec(
    readFileSync(
      new URL(
        "../schema/migrations/2026-11-24-form-outbox-resend.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const row = live.prepare("SELECT * FROM form_deliveries").get();
  assert.equal(row.state, "review");
  assert.equal(row.env, "production");
  assert.equal(row.rendered, null);
  assert.equal(
    live.prepare("SELECT env FROM form_record_deliveries").get().env,
    "production",
  );
  // Code on main still inserts without the new columns.
  live.exec(
    "INSERT INTO form_deliveries (submission_id,channel) VALUES ('s1','intake')",
  );
});

// --- the other send paths -------------------------------------------------

function donorDb() {
  const s = new DatabaseSync(":memory:");
  s.exec(readFileSync(new URL("../schema/donor_gifts.sql", import.meta.url), "utf8"));
  s.prepare(
    `INSERT INTO donor_gifts(transaction_id,email,amount,donated,transacted_at,email_status,created_at,updated_at)
     VALUES ('tx-1','donor@example.com',60,60,'2026-11-24','pending','2026-11-24','2026-11-24')`,
  ).run();
  return { s, db: wrap(s) };
}
function wrap(s) {
  return {
    prepare(sql) {
      let a = [];
      const q = s.prepare(sql);
      return {
        bind(...v) {
          a = v;
          return this;
        },
        async first() {
          return q.get(...a);
        },
        async all() {
          return { results: q.all(...a) };
        },
        async run() {
          return { meta: { changes: Number(q.run(...a).changes) } };
        },
      };
    },
  };
}
const gift = {
  transactionId: "tx-1",
  email: "donor@example.com",
  amount: 60,
  donated: 60,
  firstName: "Dee",
};
const failureDb = () =>
  sqliteD1(
    "CREATE TABLE send_failures (id TEXT PRIMARY KEY, ts INTEGER, route TEXT, to_addr TEXT, error TEXT);",
  );
const donorEnv = (db) => ({ ...RESEND, ENV_NAME: "production", WAIVERS_DB: db });
const status = (s) =>
  s.prepare("SELECT email_status, last_error FROM donor_gifts").get();

test("donor thank you: keyed by transaction, retryable failures retry, refusals stop", async () => {
  let { s, db } = donorDb();
  assert.deepEqual(await claimAndThank(donorEnv(db), gift), { emailed: true });
  assert.equal(calls[0].key, "donor-thanks-tx-1");
  assert.deepEqual(
    calls[0].body.tags.map((t) => t.value),
    ["adapttolife", "donor-thanks", "production"],
  );
  assert.equal(calls[0].body.from, "Adapt To Life <hello@mail.adapttolife.org>");
  assert.equal(status(s).email_status, "sent");

  ({ s, db } = donorDb());
  plan = [503];
  assert.equal((await claimAndThank(donorEnv(db), gift)).retry, true);
  assert.equal(status(s).email_status, "retry");

  ({ s, db } = donorDb());
  plan = [422];
  assert.equal((await claimAndThank(donorEnv(db), gift)).failed, true);
  assert.equal(status(s).email_status, "failed");

  ({ s, db } = donorDb());
  const staging = {
    ...donorEnv(db),
    ENV_NAME: "staging",
    MAIL_ALLOW: "@adapttolife.org",
  };
  assert.equal((await claimAndThank(staging, gift)).dropped, true);
  assert.equal(status(s).email_status, "no_email");
  assert.match(status(s).last_error, /dropped outside production/);
});

function donorRow(s, fields) {
  const cols = Object.keys(fields);
  s.prepare(`UPDATE donor_gifts SET ${cols.map((c) => `${c}=?`).join(",")}`).run(
    ...cols.map((c) => fields[c]),
  );
}

test("donor thank you: a missing key never claims or fails the gift", async () => {
  const { s, db } = donorDb();
  const out = await claimAndThank({ ...donorEnv(db), RESEND_API_KEY: "" }, gift);
  assert.deepEqual(out, { emailed: false, notConfigured: true });
  const row = s.prepare("SELECT * FROM donor_gifts").get();
  assert.equal(row.email_status, "pending");
  assert.equal(row.attempt_count, 0);
  assert.equal(row.first_attempted_at, null);
  assert.equal(calls.length, 0);
  // And the transport itself says so as a retryable, local error.
  await assert.rejects(
    sendMail({ MAIL_TRANSPORT: "resend" }, {}),
    (e) => e.name === "MailError" && e.retryable === true,
  );
});

test("donor thank you: a Gmail-era retry (no clock) is closed for review, never resent", async () => {
  const { s, db } = donorDb();
  donorRow(s, {
    email_status: "retry",
    attempt_count: 1,
    email_attempted_at: ago(HOUR),
    next_attempt_at: ago(1000),
  });
  assert.equal((await claimAndThank(donorEnv(db), gift)).duplicate, true);
  const r = await recoverDonorEmails(donorEnv(db));
  assert.equal(calls.length, 0, "ZERO sends");
  assert.equal(r.failed, 1);
  assert.match(
    status(s).last_error,
    /^Review before resending: attempted before the Resend move/,
  );
  assert.equal(status(s).email_status, "failed");
});

test("donor thank you: past 23 hours from the first attempt, a due retry is never sent", async () => {
  const { s, db } = donorDb();
  donorRow(s, {
    email_status: "retry",
    attempt_count: 1,
    first_attempted_at: ago(23 * HOUR + 1000),
    email_attempted_at: ago(HOUR),
    next_attempt_at: ago(1000),
  });
  await recoverDonorEmails(donorEnv(db));
  assert.equal(calls.length, 0, "ZERO sends after 23 hours");
  assert.equal(status(s).email_status, "failed");
  assert.match(status(s).last_error, /retry window \(23 hours\) closed/);
});

test("donor thank you: the first attempt starts the clock and a retry is clamped inside it", async () => {
  const { s, db } = donorDb();
  plan = [503];
  await claimAndThank(donorEnv(db), gift);
  let row = s.prepare("SELECT * FROM donor_gifts").get();
  assert.ok(row.first_attempted_at);
  assert.equal(row.email_status, "retry");
  const first = row.first_attempted_at;
  // A later attempt keeps the same clock.
  donorRow(s, { next_attempt_at: ago(1000) });
  plan = [503];
  await claimAndThank(donorEnv(db), gift);
  row = s.prepare("SELECT * FROM donor_gifts").get();
  assert.equal(row.first_attempted_at, first, "never reset");
  // Near the end of the window, the next try is clamped to the cutoff.
  const late = ago(23 * HOUR - 5 * 60e3);
  donorRow(s, {
    first_attempted_at: late,
    next_attempt_at: ago(1000),
    attempt_count: 1,
  });
  plan = [503];
  await claimAndThank(donorEnv(db), gift);
  row = s.prepare("SELECT * FROM donor_gifts").get();
  assert.equal(row.email_status, "retry");
  assert.ok(Date.parse(row.next_attempt_at) <= Date.parse(late) + 23 * HOUR - 60e3);
});

test("no clock means no send: windowOpen and windowRefusal fail closed", () => {
  assert.equal(windowOpen(undefined), false);
  assert.equal(windowOpen(null), false);
  assert.equal(windowOpen("not a date"), false);
  assert.equal(windowOpen(ago(HOUR)), true);
  assert.equal(windowOpen(ago(23 * HOUR + 1000)), false);
  assert.match(windowRefusal(null), /^No retry clock/);
  assert.match(windowRefusal(ago(23 * HOUR + 1000)), /^Retry window closed/);
  assert.equal(windowRefusal(ago(HOUR)), null);
});

// The donor table, with the claim's read-back replaced: `readback(s)` runs in
// place of the "SELECT attempt_count, first_attempted_at" query.
function donorDbWithReadback(readback) {
  const base = donorDb();
  const prepare = base.db.prepare.bind(base.db);
  base.db.prepare = (sql) =>
    /SELECT attempt_count, first_attempted_at/.test(sql)
      ? { bind: () => ({ first: async () => readback(base.s) }) }
      : prepare(sql);
  return base;
}

test("donor thank you: a lost lease reads no clock, sends nothing and leaves the other worker's row alone", async () => {
  // Between the claim and its read-back, another worker reclaimed the row.
  const { s, db } = donorDbWithReadback((sql) => {
    sql.prepare("UPDATE donor_gifts SET lease_token='other-worker'").run();
    return null;
  });
  const out = await claimAndThank(
    { ...donorEnv(db), AGENT_MAIL_DB: failureDb() },
    gift,
  );
  assert.equal(calls.length, 0, "ZERO sends");
  assert.equal(out.obsolete, true);
  assert.equal(
    status(s).email_status,
    "sending",
    "the row stays with whoever holds the lease",
  );
});

test("donor thank you: a claimed row with no clock is closed for review with an alert, never sent", async () => {
  const { s, db } = donorDbWithReadback(() => ({
    attempt_count: 1,
    first_attempted_at: null,
  }));
  const failures = failureDb();
  const out = await claimAndThank({ ...donorEnv(db), AGENT_MAIL_DB: failures }, gift);
  assert.equal(calls.length, 0, "ZERO sends");
  assert.equal(out.failed, true);
  assert.equal(status(s).email_status, "failed");
  assert.match(status(s).last_error, /^Review before resending: No retry clock/);
  assert.equal(failures.sql.prepare("SELECT count(*) n FROM send_failures").get().n, 1);
});

test("monthly donor: a first thank you under review counts as possibly sent, so the next charge skips it and alerts", async () => {
  const { s, db } = donorDb();
  s.prepare(
    "UPDATE donor_gifts SET recurring=1, campaign_id='683765', email_status='failed', last_error=?",
  ).run("Review before resending: attempted before the Resend move");
  const failures = failureDb();
  const env = { ...donorEnv(db), AGENT_MAIL_DB: failures };
  const charge = (id) => ({
    id,
    email: "donor@example.com",
    first_name: "Dee",
    amount: 60,
    donated: 60,
    campaign_id: "683765",
    plan_id: "plan-1",
    transacted_at: "2026-12-24T12:00:00Z",
  });
  const next = await recordGift(env, charge("tx-2"));
  assert.equal(next.inserted, true);
  const row = s.prepare("SELECT * FROM donor_gifts WHERE transaction_id='tx-2'").get();
  assert.equal(row.email_status, "no_email", "no second thank you");
  const alerts = failures.sql.prepare("SELECT * FROM send_failures").all();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].error, /under review and may have gone out/);
  // A first thank you that plainly failed (not under review) is still carried
  // by the next charge, as before.
  s.prepare(
    "UPDATE donor_gifts SET last_error='email unavailable' WHERE transaction_id='tx-1'",
  ).run();
  await recordGift(env, charge("tx-3"));
  assert.equal(
    s.prepare("SELECT email_status FROM donor_gifts WHERE transaction_id='tx-3'").get()
      .email_status,
    "pending",
  );
  assert.equal(calls.length, 0);
});

test("admin sign-in link: the key is a digest of the link, so a new link is never refused as a reused key", async () => {
  const env = { ...RESEND, ENV_NAME: "production" };
  const link = (t) => `https://adapttolife.org/admin/auth/verify?token=${t}`;
  await sendAdminLink(env, "alec@adapttolife.org", link("first"));
  await sendAdminLink(env, "alec@adapttolife.org", link("second"));
  await sendAdminLink(env, "alec@adapttolife.org", link("second"));
  const [a, b, c] = calls;
  assert.match(a.key, /^signin-[0-9a-f]{64}$/);
  assert.ok(!a.key.includes("alec"), "no address in the key");
  // A second request inside ten minutes has a new token: a new key, not a 409.
  assert.notEqual(a.key, b.key);
  // The same link sent twice (a retry) is the same key: Resend collapses it.
  assert.equal(b.key, c.key);
  assert.equal(a.body.from, "Adapt To Life <hello@mail.adapttolife.org>");
  assert.deepEqual(a.body.reply_to, ["hello@adapttolife.org"]);
  assert.equal(a.body.tags.find((t) => t.name === "kind").value, "signin");
});

test("beta invite on Resend: each admin request is its own send, so a deliberate resend really goes out", async () => {
  const env = { ...RESEND, ENV_NAME: "production" };
  const invite = (name, siteUrl = "https://adaptivesportsnearme.com/") =>
    sendBetaTesterInvitation(env, { email: "tester@example.com", name, siteUrl });
  await invite("dana");
  await invite("Dana"); // a corrected name
  await invite("Dana"); // the admin asks to resend the identical invite
  const [a, b, c] = calls;
  assert.equal(calls.length, 3);
  for (const call of calls) assert.match(call.key, /^beta-invite-[0-9a-f-]{36}$/);
  assert.ok(!a.key.includes("tester"), "no address in the key");
  // A key shared with a different body would be a 409 (and a 503 for the
  // admin); one shared with the same body would be Resend's cached 200 with
  // nothing sent while the page says "invited". Every request is a new key.
  assert.equal(new Set([a.key, b.key, c.key]).size, 3);
  assert.equal(a.body.from, "Adapt To Life <hello@mail.adapttolife.org>");
  assert.deepEqual(a.body.to, ["tester@example.com"]);
  assert.deepEqual(a.body.reply_to, ["hello@adapttolife.org"]);
  assert.deepEqual(
    a.body.tags.map((t) => [t.name, t.value]),
    [
      ["brand", "adapttolife"],
      ["kind", "beta-invite"],
      ["env", "production"],
    ],
  );
});

test("staff notice: keyed by intake id and tagged", async () => {
  const e = { ...formBindings(), ...RESEND, ENV_NAME: "production" };
  e.INTAKE.sql.exec(
    "INSERT INTO intake (id,received_at,site,kind,name,email,summary,payload) VALUES ('in-1','2026-11-24','adapttolife.org','contact','A','a@example.com','New contact: A','{}');" +
      "INSERT INTO intake_delivery_claims (intake_id,state) VALUES ('in-1','pending');",
  );
  const row = e.INTAKE.sql.prepare("SELECT * FROM intake").get();
  assert.equal(await notifyIntakeRow(e, row), true);
  assert.equal(calls[0].key, "intake-notice-in-1");
  assert.equal(calls[0].body.from, "Adapt To Life Intake <hello@mail.adapttolife.org>");
  assert.equal(
    calls[0].body.tags.find((t) => t.name === "kind").value,
    "notice-intake",
  );
});
