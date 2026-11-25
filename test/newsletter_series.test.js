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
import { createHmac } from "node:crypto";
import {
  WELCOME,
  SAVED_FOR_LATER,
  SHOP_WELCOME,
  renderEmail,
  sendSeriesEmail,
  continueSeries,
  runWelcomeSeries,
  unsubscribeUrl,
  verifyUnsubscribe,
  unsubscribe,
} from "../src/newsletter-series.js";
import {
  fakeResend as statefulResend,
  newsletterEnv,
  withFetch,
  TOPIC_ATL,
  TOPIC_SHOP,
  TOPIC_ASNM,
} from "./helpers/fake-resend.js";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const DAY = 24 * 60 * 60 * 1000;
const ALL = [...WELCOME, ...SAVED_FOR_LATER];
const POSTAL = "Adapt To Life NFP, 1509 N Milwaukee Ave, Libertyville, IL 60048";
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
  // docs/EMAIL.md, "One confirmation for every action": "You're on the list".
  assert.equal(welcome.subject, "You’re on the list");
  assert.ok(welcome.paragraphs.length <= 4, "super simple");
  assert.deepEqual(
    SAVED_FOR_LATER.map((s) => s.key),
    ["welcome-designed", "fund", "crew", "ask", "ways"],
  );
  for (const saved of SAVED_FOR_LATER)
    assert.ok(!WELCOME.includes(saved), `${saved.key} is not in the sending list`);
});

test("the copy keeps the Adapt To Life voice: no dashes, no questions, no GLASA", () => {
  for (const s of [...ALL, SHOP_WELCOME])
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
    read("public/index.html")
      .replace(/<\/?b>/g, "")
      .includes(
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
  // Nov 12 2026: the emails say the round goal without stacking the parts (no
  // calculator needed), and a retired total never comes back.
  for (const old of ["$48,180", "$34,500"]) assert.ok(!all.includes(old), old);
  // The picker's line has no amount (the button shows it); the email stands
  // alone, so it says the amount and the same thing.
  // The ask leads with the picker's default, $60 a month (Alec, Nov 8 2026).
  assert.ok(
    read("public/js/campaigns.js").includes(
      "Four nights on court every month for one athlete.",
    ),
  );
  assert.ok(
    all.includes("$60 a month puts one athlete on court four nights every month."),
  );
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
    // Every list email: why they are getting it, and the postal address.
    for (const out of [html, text]) {
      assert.ok(out.includes("signed up at adapttolife.org"), `${s.key}: why`);
      assert.ok(out.includes(POSTAL), `${s.key}: postal address`);
    }
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

test("the plain welcome reads as a letter: unsubscribe up top and at the foot, one link in the body", () => {
  const { html, text } = renderEmail(WELCOME[0], { unsubscribeUrl: UNSUB });
  const links = [...html.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(links.length, 3, "unsubscribe, the crew link, unsubscribe");
  assert.equal(
    links[0],
    UNSUB.replace(/&/g, "&amp;"),
    "the unsubscribe link comes first",
  );
  assert.equal(links[2], UNSUB.replace(/&/g, "&amp;"));
  assert.match(
    links[1],
    /^https:\/\/adapttolife\.org\/pickleball\?utm_source=newsletter/,
  );
  assert.ok(html.includes(">Chicago Pickleball: Wheelie Big Dills</a>"));
  assert.ok(
    html.indexOf("You signed up for Adapt To Life news at adapttolife.org.") <
      html.indexOf(">Thanks for signing up.</p>"),
    "why they are getting it, before the letter",
  );
  assert.ok(
    !html.includes("background:"),
    "the mail app's own background, dark mode included",
  );
  assert.ok(
    text.startsWith(
      `You signed up for Adapt To Life news at adapttolife.org. Unsubscribe: ${UNSUB}\n\nThanks for signing up.`,
    ),
  );
  assert.ok(
    text.includes(
      "Chicago Pickleball: Wheelie Big Dills (https://adapttolife.org/pickleball?",
    ),
  );
  assert.ok(text.includes("\nAlec\nFounder, Adapt To Life\n"));
  assert.ok(
    text.endsWith(
      `Unsubscribe: ${UNSUB}\n${POSTAL}\nA 501(c)(3) nonprofit, EIN 41-3213344.`,
    ),
  );
});

test("the Body Shop welcome: the same plain letter, from the shop, naming Adapt To Life NFP at the address", () => {
  const unsub = "https://adapttolife.org/unsubscribe?e=a%40b.co&b=bodyshop&t=tok";
  const { subject, html, text } = renderEmail(SHOP_WELCOME, { unsubscribeUrl: unsub });
  assert.equal(subject, "You’re on the list");
  assert.ok(SHOP_WELCOME.paragraphs.length <= 4, "super simple");
  assert.ok(
    text.startsWith(
      `You signed up for Adapt Body Shop news at adaptbodyshop.com. Unsubscribe: ${unsub}`,
    ),
  );
  assert.ok(
    text.includes(
      "\nAdapt Body Shop\n\nYou’re getting this because you signed up at adaptbodyshop.com.",
    ),
  );
  assert.ok(
    text.includes(
      "Adapt Body Shop is part of Adapt To Life NFP, 1509 N Milwaukee Ave, Libertyville, IL 60048",
    ),
  );
  assert.ok(!/Alec|Founder/.test(text), "signed by the shop");
  assert.ok(!/every shirt/i.test(text), "no absolutes in money copy");
  assert.equal((html.match(/unsubscribe\?e=/g) || []).length, 2);
  assert.ok(html.includes('href="https://adaptbodyshop.com/"'));
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
test("a link carries its brand, is signed with NEWSLETTER_LINK_SECRET, and works only for that address and list", async () => {
  const env = { NEWSLETTER_LINK_SECRET: "link-secret", RESEND_API_KEY: "re_test" };
  const url = new URL(await unsubscribeUrl(env, " Person@Example.com ", "bodyshop"));
  assert.equal(url.origin + url.pathname, "https://adapttolife.org/unsubscribe");
  assert.equal(url.searchParams.get("e"), "person@example.com");
  assert.equal(url.searchParams.get("b"), "bodyshop");
  const t = url.searchParams.get("t");
  assert.equal(
    await verifyUnsubscribe(env, "person@example.com", "bodyshop", t),
    "bodyshop",
  );
  assert.equal(
    await verifyUnsubscribe(env, "person@example.com", "atl", t),
    null,
    "not another list",
  );
  assert.equal(await verifyUnsubscribe(env, "someone@else.com", "bodyshop", t), null);
  assert.equal(
    await verifyUnsubscribe(
      env,
      "person@example.com",
      "bodyshop",
      t.slice(0, -1) + "x",
    ),
    null,
  );
  assert.equal(await verifyUnsubscribe(env, "person@example.com", "nope", t), null);
  // Never the Resend key: rotating it must not break a link already sent.
  assert.equal(
    await verifyUnsubscribe(
      { ...env, RESEND_API_KEY: "rotated" },
      "person@example.com",
      "bodyshop",
      t,
    ),
    "bodyshop",
  );
  assert.equal(
    await verifyUnsubscribe(
      { ...env, NEWSLETTER_LINK_SECRET: "other" },
      "person@example.com",
      "bodyshop",
      t,
    ),
    null,
  );
  await assert.rejects(
    () => unsubscribeUrl({ RESEND_API_KEY: "re_test" }, "a@b.co"),
    /NEWSLETTER_LINK_SECRET/,
  );
});

// The link every welcome carried before Nov 25 2026: no brand, v1, signed with
// the Resend key (NEWSLETTER_LINK_SECRET was never set on production).
const v1Token = (secret, email) =>
  createHmac("sha256", secret)
    .update(`newsletter-unsubscribe:v1:${email}`)
    .digest("base64url")
    .slice(0, 32);

test("old links (no brand, signed with the Resend key) still verify, as Adapt To Life news", async () => {
  const env = { NEWSLETTER_LINK_SECRET: "link-secret", RESEND_API_KEY: "re_test" };
  const old = v1Token("re_test", "old@example.com");
  assert.equal(await verifyUnsubscribe(env, "old@example.com", "", old), "atl");
  assert.equal(await verifyUnsubscribe(env, "other@example.com", "", old), null);
  assert.equal(
    await verifyUnsubscribe(
      { ...env, RESEND_API_KEY: "rotated" },
      "old@example.com",
      "",
      old,
    ),
    null,
  );
  // An old token cannot be passed off as a v2 link for a brand.
  assert.equal(await verifyUnsubscribe(env, "old@example.com", "atl", old), null);
});

// ---- sending ---------------------------------------------------------------------
test("a list email goes to Resend from the brand's mail. domain with one click unsubscribe headers and tags", async () => {
  const resend = statefulResend();
  const env = newsletterEnv();
  await withFetch(resend.fetch, () =>
    sendSeriesEmail(env, "Fan@Example.com", WELCOME[0]),
  );
  const [call] = resend.calls.filter((c) => c.path === "/emails");
  assert.equal(call.headers.Authorization, "Bearer re_test");
  assert.match(call.headers["Idempotency-Key"], /^welcome-atl-welcome-[0-9a-f]{32}$/);
  assert.equal(call.body.from, "Alec at Adapt To Life <hello@mail.adapttolife.org>");
  assert.deepEqual(call.body.reply_to, ["hello@adapttolife.org"]);
  assert.deepEqual(call.body.to, ["fan@example.com"]);
  assert.equal(call.body.subject, "You’re on the list");
  assert.match(
    call.body.headers["List-Unsubscribe"],
    /^<https:\/\/adapttolife\.org\/unsubscribe\?e=fan%40example\.com&b=atl&t=[\w-]+>, <mailto:hello@adapttolife\.org\?subject=Unsubscribe>$/,
  );
  assert.equal(
    call.body.headers["List-Unsubscribe-Post"],
    "List-Unsubscribe=One-Click",
  );
  assert.deepEqual(call.body.tags, [
    { name: "brand", value: "adapttolife" },
    { name: "kind", value: "welcome" },
    { name: "series", value: "welcome" },
    { name: "step", value: "welcome" },
    { name: "env", value: "production" },
  ]);
  assert.ok(call.body.html && call.body.text);
});

// ---- the journey (later emails, if WELCOME ever grows) -------------------------
const journey = (env, email) =>
  env.AGENT_MAIL_DB.sql
    .prepare("SELECT * FROM newsletter_journey WHERE email=?")
    .get(email);
const legacyRow = (env, email, at) =>
  env.AGENT_MAIL_DB.sql
    .prepare(
      "INSERT INTO newsletter_journey (email,series,step,status,started_at,next_at,attempts) VALUES (?, 'welcome', 0, 'active', ?, ?, 0)",
    )
    .run(email, at, at);

test("after the welcome the journey is recorded at step 1, and with one email nothing more is sent", async () => {
  const env = newsletterEnv();
  const resend = statefulResend();
  const t0 = Date.parse("2026-11-25T15:00:00Z");
  await continueSeries(env, "fan@example.com", { now: t0 });
  assert.equal(journey(env, "fan@example.com").step, 1);
  assert.equal(journey(env, "fan@example.com").status, "done");
  await withFetch(resend.fetch, async () => {
    for (const day of [1, 2, 5, 9, 14, 30])
      assert.equal(
        (await runWelcomeSeries(env, { now: t0 + day * DAY })).sent ?? 0,
        0,
        `day ${day}`,
      );
  });
  assert.equal(resend.emails.length, 0);
});

test("a journey send checks the brand Topic first: someone who left Adapt To Life news gets nothing", async () => {
  const env = newsletterEnv();
  const t0 = Date.parse("2026-11-07T15:00:00Z");
  legacyRow(env, "gone@example.com", new Date(t0).toISOString());
  legacyRow(env, "still@example.com", new Date(t0).toISOString());
  const resend = statefulResend({
    contacts: {
      // Opted out of the Topic only; the team wide flag is not set.
      "gone@example.com": {
        topics: { [TOPIC_ATL]: "opt_out", [TOPIC_ASNM]: "opt_in" },
      },
      "still@example.com": { topics: { [TOPIC_ATL]: "opt_in" } },
    },
  });
  await withFetch(resend.fetch, () => runWelcomeSeries(env, { now: t0 + DAY }));
  assert.equal(journey(env, "gone@example.com").status, "unsubscribed");
  assert.deepEqual(
    resend.emails.map((m) => m.to[0]),
    ["still@example.com"],
  );
  // Left everything (the team wide flag): nothing either.
  const env2 = newsletterEnv();
  legacyRow(env2, "all@example.com", new Date(t0).toISOString());
  const r2 = statefulResend({
    contacts: {
      "all@example.com": { unsubscribed: true, topics: { [TOPIC_ATL]: "opt_in" } },
    },
  });
  await withFetch(r2.fetch, () => runWelcomeSeries(env2, { now: t0 + DAY }));
  assert.equal(r2.emails.length, 0);
});

test("a failed journey send is retried later, and gives up after six tries", async () => {
  const env = newsletterEnv();
  const t0 = Date.parse("2026-11-07T15:00:00Z");
  legacyRow(env, "retry@example.com", new Date(t0).toISOString());
  const failing = statefulResend({
    contacts: { "retry@example.com": { topics: { [TOPIC_ATL]: "opt_in" } } },
    fail: (m, p) => (p === "/emails" ? 500 : null),
  });
  await withFetch(failing.fetch, async () => {
    await runWelcomeSeries(env, { now: t0 });
    const row = journey(env, "retry@example.com");
    assert.equal(row.step, 0);
    assert.equal(row.attempts, 1);
    for (let i = 0; i < 6; i++)
      await runWelcomeSeries(env, {
        now: Date.parse(journey(env, "retry@example.com").next_at) + 1000,
      });
  });
  assert.equal(journey(env, "retry@example.com").status, "stopped");
});

test("the series is off unless WELCOME_SERIES is on", async () => {
  const env = newsletterEnv({ WELCOME_SERIES: "off" });
  const resend = statefulResend();
  await withFetch(resend.fetch, async () => {
    assert.equal((await runWelcomeSeries(env)).skipped, "disabled");
  });
  assert.equal(resend.calls.length, 0);
  const cfg = read("wrangler.jsonc");
  assert.ok(cfg.slice(0, cfg.indexOf('"env": {')).includes('"WELCOME_SERIES": "on"'));
});

// ---- unsubscribing -----------------------------------------------------------------
test("unsubscribing opts out of that brand's Topic only: never the team wide flag, never another Topic", async () => {
  const env = newsletterEnv();
  const t0 = new Date().toISOString();
  legacyRow(env, "bye@example.com", t0);
  env.AGENT_MAIL_DB.sql
    .prepare(
      "INSERT INTO newsletter_signups (brand,email,env,joined_at,state,contact_at,topic_at) VALUES ('atl','bye@example.com','production',?,'done',?,?)",
    )
    .run(t0, t0, t0);
  const resend = statefulResend({
    contacts: {
      "bye@example.com": {
        topics: {
          [TOPIC_ATL]: "opt_in",
          [TOPIC_SHOP]: "opt_in",
          [TOPIC_ASNM]: "opt_in",
        },
      },
    },
  });
  await withFetch(resend.fetch, () => unsubscribe(env, "Bye@Example.com", "atl"));
  const c = resend.contacts.get("bye@example.com");
  assert.equal(c.topics.get(TOPIC_ATL), "opt_out");
  assert.equal(c.topics.get(TOPIC_SHOP), "opt_in");
  assert.equal(c.topics.get(TOPIC_ASNM), "opt_in");
  assert.equal(c.unsubscribed, false);
  const writes = resend.calls.filter((x) => x.method !== "GET");
  assert.deepEqual(
    writes.map((x) => [x.method, x.path, x.body]),
    [
      [
        "PATCH",
        "/contacts/bye%40example.com/topics",
        [{ id: TOPIC_ATL, subscription: "opt_out" }],
      ],
    ],
  );
  assert.equal(journey(env, "bye@example.com").status, "unsubscribed");
  const signup = env.AGENT_MAIL_DB.sql
    .prepare("SELECT * FROM newsletter_signups")
    .get();
  assert.equal(signup.topic_at, null);
  assert.ok(signup.unsubscribed_at);
  // Body Shop: its own Topic, and the Adapt To Life journey is left alone.
  const env2 = newsletterEnv();
  legacyRow(env2, "bye@example.com", t0);
  await withFetch(resend.fetch, () => unsubscribe(env2, "bye@example.com", "bodyshop"));
  assert.equal(c.topics.get(TOPIC_SHOP), "opt_out");
  assert.equal(journey(env2, "bye@example.com").status, "active");
  // No such contact: nothing to opt out of; not an error.
  await withFetch(resend.fetch, () => unsubscribe(env2, "nobody@example.com", "atl"));
});

// ---- through the worker -------------------------------------------------------------
async function worker() {
  return (await import("../src/index.js")).default;
}
const ctx = { waitUntil() {} };

test("/unsubscribe GET shows one button and changes nothing; the button POST unsubscribes from that brand", async () => {
  const w = await worker();
  const env = {
    ...newsletterEnv(),
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const resend = statefulResend({
    contacts: {
      "click@example.com": {
        topics: { [TOPIC_ATL]: "opt_in", [TOPIC_SHOP]: "opt_in" },
      },
    },
  });
  const good = await unsubscribeUrl(env, "click@example.com", "bodyshop");
  await withFetch(resend.fetch, async () => {
    // Mail scanners open links: a GET, however many, never unsubscribes.
    for (let i = 0; i < 3; i++) {
      const page = await w.fetch(new Request(good), env, ctx);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /Unsubscribe from Adapt Body Shop news/);
      assert.match(
        html,
        /<form method="post" action="\/unsubscribe\?e=click%40example\.com&amp;b=bodyshop&amp;t=[\w-]+"><button type="submit">Unsubscribe<\/button><\/form>/,
      );
    }
    assert.equal(resend.calls.length, 0, "no Resend call on GET");
    const done = await w.fetch(
      new Request(good, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "",
      }),
      env,
      ctx,
    );
    assert.equal(done.status, 200);
    assert.match(
      await done.text(),
      /You’re unsubscribed[\s\S]*won’t get Adapt Body Shop news any more/,
    );
  });
  const c = resend.contacts.get("click@example.com");
  assert.equal(c.topics.get(TOPIC_SHOP), "opt_out");
  assert.equal(
    c.topics.get(TOPIC_ATL),
    "opt_in",
    "the other brand's list is untouched",
  );
  assert.equal(c.unsubscribed, false);
});

test("/unsubscribe one click POST (RFC 8058) answers an empty 200; forged links are refused; old links still work", async () => {
  const w = await worker();
  const env = {
    ...newsletterEnv(),
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const resend = statefulResend({
    contacts: {
      "one@example.com": { topics: { [TOPIC_ATL]: "opt_in" } },
      "old@example.com": { topics: { [TOPIC_ATL]: "opt_in" } },
    },
  });
  const good = await unsubscribeUrl(env, "one@example.com", "atl");
  const oneClick = (url) =>
    w.fetch(
      new Request(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      env,
      ctx,
    );
  await withFetch(resend.fetch, async () => {
    const res = await oneClick(good);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "");
    assert.equal(
      resend.contacts.get("one@example.com").topics.get(TOPIC_ATL),
      "opt_out",
    );

    const forged = good.replace("one%40", "other%40");
    assert.equal((await oneClick(forged)).status, 400);
    const page = await w.fetch(new Request(forged), env, ctx);
    assert.equal(page.status, 400);
    assert.match(await page.text(), /didn’t work/);
    // A link re-pointed at another list fails too.
    assert.equal((await oneClick(good.replace("b=atl", "b=bodyshop"))).status, 400);

    const old = `https://adapttolife.org/unsubscribe?e=old%40example.com&t=${v1Token("re_test", "old@example.com")}`;
    assert.match(
      await (await w.fetch(new Request(old), env, ctx)).text(),
      /Unsubscribe from Adapt To Life news/,
    );
    assert.equal((await oneClick(old)).status, 200);
    assert.equal(
      resend.contacts.get("old@example.com").topics.get(TOPIC_ATL),
      "opt_out",
    );
  });
  assert.ok(
    !resend.calls.some(
      (c) => c.method === "PATCH" && /^\/contacts\/[^/]+$/.test(c.path),
    ),
    "never the team wide flag",
  );
});

test("/unsubscribe: when Resend refuses, the person is told to try again, and nothing claims success", async () => {
  const w = await worker();
  const env = {
    ...newsletterEnv(),
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const resend = statefulResend({ fail: () => 503 });
  const good = await unsubscribeUrl(env, "busy@example.com", "atl");
  await withFetch(resend.fetch, async () => {
    const res = await w.fetch(
      new Request(good, { method: "POST", body: "" }),
      env,
      ctx,
    );
    assert.equal(res.status, 503);
    assert.match(await res.text(), /didn’t go through[\s\S]*<button/);
  });
  // A person hears about it the same day.
  const f = env.AGENT_MAIL_DB.sql
    .prepare("SELECT route,to_addr FROM send_failures")
    .all();
  assert.deepEqual(
    f.map((x) => [x.route, x.to_addr]),
    [["unsubscribe:atl", "busy@example.com"]],
  );
});

test("a new signup through /api/subscribe is recorded and welcomed; a second one is existing and gets no second welcome", async () => {
  const w = await worker();
  const waits = [];
  const c = { waitUntil: (p) => waits.push(p) };
  const env = {
    ...newsletterEnv(),
    TURNSTILE_MODE: "off",
    FORM_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const resend = statefulResend();
  const signup = () =>
    w.fetch(
      new Request("https://adapttolife.org/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9" },
        body: JSON.stringify({ em: "new@example.com", source: "test" }),
      }),
      env,
      c,
    );
  await withFetch(resend.fetch, async () => {
    const first = await signup();
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true });
    await Promise.allSettled(waits.splice(0));
    assert.equal(resend.emails.length, 1, "the welcome went out");
    assert.equal(resend.emails[0].subject, "You’re on the list");
    const again = await signup();
    assert.deepEqual(await again.json(), { ok: true, existing: true });
    await Promise.allSettled(waits.splice(0));
    assert.equal(resend.emails.length, 1, "no second welcome");
  });
});
