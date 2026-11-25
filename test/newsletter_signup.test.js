// Joining a list (src/newsletter.js; docs/EMAIL.md, "Contacts, lists and
// unsubscribing"): the join is recorded before Resend is called, each step is
// stamped, the cron finishes what did not complete, and the welcome is keyed,
// frozen and checked against the brand Topic. Real SQL (the agent-mail schema
// files) and a stateful fake Resend; no network.
import test from "node:test";
import assert from "node:assert/strict";
import { unsubscribe } from "../src/newsletter-series.js";
import {
  safeNewsletterSubscribe,
  processSignup,
  sweepSignups,
} from "../src/newsletter.js";
import {
  fakeResend,
  newsletterEnv,
  withFetch,
  TOPIC_ATL,
  TOPIC_SHOP,
  TOPIC_ASNM,
  SEG_ATL,
  SEG_SHOP,
} from "./helpers/fake-resend.js";

const row = (env, email, brand = "atl") =>
  env.AGENT_MAIL_DB.sql
    .prepare("SELECT * FROM newsletter_signups WHERE brand=? AND email=?")
    .get(brand, email);
const failures = (env) =>
  env.AGENT_MAIL_DB.sql.prepare("SELECT route,to_addr,error FROM send_failures").all();
const due = (env) =>
  env.AGENT_MAIL_DB.sql
    .prepare("UPDATE newsletter_signups SET next_attempt_at='2000-01-01T00:00:00Z'")
    .run();

test("a new signup: recorded, made a contact in the brand Segment, opted in to the Topic, welcomed once", async () => {
  const env = newsletterEnv();
  const resend = fakeResend();
  const out = await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env, " New@Example.com ", "footer", { name: "Taylor" }),
  );
  assert.deepEqual(out, { ok: true });
  const c = resend.contacts.get("new@example.com");
  assert.ok(c.segments.has(SEG_ATL));
  assert.equal(c.topics.get(TOPIC_ATL), "opt_in");
  assert.equal(c.first_name, "Taylor");
  assert.equal(resend.emails.length, 1);
  const [mail] = resend.emails;
  assert.equal(mail.subject, "You’re on the list");
  assert.deepEqual(mail.to, ["new@example.com"]);
  assert.equal(mail.from, "Alec at Adapt To Life <hello@mail.adapttolife.org>");
  assert.match(
    mail.headers["List-Unsubscribe"],
    /^<https:\/\/adapttolife\.org\/unsubscribe\?e=new%40example\.com&b=atl&t=[\w-]{32}>, <mailto:hello@adapttolife\.org\?subject=Unsubscribe>$/,
  );
  assert.equal(mail.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const r = row(env, "new@example.com");
  assert.equal(r.state, "done");
  assert.ok(r.contact_at && r.topic_at && r.welcome_at && r.welcome_first_attempted_at);
  assert.equal(r.welcome_id, "email-1");
  assert.equal(r.source, "footer");
  // The journey knows the welcome went, so the series never sends it again.
  const j = env.AGENT_MAIL_DB.sql.prepare("SELECT * FROM newsletter_journey").get();
  assert.equal(j.email, "new@example.com");
  assert.equal(j.status, "done");
  // The Topic is checked before the welcome goes (GET topics precedes POST /emails).
  const order = resend.calls.map((c) => `${c.method} ${c.path}`);
  assert.ok(
    order.lastIndexOf("GET /contacts/new%40example.com/topics") <
      order.indexOf("POST /emails"),
  );
});

test("idempotent: a second signup answers existing and sends nothing; a repeat pass does nothing", async () => {
  const env = newsletterEnv();
  const resend = fakeResend();
  await withFetch(resend.fetch, async () => {
    await safeNewsletterSubscribe(env, "twice@example.com");
    const calls = resend.calls.length;
    assert.deepEqual(await safeNewsletterSubscribe(env, "TWICE@example.com"), {
      ok: true,
      existing: true,
    });
    assert.deepEqual(await processSignup(env, "atl", "twice@example.com"), {
      state: "skipped",
    });
    assert.deepEqual(await sweepSignups(env), { processed: 0 });
    assert.equal(resend.calls.length, calls, "no Resend call at all");
  });
  assert.equal(resend.emails.length, 1);
});

test("409: someone already in the team gets this brand's Topic and welcome; the team wide flag is cleared, other Topics untouched", async () => {
  const env = newsletterEnv();
  const resend = fakeResend({
    contacts: {
      "asnm@example.com": {
        unsubscribed: true,
        segments: ["asnm-seg"],
        topics: { [TOPIC_ASNM]: "opt_out" },
      },
    },
  });
  // The contact is created by someone else between our look-up and our create:
  // Resend answers 409 and the existing-contact path takes over.
  let first = true;
  const racing = async (input, init = {}) => {
    const u = new URL(String(input));
    if (
      first &&
      u.pathname === "/contacts/asnm%40example.com" &&
      (init.method || "GET") === "GET"
    ) {
      first = false;
      return Response.json({ name: "not_found" }, { status: 404 });
    }
    return resend.fetch(input, init);
  };
  const out = await withFetch(racing, () =>
    safeNewsletterSubscribe(env, "asnm@example.com"),
  );
  assert.deepEqual(out, { ok: true });
  assert.ok(
    resend.calls.some((c) => c.method === "POST" && c.path === "/contacts"),
    "create tried",
  );
  const c = resend.contacts.get("asnm@example.com");
  assert.ok(c.segments.has(SEG_ATL) && c.segments.has("asnm-seg"));
  assert.equal(c.topics.get(TOPIC_ATL), "opt_in");
  assert.equal(c.topics.get(TOPIC_ASNM), "opt_out", "never touched");
  assert.equal(c.unsubscribed, false, "joining a brand clears the team wide flag");
  assert.equal(resend.emails.length, 1);
  assert.equal(row(env, "asnm@example.com").state, "done");
});

test("an existing contact who has not left everything: the team wide flag is never written", async () => {
  const env = newsletterEnv();
  const resend = fakeResend({
    contacts: { "beta@example.com": { topics: { "beta-1": "opt_in" } } },
  });
  await withFetch(resend.fetch, () => safeNewsletterSubscribe(env, "beta@example.com"));
  assert.ok(
    !resend.calls.some(
      (c) => c.method === "PATCH" && c.path === "/contacts/beta%40example.com",
    ),
  );
  assert.ok(
    !resend.calls.some((c) => c.method === "POST" && c.path === "/contacts"),
    "never re-created",
  );
  assert.equal(resend.contacts.get("beta@example.com").topics.get("beta-1"), "opt_in");
  assert.equal(resend.emails.length, 1);
});

test("a half-finished signup is never 'already on the list': signing up again, or the sweep, finishes it", async () => {
  const env = newsletterEnv();
  let topicsDown = true;
  const resend = fakeResend({
    fail: (method, path) =>
      topicsDown && method === "PATCH" && path.endsWith("/topics") ? 503 : null,
  });
  await withFetch(resend.fetch, async () => {
    assert.deepEqual(await safeNewsletterSubscribe(env, "half@example.com"), {
      ok: true,
    });
    let r = row(env, "half@example.com");
    assert.equal(r.state, "pending");
    assert.ok(r.contact_at, "the contact step is stamped");
    assert.equal(r.topic_at, null);
    assert.ok(Date.parse(r.next_attempt_at) > Date.now(), "backoff");
    assert.match(r.error, /^topic: Resend could not opt the contact in/);
    assert.equal(resend.emails.length, 0);
    topicsDown = false;
    // Signing up again does not say "existing"; it finishes now.
    assert.deepEqual(await safeNewsletterSubscribe(env, "half@example.com"), {
      ok: true,
    });
    r = row(env, "half@example.com");
    assert.equal(r.state, "done");
    assert.ok(r.topic_at && r.welcome_at);
  });
  assert.equal(resend.emails.length, 1);
  assert.deepEqual(failures(env), [], "a passing 503 pages nobody");

  // The same, finished by the cron instead.
  const env2 = newsletterEnv();
  topicsDown = true;
  await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env2, "cron@example.com"),
  );
  topicsDown = false;
  await withFetch(resend.fetch, async () => {
    assert.equal((await sweepSignups(env2)).processed, 0, "not before its backoff");
    due(env2);
    assert.equal((await sweepSignups(env2)).processed, 1);
  });
  assert.equal(row(env2, "cron@example.com").state, "done");
  assert.equal(resend.emails.filter((m) => m.to[0] === "cron@example.com").length, 1);
});

test("the join is recorded even when Resend is down at signup, and the sweep makes the contact later", async () => {
  const env = newsletterEnv();
  let down = true;
  const resend = fakeResend({ fail: () => (down ? 500 : null) });
  await withFetch(resend.fetch, () => safeNewsletterSubscribe(env, "down@example.com"));
  assert.equal(row(env, "down@example.com").state, "pending");
  assert.equal(row(env, "down@example.com").contact_at, null);
  down = false;
  due(env);
  await withFetch(resend.fetch, () => sweepSignups(env));
  assert.equal(row(env, "down@example.com").state, "done");
  assert.ok(resend.contacts.has("down@example.com"));
});

test("a welcome that failed is resent from its frozen copy under the same key, inside the window", async () => {
  const env = newsletterEnv();
  let sendDown = true;
  const resend = fakeResend({
    fail: (m, p) => (sendDown && p === "/emails" ? 500 : null),
  });
  await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env, "retry@example.com"),
  );
  let r = row(env, "retry@example.com");
  assert.equal(r.state, "pending");
  assert.ok(r.welcome_rendered && r.welcome_first_attempted_at);
  const frozen = r.welcome_rendered;
  const firstKey = resend.calls.find((c) => c.path === "/emails").headers[
    "Idempotency-Key"
  ];
  assert.deepEqual(
    failures(env).map((f) => f.route),
    ["newsletter:atl welcome"],
    "the first failed send is reported",
  );
  sendDown = false;
  // A changed link secret would change a fresh render; the frozen copy wins.
  env.NEWSLETTER_LINK_SECRET = "rotated";
  due(env);
  await withFetch(resend.fetch, () => sweepSignups(env));
  r = row(env, "retry@example.com");
  assert.equal(r.state, "done");
  assert.equal(r.welcome_rendered, frozen);
  const sends = resend.calls.filter((c) => c.path === "/emails");
  assert.equal(sends.length, 2);
  assert.equal(sends[1].headers["Idempotency-Key"], firstKey);
  assert.deepEqual(sends[1].body, sends[0].body);
});

test("past the 23 hour window the welcome is not sent: review, and a person hears", async () => {
  const env = newsletterEnv();
  let sendDown = true;
  const resend = fakeResend({
    fail: (m, p) => (sendDown && p === "/emails" ? 500 : null),
  });
  await withFetch(resend.fetch, () => safeNewsletterSubscribe(env, "late@example.com"));
  sendDown = false;
  env.AGENT_MAIL_DB.sql
    .prepare(
      "UPDATE newsletter_signups SET welcome_first_attempted_at=?, next_attempt_at=NULL",
    )
    .run(new Date(Date.now() - 24 * 3600e3).toISOString());
  await withFetch(resend.fetch, () => sweepSignups(env));
  const r = row(env, "late@example.com");
  assert.equal(r.state, "review");
  assert.match(r.error, /Retry window closed/);
  assert.equal(
    resend.calls.filter((c) => c.path === "/emails").length,
    1,
    "only the first try",
  );
  assert.equal(failures(env).length, 2);
});

test("someone who left the brand Topic before the welcome went gets no welcome", async () => {
  const env = newsletterEnv();
  let sendDown = true;
  const resend = fakeResend({
    fail: (m, p) => (sendDown && p === "/emails" ? 500 : null),
  });
  await withFetch(resend.fetch, () => safeNewsletterSubscribe(env, "left@example.com"));
  resend.contacts.get("left@example.com").topics.set(TOPIC_ATL, "opt_out");
  sendDown = false;
  due(env);
  await withFetch(resend.fetch, () => sweepSignups(env));
  const r = row(env, "left@example.com");
  assert.equal(r.state, "done");
  assert.equal(r.note, "not sent: unsubscribed");
  assert.equal(resend.calls.filter((c) => c.path === "/emails").length, 1);
});

test("someone on the Adapt To Life list before the ledger who joins again gets the Topic, not a second welcome", async () => {
  const env = newsletterEnv();
  env.AGENT_MAIL_DB.sql
    .prepare(
      "INSERT INTO newsletter_journey (email,series,step,status,started_at,next_at,last_sent_at) VALUES ('old@example.com','welcome',1,'done','2026-11-08T00:00:00Z','2026-11-08T00:00:00Z','2026-11-08T00:00:00Z'), ('never@example.com','welcome',0,'stopped','2026-11-08T00:00:00Z','2026-11-08T00:00:00Z',NULL)",
    )
    .run();
  const resend = fakeResend({
    contacts: { "old@example.com": { segments: [SEG_ATL] } },
  });
  await withFetch(resend.fetch, () => safeNewsletterSubscribe(env, "old@example.com"));
  assert.equal(resend.emails.length, 0);
  assert.equal(resend.contacts.get("old@example.com").topics.get(TOPIC_ATL), "opt_in");
  assert.equal(row(env, "old@example.com").note, "welcomed before the signup ledger");
  // One whose old welcome never went (the journey gave up) gets it now.
  await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env, "never@example.com"),
  );
  assert.deepEqual(
    resend.emails.map((m) => m.to[0]),
    ["never@example.com"],
  );
});

test("an interrupted signup is picked up by the sweep; a welcome that may have gone is resent only inside its window", async () => {
  const env = newsletterEnv();
  const resend = fakeResend();
  const old = new Date(Date.now() - 20 * 60e3).toISOString();
  const sql = env.AGENT_MAIL_DB.sql;
  sql
    .prepare(
      "INSERT INTO newsletter_signups (brand,email,env,joined_at,state,started_at,attempts) VALUES ('atl','cut@example.com','production',?,'running',?,1)",
    )
    .run(old, old);
  sql
    .prepare(
      "INSERT INTO newsletter_signups (brand,email,env,joined_at,state,started_at,attempts,contact_at,topic_at,welcome_rendered,welcome_first_attempted_at) VALUES ('atl','sent@example.com','production',?,'running',?,1,?,?,'{}',?)",
    )
    .run(old, old, old, old, new Date(Date.now() - 30 * 3600e3).toISOString());
  await withFetch(resend.fetch, () => sweepSignups(env));
  assert.equal(row(env, "cut@example.com").state, "done");
  assert.equal(row(env, "sent@example.com").state, "review");
  assert.deepEqual(
    failures(env).map((f) => f.to_addr),
    ["sent@example.com"],
  );
});

test("a refusal Resend calls final goes to review at once and is reported", async () => {
  const env = newsletterEnv();
  const resend = fakeResend({
    fail: (m, p) => (m === "POST" && p === "/contacts" ? 422 : null),
  });
  await withFetch(resend.fetch, () => safeNewsletterSubscribe(env, "bad@example.com"));
  const r = row(env, "bad@example.com");
  assert.equal(r.state, "review");
  assert.match(r.error, /contact: .*422 validation_error/);
  assert.deepEqual(
    failures(env).map((f) => f.route),
    ["newsletter:atl contact"],
  );
});

test("without NEWSLETTER_LINK_SECRET no welcome goes out: it waits, a person hears once, and the sweep sends it once the secret is set", async () => {
  const env = newsletterEnv({ NEWSLETTER_LINK_SECRET: undefined });
  const resend = fakeResend();
  await withFetch(resend.fetch, () => safeNewsletterSubscribe(env, "wait@example.com"));
  let r = row(env, "wait@example.com");
  assert.equal(r.state, "pending");
  assert.ok(r.topic_at, "on the list already");
  assert.match(r.error, /NEWSLETTER_LINK_SECRET/);
  assert.equal(resend.emails.length, 0);
  assert.equal(failures(env).length, 1);
  env.NEWSLETTER_LINK_SECRET = "now-set";
  due(env);
  await withFetch(resend.fetch, () => sweepSignups(env));
  assert.equal(row(env, "wait@example.com").state, "done");
  assert.equal(resend.emails.length, 1);
  assert.equal(failures(env).length, 1, "not reported again");
});

test("outside production an address off MAIL_ALLOW never reaches Resend, and each Worker sweeps only its own rows", async () => {
  const env = newsletterEnv({ ENV_NAME: "staging", MAIL_ALLOW: "@adapttolife.org" });
  const resend = fakeResend();
  await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env, "public@example.com"),
  );
  assert.equal(resend.calls.length, 0);
  assert.match(row(env, "public@example.com").note, /MAIL_ALLOW/);
  // A staging row waiting in the shared table is not production's to send.
  env.AGENT_MAIL_DB.sql
    .prepare(
      "INSERT INTO newsletter_signups (brand,email,env,joined_at) VALUES ('atl','team@adapttolife.org','staging',?)",
    )
    .run(new Date().toISOString());
  const prod = { ...env, ENV_NAME: "production" };
  await withFetch(resend.fetch, () => sweepSignups(prod));
  assert.equal(resend.calls.length, 0);
  assert.equal(row(env, "team@adapttolife.org").state, "pending");
});

test("Body Shop: its own Segment, Topic and welcome from hello@mail.adaptbodyshop.com", async () => {
  const env = newsletterEnv();
  const resend = fakeResend();
  await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env, "shopper@example.com", "/collections/all", {
      brand: "bodyshop",
    }),
  );
  const c = resend.contacts.get("shopper@example.com");
  assert.deepEqual([...c.segments], [SEG_SHOP]);
  assert.deepEqual([...c.topics], [[TOPIC_SHOP, "opt_in"]]);
  const [mail] = resend.emails;
  assert.equal(mail.from, "Adapt Body Shop <hello@mail.adaptbodyshop.com>");
  assert.deepEqual(mail.reply_to, ["hello@adaptbodyshop.com"]);
  assert.match(
    mail.headers["List-Unsubscribe"],
    /b=bodyshop&t=[\w-]{32}>, <mailto:hello@adaptbodyshop\.com\?subject=Unsubscribe>$/,
  );
  assert.ok(mail.tags.some((t) => t.name === "brand" && t.value === "bodyshop"));
  assert.match(mail.text, /signed up at adaptbodyshop\.com/);
  assert.match(
    mail.text,
    /Adapt To Life NFP, 1509 N Milwaukee Ave, Libertyville, IL 60048/,
  );
  assert.equal(
    env.AGENT_MAIL_DB.sql.prepare("SELECT count(*) n FROM newsletter_journey").get().n,
    0,
    "the series is Adapt To Life's",
  );
  // The same person on the Adapt To Life list is a separate join.
  await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env, "shopper@example.com"),
  );
  assert.equal(c.topics.get(TOPIC_ATL), "opt_in");
  assert.equal(resend.emails.length, 2);
});

test("not configured (no key, Segment or Topic): 503 and nothing recorded", async () => {
  for (const missing of ["RESEND_API_KEY", "RESEND_SEGMENT_ID", "RESEND_TOPIC_ATL"]) {
    const env = newsletterEnv({ [missing]: "" });
    assert.equal(
      (await safeNewsletterSubscribe(env, "x@example.com")).status,
      503,
      missing,
    );
  }
  assert.equal(
    (
      await safeNewsletterSubscribe(
        newsletterEnv({ RESEND_TOPIC_BODYSHOP: "" }),
        "x@example.com",
        "",
        { brand: "bodyshop" },
      )
    ).status,
    503,
  );
});

test("someone who unsubscribes while their welcome is still owed is never opted back in or welcomed; joining again opts in", async () => {
  const env = newsletterEnv();
  let sendDown = true;
  const resend = fakeResend({
    fail: (m, p) => (sendDown && p === "/emails" ? 500 : null),
  });
  await withFetch(resend.fetch, async () => {
    await safeNewsletterSubscribe(env, "quick@example.com");
    assert.equal(row(env, "quick@example.com").state, "pending");
    await unsubscribe(env, "quick@example.com", "atl");
    sendDown = false;
    due(env);
    await sweepSignups(env);
  });
  const c = resend.contacts.get("quick@example.com");
  assert.equal(c.topics.get(TOPIC_ATL), "opt_out", "not opted back in");
  assert.equal(resend.emails.length, 0);
  assert.equal(row(env, "quick@example.com").state, "done");
  // Joining again is an explicit yes: back on the list.
  await withFetch(resend.fetch, () =>
    safeNewsletterSubscribe(env, "quick@example.com"),
  );
  assert.equal(c.topics.get(TOPIC_ATL), "opt_in");
  assert.equal(row(env, "quick@example.com").unsubscribed_at, null);
});
