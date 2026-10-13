// The Adapt Body Shop footer newsletter sign-up: kind "newsletter" on
// /api/shop-contact.
//
// What this pins:
//   1. "subscribed" is said only after the row exists. The storefront shows
//      "you are on the list" on exactly {ok:true, subscribed:true}, so a failed
//      write must never return that pair.
//   2. One row per address. A repeat sign-up (any case) is the same success
//      and writes nothing, and the first sign-up's time and page are kept.
//   3. A sign-up is not a contact message: no auto-reply, no hello@ notice, no
//      shop_messages row.
//   4. Every gate the contact form has still applies: shop key, honeypot,
//      Turnstile.
//   5. The Sheet mirror goes to its own "Shop Newsletter" tab and marks rows
//      only after Sheets confirms the append.
//
// Real SQL: an in-memory SQLite D1 built from schema/shop_messages.sql (which
// carries the new table) and checked against the migration, so ON CONFLICT is
// exercised rather than assumed. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { sqliteD1 } from "./helpers/form-db.js";
import { handleShopContact, runShopNewsletterBacklog } from "../src/shop_contact.js";

const KEY = "test-shared-key";
const MIGRATION = readFileSync(
  new URL("../schema/migrations/2026-10-03-shop-subscribers.sql", import.meta.url),
  "utf8",
);
const BASE_SCHEMA = readFileSync(new URL("../schema/shop_messages.sql", import.meta.url), "utf8");

function setup({ db = sqliteD1(BASE_SCHEMA), turnstileOff = true } = {}) {
  const sent = [];
  const jobs = [];
  const env = {
    SHOP_CONTACT_KEY: KEY,
    WAIVERS_DB: db,
    SEND_EMAIL: { async send(msg) { sent.push(msg); return {}; } },
  };
  if (turnstileOff) env.TURNSTILE_MODE = "off";
  const ctx = { waitUntil: (p) => jobs.push(p) };
  return { db, env, sent, jobs, ctx };
}

function post(body, { key = KEY } = {}) {
  const headers = new Headers({ "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.9" });
  if (key !== null) headers.set("X-Shop-Key", key);
  return new Request("https://adapttolife.org/api/shop-contact", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const SIGNUP = {
  kind: "newsletter",
  topic: "Newsletter",
  email: "Reader@Example.com",
  cf_token: "tok",
  company: "",
  source: "/collections/all",
  ref: "",
  user_agent: "test",
};

const subscribers = (db) => db.sql.prepare("SELECT * FROM shop_subscribers").all();

test("the migration and the base schema define the same table", () => {
  const db = sqliteD1(MIGRATION);
  const cols = (d) => d.sql.prepare("PRAGMA table_info(shop_subscribers)").all().map((c) => c.name);
  assert.deepEqual(cols(db), cols(sqliteD1(BASE_SCHEMA)));
  // Re-applying is harmless: the migration is IF NOT EXISTS throughout.
  db.sql.exec(MIGRATION);
});

test("a sign-up writes one row, then answers subscribed", async () => {
  const { db, env, ctx } = setup();
  const res = await handleShopContact(post(SIGNUP), env, ctx);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, subscribed: true });
  const rows = subscribers(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].email, "reader@example.com");
  assert.equal(rows[0].source, "/collections/all");
  assert.equal(rows[0].ip, "203.0.113.9");
  assert.equal(rows[0].crm_row, null);
});

test("a repeat sign-up is ok and adds no second row", async () => {
  const { db, env, ctx } = setup();
  await handleShopContact(post(SIGNUP), env, ctx);
  const first = subscribers(db)[0];
  const again = await handleShopContact(
    post({ ...SIGNUP, email: "  READER@example.COM ", source: "/contact" }),
    env,
    ctx,
  );
  assert.equal(again.status, 200);
  assert.deepEqual(await again.json(), { ok: true, subscribed: true });
  const rows = subscribers(db);
  assert.equal(rows.length, 1);
  // The first sign-up is when consent was given; it is not overwritten.
  assert.equal(rows[0].created_at, first.created_at);
  assert.equal(rows[0].source, "/collections/all");
});

test("a database failure is never reported as subscribed", async () => {
  // A DB without the table: exactly what an unapplied migration looks like.
  const { env, ctx, sent } = setup({ db: sqliteD1("SELECT 1;") });
  const res = await handleShopContact(post(SIGNUP), env, ctx);
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.equal(body.subscribed, undefined);
  assert.equal(sent.length, 0);
});

test("a sign-up sends no auto-reply, no shop notice, and is not a message", async () => {
  const { db, env, ctx, sent, jobs } = setup();
  await handleShopContact(post(SIGNUP), env, ctx);
  await Promise.all(jobs);
  assert.equal(jobs.length, 0);
  assert.equal(sent.length, 0);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM shop_messages").get().n, 0);
});

test("a contact message still goes the contact way", async () => {
  const { db, env, ctx, sent, jobs } = setup();
  const res = await handleShopContact(
    post({ name: "Dana", email: "dana@example.com", topic: "Sizing help", message: "M or L?" }),
    env,
    ctx,
  );
  assert.equal((await res.json()).ok, true);
  await Promise.all(jobs);
  assert.equal(subscribers(db).length, 0);
  assert.equal(db.sql.prepare("SELECT COUNT(*) AS n FROM shop_messages").get().n, 1);
  assert.equal(sent.length, 2);
});

test("a bad address is refused and stores nothing", async () => {
  const { db, env, ctx } = setup();
  const res = await handleShopContact(post({ ...SIGNUP, email: "nope" }), env, ctx);
  assert.equal(res.status, 422);
  assert.equal(subscribers(db).length, 0);
});

test("the gates still apply: key, honeypot, Turnstile", async () => {
  {
    const { db, env, ctx } = setup();
    const res = await handleShopContact(post(SIGNUP, { key: "wrong" }), env, ctx);
    assert.equal(res.status, 401);
    assert.equal(subscribers(db).length, 0);
  }
  {
    const { db, env, ctx } = setup();
    const res = await handleShopContact(post({ ...SIGNUP, company: "Acme" }), env, ctx);
    const body = await res.json();
    assert.equal(body.ok, true);
    // A bot gets a cheerful ok but never "subscribed", and nothing is written.
    assert.equal(body.subscribed, undefined);
    assert.equal(subscribers(db).length, 0);
  }
  {
    const { db, env, ctx } = setup({ turnstileOff: false });
    const res = await handleShopContact(post(SIGNUP), env, ctx);
    assert.equal(res.status, 403);
    assert.equal(subscribers(db).length, 0);
  }
});

// --- the Sheet mirror -------------------------------------------------------

const SA_PRIVATE_KEY = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" }).toString();

function crmEnv(db) {
  return {
    WAIVERS_DB: db,
    GOOGLE_SA_JSON: JSON.stringify({
      client_email: "x@y.iam.gserviceaccount.com",
      token_uri: "https://oauth2.example/token",
      private_key: SA_PRIVATE_KEY,
    }),
  };
}

async function seeded() {
  const { db, env, ctx } = setup();
  await handleShopContact(post(SIGNUP), env, ctx);
  return db;
}

test("newsletter rows go to their own tab and are marked only after the append", async (t) => {
  const db = await seeded();
  const calls = [];
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    calls.push({ u, body: init?.body });
    if (u.includes("/token")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    if (u.includes("?fields=sheets.properties.title")) {
      return new Response(JSON.stringify({ sheets: [{ properties: { title: "Shop Messages" } }] }), { status: 200 });
    }
    if (u.includes(":batchUpdate")) return new Response("{}", { status: 200 });
    if (u.includes("A1:D1")) return new Response("{}", { status: 200 });
    if (u.includes(":append")) {
      return new Response(JSON.stringify({ updates: { updatedRange: "'Shop Newsletter'!A2:D2" } }), { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  };

  await runShopNewsletterBacklog(crmEnv(db));
  const append = calls.find((c) => c.u.includes(":append"));
  assert.match(append.u, /Shop%20Newsletter!A:D:append/);
  assert.deepEqual(JSON.parse(append.body).values[0].slice(1), ["reader@example.com", "/collections/all", ""]);
  // The tab did not exist, so it was created with its own header.
  assert.ok(calls.some((c) => c.u.includes(":batchUpdate") && c.body.includes("Shop Newsletter")));
  const header = calls.find((c) => c.u.includes("A1:D1"));
  assert.deepEqual(JSON.parse(header.body).values[0], ["Date", "Email", "Page", "Referral code"]);
  assert.equal(subscribers(db)[0].crm_row, "'Shop Newsletter'!A2:D2");
  // Never into the contact queue's tab.
  assert.ok(!calls.some((c) => c.u.includes("Shop%20Messages!")));
});

test("a Sheets failure leaves sign-ups unmarked so the next tick retries", async (t) => {
  const db = await seeded();
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/token")) return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    if (u.includes("?fields=sheets.properties.title")) {
      return new Response(JSON.stringify({ sheets: [{ properties: { title: "Shop Newsletter" } }] }), { status: 200 });
    }
    return new Response("nope", { status: 503 });
  };
  await runShopNewsletterBacklog(crmEnv(db));
  assert.equal(subscribers(db)[0].crm_row, null);
});
