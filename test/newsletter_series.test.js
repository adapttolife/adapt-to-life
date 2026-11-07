// The newsletter welcome email (src/newsletter-series.js): the one plain letter
// a new subscriber gets, the designed emails saved for later, how they render,
// how they go out through Resend, and the unsubscribe link.
//
// Alec, Nov 7 2026: "make sure resend is working as intended and we created
// the emails." Then, seeing five: "Let's just keep one email for now. Keep it
// super simple."
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WELCOME,
  SAVED_FOR_LATER,
  renderEmail,
  sendSeriesEmail,
  startWelcome,
  runWelcomeSeries,
  unsubscribeUrl,
  validUnsubscribe,
  unsubscribe,
} from "../src/newsletter-series.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const ALL = [...WELCOME, ...SAVED_FOR_LATER];
const UNSUB = "https://adapttolife.org/unsubscribe?e=a%40b.co&t=tok";

// ---- the copy -------------------------------------------------------------
const copyOf = (step) =>
  [
    step.subject,
    step.preheader,
    ...(step.paragraphs || []).flatMap((x) =>
      typeof x === "string" ? [x] : [x.text, x.link.label],
    ),
    ...(step.items || []).flatMap((i) => [i.text, i.link.label]),
    step.highlight,
    step.closing,
    step.ps,
    step.psForNonDonors?.text,
    step.cta?.label,
    step.secondary?.label,
  ].filter(Boolean);

test("one plain email, sent at signup; the rest are saved and never sent", () => {
  assert.equal(WELCOME.length, 1);
  const [welcome] = WELCOME;
  assert.equal(welcome.key, "welcome");
  assert.equal(welcome.day, 0);
  assert.equal(welcome.plain, true);
  assert.ok(
    !welcome.image && !welcome.cta && !welcome.ps,
    "no photo, no button, no P.S.",
  );
  assert.equal(welcome.subject, "Welcome to Adapt To Life");
  assert.ok(welcome.paragraphs.length <= 4, "super simple");
  assert.deepEqual(
    SAVED_FOR_LATER.map((s) => s.key),
    ["welcome-designed", "fund", "crew", "ask", "ways"],
  );
  for (const saved of SAVED_FOR_LATER)
    assert.ok(!WELCOME.includes(saved), `${saved.key} is not in the sending list`);
});

test("the copy keeps the Adapt To Life voice: no dashes, no questions, no GLASA", () => {
  for (const s of ALL)
    for (const line of copyOf(s)) {
      assert.ok(
        !/[‒-―-]/.test(line.replace(/@adapt_to_life_org/, "")),
        `${s.key}: dash in "${line}"`,
      );
      assert.ok(!line.includes("?"), `${s.key}: question in "${line}"`);
      assert.ok(!line.includes("!"), `${s.key}: exclamation in "${line}"`);
      assert.ok(!/glasa|great lakes/i.test(line), `${s.key}: GLASA in "${line}"`);
      assert.ok(!line.includes("'"), `${s.key}: straight apostrophe in "${line}"`);
    }
});

test("the welcome is built on Alec's own published words and the site's facts", () => {
  const text = copyOf(WELCOME[0]).join("\n");
  // His accepted welcome (skills: adapt-to-life-brand-voice): "We're here to
  // expand access to adaptive sports so athletes can find their place."
  assert.ok(
    text.includes(
      "We’re here to expand access to adaptive sports so athletes can find their place.",
    ),
  );
  assert.ok(
    read("public/index.html").includes(
      "We expand access to adaptive sports so athletes can find their place.",
    ),
  );
  assert.ok(
    text.includes(
      "Chicago Pickleball: Wheelie Big Dills, a crew of wheelchair pickleball players on court every week",
    ),
  );
  assert.ok(
    read("public/pickleball.html").includes("A crew of wheelchair pickleball players"),
  );
});

test("every money button and link says Donate (the saved emails too)", () => {
  for (const s of ALL) {
    const links = [
      s.cta,
      s.secondary,
      s.psForNonDonors?.link,
      ...(s.items || []).map((i) => i.link),
      ...(s.paragraphs || []).filter((x) => typeof x !== "string").map((x) => x.link),
    ].filter(Boolean);
    for (const l of links)
      if (/^\/donate/.test(l.href))
        assert.equal(l.label, "Donate", `${s.key}: ${l.label}`);
  }
});

test("the numbers in the saved emails are still the site's numbers", () => {
  const all = ALL.flatMap(copyOf).join("\n");
  const wbd = JSON.parse(read("public/data/campaigns.json")).campaigns.find(
    (c) => c.slug === "wheelie-big-dills",
  );
  const usd = (n) => "$" + n.toLocaleString("en-US");
  assert.ok(all.includes(usd(wbd.goal)), "the goal");
  for (const part of wbd.parts) assert.ok(all.includes(usd(part.goal)), part.key);
  assert.ok(
    read("public/js/campaigns.js").includes(
      "$129 a month can keep one athlete training all year.",
    ),
  );
  assert.ok(all.includes("$129 a month can keep one athlete training all year."));
  const sponsorship = read("public/sponsorship.html");
  for (const price of ["$225", "$1,548", "$15,480"]) {
    assert.ok(sponsorship.includes(price), `${price} on /sponsorship`);
    assert.ok(all.includes(price), `${price} in the emails`);
  }
  assert.ok(
    read("public/promise.html").includes("Right now Alec covers the overhead himself."),
  );
});

// ---- rendering --------------------------------------------------------------
test("every email renders with the unsubscribe link and a plain text twin", () => {
  for (const s of ALL) {
    const { subject, html, text } = renderEmail(s, { unsubscribeUrl: UNSUB });
    assert.equal(subject, s.subject);
    if (s.plain)
      assert.ok(!html.includes("<img"), `${s.key}: a plain letter has no images`);
    else assert.ok(html.includes("/images/email/atl-logo-cream.png"), `${s.key}: logo`);
    assert.ok(
      html.includes(UNSUB.replace(/&/g, "&amp;")),
      `${s.key}: unsubscribe in html`,
    );
    assert.ok(text.includes(`Unsubscribe: ${UNSUB}`), `${s.key}: unsubscribe in text`);
    assert.ok(html.includes(s.preheader), `${s.key}: preheader`);
    assert.ok(html.includes("EIN 41-3213344"), `${s.key}: legal line`);
    for (const img of html.match(/<img [^>]*>/g) || [])
      assert.match(img, /alt="[^"]+"/);
    for (const m of html.matchAll(/href="([^"]+)"/g)) {
      const href = m[1].replace(/&amp;/g, "&");
      if (
        href.startsWith("mailto:") ||
        href.includes("instagram.com") ||
        href.includes("/unsubscribe?")
      )
        continue;
      assert.ok(href.startsWith("https://adapttolife.org/"), `${s.key}: ${href}`);
      assert.ok(
        href.includes("utm_campaign=welcome") && href.includes(`utm_content=${s.key}`),
        `${s.key}: ${href}`,
      );
    }
  }
  assert.throws(() => renderEmail(WELCOME[0], {}), /unsubscribe/);
});

test("the plain welcome reads as a letter, with one link, and its text twin says the same", () => {
  const { html, text } = renderEmail(WELCOME[0], { unsubscribeUrl: UNSUB });
  const links = [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 2, "the crew link and the unsubscribe link");
  assert.match(
    links[0],
    /^https:\/\/adapttolife\.org\/pickleball\?utm_source=newsletter/,
  );
  assert.ok(html.includes(">Chicago Pickleball: Wheelie Big Dills</a>"));
  assert.ok(
    !html.includes("background:"),
    "the mail app's own background, dark mode included",
  );
  assert.ok(text.startsWith("Thanks for signing up."));
  assert.ok(
    text.includes("Chicago Pickleball: Wheelie Big Dills (https://adapttolife.org/pickleball?"),
  );
  assert.ok(text.includes("\nAlec\nFounder, Adapt To Life\n"));
});

test("donors do not get the P.S. asking them to give (saved email)", () => {
  const ways = SAVED_FOR_LATER.find((s) => s.key === "ways");
  assert.ok(
    renderEmail(ways, { unsubscribeUrl: UNSUB }).text.includes("If you’d like to give"),
  );
  assert.ok(
    !renderEmail(ways, { unsubscribeUrl: UNSUB, isDonor: true }).text.includes(
      "If you’d like to give",
    ),
  );
});

test("every image the saved emails use is on the site", () => {
  for (const s of ALL.filter((s) => s.image))
    assert.ok(
      readFileSync(new URL(`../public${s.image.src}`, import.meta.url)).length > 10000,
      s.image.src,
    );
  assert.ok(
    readFileSync(new URL("../public/images/email/atl-logo-cream.png", import.meta.url))
      .length > 1000,
  );
});

// ---- unsubscribe links --------------------------------------------------------
test("an unsubscribe link works only for the address it was made for", async () => {
  const env = { RESEND_API_KEY: "re_test" };
  const url = new URL(await unsubscribeUrl(env, " Person@Example.com "));
  assert.equal(url.origin + url.pathname, "https://adapttolife.org/unsubscribe");
  assert.equal(url.searchParams.get("e"), "person@example.com");
  const t = url.searchParams.get("t");
  assert.ok(await validUnsubscribe(env, "person@example.com", t));
  assert.ok(!(await validUnsubscribe(env, "someone@else.com", t)));
  assert.ok(!(await validUnsubscribe(env, "person@example.com", t.slice(0, -1) + "x")));
  assert.ok(
    !(await validUnsubscribe({ RESEND_API_KEY: "other" }, "person@example.com", t)),
  );
});

// ---- a fake Resend and a fake D1 ------------------------------------------------
function fakeResend({ contact = { unsubscribed: false }, sendStatus = 200 } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({
      url: u,
      method: init.method || "GET",
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : null,
    });
    if (u === "https://api.resend.com/emails")
      return sendStatus === 200
        ? Response.json({ id: `email-${calls.length}` })
        : new Response("nope", { status: sendStatus });
    if (u.startsWith("https://api.resend.com/contacts/")) {
      if (init.method === "PATCH")
        return Response.json({ object: "contact", id: "c1" });
      return contact
        ? Response.json({ object: "contact", ...contact })
        : new Response("not found", { status: 404 });
    }
    throw new Error("unexpected fetch " + u);
  };
  return {
    fetch,
    calls,
    sent: () => calls.filter((c) => c.url === "https://api.resend.com/emails"),
  };
}

function fakeD1() {
  const rows = new Map();
  const stmt = (sql, values) => ({
    async first() {
      if (sql.startsWith("INSERT OR IGNORE INTO newsletter_journey")) {
        const [email, contact_id, series, started_at, next_at] = values;
        if (rows.has(email)) return null;
        rows.set(email, {
          email,
          contact_id,
          series,
          step: 0,
          status: "active",
          started_at,
          next_at,
          claimed_until: null,
          attempts: 0,
          last_error: null,
          last_sent_at: null,
        });
        return { email };
      }
      if (sql.startsWith("UPDATE newsletter_journey SET claimed_until = ?")) {
        const [until, email, now] = values;
        const r = rows.get(email);
        if (!r || r.status !== "active" || (r.claimed_until && r.claimed_until >= now))
          return null;
        r.claimed_until = until;
        return { ...r };
      }
      throw new Error("unexpected first() " + sql);
    },
    async all() {
      if (sql.startsWith("SELECT email FROM newsletter_journey")) {
        const [now, now2, limit] = values;
        const results = [...rows.values()]
          .filter(
            (r) =>
              r.status === "active" &&
              r.next_at <= now &&
              (!r.claimed_until || r.claimed_until < now2),
          )
          .sort((a, b) => a.next_at.localeCompare(b.next_at))
          .slice(0, limit)
          .map((r) => ({ email: r.email }));
        return { results };
      }
      throw new Error("unexpected all() " + sql);
    },
    async run() {
      if (sql.startsWith("UPDATE newsletter_journey SET status = 'unsubscribed'")) {
        const r = rows.get(values[0]);
        if (r) Object.assign(r, { status: "unsubscribed", claimed_until: null });
        return {};
      }
      if (sql.startsWith("UPDATE newsletter_journey SET")) {
        const keys = [...sql.matchAll(/(\w+) = \?/g)].map((m) => m[1]);
        const email = values[values.length - 1];
        const r = rows.get(email);
        keys.forEach((k, i) => (r[k] = values[i]));
        r.claimed_until = null;
        return {};
      }
      throw new Error("unexpected run() " + sql);
    },
  });
  return { rows, prepare: (sql) => ({ bind: (...values) => stmt(sql, values) }) };
}

function fakeDonors(emails = []) {
  return {
    prepare: () => ({
      bind: (email) => ({
        first: async () => (emails.includes(email) ? { yes: 1 } : null),
      }),
    }),
  };
}

async function withFetch(fetch, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

const envWith = (db, donors = fakeDonors()) => ({
  WELCOME_SERIES: "on",
  RESEND_API_KEY: "re_test",
  AGENT_MAIL_DB: db,
  WAIVERS_DB: donors,
  NEWSLETTER_FROM: "Alec at Adapt To Life <hello@mail.adapttolife.org>",
  NEWSLETTER_REPLY_TO: "hello@adapttolife.org",
});

// ---- sending ---------------------------------------------------------------------
test("the email goes to Resend from mail.adapttolife.org with one click unsubscribe headers", async () => {
  const resend = fakeResend();
  const env = envWith(fakeD1());
  await withFetch(resend.fetch, () =>
    sendSeriesEmail(env, "Fan@Example.com", WELCOME[0]),
  );
  const [call] = resend.sent();
  assert.equal(call.method, "POST");
  assert.equal(call.headers.Authorization, "Bearer re_test");
  assert.match(call.headers["Idempotency-Key"], /^welcome-welcome-[0-9a-f]{32}$/);
  assert.equal(call.body.from, "Alec at Adapt To Life <hello@mail.adapttolife.org>");
  assert.equal(call.body.reply_to, "hello@adapttolife.org");
  assert.deepEqual(call.body.to, ["fan@example.com"]);
  assert.equal(call.body.subject, "Welcome to Adapt To Life");
  assert.match(
    call.body.headers["List-Unsubscribe"],
    /^<https:\/\/adapttolife\.org\/unsubscribe\?e=fan%40example\.com&t=[\w-]+>, <mailto:hello@adapttolife\.org\?subject=Unsubscribe>$/,
  );
  assert.equal(
    call.body.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assert.deepEqual(call.body.tags, [
    { name: "series", value: "welcome" },
    { name: "step", value: "welcome" },
  ]);
  assert.ok(call.body.html && call.body.text);
});

// ---- the journey ---------------------------------------------------------------------
test("a new subscriber gets the welcome at once, and nothing after it", async () => {
  const db = fakeD1();
  const env = envWith(db);
  const resend = fakeResend();
  const t0 = Date.parse("2026-11-07T15:00:00Z");
  await withFetch(resend.fetch, async () => {
    const out = await startWelcome(env, "fan@example.com", {
      contactId: "c1",
      now: t0,
    });
    assert.equal(out.started, true);
    assert.equal(out.sent, true);
    for (const day of [1, 2, 5, 9, 14, 30])
      assert.equal(
        (await runWelcomeSeries(env, { now: t0 + day * DAY })).sent,
        0,
        `day ${day}`,
      );
  });
  assert.equal(resend.sent().length, 1);
  assert.equal(db.rows.get("fan@example.com").status, "done");
  // Starting again does nothing: one welcome per person.
  await withFetch(resend.fetch, async () => {
    assert.equal(
      (await startWelcome(env, "fan@example.com", { now: t0 + 20 * DAY })).started,
      false,
    );
  });
});

test("donors get the welcome too: there is no ask in it", async () => {
  const db = fakeD1();
  const env = envWith(db, fakeDonors(["donor@example.com"]));
  const resend = fakeResend();
  await withFetch(resend.fetch, () =>
    startWelcome(env, "donor@example.com", { now: Date.parse("2026-11-07T15:00:00Z") }),
  );
  assert.equal(resend.sent().length, 1);
  assert.equal(db.rows.get("donor@example.com").status, "done");
});

test("a retry checks Resend first: someone who unsubscribed meanwhile gets nothing", async () => {
  const db = fakeD1();
  const env = envWith(db);
  const t0 = Date.parse("2026-11-07T15:00:00Z");
  await withFetch(fakeResend({ sendStatus: 500 }).fetch, () =>
    startWelcome(env, "gone@example.com", { now: t0 }),
  );
  const later = fakeResend({ contact: { unsubscribed: true } });
  await withFetch(later.fetch, () => runWelcomeSeries(env, { now: t0 + 3 * DAY }));
  assert.equal(later.sent().length, 0);
  assert.equal(db.rows.get("gone@example.com").status, "unsubscribed");
});

test("a failed send is retried later, and gives up after six tries", async () => {
  const db = fakeD1();
  const env = envWith(db);
  const t0 = Date.parse("2026-11-07T15:00:00Z");
  const failing = fakeResend({ sendStatus: 500 });
  await withFetch(failing.fetch, () =>
    startWelcome(env, "retry@example.com", { now: t0 }),
  );
  const row = db.rows.get("retry@example.com");
  assert.equal(row.step, 0, "still on the welcome");
  assert.equal(row.attempts, 1);
  assert.ok(Date.parse(row.next_at) > t0, "retry is scheduled");
  await withFetch(failing.fetch, async () => {
    for (let i = 0; i < 6; i++) {
      const now = Date.parse(db.rows.get("retry@example.com").next_at) + 1000;
      await runWelcomeSeries(env, { now });
    }
  });
  assert.equal(db.rows.get("retry@example.com").status, "stopped");
});

test("the email is off unless WELCOME_SERIES is on", async () => {
  const db = fakeD1();
  const env = { ...envWith(db), WELCOME_SERIES: "off" };
  const resend = fakeResend();
  await withFetch(resend.fetch, async () => {
    assert.equal((await startWelcome(env, "x@example.com")).started, false);
    assert.equal((await runWelcomeSeries(env)).skipped, "disabled");
  });
  assert.equal(resend.calls.length, 0);
  // On for the live site (top-level vars). Staging mirrors the vars
  // (scripts/staging-live.test.mjs) but has no Resend key, so it stays inert.
  const cfg = read("wrangler.jsonc");
  assert.ok(cfg.slice(0, cfg.indexOf('"env": {')).includes('"WELCOME_SERIES": "on"'));
  assert.equal(
    (await startWelcome({ WELCOME_SERIES: "on", AGENT_MAIL_DB: db }, "y@example.com"))
      .started,
    false,
  );
});

test("unsubscribing stops it and marks the contact unsubscribed in Resend", async () => {
  const db = fakeD1();
  const env = envWith(db);
  const resend = fakeResend();
  await withFetch(resend.fetch, async () => {
    await startWelcome(env, "bye@example.com", {
      now: Date.parse("2026-11-07T15:00:00Z"),
    });
    await unsubscribe(env, "Bye@Example.com");
  });
  assert.equal(db.rows.get("bye@example.com").status, "unsubscribed");
  const patch = resend.calls.find((c) => c.method === "PATCH");
  assert.equal(patch.url, "https://api.resend.com/contacts/bye%40example.com");
  assert.deepEqual(patch.body, { unsubscribed: true });
});

// ---- through the worker -------------------------------------------------------------
async function worker() {
  return (await import("../src/index.js")).default;
}

test("/unsubscribe: the link unsubscribes, one click POST answers 200, a forged link is refused", async () => {
  const w = await worker();
  const db = fakeD1();
  const env = { ...envWith(db), ASSETS: { fetch: async () => new Response("asset") } };
  const resend = fakeResend();
  const good = await unsubscribeUrl(env, "click@example.com");
  await withFetch(resend.fetch, async () => {
    const page = await w.fetch(new Request(good), env, { waitUntil() {} });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /You’re unsubscribed/);
    const oneClick = await w.fetch(
      new Request(good, { method: "POST", body: "List-Unsubscribe=One-Click" }),
      env,
      { waitUntil() {} },
    );
    assert.equal(oneClick.status, 200);
    const forged = await w.fetch(
      new Request(good.replace("click%40", "other%40")),
      env,
      {
        waitUntil() {},
      },
    );
    assert.equal(forged.status, 400);
    assert.match(await forged.text(), /didn’t work/);
  });
  assert.equal(resend.calls.filter((c) => c.method === "PATCH").length, 2);
});

test("a new signup through /api/subscribe gets the welcome; an existing one does not", async () => {
  const w = await worker();
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const journey = fakeD1();
  const claims = new Set();
  // agent-mail holds both the signup claims and the journey.
  const db = {
    prepare(sql) {
      if (sql.includes("newsletter_journey")) return journey.prepare(sql);
      return {
        bind: (...values) => ({
          async first() {
            if (sql.startsWith("INSERT OR IGNORE INTO newsletter_delivery_claims")) {
              if (claims.has(values[0])) return null;
              claims.add(values[0]);
              return { claim_key: values[0] };
            }
            return null;
          },
          async run() {
            return {};
          },
        }),
      };
    },
  };
  const env = {
    ...envWith(db),
    RESEND_SEGMENT_ID: "seg",
    TURNSTILE_MODE: "off",
    FORM_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const sent = [];
  const fetch = async (url, init = {}) => {
    const u = String(url);
    if (u === "https://api.resend.com/contacts")
      return Response.json({ object: "contact", id: "c-new" });
    if (u === "https://api.resend.com/emails") {
      sent.push(JSON.parse(init.body));
      return Response.json({ id: "e1" });
    }
    return new Response("{}", { status: 200 });
  };
  const signup = () =>
    w.fetch(
      new Request("https://adapttolife.org/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9" },
        body: JSON.stringify({ em: "new@example.com", source: "test" }),
      }),
      env,
      ctx,
    );
  await withFetch(fetch, async () => {
    const first = await signup();
    assert.equal(first.status, 200);
    await Promise.allSettled(waits.splice(0));
    assert.equal(sent.length, 1, "the welcome went out");
    assert.equal(sent[0].subject, "Welcome to Adapt To Life");
    assert.equal(journey.rows.get("new@example.com").contact_id, "c-new");
    const again = await signup();
    assert.deepEqual(await again.json(), { ok: true, existing: true });
    await Promise.allSettled(waits.splice(0));
    assert.equal(sent.length, 1, "no second welcome");
  });
});
