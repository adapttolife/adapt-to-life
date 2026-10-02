// The production schedule tells hello@ about every intake record still waiting
// for its notification.
//
// Pinned because it silently stopped happening. From the 2026-09-14 Cloudflare
// account move until 2026-10-02 no deployed Worker ran the sweep against the live
// intake database, so form notifications sat in 'pending' and a real grant
// application never reached hello@. This drives the real scheduled() handler,
// not the sweep function on its own, because the bug was that nothing called it.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { formBindings } from "./helpers/form-db.js";
import worker from "../src/index.js";

let realFetch;
beforeEach(() => {
  realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline test forbids live network"); };
});
afterEach(() => { globalThis.fetch = realFetch; });

function setup() {
  const mail = [];
  const env = {
    ...formBindings(),
    INTAKE_INBOX: "hello@adapttolife.org",
    SEND_EMAIL: { send: async (m) => { mail.push(m); return { messageId: "offline-" + mail.length }; } },
  };
  env.INTAKE.sql.prepare(
    "INSERT INTO intake (id,received_at,site,kind,name,email,summary,payload,source,is_canary) VALUES (?,?,?,?,?,?,?,?,?,0)"
  ).run("stranded-1", "2026-09-30T17:25:33.181Z", "adapttolife.org", "apply", "Offline Applicant",
    "applicant@example.org", "New apply: Offline Applicant", "{}", "adapttolife.org/apply");
  env.INTAKE.sql.prepare("INSERT INTO intake_delivery_claims (intake_id,state) VALUES ('stranded-1','pending')").run();
  return { env, mail };
}

async function tick(env) {
  const work = [];
  await worker.scheduled({ cron: "*/10 * * * *", scheduledTime: Date.now() }, env, { waitUntil: (p) => work.push(p) });
  await Promise.allSettled(work);
}

const toHouse = (mail) => mail.filter((m) => [].concat(m.to).includes("hello@adapttolife.org"));

test("the production schedule notifies hello@ about a stranded intake record, exactly once", async () => {
  const { env, mail } = setup();
  await tick(env);
  await tick(env);

  const sent = toHouse(mail);
  assert.equal(sent.length, 1, "one notification, never a second on the next tick");
  assert.equal(sent[0].subject, "New apply: Offline Applicant");
  assert.equal(sent[0].replyTo, "applicant@example.org", "a reply goes to the applicant");
  assert.equal(env.INTAKE.sql.prepare("SELECT state FROM intake_delivery_claims WHERE intake_id='stranded-1'").get().state, "done");
  assert.ok(env.INTAKE.sql.prepare("SELECT notified_at FROM intake WHERE id='stranded-1'").get().notified_at);
});

test("a record closed without sending is never mailed by the schedule", async () => {
  const { env, mail } = setup();
  env.INTAKE.sql.prepare("UPDATE intake_delivery_claims SET state='done',error='test submission; no notification needed' WHERE intake_id='stranded-1'").run();
  await tick(env);
  assert.equal(toHouse(mail).length, 0);
});
