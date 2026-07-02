// Spec 38 Phase 2 — Givebutter webhook: every successful gift becomes an Airtable row
// (the agent-legible giving record) and triggers a warm thank-you email via the
// SEND_EMAIL binding. Registered via the Givebutter API; deliveries are verified
// against the webhook's signing secret (Signature header, HMAC-SHA256 of the raw body).

import { cfSend } from "./email.js";

export async function handleGivebutterWebhook(request, env, ctx) {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }
  const raw = await request.text();

  // Verify the delivery really came from Givebutter.
  const sig = request.headers.get("Signature") || request.headers.get("signature") || "";
  if (!env.GIVEBUTTER_WEBHOOK_SECRET) {
    console.error("givebutter-webhook: no GIVEBUTTER_WEBHOOK_SECRET configured");
    return json({ ok: false }, 503);
  }
  if (!(await verifySignature(raw, sig, env.GIVEBUTTER_WEBHOOK_SECRET))) {
    console.error("givebutter-webhook: signature mismatch", sig.slice(0, 12));
    return json({ ok: false }, 401);
  }

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad json" }, 400); }
  const event = str(body.event || body.type);
  const data = body.data || {};

  // Ack fast; do the work off the response path.
  if (event === "transaction.succeeded") {
    ctx.waitUntil(recordGift(env, data).catch((e) => console.error("recordGift failed:", e)));
  } else {
    console.log("givebutter-webhook: ignoring event", event);
  }
  return json({ ok: true });
}

async function recordGift(env, t) {
  // Defensive field extraction — Givebutter's transaction object varies by giving flow.
  const first = str(t.first_name || (t.member && t.member.first_name));
  const last = str(t.last_name || (t.member && t.member.last_name));
  const name = `${first} ${last}`.trim() || str(t.giving_space && t.giving_space.name) || "Anonymous";
  const email = str(t.email || (t.member && t.member.email));
  const amount = Number(t.amount) || 0;
  const txId = str(t.id);
  const campaign = str(t.campaign_code || t.campaign_id || (t.campaign && t.campaign.code));
  const recurring = !!(t.plan_id || (t.plan && t.plan.id) || str(t.frequency).toLowerCase() === "monthly");
  const note = str((t.giving_space && t.giving_space.message) || t.public_message || t.dedication);
  const kind = campaign === str(env.GIVEBUTTER_SPONSOR_CAMPAIGN_CODE || "MNL0JS") ? "Sponsorship" : "Donation";

  // Dedupe: webhook deliveries can retry.
  if (txId && (await donationExists(env, txId))) {
    console.log("givebutter-webhook: duplicate delivery for", txId);
    return;
  }

  const fields = {
    Name: name,
    Email: email || undefined,
    Amount: amount,
    Frequency: recurring ? "Monthly" : "One-time",
    Kind: kind,
    Campaign: campaign,
    "GB Transaction": txId,
    Status: "New",
    Received: new Date().toISOString(),
    Note: note || undefined,
  };
  const recId = await airtableCreate(env, fields);

  if (email) {
    await sendThankYou(env, { name: first || name, email, amount, recurring, kind });
    if (recId) await airtableUpdate(env, recId, { Status: "Thanked" });
  }
}

async function donationExists(env, txId) {
  const formula = encodeURIComponent(`{GB Transaction} = "${txId.replace(/"/g, "")}"`);
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_DONATIONS_TABLE_ID}?maxRecords=1&filterByFormula=${formula}`,
    { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } }
  );
  if (!res.ok) return false; // on lookup failure, prefer recording over dropping
  const d = await res.json();
  return Array.isArray(d.records) && d.records.length > 0;
}

async function airtableCreate(env, fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_DONATIONS_TABLE_ID}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }], typecast: true }),
    }
  );
  if (!res.ok) {
    console.error("airtable donations create failed", res.status, await safeText(res));
    return null;
  }
  const d = await res.json();
  return d.records && d.records[0] && d.records[0].id;
}

async function airtableUpdate(env, recId, fields) {
  const res = await fetch(
    `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_DONATIONS_TABLE_ID}/${recId}`,
    {
      method: "PATCH",
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields, typecast: true }),
    }
  );
  if (!res.ok) console.error("airtable donations update failed", res.status, await safeText(res));
}

async function sendThankYou(env, { name, email, amount, recurring, kind }) {
  const amt = amount ? `$${Number(amount).toLocaleString("en-US")}` : "Your gift";
  const monthly = recurring ? " every month" : "";
  const opening = kind === "Sponsorship"
    ? `Your sponsorship just put your name behind real athletes.`
    : `You just put an athlete closer to the game.`;
  const subject = kind === "Sponsorship"
    ? "Thank you. Your sponsorship is in the game."
    : "Thank you. You just put an athlete in the game.";
  const text = [
    `${name ? name + ", t" : "T"}hank you.`,
    ``,
    `${opening} ${amt}${monthly} goes to the real costs of competing: equipment, travel, and training. One hundred percent reaches the athlete; overhead is covered separately, on purpose.`,
    ``,
    `Givebutter emails your official receipt separately. Watch what your gift builds at https://adapttolife.org/roadmap, and if you ever want the story behind the fund: https://adapttolife.org/tim`,
    ``,
    `With hustle and heart,`,
    `Adapt To Life`,
    `hello@adapttolife.org · adapttolife.org`,
  ].join("\n");
  try {
    await cfSend(env, {
      from: "Adapt To Life <hello@adapttolife.org>",
      to: email,
      replyTo: "hello@adapttolife.org",
      subject,
      text,
    });
  } catch (e) {
    console.error("thank-you send failed:", e);
  }
}

async function verifySignature(raw, sigHeader, secret) {
  if (!sigHeader) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(raw));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  const given = sigHeader.trim();
  // Accept common encodings (hex or base64), constant-time-ish comparison.
  return timingSafeEqual(given.toLowerCase(), hex) || timingSafeEqual(given, b64);
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function str(v) { return (typeof v === "string" ? v : v == null ? "" : String(v)).trim().slice(0, 5000); }
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
async function safeText(res) { try { return (await res.text()).slice(0, 300); } catch { return "(no body)"; } }
