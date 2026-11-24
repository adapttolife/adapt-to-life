// The form outbox on Resend (src/forms.js, src/form-records.js; docs/EMAIL.md
// "How a site sends"): rows belong to the environment that wrote them, the
// receipt is rendered once and resent byte-identical under one key, retryable
// failures back off inside 23 hours, and the D1 change is additive.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { formBindings, sqliteD1 } from "./helpers/form-db.js";
import { acceptForm, processForm, sweepForms, retryDelayMs } from "../src/forms.js";
import { claimAndThank } from "../src/givebutter_webhook.js";
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
  assert.match(second.body.text, /^Hi Offline,\n\nFROZEN COPY\./);
  assert.deepEqual(second.body, stored.body ?? second.body);
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

test("a retryable failure past 23 hours from the first attempt goes to review", async () => {
  const e = env();
  const a = await acceptForm(e, "contact", sub);
  plan = [429];
  await processForm(e, a.id);
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE form_deliveries SET first_attempted_at=?, next_attempt_at=? WHERE channel='receipt'",
    )
    .run(
      new Date(Date.now() - 23 * 3600e3 - 60e3).toISOString(),
      new Date(Date.now() - 1000).toISOString(),
    );
  plan = [500];
  await sweepForms(e);
  const r = receiptRow(e);
  assert.equal(r.state, "review");
  assert.equal(r.next_attempt_at, null);
  assert.match(r.error, /500/);
  assert.equal(
    failures(e).length,
    2,
    "the first failure and the give-up are both reported",
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

test("an interrupted Resend receipt with its frozen copy retries; one without goes to review", async () => {
  for (const [rendered, expected] of [
    [true, "pending"],
    [false, "review"],
  ]) {
    const e = env();
    const a = await acceptForm(e, "contact", sub);
    const old = new Date(Date.now() - 20 * 60e3).toISOString();
    e.WAIVERS_DB.sql
      .prepare(
        "UPDATE form_deliveries SET state='running', started_at=?, first_attempted_at=?, rendered=? WHERE channel='receipt'",
      )
      .run(old, old, rendered ? JSON.stringify({ x: 1 }) : null);
    // Stop the sweep from also re-sending, so the state it set can be read.
    e.WAIVERS_DB.sql.exec(
      "UPDATE form_deliveries SET next_attempt_at='9999' WHERE channel='intake'",
    );
    globalThis.fetch = async () => {
      throw Error("no send in this test");
    };
    await sweepForms({ ...e, MAIL_TRANSPORT: "resend", RESEND_API_KEY: "" });
    assert.equal(receiptRow(e).state, expected, String(rendered));
    void a;
  }
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

test("the migration takes the live tables exactly to the schema files", () => {
  for (const [db, migration] of [
    ["atl-waivers", "schema/migrations/2026-11-24-form-outbox-resend.sql"],
    ["agent-mail", "schema/migrations/2026-11-24-resend-events.sql"],
  ]) {
    const live = new DatabaseSync(":memory:");
    for (const file of D1_SCHEMAS[db]) {
      let sql;
      try {
        // The shape before this change, as committed on the base branch.
        sql = execFileSync("git", ["show", `660d2c54:${file}`], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      } catch {
        continue; // a file this change adds
      }
      live.exec(sql);
    }
    live.exec(readFileSync(new URL(`../${migration}`, import.meta.url), "utf8"));
    assert.deepEqual(
      diffSchema(buildExpected(db), describeLocal(live)).problems,
      [],
      db,
    );
  }
});

test("the migration keeps existing rows and gives them env='production'", () => {
  const before = execFileSync("git", ["show", "660d2c54:src/schema_forms.sql"], {
    encoding: "utf8",
  });
  const live = new DatabaseSync(":memory:");
  live.exec(before);
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
  return { s, db: sqliteD1("").constructor ? wrap(s) : null };
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

test("admin sign-in link: house From, signin key from a hash of the address and a 10-minute bucket", async () => {
  await sendAdminLink(
    { ...RESEND, ENV_NAME: "production" },
    "alec@adapttolife.org",
    "https://adapttolife.org/admin/auth/verify?token=x",
  );
  const [c] = calls;
  assert.match(c.key, /^signin-[0-9a-f]{64}-\d+$/);
  assert.ok(!c.key.includes("alec"), "no address in the key");
  assert.equal(Number(c.key.split("-").at(-1)), Math.floor(Date.now() / 600000));
  assert.equal(c.body.from, "Adapt To Life <hello@mail.adapttolife.org>");
  assert.deepEqual(c.body.reply_to, ["hello@adapttolife.org"]);
  assert.equal(c.body.tags.find((t) => t.name === "kind").value, "signin");
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
