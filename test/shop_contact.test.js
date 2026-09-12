// Unit tests for src/shop_contact.js — the Adapt Body Shop contact form.
//
// What this pins, in order of how much it would hurt to get wrong:
//   1. The endpoint is not an open relay. No key, wrong key, or an unset key on
//      the Worker must never reach the database or the mail binding. This is the
//      only thing standing between a public URL and our own sending domain.
//   2. A saved message survives everything downstream. Once the D1 insert
//      succeeds the customer gets ok:true even if both emails fail, because the
//      alternative is telling someone their question did not go through when it
//      did. Conversely a FAILED insert must never return ok:true — a green tick
//      over a lost message is the one unrecoverable outcome here.
//   3. The customer's copy and the shop's copy are different messages: the
//      customer's carries the reply promise and never the internal metadata; the
//      shop's is reply-to-the-customer so hitting reply answers them.
//   4. The CRM mirror is idempotent. It marks rows ONLY after Sheets confirms
//      the append, so an API failure retries instead of silently dropping.
//
// Standalone `node --test` with stub bindings — same no-new-deps convention as
// the rest of this directory. No network is touched: global fetch is replaced
// per test and restored after.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleShopContact,
  runShopCrmBacklog,
  REPLY_WINDOW,
  SHOP_TOPICS,
} from "../src/shop_contact.js";

const KEY = "test-shared-key";

function stubDb({ insertThrows = false } = {}) {
  const inserts = [];
  const updates = [];
  let selectRows = [];
  return {
    inserts,
    updates,
    setRows(rows) { selectRows = rows; },
    binding: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async run() {
                if (/^\s*INSERT/i.test(sql)) {
                  if (insertThrows) throw new Error("simulated D1 outage");
                  inserts.push(args);
                } else {
                  updates.push({ sql, args });
                }
                return {};
              },
              async all() { return { results: selectRows }; },
              async first() { return selectRows[0] || null; },
            };
          },
          async all() { return { results: selectRows }; },
        };
      },
    },
  };
}

function stubEnv({ sendThrows = false, insertThrows = false, key = KEY } = {}) {
  const db = stubDb({ insertThrows });
  const sent = [];
  return {
    db,
    sent,
    env: {
      SHOP_CONTACT_KEY: key,
      WAIVERS_DB: db.binding,
      // No TURNSTILE_SECRET_KEY: since 2026-09-12 that REFUSES unless the lane
      // says TURNSTILE_MODE="off" out loud (src/turnstile.js). These tests are
      // about the handler's real path, not the challenge.
      TURNSTILE_MODE: "off",
      SEND_EMAIL: {
        send(msg) {
          if (sendThrows) throw new Error("simulated Email Service outage");
          sent.push(msg);
          return {};
        },
      },
    },
  };
}

function post(body, { key = KEY } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (key !== null) headers.set("X-Shop-Key", key);
  return new Request("https://adapttolife.org/api/shop-contact", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const GOOD = {
  name: "Dana Reyes",
  email: "Dana@Example.com",
  topic: "Sizing help",
  message: "Between a medium and a large. Which one?",
};

// A ctx whose waitUntil is awaitable, so a test can assert on work that the
// real Worker deliberately does after the response has gone out.
function ctxCollector() {
  const jobs = [];
  return { jobs, ctx: { waitUntil: (p) => jobs.push(p) }, settle: () => Promise.all(jobs) };
}

// --- 1. the gate ------------------------------------------------------------

test("a request with no shared key is refused and touches nothing", async () => {
  const { env, db, sent } = stubEnv();
  const res = await handleShopContact(post(GOOD, { key: null }), env, null);
  assert.equal(res.status, 401);
  assert.equal(db.inserts.length, 0);
  assert.equal(sent.length, 0);
});

test("a request with the wrong shared key is refused", async () => {
  const { env, db } = stubEnv();
  const res = await handleShopContact(post(GOOD, { key: "not-the-key" }), env, null);
  assert.equal(res.status, 401);
  assert.equal(db.inserts.length, 0);
});

test("a Worker with no key configured refuses everything rather than opening up", async () => {
  const { env, db } = stubEnv({ key: "" });
  const res = await handleShopContact(post(GOOD, { key: "anything" }), env, null);
  assert.equal(res.status, 503);
  assert.equal(db.inserts.length, 0);
});

test("the honeypot is accepted silently and stores nothing", async () => {
  const { env, db, sent } = stubEnv();
  const res = await handleShopContact(post({ ...GOOD, company: "Acme" }), env, null);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(db.inserts.length, 0);
  assert.equal(sent.length, 0);
});

// --- 2. validation ----------------------------------------------------------

test("a bad email is rejected before anything is stored", async () => {
  const { env, db } = stubEnv();
  const res = await handleShopContact(post({ ...GOOD, email: "nope" }), env, null);
  assert.equal(res.status, 422);
  assert.equal(db.inserts.length, 0);
});

test("order-number topics demand an order number even on a direct POST", async () => {
  const { env, db } = stubEnv();
  const res = await handleShopContact(
    post({ ...GOOD, topic: "Where is my order", order_number: "" }), env, null
  );
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /order number/i);
  assert.equal(db.inserts.length, 0);
});

test("an unknown topic is kept, not dropped", async () => {
  const { env, db } = stubEnv();
  const { ctx, settle } = ctxCollector();
  const res = await handleShopContact(
    post({ ...GOOD, topic: "Something we never listed" }), env, ctx
  );
  assert.equal(res.status, 200);
  await settle();
  const row = db.inserts[0];
  assert.equal(row[4], "Something else");
  // The submitted wording survives verbatim in the message body.
  assert.match(row[6], /Something we never listed/);
  assert.match(row[6], /Between a medium and a large/);
});

// --- 3. the record is the promise -------------------------------------------

test("a failed insert never reports success", async () => {
  const { env, sent } = stubEnv({ insertThrows: true });
  const res = await handleShopContact(post(GOOD), env, null);
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.ok, false);
  // It hands over an address that does not depend on this Worker.
  assert.match(body.error, /hello@adaptbodyshop\.com/);
  assert.equal(sent.length, 0);
});

test("a saved message succeeds even when both emails fail", async () => {
  const { env, db } = stubEnv({ sendThrows: true });
  const { ctx, settle } = ctxCollector();
  const res = await handleShopContact(post(GOOD), env, ctx);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  await settle(); // must not reject
  assert.equal(db.inserts.length, 1);
});

test("the email is normalised and the response names the promise", async () => {
  const { env, db } = stubEnv();
  const { ctx, settle } = ctxCollector();
  const res = await handleShopContact(post(GOOD), env, ctx);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.reply_window, REPLY_WINDOW);
  await settle();
  assert.equal(db.inserts[0][3], "dana@example.com");
});

// --- 4. two different messages ----------------------------------------------

test("the customer copy carries the promise and the shop copy replies to them", async () => {
  const { env, sent } = stubEnv();
  const { ctx, settle } = ctxCollector();
  await handleShopContact(post({ ...GOOD, topic: "Where is my order", order_number: "#1042" }), env, ctx);
  await settle();

  assert.equal(sent.length, 2);
  const [customer, shop] = sent;

  assert.equal(customer.to, "dana@example.com");
  assert.equal(customer.replyTo, "hello@adaptbodyshop.com");
  assert.match(customer.subject, /order #1042/);
  assert.match(customer.text, new RegExp(REPLY_WINDOW));
  assert.match(customer.html, new RegExp(REPLY_WINDOW));
  // The customer must never see internal metadata.
  assert.doesNotMatch(customer.html, /Referral code/);

  assert.equal(shop.to, "hello@adaptbodyshop.com");
  assert.match(shop.replyTo, /dana@example\.com/);
  assert.match(shop.subject, /^\[shop\]/);
  assert.match(shop.subject, /order #1042/);
});

test("customer text is escaped into the HTML body", async () => {
  const { env, sent } = stubEnv();
  const { ctx, settle } = ctxCollector();
  await handleShopContact(
    post({ ...GOOD, name: "<script>x</script>", message: "5 > 3 & \"quoted\"" }), env, ctx
  );
  await settle();
  for (const msg of sent) {
    assert.doesNotMatch(msg.html, /<script>/);
    assert.match(msg.html, /&amp;|&gt;|&quot;|&lt;/);
  }
});

test("both sends are from the onboarded apex with the shop's name on them", async () => {
  const { env, sent } = stubEnv();
  const { ctx, settle } = ctxCollector();
  await handleShopContact(post(GOOD), env, ctx);
  await settle();
  for (const msg of sent) {
    assert.match(msg.from, /^Adapt Body Shop <hello@adapttolife\.org>$/);
  }
});

test("the topic list and the order-required subset stay in agreement", () => {
  // A topic that demands an order number but is not offered on the form would
  // be unreachable; one offered but missing from the list would be recorded as
  // "Something else". Both are silent, so they are pinned here.
  for (const topic of ["Where is my order", "Return or exchange", "Wrong or damaged item"]) {
    assert.ok(SHOP_TOPICS.includes(topic), `${topic} must be an offered topic`);
  }
});

// --- 5. the CRM mirror ------------------------------------------------------

// A REAL RSA key, generated here. src/google.js signs the JWT with WebCrypto
// before it ever reaches fetch, so a placeholder string fails at importKey and
// the test would pass for the wrong reason (no marks written because no request
// was made). Generating one keeps the whole signing path under test.
const SA_PRIVATE_KEY = await (async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return privateKey.export({ type: "pkcs8", format: "pem" }).toString();
})();

function crmEnv(rows) {
  const db = stubDb();
  db.setRows(rows);
  return {
    db,
    env: {
      WAIVERS_DB: db.binding,
      GOOGLE_SA_JSON: JSON.stringify({
        client_email: "x@y.iam.gserviceaccount.com",
        token_uri: "https://oauth2.example/token",
        private_key: SA_PRIVATE_KEY,
      }),
    },
  };
}

const ROW = {
  id: "abc", created_at: "2026-09-04T06:00:00.000Z", name: "Dana", email: "dana@example.com",
  topic: "Sizing help", order_number: "", message: "hi", source: "/contact", ref: "",
};

test("CRM sync marks rows only after Sheets confirms the append", async (t) => {
  const { env, db } = crmEnv([ROW]);
  const calls = [];
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url).includes("/token")) {
      return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    }
    if (String(url).includes("?fields=sheets.properties.title")) {
      return new Response(JSON.stringify({ sheets: [{ properties: { title: "Shop Messages" } }] }), { status: 200 });
    }
    if (String(url).includes(":append")) {
      return new Response(JSON.stringify({ updates: { updatedRange: "'Shop Messages'!A2:I2" } }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  };

  await runShopCrmBacklog(env);
  assert.equal(db.updates.length, 1);
  assert.match(db.updates[0].sql, /UPDATE shop_messages SET crm_row/);
  assert.equal(db.updates[0].args[0], "'Shop Messages'!A2:I2");
  // The existing tab was left alone rather than recreated.
  assert.ok(!calls.some((u) => u.includes(":batchUpdate")));
});

test("a Sheets failure leaves rows unmarked so the next tick retries", async (t) => {
  const { env, db } = crmEnv([ROW]);
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (url) => {
    if (String(url).includes("/token")) {
      return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    }
    if (String(url).includes("?fields=sheets.properties.title")) {
      return new Response(JSON.stringify({ sheets: [{ properties: { title: "Shop Messages" } }] }), { status: 200 });
    }
    return new Response("nope", { status: 503 });
  };

  await runShopCrmBacklog(env);
  assert.equal(db.updates.length, 0);
});

test("CRM sync with nothing pending does no work at all", async (t) => {
  const { env } = crmEnv([]);
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response("{}", { status: 200 }); };
  await runShopCrmBacklog(env);
  assert.equal(called, false);
});
