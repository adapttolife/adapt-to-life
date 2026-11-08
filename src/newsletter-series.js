// src/newsletter-series.js — the welcome email every new subscriber gets.
//
// Alec, Nov 7 2026: "Let's make sure resend is working as intended and we
// created the emails." I built a five email series; seeing it, he said: "Let's
// take a moment and just do one email, and keep it simple. Save these other
// ones... but don't use them. Let's just keep one email for now. Keep it super
// simple."
//
// So, today, when someone signs up:
//   1. /api/subscribe adds them to the Adapt To Life segment in Resend
//      (src/newsletter.js), exactly as before.
//   2. startWelcome() records them in newsletter_journey (agent-mail D1) and
//      sends one plain letter from Alec straight away, so "Watch your inbox" is
//      true. That is all. After that they hear from us through the newsletter,
//      written and sent as a Broadcast in Resend.
//
// The other emails are kept below in SAVED_FOR_LATER and nothing sends them.
// The series machinery (the journey row, the ten minute cron in
// runWelcomeSeries) stays, so bringing one back is moving it into WELCOME.
//
// Every email goes out through Resend from mail.adapttolife.org (the domain
// verified there), with replies to hello@adapttolife.org. Every email carries an
// unsubscribe link and the one click List-Unsubscribe headers Gmail and Yahoo
// ask for. Unsubscribing stops this series and marks the contact unsubscribed
// in Resend, so Broadcasts skip them too.
//
// Before any later send the contact is checked in Resend (someone who
// unsubscribed from a Broadcast gets nothing more), and an email marked
// skipForDonors is skipped for anyone who has already given (donor_gifts in
// atl-waivers).
//
// Copy follows the Adapt To Life voice (skills: adapt-to-life-brand-voice):
// short, plain, warm, no dashes, no rhetorical questions, facts from the site.
// Every money button says Donate (test/one_cta.test.js holds the pages to that;
// test/newsletter_series.test.js holds these emails to it).

const SITE = "https://adapttolife.org";
const DEFAULT_FROM = "Alec at Adapt To Life <hello@mail.adapttolife.org>";
const DEFAULT_REPLY_TO = "hello@adapttolife.org";
const SERIES = "welcome";
const LEASE_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 6;

// Links carry UTM tags so a gift or a visit can be traced to the email.
export function link(path, content) {
  const url = new URL(path, SITE);
  url.searchParams.set("utm_source", "newsletter");
  url.searchParams.set("utm_medium", "email");
  url.searchParams.set("utm_campaign", SERIES);
  url.searchParams.set("utm_content", content);
  return url.toString();
}

// THE EMAIL. One plain letter from Alec, the way he writes: short, warm, one
// thought a paragraph, one link. No photo, no button, no header; a letter from
// a person is also what mail apps most often put in the main inbox rather than
// a promotions tab. The opening follows his own published welcome ("We're here
// to expand access to adaptive sports so athletes can find their place.").
export const WELCOME = [
  {
    key: "welcome",
    day: 0,
    plain: true,
    subject: "Welcome to Adapt To Life",
    preheader: "Thanks for signing up.",
    paragraphs: [
      "Thanks for signing up.",
      {
        text: "We’re here to expand access to adaptive sports so athletes can find their place. Right now that means Chicago Pickleball: Wheelie Big Dills, a crew of wheelchair pickleball players on court every week.",
        link: { label: "Chicago Pickleball: Wheelie Big Dills", href: "/pickleball" },
      },
      "We’ll write when there’s something worth sharing.",
    ],
  },
];

// SAVED FOR LATER, NOT SENT (Alec, Nov 7: "Save these other ones... but don't
// use them"). The designed series he reviewed that day: the first welcome
// (photo and button), then day 2, 5, 9 and 14. Nothing reads this list;
// startWelcome and runWelcomeSeries walk WELCOME only. Facts are the site's
// own, checked Nov 7 2026: index.html, tim.html, juan.html, pickleball.html,
// numbers.html, promise.html, sponsorship.html, campaigns.js.
export const SAVED_FOR_LATER = [
  {
    key: "welcome-designed",
    day: 0,
    subject: "You’re on the list",
    preheader: "A short hello, and what to expect from us.",
    image: {
      src: "/images/email/welcome-crew-v1.jpg",
      alt: "Two members of the crew shake hands across the net after a game.",
    },
    paragraphs: [
      "Thanks for signing up. I’m Alec, and I started Adapt To Life.",
      "A brochure introduced me to adaptive sports when I was six. Sport gave me somewhere to belong and something to work toward. Finding that should not come down to luck, and neither should having the support to keep playing.",
      "Right now that means Chicago Pickleball: Wheelie Big Dills, a crew of 10 to 15 wheelchair pickleball players on court every week. Next stop, Naples.",
      "We’ll write when there’s something worth sharing: an athlete’s story, a result, or a moment when your help counts.",
    ],
    cta: { label: "Meet the crew", href: "/pickleball" },
    ps: "Reply and tell us what brought you here.",
  },
  {
    key: "fund",
    day: 2,
    subject: "Why it’s called the Hustle & Heart Fund",
    preheader: "Tim Gruensfelder gave the game everything.",
    paragraphs: [
      "Every gift to Adapt To Life goes to one place, the Hustle & Heart Fund. It’s named for Tim Gruensfelder.",
      "Tim found wheelchair basketball after childhood cancer. He worked for every loose ball and earned a college scholarship. In 2018 the cancer came back. Tim was 22.",
      "His family kept him on the court with the Timmy G Classic, a wheelchair basketball tournament that carries his name. The fund carries it too, and his standard: all hustle, all heart.",
      "It helps athletes with equipment, training and travel, through ambassadors like Juan Ortiz who build with the community where they live.",
    ],
    cta: { label: "Read Tim’s story", href: "/tim" },
  },
  {
    key: "crew",
    day: 5,
    subject: "Three straight US Opens",
    preheader: "What the crew has done, and the ambassador behind it.",
    image: {
      src: "/images/email/welcome-juan-v1.jpg",
      alt: "Juan Ortiz celebrates on court in a Chicago Adaptive Sports shirt.",
    },
    paragraphs: [
      "Robby and Brian have each played the US Open in Naples the last three years.",
      "In October the crew brought home six medals from Monster Smash: two golds, two silvers and two bronzes in the wheelchair division.",
      "And when Juan Ortiz asked the APP Tour for a wheelchair division, they made one. Juan was paralyzed at 14, is a Hall of Famer in wheelchair softball and trains 16 hours a week. He is our first ambassador.",
      "Brian put it this way: “The chair didn’t fix me. It gave me options I didn’t have before.”",
    ],
    cta: { label: "Read Juan’s story", href: "/juan" },
  },
  {
    key: "ask",
    day: 9,
    skipForDonors: true,
    subject: "What a year on court costs",
    preheader: "Every number in our goal, and how we got it.",
    image: {
      src: "/images/email/welcome-court-v1.jpg",
      alt: "Juan Ortiz serves on an indoor court.",
    },
    paragraphs: [
      "Playing every week costs real money. A night of court time is $225 for up to 15 athletes. A year of unlimited play, so an athlete can train to compete, is $1,548. A sport chair runs $4,000 to $6,000, and insurance doesn’t cover it.",
      "Our goal for the year ahead is $48,180: $27,180 to keep the crew on court every week, then $21,000 for the road to the US Open. Every new gift starts with the first line.",
      "Right now I cover our overhead myself while we build revenue so the work can stand on its own.",
    ],
    highlight: "$60 a month puts one athlete on court four nights every month.",
    cta: { label: "Donate", href: "/donate?amount=60&frequency=monthly" },
    secondary: { label: "See the numbers breakdown", href: "/numbers" },
    fine: "Donations are tax deductible to the extent allowed by law. Adapt To Life is a 501(c)(3) nonprofit, EIN 41-3213344.",
  },
  {
    key: "ways",
    day: 14,
    subject: "More ways to be part of it",
    preheader: "For businesses, connectors and anyone with a few hours.",
    paragraphs: ["Giving money is one way to help. Here are a few others."],
    items: [
      {
        text: "If you run a business, sponsor a night of court time for $225, an athlete for a year for $1,548, or the whole Train to Compete program for $15,480.",
        link: { label: "See sponsorship", href: "/sponsorship" },
      },
      {
        text: "If you know someone building adaptive sports where they live, they could be our next ambassador.",
        link: { label: "Tell us who", href: "/ambassadors#join" },
      },
      {
        text: "If you have a few hours, there’s a volunteer role for writers, photographers, coaches and more.",
        link: { label: "See the roles", href: "/volunteer" },
      },
      {
        text: "And if you’re on Instagram, you can follow the crew every week.",
        link: {
          label: "@adapt_to_life_org",
          href: "https://www.instagram.com/adapt_to_life_org/",
          external: true,
        },
      },
    ],
    closing: "Thanks for being here.",
    // Only for people who have not given yet.
    psForNonDonors: {
      text: "If you’d like to give, every gift goes to the Hustle & Heart Fund.",
      link: { label: "Donate", href: "/donate" },
    },
  },
];

// ---------------------------------------------------------------------------
// Rendering. Table layout and inline styles, because that is what survives
// Gmail, Outlook and Apple Mail. Night header, the off white card on the beige
// page, orange ink buttons (4.7:1 with off white text), the system font stack
// behind Sofia Sans, which most mail clients will not load.
// ---------------------------------------------------------------------------
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const FONT =
  "'Sofia Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const C = {
  page: "#EFE8DC",
  card: "#F9F7F2",
  night: "#171513",
  ink: "#26231F",
  soft: "#4A463F",
  muted: "#6A675E",
  orange: "#B9391E",
  cream: "#F9F7F2",
  line: "#E2DACB",
};

function hrefFor(target, step) {
  return target.external ? target.href : link(target.href, step.key);
}

function button(label, href) {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 22px"><tr>` +
    `<td bgcolor="${C.orange}" style="border-radius:999px;background:${C.orange}">` +
    `<a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:17px;font-weight:700;line-height:1;color:${C.cream};text-decoration:none;border-radius:999px">${esc(label)}</a>` +
    `</td></tr></table>`
  );
}

const p = (html, extra = "") =>
  `<p style="margin:0 0 18px;font-family:${FONT};font-size:17px;line-height:1.6;color:${C.ink};${extra}">${html}</p>`;
const a = (label, href) =>
  `<a href="${esc(href)}" style="color:${C.orange};font-weight:700;text-decoration:underline">${esc(label)}</a>`;

// A paragraph is plain text, or { text, link: { label, href } } with the label
// found in the text and linked in place.
function paraHtml(para, step, linkStyle) {
  if (typeof para === "string") return esc(para);
  const at = para.text.indexOf(para.link.label);
  if (at < 0) throw new Error(`link label not in paragraph: ${para.link.label}`);
  const href = esc(hrefFor(para.link, step));
  return (
    esc(para.text.slice(0, at)) +
    `<a href="${href}" style="${linkStyle}">${esc(para.link.label)}</a>` +
    esc(para.text.slice(at + para.link.label.length))
  );
}
function paraText(para, step) {
  if (typeof para === "string") return para;
  const at = para.text.indexOf(para.link.label) + para.link.label.length;
  return `${para.text.slice(0, at)} (${hrefFor(para.link, step)})${para.text.slice(at)}`;
}

// THE PLAIN LETTER: what a person would send. No header, no photo, no button,
// no background colour (the mail app's own, so dark mode reads it too). One
// typeface, the text, Alec's name, and the small print every email must carry.
function renderPlain(step, { unsubscribeUrl }) {
  // The link takes the mail app's own colour, like any personal email: no one
  // orange reads on both a white page and a dark mode page.
  const linkStyle = "text-decoration:underline";
  const para = (html, extra = "") =>
    `<p style="margin:0 0 16px;font-size:17px;line-height:1.55;${extra}">${html}</p>`;
  const body = (step.paragraphs || []).map((x) => para(paraHtml(x, step, linkStyle)));
  const html = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${esc(step.subject)}</title></head>`,
    `<body style="margin:0;padding:0">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(step.preheader)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>`,
    `<div style="max-width:560px;padding:24px 20px;font-family:${FONT}">`,
    body.join(""),
    para(
      `Alec<br><span style="font-size:15px;opacity:0.75">Founder, Adapt To Life</span>`,
      "margin-top:24px",
    ),
    `<p style="margin:32px 0 0;font-size:13px;line-height:1.55;opacity:0.7">`,
    `You’re getting this because you signed up at adapttolife.org. <a href="${esc(unsubscribeUrl)}" style="color:inherit;text-decoration:underline">Unsubscribe</a><br>`,
    `Adapt To Life NFP, a 501(c)(3) nonprofit. EIN 41-3213344.`,
    `</p></div></body></html>`,
  ].join("");
  const text = [
    ...(step.paragraphs || []).flatMap((x) => [paraText(x, step), ""]),
    "Alec",
    "Founder, Adapt To Life",
    "",
    "You’re getting this because you signed up at adapttolife.org.",
    `Unsubscribe: ${unsubscribeUrl}`,
    "Adapt To Life NFP, a 501(c)(3) nonprofit. EIN 41-3213344.",
  ].join("\n");
  return { subject: step.subject, html, text };
}

export function renderEmail(
  step,
  { unsubscribeUrl, isDonor = false, assetOrigin = SITE } = {},
) {
  if (!unsubscribeUrl) throw new Error("renderEmail needs an unsubscribe URL");
  if (step.plain) return renderPlain(step, { unsubscribeUrl });
  const asset = (path) => new URL(path, assetOrigin).toString();
  const parts = [];
  for (const para of step.paragraphs || [])
    parts.push(
      p(
        paraHtml(
          para,
          step,
          `color:${C.orange};font-weight:700;text-decoration:underline`,
        ),
      ),
    );
  for (const item of step.items || [])
    parts.push(
      p(`${esc(item.text)}<br>${a(item.link.label, hrefFor(item.link, step))}`),
    );
  if (step.highlight)
    parts.push(
      p(esc(step.highlight), `font-size:19px;font-weight:700;color:${C.night}`),
    );
  if (step.cta) parts.push(button(step.cta.label, hrefFor(step.cta, step)));
  if (step.secondary)
    parts.push(p(a(step.secondary.label, hrefFor(step.secondary, step))));
  if (step.closing) parts.push(p(esc(step.closing)));
  parts.push(
    p(
      `Alec<br><span style="font-size:14px;color:${C.muted}">Alec Tranel, Founder, Adapt To Life</span>`,
    ),
  );
  if (step.ps) parts.push(p(`P.S. ${esc(step.ps)}`, `font-size:15px;color:${C.soft}`));
  if (step.psForNonDonors && !isDonor)
    parts.push(
      p(
        `P.S. ${esc(step.psForNonDonors.text)} ${a(step.psForNonDonors.link.label, hrefFor(step.psForNonDonors.link, step))}`,
        `font-size:15px;color:${C.soft}`,
      ),
    );
  if (step.fine) parts.push(p(esc(step.fine), `font-size:13px;color:${C.muted}`));

  const image = step.image
    ? `<tr><td style="padding:0;background:${C.night}"><img src="${esc(asset(step.image.src))}" width="600" alt="${esc(step.image.alt)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`
    : "";

  const html = [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">`,
    `<title>${esc(step.subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:${C.page}">`,
    // The preheader: the grey line inbox apps show after the subject.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(step.preheader)}${"&#8199;&#65279;&#847; ".repeat(30)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px">`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;border-radius:14px;overflow:hidden">`,
    `<tr><td style="padding:22px 28px;background:${C.night}"><a href="${esc(link("/", step.key))}"><img src="${esc(asset("/images/email/atl-logo-cream.png"))}" width="209" height="52" alt="Adapt To Life" style="display:block;border:0"></a></td></tr>`,
    image,
    `<tr><td style="padding:32px 28px 14px;background:${C.card}">${parts.join("")}</td></tr>`,
    `</table>`,
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td style="padding:20px 28px 8px;font-family:${FONT};font-size:13px;line-height:1.6;color:${C.muted}">`,
    `You’re getting this because you signed up at adapttolife.org. <a href="${esc(unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline">Unsubscribe</a><br>`,
    `Reply any time, or write to <a href="mailto:hello@adapttolife.org" style="color:${C.muted}">hello@adapttolife.org</a>.<br>`,
    `Adapt To Life NFP, a 501(c)(3) nonprofit. EIN 41-3213344.`,
    `</td></tr></table>`,
    `</td></tr></table></body></html>`,
  ].join("");

  const lines = [];
  for (const para of step.paragraphs || []) lines.push(paraText(para, step), "");
  for (const item of step.items || [])
    lines.push(item.text, `${item.link.label}: ${hrefFor(item.link, step)}`, "");
  if (step.highlight) lines.push(step.highlight, "");
  if (step.cta) lines.push(`${step.cta.label}: ${hrefFor(step.cta, step)}`, "");
  if (step.secondary)
    lines.push(`${step.secondary.label}: ${hrefFor(step.secondary, step)}`, "");
  if (step.closing) lines.push(step.closing, "");
  lines.push("Alec", "Alec Tranel, Founder, Adapt To Life", "");
  if (step.ps) lines.push(`P.S. ${step.ps}`, "");
  if (step.psForNonDonors && !isDonor)
    lines.push(
      `P.S. ${step.psForNonDonors.text} ${hrefFor(step.psForNonDonors.link, step)}`,
      "",
    );
  if (step.fine) lines.push(step.fine, "");
  lines.push(
    "You’re getting this because you signed up at adapttolife.org.",
    `Unsubscribe: ${unsubscribeUrl}`,
    "Adapt To Life NFP, a 501(c)(3) nonprofit. EIN 41-3213344.",
  );

  return { subject: step.subject, html, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Unsubscribe links. An HMAC of the address, so a link works only for the
// person it was sent to. The key is the Resend key the worker already holds
// (or NEWSLETTER_LINK_SECRET if one is ever set), with its own prefix so the
// signature means nothing anywhere else.
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function hmac(env, message) {
  const secret = env.NEWSLETTER_LINK_SECRET || env.RESEND_API_KEY;
  if (!secret) throw new Error("no key for newsletter links");
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64url(await crypto.subtle.sign("HMAC", key, enc.encode(message))).slice(
    0,
    32,
  );
}

export const normalizeEmail = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();

export async function unsubscribeToken(env, email) {
  return hmac(env, `newsletter-unsubscribe:v1:${normalizeEmail(email)}`);
}

export async function unsubscribeUrl(env, email) {
  const url = new URL("/unsubscribe", SITE);
  url.searchParams.set("e", normalizeEmail(email));
  url.searchParams.set("t", await unsubscribeToken(env, email));
  return url.toString();
}

export async function validUnsubscribe(env, email, token) {
  if (!email || !token) return false;
  const want = await unsubscribeToken(env, email);
  if (want.length !== String(token).length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++)
    diff |= want.charCodeAt(i) ^ String(token).charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Resend calls.
// ---------------------------------------------------------------------------
const resendHeaders = (env, extra = {}) => ({
  Authorization: `Bearer ${env.RESEND_API_KEY}`,
  "Content-Type": "application/json",
  ...extra,
});

async function sha256Hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sendSeriesEmail(env, email, step, opts = {}) {
  const address = normalizeEmail(email);
  const unsub = await unsubscribeUrl(env, address);
  const rendered = renderEmail(step, { ...opts, unsubscribeUrl: unsub });
  const body = {
    from: env.NEWSLETTER_FROM || DEFAULT_FROM,
    to: [address],
    reply_to: env.NEWSLETTER_REPLY_TO || DEFAULT_REPLY_TO,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: {
      "List-Unsubscribe": `<${unsub}>, <mailto:hello@adapttolife.org?subject=Unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
    tags: [
      { name: "series", value: SERIES },
      { name: "step", value: step.key },
    ],
  };
  const idempotency = `${SERIES}-${step.key}-${(await sha256Hex(address)).slice(0, 32)}${opts.idempotencySuffix || ""}`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: resendHeaders(env, { "Idempotency-Key": idempotency }),
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {}
    throw new Error(`Resend rejected the email (${res.status}) ${detail}`);
  }
  const out = await res.json().catch(() => ({}));
  return { id: out.id || null };
}

// The contact as Resend has it now. Someone who unsubscribed from a Broadcast,
// or was deleted, must not get the rest of the series.
async function contactStatus(env, email) {
  const res = await fetch(
    `https://api.resend.com/contacts/${encodeURIComponent(normalizeEmail(email))}`,
    { headers: resendHeaders(env), signal: AbortSignal.timeout(10000) },
  );
  if (res.status === 404) return "gone";
  if (!res.ok) throw new Error(`Resend contact lookup failed (${res.status})`);
  const contact = await res.json();
  return contact?.unsubscribed ? "unsubscribed" : "subscribed";
}

async function isDonor(env, email) {
  if (!env.WAIVERS_DB) return false;
  const row = await env.WAIVERS_DB.prepare(
    "SELECT 1 AS yes FROM donor_gifts WHERE email = ? LIMIT 1",
  )
    .bind(normalizeEmail(email))
    .first();
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// The journey. One row per subscriber in agent-mail D1
// (schema/migrations/2026-11-07-newsletter-welcome.sql). `step` is the index of
// the NEXT email; `next_at` is when it is due. A row is leased before it is
// worked so two cron runs cannot send the same email, and Resend's idempotency
// key backs that up for 24 hours.
// ---------------------------------------------------------------------------
const iso = (ms) => new Date(ms).toISOString();
const dueAt = (startedAt, index) =>
  iso(Date.parse(startedAt) + (WELCOME[index]?.day || 0) * 24 * 60 * 60 * 1000);

export const seriesEnabled = (env) =>
  env.WELCOME_SERIES === "on" &&
  Boolean(env.RESEND_API_KEY) &&
  Boolean(env.AGENT_MAIL_DB);

// Called right after a NEW signup. Sends email 1 now; the cron does the rest.
export async function startWelcome(
  env,
  email,
  { contactId = null, now = Date.now(), assetOrigin } = {},
) {
  if (!seriesEnabled(env)) return { started: false, reason: "disabled" };
  const address = normalizeEmail(email);
  const started = iso(now);
  const inserted = await env.AGENT_MAIL_DB.prepare(
    "INSERT OR IGNORE INTO newsletter_journey (email, contact_id, series, step, status, started_at, next_at, attempts) VALUES (?, ?, ?, 0, 'active', ?, ?, 0) RETURNING email",
  )
    .bind(address, contactId, SERIES, started, started)
    .first();
  if (!inserted) return { started: false, reason: "already-in-series" };
  const row = await claimRow(env, address, now);
  if (!row) return { started: true, sent: false };
  const result = await workRow(env, row, { now, assetOrigin, fresh: true });
  return { started: true, ...result };
}

async function claimRow(env, email, now) {
  return env.AGENT_MAIL_DB.prepare(
    "UPDATE newsletter_journey SET claimed_until = ? WHERE email = ? AND status = 'active' AND (claimed_until IS NULL OR claimed_until < ?) RETURNING *",
  )
    .bind(iso(now + LEASE_MS), email, iso(now))
    .first();
}

async function finish(env, email, fields) {
  const keys = Object.keys(fields);
  await env.AGENT_MAIL_DB.prepare(
    `UPDATE newsletter_journey SET ${keys.map((k) => `${k} = ?`).join(", ")}, claimed_until = NULL WHERE email = ?`,
  )
    .bind(...keys.map((k) => fields[k]), email)
    .run();
}

async function workRow(
  env,
  row,
  { now = Date.now(), assetOrigin, fresh = false } = {},
) {
  const index = Number(row.step) || 0;
  const step = WELCOME[index];
  if (!step) {
    await finish(env, row.email, { status: "done" });
    return { sent: false, done: true };
  }
  try {
    // Email 1 goes out the moment they sign up; later ones check Resend first.
    if (!fresh) {
      const status = await contactStatus(env, row.email);
      if (status !== "subscribed") {
        await finish(env, row.email, {
          status: status === "gone" ? "stopped" : "unsubscribed",
        });
        return { sent: false, stopped: status };
      }
    }
    const donor =
      step.skipForDonors || step.psForNonDonors ? await isDonor(env, row.email) : false;
    let sentId = null;
    if (!(step.skipForDonors && donor)) {
      const out = await sendSeriesEmail(env, row.email, step, {
        isDonor: donor,
        assetOrigin,
      });
      sentId = out.id;
    }
    const next = index + 1;
    if (next >= WELCOME.length) {
      await finish(env, row.email, {
        step: next,
        status: "done",
        last_sent_at: iso(now),
        attempts: 0,
        last_error: null,
      });
    } else {
      const nextAt = dueAt(row.started_at, next);
      await finish(env, row.email, {
        step: next,
        next_at: Date.parse(nextAt) > now ? nextAt : iso(now),
        last_sent_at: iso(now),
        attempts: 0,
        last_error: null,
      });
    }
    return { sent: Boolean(sentId), skipped: !sentId, step: step.key, id: sentId };
  } catch (err) {
    const attempts = (Number(row.attempts) || 0) + 1;
    const retryAt = iso(now + 15 * 60 * 1000 * 2 ** Math.min(attempts - 1, 5));
    await finish(env, row.email, {
      attempts,
      last_error: String(err?.message || err).slice(0, 500),
      ...(attempts >= MAX_ATTEMPTS ? { status: "stopped" } : { next_at: retryAt }),
    });
    console.error("welcome series send failed", {
      step: step.key,
      attempts,
      error: String(err?.message || err).slice(0, 200),
    });
    return { sent: false, error: true, step: step.key };
  }
}

// The cron: everything due, a handful at a time (Resend allows a few requests
// a second, and each row is one or two calls).
export async function runWelcomeSeries(env, { now = Date.now(), limit = 20 } = {}) {
  if (!seriesEnabled(env)) return { ok: true, skipped: "disabled" };
  const { results = [] } = await env.AGENT_MAIL_DB.prepare(
    "SELECT email FROM newsletter_journey WHERE status = 'active' AND next_at <= ? AND (claimed_until IS NULL OR claimed_until < ?) ORDER BY next_at LIMIT ?",
  )
    .bind(iso(now), iso(now), limit)
    .all();
  let sent = 0;
  let failed = 0;
  for (const { email } of results) {
    const row = await claimRow(env, email, now);
    if (!row) continue;
    const out = await workRow(env, row, { now });
    if (out.sent) sent++;
    if (out.error) failed++;
  }
  return { ok: true, due: results.length, sent, failed };
}

// Unsubscribe: stop the series and tell Resend, so Broadcasts skip them too.
export async function unsubscribe(env, email) {
  const address = normalizeEmail(email);
  if (env.AGENT_MAIL_DB)
    await env.AGENT_MAIL_DB.prepare(
      "UPDATE newsletter_journey SET status = 'unsubscribed', claimed_until = NULL WHERE email = ?",
    )
      .bind(address)
      .run();
  const res = await fetch(
    `https://api.resend.com/contacts/${encodeURIComponent(address)}`,
    {
      method: "PATCH",
      headers: resendHeaders(env),
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ unsubscribed: true }),
    },
  );
  if (!res.ok && res.status !== 404)
    throw new Error(`Resend could not unsubscribe the contact (${res.status})`);
  return { ok: true };
}

// The page the unsubscribe link lands on. Small and self contained, with
// relative links so it works on whichever host served it.
export function unsubscribePage({ ok, email = "" }) {
  const title = ok ? "You’re unsubscribed" : "That link didn’t work";
  const body = ok
    ? `<p>${esc(email)} won’t get any more emails from us. If that was a mistake, you can sign up again any time at <a href="/subscribe">adapttolife.org/subscribe</a>.</p>`
    : `<p>We couldn’t confirm that unsubscribe link. Reply to any of our emails, or write to <a href="mailto:hello@adapttolife.org">hello@adapttolife.org</a>, and we’ll take you off the list.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="theme-color" content="#0f0e0d"><title>${title} | Adapt To Life</title>
<style>body{margin:0;background:#EFE8DC;color:#26231F;font-family:'Sofia Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:18px;line-height:1.6}header{background:#0f0e0d;padding:18px 24px}main{max-width:560px;margin:48px auto;padding:0 24px}h1{font-size:34px;line-height:1.1;margin:0 0 18px;color:#171513}a{color:#B9391E;font-weight:700}</style></head>
<body><header><a href="/"><img src="/images/email/atl-logo-cream.png" width="209" height="52" alt="Adapt To Life"></a></header><main><h1>${title}</h1>${body}<p><a href="/">Back to adapttolife.org</a></p></main></body></html>`;
}
