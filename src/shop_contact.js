// Adapt Body Shop contact form — the server half.
//
// The shop is a headless Hydrogen storefront on its own Worker
// (deploy/abs-production). It has no database, no mail binding and no Google
// credential, and giving it all three would have meant a second copy of the
// house email shell, a second service-account secret and a second send-failure
// ledger nobody would remember to watch. So the storefront's /contact action
// posts here instead: this Worker already holds every one of those, plus the
// watchdog that pages when a receipt stops sending.
//
// AUTH. Two independent gates, because this endpoint is publicly routable (a
// service binding would have been tighter but would not exist in `hydrogen dev`
// or on abs-staging, and one path that works everywhere beats two that each
// work somewhere):
//
//   1. SHOP_CONTACT_KEY — a shared secret held as a Worker secret on BOTH
//      Workers and sent as X-Shop-Key. It never reaches a browser: the
//      storefront's route action runs server-side. This is what stops the
//      endpoint being an open relay for our own mail domain.
//   2. Turnstile — the storefront's form is the public spam surface, and a
//      token here proves a browser solved a challenge. The site key is public
//      (it ships to the page); the secret is the one already configured on this
//      Worker, with adaptbodyshop.com added to the same widget.
//
// ORDER OF OPERATIONS. Validate, write to D1, RESPOND, then do everything else
// in ctx.waitUntil: the auto-reply, the internal notification, and (on the
// cron) the CRM row. By the time any of those runs the message is already
// durable, so none of them is allowed to fail the submission — the exact rule
// receipts.js states and the reason the waiver Drive archive is a backlog
// sweep rather than an inline call.

import {
  cfSend, SHOP_FROM, SHOP_INBOX, shopShell, houseQuote, houseLabel, esc,
  recordTransactionalFailure,
} from "./email.js";
import { getGoogleAccessToken, SHEETS_SCOPE } from "./google.js";
import { verifyTurnstile } from "./turnstile.js";

// How long we tell a customer they will wait. Alec's call, 2026-09-04: two
// business days. It is a promise printed on a public page and repeated in every
// auto-reply, so it lives in ONE constant that both this file and the
// storefront's page copy quote — change it here and in
// app/routes/contact.tsx REPLY_WINDOW together, and nowhere else.
export const REPLY_WINDOW = "two business days";

// The closed set of reasons someone writes to a merch shop. Closed on the same
// reasoning as the volunteer roles in index.js: the form's <select> is the only
// legitimate source, so anything else is a hand-crafted POST. Unlike the
// volunteer case an unknown topic is not dropped — the customer's words are the
// point — it is recorded as "Something else" and the raw value is kept in the
// message body, because losing a real question to a taxonomy is the worse bug.
export const SHOP_TOPICS = [
  "Where is my order",
  "Return or exchange",
  "Sizing help",
  "Wrong or damaged item",
  "Product question",
  "Wholesale or bulk order",
  "Partnership or affiliate",
  "Something else",
];

// Topics where not having the order number costs a round trip. The storefront
// marks the field required for these; this list is what the server checks so a
// direct POST cannot skip it.
const ORDER_TOPICS = new Set([
  "Where is my order",
  "Return or exchange",
  "Wrong or damaged item",
]);

const CRM_SHEET_ID = "1ahXuu11mV3bJVtyqXrhVz4lFCSSWpl7jX52SqlcJFLE"; // "Adapt To Life CRM"
const CRM_TAB = "Shop Messages";

// ---------------------------------------------------------------------------
// POST /api/shop-contact
// ---------------------------------------------------------------------------
export async function handleShopContact(request, env, ctx) {
  if (!env.SHOP_CONTACT_KEY) {
    console.error("SHOP_CONTACT_KEY not configured; refusing shop contact");
    return json({ ok: false, error: "Contact is temporarily unavailable." }, 503);
  }
  if (!timingSafeEqual(request.headers.get("X-Shop-Key") || "", env.SHOP_CONTACT_KEY)) {
    return json({ ok: false, error: "Not authorized." }, 401);
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  // Honeypot. Same hidden "company" field as every other form on this Worker,
  // answered with a cheerful ok so a bot learns nothing.
  if (str(data.company)) return json({ ok: true });

  if (!(await verifyTurnstile(env, str(data.cf_token), request.headers.get("CF-Connecting-IP")))) {
    return json({ ok: false, error: "Verification failed. Please reload the page and try again." }, 403);
  }

  const name = str(data.name, 120);
  const email = str(data.email, 200).toLowerCase();
  const rawTopic = str(data.topic, 120);
  const topic = SHOP_TOPICS.includes(rawTopic) ? rawTopic : "Something else";
  const orderNumber = str(data.order_number, 40);
  let message = str(data.message, 5000);

  // An unrecognised topic is preserved rather than discarded — see SHOP_TOPICS.
  if (rawTopic && topic !== rawTopic) {
    message = `[topic as submitted: ${rawTopic}]\n\n${message}`;
  }

  if (!name) return json({ ok: false, error: "Please tell us your name." }, 422);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "A valid email address is required." }, 422);
  }
  if (!message) return json({ ok: false, error: "Please tell us how we can help." }, 422);
  if (ORDER_TOPICS.has(topic) && !orderNumber) {
    return json({ ok: false, error: "Please add your order number so we can look it up." }, 422);
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const cf = request.cf || {};
  const row = {
    id,
    createdAt,
    name,
    email,
    topic,
    orderNumber,
    message,
    source: str(data.source, 300),
    ref: str(data.ref, 80),
    ip: request.headers.get("CF-Connecting-IP") || "",
    country: cf.country || "",
    userAgent: str(data.user_agent, 300) || (request.headers.get("User-Agent") || "").slice(0, 300),
  };

  // D1 is the record. If this fails the customer is told plainly and given an
  // address that does not depend on this Worker, because the one unacceptable
  // outcome is a green tick over a message that went nowhere.
  try {
    await env.WAIVERS_DB.prepare(
      `INSERT INTO shop_messages
         (id, created_at, name, email, topic, order_number, message, source, ref, ip, country, user_agent)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      row.id, row.createdAt, row.name, row.email, row.topic, row.orderNumber,
      row.message, row.source, row.ref, row.ip, row.country, row.userAgent
    ).run();
  } catch (err) {
    console.error("shop contact D1 insert failed:", err);
    return json(
      { ok: false, error: `Could not save your message. Please email ${SHOP_INBOX} and we will pick it up there.` },
      502
    );
  }

  after(ctx, deliver(env, row));

  return json({ ok: true, id, reply_window: REPLY_WINDOW });
}

// Both emails, in one place, after the response. The customer's auto-reply and
// the shop's notification are separate sends on purpose: the customer copy must
// never carry an internal note, and the internal copy wants a subject a human
// can triage from the list view without opening it.
async function deliver(env, row) {
  const okReceipt = await sendShopReceipt(env, row);
  await notifyShop(env, row);
  if (okReceipt) {
    try {
      await env.WAIVERS_DB.prepare("UPDATE shop_messages SET receipt_sent = 1 WHERE id = ?")
        .bind(row.id).run();
    } catch (err) {
      console.error("shop contact receipt flag failed:", err);
    }
  }
}

// The customer's auto-reply. It does three things and refuses to do a fourth:
// it confirms a human has the message, it names the window Alec committed to,
// and it shows them what we received so they can correct it in one reply
// instead of wondering. It deliberately does NOT pretend to answer the
// question, offer a fake ticket number, or sign off as a person who did not
// write it.
export async function sendShopReceipt(env, row) {
  const first = String(row.name || "").trim().split(/\s+/)[0] || "there";
  const subject = row.orderNumber
    ? `We got your message about order ${row.orderNumber}`
    : "We got your message";

  const detailLines = [`Topic: ${row.topic}`];
  if (row.orderNumber) detailLines.push(`Order: ${row.orderNumber}`);

  const text =
    `Hi ${first},\n\n` +
    `Thanks for writing to Adapt Body Shop. Your message is in and a person will read it — you will hear back within ${REPLY_WINDOW}.\n\n` +
    `If anything below is wrong, just reply to this email and it goes straight onto the same thread.\n\n` +
    `${detailLines.join("\n")}\n\n` +
    `What you sent:\n${row.message}\n\n` +
    `Adapt Body Shop\nThe merch surface for Adapt To Life, a 501(c)(3) nonprofit. EIN 41-3213344.`;

  const html = shopShell(
    `<p>Hi ${esc(first)},</p>` +
      `<p>Thanks for writing to Adapt Body Shop. Your message is in and a person will read it — ` +
      `you will hear back within <strong>${esc(REPLY_WINDOW)}</strong>.</p>` +
      `<p>If anything below is wrong, just reply to this email and it goes straight onto the same thread.</p>` +
      houseLabel(row.orderNumber ? `${row.topic} · order ${row.orderNumber}` : row.topic) +
      houseQuote(esc(row.message)) +
      `<p style="margin-top:24px;color:#6e6b62;font-size:14px">` +
      `Every shirt funds adaptive sport. A purchase is not a donation — ` +
      `<a href="https://adapttolife.org" style="color:#c63f22">adapttolife.org</a> is where the org lives.</p>`
  );

  return send(env, {
    from: SHOP_FROM,
    to: row.email,
    replyTo: SHOP_INBOX,
    subject,
    text,
    html,
    headers: { "X-ABS-Form": "contact", "X-ABS-Topic": row.topic, "X-ABS-Id": row.id },
  }, "shop contact receipt");
}

// The shop's own copy. Not a bcc on the customer's receipt: a bcc makes the
// subject line about the customer's experience, and the person working the
// queue needs the topic and the order number in the list view. Reply-To is the
// customer, so hitting reply in Gmail answers them directly.
async function notifyShop(env, row) {
  const bits = [row.topic];
  if (row.orderNumber) bits.push(`order ${row.orderNumber}`);
  const subject = `[shop] ${bits.join(" · ")} — ${row.name}`;

  const meta = [
    ["From", `${row.name} <${row.email}>`],
    ["Topic", row.topic],
    ["Order", row.orderNumber || "—"],
    ["Page", row.source || "—"],
    ["Referral code", row.ref || "—"],
    ["Received", row.createdAt],
    ["Record", row.id],
  ];

  const text =
    meta.map(([k, v]) => `${k}: ${v}`).join("\n") +
    `\n\n${row.message}\n\n` +
    `Reply within ${REPLY_WINDOW} — that is what their auto-reply promised.`;

  const html = shopShell(
    `<p style="margin:0 0 16px"><strong>${esc(row.name)}</strong> &lt;` +
      `<a href="mailto:${esc(row.email)}" style="color:#c63f22">${esc(row.email)}</a>&gt;</p>` +
      houseQuote(esc(row.message)) +
      `<table style="margin-top:20px;border-collapse:collapse;font-size:14px;color:#3c382f">` +
      meta.slice(1).map(([k, v]) =>
        `<tr><td style="padding:2px 14px 2px 0;color:#6e6b62;white-space:nowrap">${esc(k)}</td>` +
        `<td style="padding:2px 0">${esc(v)}</td></tr>`
      ).join("") +
      `</table>` +
      `<p style="margin-top:20px;color:#6e6b62;font-size:14px">Their auto-reply promised an answer within ` +
      `${esc(REPLY_WINDOW)}. Reply here and it reaches them directly.</p>`
  );

  return send(env, {
    from: SHOP_FROM,
    to: SHOP_INBOX,
    replyTo: `${row.name} <${row.email}>`,
    subject,
    text,
    html,
    headers: { "X-ABS-Form": "contact-internal", "X-ABS-Id": row.id },
  }, "shop contact notification");
}

// Identical contract to receipts.js send(): never throws, records a row the
// fleet watchdog already pages on, and stays quiet where staging has no binding.
async function send(env, msg, label) {
  try {
    if (!env.SEND_EMAIL) {
      console.log(`${label}: SEND_EMAIL not bound, skipping`);
      return false;
    }
    await cfSend(env, msg);
    return true;
  } catch (err) {
    console.error(`${label} failed:`, err);
    await recordTransactionalFailure(env, `receipt:${label}`, msg && msg.to, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// CRM mirror (cron). Same shape as the waiver Drive backlog, for the same
// reason: a Google API on the request path is a way to lose a customer's
// message, and a sweep is a way to survive an outage without noticing it.
//
// Its own tab, not the curated People tab. That is the standing rule for this
// sheet (scripts/beehiiv-crm-sync.py states it: automation proposes, a person
// curates) — a shop question is not yet a relationship, and pouring machine
// rows into the tab a human maintains by hand is how a CRM stops being trusted.
// ---------------------------------------------------------------------------
const CRM_HEADER = [
  "Date", "Name", "Email", "Topic", "Order", "Message", "Page", "Referral code", "Record ID",
];

export async function runShopCrmBacklog(env) {
  if (!env.GOOGLE_SA_JSON) { console.error("shop CRM sync not configured (no GOOGLE_SA_JSON)"); return; }
  if (!env.WAIVERS_DB) return;

  let rows;
  try {
    rows = (await env.WAIVERS_DB.prepare(
      "SELECT * FROM shop_messages WHERE crm_row IS NULL ORDER BY created_at ASC LIMIT 25"
    ).all()).results || [];
  } catch (err) { console.error("shop CRM backlog query failed:", err); return; }
  if (!rows.length) return;

  let token;
  try { token = await getGoogleAccessToken(env, SHEETS_SCOPE); }
  catch (err) { console.error("shop CRM token mint failed:", err); return; }

  try { await ensureCrmTab(token); }
  catch (err) { console.error("shop CRM tab check failed:", err); return; }

  // One append for the whole batch — the API returns the exact range it wrote,
  // which is what gets stored back as the idempotency marker. Appending row by
  // row would burn a quota unit each and give 25 chances to half-finish.
  const values = rows.map((r) => [
    r.created_at, r.name, r.email, r.topic, r.order_number || "",
    r.message, r.source || "", r.ref || "", r.id,
  ]);

  let updatedRange;
  try {
    const res = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${CRM_SHEET_ID}/values/` +
        `${encodeURIComponent(CRM_TAB)}!A:I:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values }),
      }
    );
    if (!res.ok) throw new Error(`sheets append ${res.status} ${await res.text().catch(() => "")}`);
    updatedRange = (await res.json())?.updates?.updatedRange || "appended";
  } catch (err) {
    // Left unmarked on purpose: the next tick retries the same rows. The cost of
    // a retry is a duplicate row a human can delete; the cost of marking
    // optimistically is a customer message that never reaches the CRM at all.
    console.error("shop CRM append failed:", err);
    return;
  }

  for (const r of rows) {
    try {
      await env.WAIVERS_DB.prepare("UPDATE shop_messages SET crm_row = ? WHERE id = ?")
        .bind(updatedRange, r.id).run();
    } catch (err) {
      console.error("shop CRM mark failed for", r.id, err);
    }
  }
  console.log(`shop CRM sync: ${rows.length} message(s) filed to ${updatedRange}`);
}

// Create the tab and its header the first time, so nobody has to hand-prepare
// the sheet before the first customer writes in. Idempotent: an existing tab is
// left exactly as it is, header included, because a human may have reordered or
// renamed columns and this code has no business overwriting that.
async function ensureCrmTab(token) {
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CRM_SHEET_ID}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!metaRes.ok) throw new Error(`sheets meta ${metaRes.status} ${await metaRes.text().catch(() => "")}`);
  const titles = ((await metaRes.json()).sheets || []).map((s) => s.properties.title);
  if (titles.includes(CRM_TAB)) return;

  const addRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CRM_SHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: CRM_TAB, gridProperties: { frozenRowCount: 1 } } } }],
      }),
    }
  );
  if (!addRes.ok) throw new Error(`sheets addSheet ${addRes.status} ${await addRes.text().catch(() => "")}`);

  const headRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${CRM_SHEET_ID}/values/` +
      `${encodeURIComponent(CRM_TAB)}!A1:I1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ values: [CRM_HEADER] }),
    }
  );
  if (!headRes.ok) throw new Error(`sheets header ${headRes.status} ${await headRes.text().catch(() => "")}`);
}

// --- helpers ---------------------------------------------------------------

function after(ctx, promise) {
  try {
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
    else Promise.resolve(promise).catch(() => {});
  } catch (err) {
    console.error("after() could not schedule work:", err);
  }
}

// Constant-time compare so the shared key cannot be recovered a byte at a time.
// Length is allowed to leak; the secret is a UUID-class random string and its
// length is not the part worth hiding.
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


function str(v, max = 5000) { return (typeof v === "string" ? v : "").trim().slice(0, max); }

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
