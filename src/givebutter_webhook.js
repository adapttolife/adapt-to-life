import {
  cfSend, esc, houseShell, houseSignoff, HOUSE_FROM, HOUSE_INBOX, recordTransactionalFailure,
} from "./email.js";

const MAX_EMAIL_ATTEMPTS = 4;
const MAX_WEBHOOK_BYTES = 64 * 1024;

export async function handleGivebutterWebhook(request, env, ctx) {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.GIVEBUTTER_WEBHOOK_SECRET) return json({ ok: false, error: "Webhook not configured" }, 503);

  // Givebutter sends the secret itself, so authenticate before allocating or
  // parsing attacker-controlled body bytes.
  const signature = request.headers.get("Signature") || "";
  if (!validSignature(signature, env.GIVEBUTTER_WEBHOOK_SECRET)) {
    return json({ ok: false, error: "Invalid signature" }, 401);
  }

  let raw;
  try {
    raw = await readBodyLimited(request, MAX_WEBHOOK_BYTES);
  } catch (err) {
    if (err?.name === "BodyTooLargeError") return json({ ok: false, error: "Payload too large" }, 413);
    throw err;
  }

  let body;
  try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }
  const event = text(body.event || body.type);
  if (event !== "transaction.succeeded") return json({ ok: true, ignored: true });

  const transaction = body.data || {};
  if (!text(transaction.id)) return json({ ok: false, error: "Missing transaction id" }, 400);

  let gift;
  try {
    // Do not acknowledge Givebutter until the transaction is durable. A 503
    // causes Givebutter to retry instead of silently losing the donor journey.
    gift = await recordGift(env, transaction);
  } catch (err) {
    console.error("givebutter gift persistence failed", err);
    return json({ ok: false, error: "Temporary persistence failure" }, 503);
  }
  if (gift.email) ctx.waitUntil(claimAndThank(env, gift));
  return json({ ok: true });
}

export async function recordGift(env, transaction) {
  if (!env.WAIVERS_DB) throw new Error("WAIVERS_DB binding not configured");

  const gift = normalizeGift(transaction);
  if (!gift.transactionId) throw new Error("missing transaction id");
  const now = new Date().toISOString();
  const initialStatus = gift.email ? "pending" : "no_email";
  const result = await env.WAIVERS_DB.prepare(
    `INSERT INTO donor_gifts
      (transaction_id, contact_id, first_name, last_name, email, amount, donated,
       campaign_id, campaign_title, communication_opt_in, recurring, transacted_at,
       email_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(transaction_id) DO NOTHING`
  ).bind(
    gift.transactionId, gift.contactId, gift.firstName, gift.lastName, gift.email,
    gift.amount, gift.donated, gift.campaignId, gift.campaignTitle,
    gift.communicationOptIn ? 1 : 0, gift.recurring ? 1 : 0, gift.transactedAt,
    initialStatus, now, now
  ).run();
  return { ...gift, inserted: Boolean(result?.meta?.changes) };
}

export async function claimAndThank(env, gift) {
  // The conditional update is the one-way gate. Concurrent or retried webhook
  // deliveries can all reach here, but only one can claim pending -> sending.
  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const leaseToken = crypto.randomUUID();
  const claim = await env.WAIVERS_DB.prepare(
    `UPDATE donor_gifts
        SET email_status = 'sending', email_attempted_at = ?, updated_at = ?,
            lease_token = ?, attempt_count = attempt_count + 1
      WHERE transaction_id = ? AND attempt_count < ?
        AND (email_status = 'pending'
          OR (email_status = 'sending' AND email_attempted_at < ?)
          OR (email_status = 'retry' AND next_attempt_at <= ?))`
  ).bind(
    claimedAt, claimedAt, leaseToken, gift.transactionId, MAX_EMAIL_ATTEMPTS,
    staleBefore, claimedAt
  ).run();
  if (!claim?.meta?.changes) return { emailed: false, duplicate: true };
  const state = await env.WAIVERS_DB.prepare(
    "SELECT attempt_count FROM donor_gifts WHERE transaction_id = ? AND lease_token = ?"
  ).bind(gift.transactionId, leaseToken).first();
  const attemptNumber = number(state?.attempt_count);

  try {
    await sendDonorThankYou(env, gift);
    const sentAt = new Date().toISOString();
    const completed = await env.WAIVERS_DB.prepare(
      `UPDATE donor_gifts
          SET email_status = ?, email_sent_at = ?, next_attempt_at = NULL,
              last_error = NULL, lease_token = NULL, updated_at = ?
        WHERE transaction_id = ? AND lease_token = ? AND email_status = 'sending'`
    ).bind("sent", sentAt, sentAt, gift.transactionId, leaseToken).run();
    return completed?.meta?.changes ? { emailed: true } : { emailed: false, obsolete: true };
  } catch (err) {
    const failedAt = new Date().toISOString();
    const terminal = attemptNumber >= MAX_EMAIL_ATTEMPTS;
    const retryAt = terminal ? null : new Date(Date.now() + retryDelayMs(attemptNumber)).toISOString();
    const updated = await env.WAIVERS_DB.prepare(
      `UPDATE donor_gifts
          SET email_status = ?, next_attempt_at = ?, last_error = ?,
              lease_token = NULL, updated_at = ?
        WHERE transaction_id = ? AND lease_token = ? AND email_status = 'sending'`
    ).bind(
      terminal ? "failed" : "retry",
      retryAt,
      text(err?.message || err).slice(0, 500),
      failedAt,
      gift.transactionId,
      leaseToken
    ).run();
    if (!updated?.meta?.changes) return { emailed: false, obsolete: true };
    await recordTransactionalFailure(env, "givebutter-thank-you", gift.email, err);
    return { emailed: false, failed: terminal, retry: !terminal };
  }
}

// The production Worker already wakes every ten minutes. Reclaiming a stale
// lease here closes the process-death gap between claiming a row and recording
// the email outcome. Cloudflare Email Sending has no idempotency key, so this is
// deliberately at-least-once after a crash rather than silently at-most-once.
export async function recoverDonorEmails(env) {
  if (!env.WAIVERS_DB) return { ok: false, scanned: 0, sent: 0, queued: 0, failed: 0, error: "WAIVERS_DB binding not configured" };
  if (!env.SEND_EMAIL) return { ok: false, scanned: 0, sent: 0, queued: 0, failed: 0, error: "SEND_EMAIL binding not configured" };
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  await env.WAIVERS_DB.prepare(
    `UPDATE donor_gifts
        SET email_status = 'failed', lease_token = NULL,
            last_error = 'delivery lease exhausted', updated_at = ?
      WHERE email_status = 'sending' AND email_attempted_at < ?
        AND attempt_count >= ?`
  ).bind(now, staleBefore, MAX_EMAIL_ATTEMPTS).run();
  const result = await env.WAIVERS_DB.prepare(
    `SELECT transaction_id, contact_id, first_name, last_name, email, amount, donated,
            campaign_id, campaign_title, communication_opt_in, recurring, transacted_at,
            attempt_count
       FROM donor_gifts
      WHERE attempt_count < ? AND (
            email_status = 'pending'
         OR (email_status = 'sending' AND email_attempted_at < ?)
         OR (email_status = 'retry' AND next_attempt_at <= ?))
      ORDER BY transacted_at
      LIMIT 50`
  ).bind(MAX_EMAIL_ATTEMPTS, staleBefore, now).all();
  const gifts = (result?.results || []).map(giftFromRow);
  const outcomes = await Promise.all(gifts.map((gift) => claimAndThank(env, gift)));
  const remaining = await env.WAIVERS_DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN email_status IN ('pending','sending','retry') THEN 1 ELSE 0 END), 0) AS queued,
       COALESCE(SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
       FROM donor_gifts`
  ).first();
  const queued = number(remaining?.queued);
  const failed = number(remaining?.failed);
  return {
    ok: queued === 0 && failed === 0,
    scanned: gifts.length,
    sent: outcomes.filter((r) => r?.emailed).length,
    queued,
    failed,
  };
}

export async function sendDonorThankYou(env, gift) {
  const name = gift.firstName || "there";
  const updates = gift.communicationOptIn
    ? "Because you chose to hear from us, we'll share meaningful campaign updates and show you what gifts like yours helped make possible."
    : "You can follow the campaign whenever you want at adapttolife.org/roadmap.";
  const textBody = [
    `Hi ${name},`,
    "",
    "Thank you for putting an athlete in the game.",
    "",
    "Your gift helps cover the real costs that keep adaptive athletes competing: equipment, training, and travel. One hundred percent reaches athletes because operating costs are covered separately, on purpose.",
    "",
    "Givebutter sent your official receipt separately. " + updates,
    "",
    "See where the money goes: https://adapttolife.org/send-6",
    "Follow our progress: https://adapttolife.org/roadmap",
    "",
    "With hustle and heart,",
    houseSignoff(),
  ].join("\n");
  const html = houseShell(
    `<p>Hi ${esc(name)},</p>` +
    `<p><strong>Thank you for putting an athlete in the game.</strong></p>` +
    `<p>Your gift helps cover the real costs that keep adaptive athletes competing: equipment, training, and travel. One hundred percent reaches athletes because operating costs are covered separately, on purpose.</p>` +
    `<p>Givebutter sent your official receipt separately. ${esc(updates)}</p>` +
    `<p><a href="https://adapttolife.org/send-6">See where the money goes</a><br>` +
    `<a href="https://adapttolife.org/roadmap">Follow our progress</a></p>` +
    `<p>With hustle and heart,</p>`
  );
  return cfSend(env, {
    from: HOUSE_FROM,
    to: gift.email,
    replyTo: HOUSE_INBOX,
    subject: "Thank you for putting an athlete in the game",
    text: textBody,
    html,
  });
}

function normalizeGift(t) {
  return {
    transactionId: text(t.id), contactId: text(t.contact_id),
    firstName: text(t.first_name), lastName: text(t.last_name), email: text(t.email).toLowerCase(),
    amount: number(t.amount), donated: number(t.donated), campaignId: text(t.campaign_id),
    campaignTitle: text(t.campaign_title), communicationOptIn: truthy(t.communication_opt_in),
    recurring: truthy(t.is_recurring) || !!text(t.plan_id),
    transactedAt: text(t.transacted_at) || new Date().toISOString(),
  };
}

function giftFromRow(row) {
  return {
    transactionId: text(row.transaction_id), contactId: text(row.contact_id),
    firstName: text(row.first_name), lastName: text(row.last_name), email: text(row.email),
    amount: number(row.amount), donated: number(row.donated), campaignId: text(row.campaign_id),
    campaignTitle: text(row.campaign_title), communicationOptIn: truthy(row.communication_opt_in),
    recurring: truthy(row.recurring), transactedAt: text(row.transacted_at),
    attemptCount: number(row.attempt_count),
  };
}

function retryDelayMs(attempt) {
  return 10 * 60 * 1000 * (3 ** Math.max(0, attempt - 1));
}

function validSignature(given, secret) {
  // Givebutter sends the per-webhook signing secret itself in Signature; it is
  // not an HMAC of the body. Compare without data-dependent early exit.
  return safeEqual(String(given || "").trim(), String(secret || "").trim());
}

async function readBodyLimited(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes) throw Object.assign(new Error("Payload too large"), { name: "BodyTooLargeError" });
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw Object.assign(new Error("Payload too large"), { name: "BodyTooLargeError" });
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
function truthy(value) { return value === true || value === 1 || String(value).toLowerCase() === "true"; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function text(value) { return String(value ?? "").trim().slice(0, 1000); }
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
