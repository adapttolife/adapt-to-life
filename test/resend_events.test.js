// POST /api/resend-events (src/resend_events.js): Svix signature on the raw body,
// five-minute tolerance, one row per svix-id, only our brands and environment,
// and bounces/complaints/failures written to send_failures once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "./helpers/form-db.js";
import { handleResendEvents, verifySvix } from "../src/resend_events.js";
import worker from "../src/index.js";

const KEY = randomBytes(24);
const SECRET = "whsec_" + KEY.toString("base64");

function sign(id, ts, body, key = KEY) {
  return (
    "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")
  );
}
function db() {
  return sqliteD1(
    "CREATE TABLE send_failures (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, route TEXT NOT NULL, to_addr TEXT, error TEXT);" +
      readFileSync(new URL("../schema/resend_events.sql", import.meta.url), "utf8"),
  );
}
function env(extra = {}) {
  return {
    RESEND_WEBHOOK_SECRET: SECRET,
    AGENT_MAIL_DB: db(),
    ENV_NAME: "production",
    ...extra,
  };
}
function event(
  type = "email.delivered",
  tags = { brand: "adapttolife", kind: "receipt-apply", env: "production" },
) {
  return {
    type,
    created_at: "2026-11-24T18:00:00.000Z",
    data: {
      email_id: "re-msg-1",
      from: "Adapt To Life <hello@mail.adapttolife.org>",
      to: ["person@example.test"],
      subject: "Your application",
      tags,
      ...(type === "email.bounced"
        ? { bounce: { type: "Permanent", message: "mailbox does not exist" } }
        : {}),
    },
  };
}
function request(
  body,
  { id = "msg_" + randomBytes(6).toString("hex"), ts, signature } = {},
) {
  const raw = typeof body === "string" ? body : JSON.stringify(body);
  const stamp = String(ts ?? Math.floor(Date.now() / 1000));
  return new Request("https://adapttolife.org/api/resend-events", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "svix-id": id,
      "svix-timestamp": stamp,
      "svix-signature": signature ?? sign(id, stamp, raw),
    },
    body: raw,
  });
}
const rows = (e, t) => e.AGENT_MAIL_DB.sql.prepare(`SELECT * FROM ${t}`).all();

test("a good signature is recorded against the message", async () => {
  const e = env();
  const res = await handleResendEvents(request(event()), e);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, recorded: true, duplicate: false });
  const [row] = rows(e, "resend_events");
  assert.equal(row.type, "email.delivered");
  assert.equal(row.email_id, "re-msg-1");
  assert.equal(row.brand, "adapttolife");
  assert.equal(row.kind, "receipt-apply");
  assert.equal(row.env, "production");
  assert.equal(row.recipient, "person@example.test");
  assert.equal(rows(e, "send_failures").length, 0, "a delivery is not a failure");
});

test("the route is wired in the Worker", async () => {
  const e = env();
  const res = await worker.fetch(request(event()), e, { waitUntil() {} });
  assert.equal(res.status, 200);
  assert.equal(rows(e, "resend_events").length, 1);
});

test("a bad signature is refused and nothing is stored", async () => {
  const e = env();
  for (const signature of [
    sign("other-id", Math.floor(Date.now() / 1000), JSON.stringify(event())),
    sign("x", 1, "y", randomBytes(24)),
    "v1,not-base64!!",
    "v2," + randomBytes(32).toString("base64"),
    "",
  ]) {
    const res = await handleResendEvents(request(event(), { signature }), e);
    assert.equal(res.status, 401, signature);
  }
  // A body changed after signing fails too.
  const id = "msg_tamper",
    ts = String(Math.floor(Date.now() / 1000));
  const signed = sign(id, ts, JSON.stringify(event()));
  const tampered = new Request("https://adapttolife.org/api/resend-events", {
    method: "POST",
    headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": signed },
    body: JSON.stringify(event("email.bounced")),
  });
  assert.equal((await handleResendEvents(tampered, e)).status, 401);
  assert.equal(rows(e, "resend_events").length, 0);
});

test("a stale or future timestamp is refused even with a valid signature", async () => {
  const e = env();
  const now = Math.floor(Date.now() / 1000);
  for (const ts of [now - 301, now + 301, now - 3600]) {
    const res = await handleResendEvents(request(event(), { ts }), e);
    assert.equal(res.status, 401, String(ts));
  }
  assert.equal(
    (await handleResendEvents(request(event(), { ts: now - 290 }), e)).status,
    200,
  );
  assert.equal(
    (
      await verifySvix({
        id: "a",
        timestamp: "abc",
        signature: "v1,x",
        body: "",
        secret: SECRET,
      })
    ).why,
    "timestamp",
  );
});

test("a replayed svix-id is stored once and its failure is written once", async () => {
  const e = env();
  const body = event("email.bounced");
  const id = "msg_replay";
  const first = await handleResendEvents(request(body, { id }), e);
  assert.deepEqual(await first.json(), { ok: true, recorded: true, duplicate: false });
  for (let i = 0; i < 3; i++) {
    const again = await handleResendEvents(request(body, { id }), e);
    assert.equal(again.status, 200);
    assert.deepEqual(await again.json(), {
      ok: true,
      recorded: false,
      duplicate: true,
    });
  }
  assert.equal(rows(e, "resend_events").length, 1);
  const failures = rows(e, "send_failures");
  assert.equal(failures.length, 1);
  assert.equal(failures[0].id, "resend:msg_replay");
  assert.equal(failures[0].route, "resend:bounced");
  assert.equal(failures[0].to_addr, "person@example.test");
  assert.match(failures[0].error, /adapttolife\/receipt-apply re-msg-1/);
});

test("complaints and failures reach send_failures; delays do not", async () => {
  const e = env();
  for (const type of [
    "email.complained",
    "email.failed",
    "email.delivery_delayed",
    "email.delivered",
  ])
    assert.equal((await handleResendEvents(request(event(type)), e)).status, 200);
  assert.deepEqual(
    rows(e, "send_failures")
      .map((r) => r.route)
      .sort(),
    ["resend:complained", "resend:failed"],
  );
  assert.equal(rows(e, "resend_events").length, 4);
});

test("Body Shop mail is ours; another brand or the other environment is ignored", async () => {
  const e = env();
  const shop = await handleResendEvents(
    request(
      event("email.delivered", {
        brand: "bodyshop",
        kind: "receipt-shop",
        env: "production",
      }),
    ),
    e,
  );
  assert.deepEqual(await shop.json(), { ok: true, recorded: true, duplicate: false });
  for (const tags of [
    { brand: "asnm", kind: "welcome", env: "production" },
    { brand: "alectranel", kind: "newsletter", env: "production" },
    { brand: "adapttolife", kind: "receipt-apply", env: "staging" },
    { kind: "receipt-apply", env: "production" },
  ]) {
    const res = await handleResendEvents(request(event("email.bounced", tags)), e);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, ignored: true });
  }
  // The tag list form is read the same way.
  const listForm = event("email.delivered", [
    { name: "brand", value: "adapttolife" },
    { name: "kind", value: "waiver" },
    { name: "env", value: "production" },
  ]);
  assert.equal(
    (await (await handleResendEvents(request(listForm), e)).json()).recorded,
    true,
  );
  assert.equal(rows(e, "resend_events").length, 2);
  assert.equal(rows(e, "send_failures").length, 0);
  // Staging keeps staging's events.
  const s = env({ ENV_NAME: "staging" });
  const staged = await handleResendEvents(
    request(
      event("email.delivered", {
        brand: "adapttolife",
        kind: "signin",
        env: "staging",
      }),
    ),
    s,
  );
  assert.equal((await staged.json()).recorded, true);
});

test("a Broadcast (no custom tags) is matched to its brand by the From domain, on production only", async () => {
  const broadcast = (from) => ({
    type: "email.bounced",
    created_at: "2026-11-24T18:00:00.000Z",
    data: {
      email_id: "re-b-1",
      broadcast_id: "b-1",
      from,
      to: ["reader@example.test"],
      subject: "News",
    },
  });
  const e = env();
  for (const [from, brand] of [
    ["Alec at Adapt To Life <hello@mail.adapttolife.org>", "adapttolife"],
    ["Adapt Body Shop <hello@mail.adaptbodyshop.com>", "bodyshop"],
  ]) {
    const res = await handleResendEvents(request(broadcast(from)), e);
    assert.equal((await res.json()).recorded, true, from);
    assert.equal(rows(e, "resend_events").at(-1).brand, brand);
    assert.equal(rows(e, "resend_events").at(-1).kind, "broadcast");
  }
  for (const from of [
    "Adaptive Sports Near Me <hello@mail.adaptivesportsnearme.com>",
    "Alec <alec@alectranel.com>",
    "",
  ]) {
    const res = await handleResendEvents(request(broadcast(from)), e);
    assert.deepEqual(await res.json(), { ok: true, ignored: true }, from);
  }
  assert.equal(rows(e, "send_failures").length, 2);
  // Staging never keeps a Broadcast event.
  const s = env({ ENV_NAME: "staging" });
  const res = await handleResendEvents(
    request(broadcast("Adapt To Life <hello@mail.adapttolife.org>")),
    s,
  );
  assert.deepEqual(await res.json(), { ok: true, ignored: true });
});

test("without its secret or database the route asks Resend to retry later", async () => {
  assert.equal(
    (await handleResendEvents(request(event()), env({ RESEND_WEBHOOK_SECRET: "" })))
      .status,
    503,
  );
  assert.equal(
    (await handleResendEvents(request(event()), env({ AGENT_MAIL_DB: undefined })))
      .status,
    503,
  );
  const get = new Request("https://adapttolife.org/api/resend-events");
  assert.equal((await handleResendEvents(get, env())).status, 405);
});
