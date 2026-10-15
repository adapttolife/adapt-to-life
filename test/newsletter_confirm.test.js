// Confirm-your-email on the Adapt To Life newsletter. The forms say "check your
// inbox" exactly when Beehiiv is waiting on the subscriber, and the confirmation
// email brings them back to our own page, never to another site.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { safeNewsletterSubscribe } from "../src/newsletter.js";
import worker from "../src/index.js";

const PUB = "pub_d1bfe66c-074f-464a-a94a-d0cce6d21943";
const db = { prepare: () => ({ bind: () => ({ first: async () => ({ claim_key: "k" }), run: async () => ({}) }) }) };
const env = { AGENT_MAIL_DB: db, BEEHIIV_API_KEY: "key", BEEHIIV_PUBLICATION_ID: PUB };

const CONFIRM = "Almost done. Check your inbox and tap the button in our email to confirm.";
const EXISTING = "You're already on the list. Thanks for being here.";
const PLAIN = "You're in. Watch your inbox.";

function beehiiv(t, { existing = null, created = "validating" } = {}) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("challenges.cloudflare.com")) return Response.json({ success: true });
    if (u.includes("/subscriptions/by_email/"))
      return existing ? Response.json({ data: { id: "sub_old", status: existing } }) : new Response("", { status: 404 });
    if (u.endsWith(`/publications/${PUB}/subscriptions`)) return Response.json({ data: { id: "sub_new", status: created } });
    return new Response("", { status: 404 });
  };
  t.after(() => { globalThis.fetch = real; });
}

test("a new signup Beehiiv has not activated is asked to confirm", async (t) => {
  for (const created of ["validating", "pending"]) {
    beehiiv(t, { created });
    assert.deepEqual(await safeNewsletterSubscribe(env, "a@example.com", "footer"), { ok: true, confirm: true }, created);
  }
});

test("an active new signup is simply on the list", async (t) => {
  beehiiv(t, { created: "active" });
  assert.deepEqual(await safeNewsletterSubscribe(env, "a@example.com", "footer"), { ok: true });
});

test("someone who signed up but never confirmed is told to confirm, not that they are on the list", async (t) => {
  beehiiv(t, { existing: "pending" });
  assert.deepEqual(await safeNewsletterSubscribe(env, "a@example.com", "footer"), { ok: true, existing: true, confirm: true });
});

test("an active subscriber hears they are already on the list", async (t) => {
  beehiiv(t, { existing: "active" });
  assert.deepEqual(await safeNewsletterSubscribe(env, "a@example.com", "footer"), { ok: true, existing: true });
});

test("/api/subscribe hands confirm and existing to the form", async (t) => {
  const full = { ...env, TURNSTILE_SECRET_KEY: "secret", FORM_LIMITER: { limit: async () => ({ success: true }) } };
  const ctx = { waitUntil: (p) => { Promise.resolve(p).catch(() => {}); } };
  const post = () => worker.fetch(new Request("https://adapttolife.org/api/subscribe", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ em: "a@example.com", source: "footer", cf_token: "token" }),
  }), full, ctx);
  beehiiv(t, { created: "validating" });
  assert.deepEqual(await (await post()).json(), { ok: true, confirm: true });
  beehiiv(t, { existing: "active" });
  assert.deepEqual(await (await post()).json(), { ok: true, existing: true });
});

// Run the shipped form script against a stand-in page and read what it says.
async function formSays(script, doc, response) {
  vm.runInNewContext(script, { document: doc.document, console, fetch: async () => ({ ok: true, json: async () => response }) });
  doc.submit({ preventDefault() {} });
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
  return doc.status.textContent;
}

function footerForm() {
  const status = { textContent: "", style: {} };
  const els = {
    ".foot-sub-msg": status, 'button[type="submit"]': { disabled: false }, 'input[name="em"]': { value: "a@example.com" },
    'input[name="company"]': { value: "" }, '[name="cf-turnstile-response"]': { value: "token" },
  };
  const doc = { status };
  const form = { querySelector: (s) => els[s] || null, getAttribute: () => "footer", reset() {},
    addEventListener: (ev, fn) => { if (ev === "submit") doc.submit = fn; } };
  doc.document = { querySelectorAll: () => [form] };
  return doc;
}

function subscribePage() {
  const status = { textContent: "", style: {} };
  const byId = { formStatus: status, em: { value: "a@example.com" }, company: { value: "" }, src: { value: "subscribe-page" } };
  const doc = { status };
  const form = { querySelector: (s) => (s === 'button[type="submit"]' ? { disabled: false, textContent: "Join the list" } : null), reset() {},
    addEventListener: (ev, fn) => { if (ev === "submit") doc.submit = fn; } };
  byId.subscribeForm = form;
  doc.document = { getElementById: (id) => byId[id] || null };
  return doc;
}

const footerScript = readFileSync(new URL("../public/js/subscribe.js", import.meta.url), "utf8");
const pageScript = [...readFileSync(new URL("../public/subscribe.html", import.meta.url), "utf8").matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map((m) => m[1]).find((s) => s.includes("getElementById('subscribeForm')"));

test("the footer form and the /subscribe page say the same three things", async () => {
  assert.ok(pageScript, "the /subscribe page still carries its form script");
  for (const [script, make] of [[footerScript, footerForm], [pageScript, subscribePage]]) {
    assert.equal(await formSays(script, make(), { ok: true, confirm: true }), CONFIRM);
    assert.equal(await formSays(script, make(), { ok: true, existing: true }), EXISTING);
    assert.equal(await formSays(script, make(), { ok: true }), PLAIN);
  }
});

test("/confirmed is our own landing page for a confirmed subscriber, hidden from search", () => {
  const html = readFileSync(new URL("../public/confirmed.html", import.meta.url), "utf8");
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/adapttolife\.org\/confirmed">/);
  assert.match(html, /<h1[^>]*>You're confirmed\.<\/h1>/);
  assert.match(html, /href="\/events"/);
  assert.doesNotMatch(html, /adaptivesportsnearme\.com\/\?confirmed/);
});
