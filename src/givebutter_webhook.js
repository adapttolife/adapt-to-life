import { mailConfigured } from "./mail-transport.js";
import {
  cfSend,
  esc,
  HOUSE_BRAND,
  houseShell,
  houseSignoff,
  HOUSE_FROM,
  HOUSE_INBOX,
  recordTransactionalFailure,
} from "./email.js";
import { recordIntake, notifyIntake } from "./intake.js";
import { RETRY_WINDOW_MS, windowRefusal, nextAttemptAt } from "./mail-window.js";

const MAX_EMAIL_ATTEMPTS = 4;
const MAX_WEBHOOK_BYTES = 64 * 1024;

export async function handleGivebutterWebhook(request, env, ctx) {
  if (request.method !== "POST")
    return json({ ok: false, error: "Method not allowed" }, 405);
  if (!env.GIVEBUTTER_WEBHOOK_SECRET)
    return json({ ok: false, error: "Webhook not configured" }, 503);

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
    if (err?.name === "BodyTooLargeError")
      return json({ ok: false, error: "Payload too large" }, 413);
    throw err;
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "Invalid JSON" }, 400);
  }
  const event = text(body.event || body.type);
  if (event !== "transaction.succeeded") return json({ ok: true, ignored: true });

  const transaction = body.data || {};
  if (!text(transaction.id))
    return json({ ok: false, error: "Missing transaction id" }, 400);
  const cutoff = new Date(env.GIVEBUTTER_DONOR_CUTOFF || "");
  if (!Number.isFinite(cutoff.getTime()))
    return json({ ok: false, error: "Donor journey not configured" }, 503);
  const transactedAt = new Date(transaction.transacted_at);
  if (!Number.isFinite(transactedAt.getTime()))
    return json({ ok: false, error: "Invalid transaction timestamp" }, 400);
  if (transactedAt < cutoff)
    return json({ ok: true, ignored: true, reason: "pre-activation" });

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

  // Donations notified nobody before this. Runs after the gift is durable and
  // after we have decided to acknowledge Givebutter, so an intake hiccup can
  // never turn a successful donation into a webhook retry.
  ctx.waitUntil(
    (async () => {
      try {
        const amount = gift.amount != null ? `$${gift.amount}` : "";
        const donor = [gift.firstName, gift.lastName].filter(Boolean).join(" ").trim();
        const who = donor || gift.email || "someone";
        const rec = await recordIntake(env, {
          site: "adapttolife.org",
          kind: "donation",
          name: donor || null,
          email: gift.email || null,
          summary: `New donation${amount ? ` ${amount}` : ""} from ${who}`,
          source: "givebutter",
          payload: {
            Amount: amount,
            Campaign: gift.campaignTitle || "",
            Recurring: gift.recurring ? "yes" : "",
            "Givebutter transaction": gift.transactionId || "",
          },
        });
        if (rec.ok) await notifyIntake(env, rec.id);
      } catch (err) {
        console.error("donation intake failed (gift itself already recorded):", err);
      }
    })(),
  );

  return json({ ok: true });
}

export async function recordGift(env, transaction) {
  if (!env.WAIVERS_DB) throw new Error("WAIVERS_DB binding not configured");

  const gift = normalizeGift(transaction);
  if (!gift.transactionId) throw new Error("missing transaction id");
  const now = new Date().toISOString();
  // A monthly gift is thanked once, on its first charge. Givebutter receipts
  // every charge itself, and the same thank-you from us every month reads like
  // a machine. A later charge is still recorded (Givebutter is the money
  // record), as "no_email": no ATL email is owed for it.
  const earlier =
    gift.email && gift.recurring ? await monthlyAlreadyThanked(env, gift) : null;
  const initialStatus = !gift.email || earlier ? "no_email" : "pending";
  const result = await env.WAIVERS_DB.prepare(
    `INSERT INTO donor_gifts
      (transaction_id, contact_id, first_name, last_name, email, amount, donated,
       campaign_id, campaign_title, communication_opt_in, recurring, transacted_at,
       email_status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(transaction_id) DO NOTHING`,
  )
    .bind(
      gift.transactionId,
      gift.contactId,
      gift.firstName,
      gift.lastName,
      gift.email,
      gift.amount,
      gift.donated,
      gift.campaignId,
      gift.campaignTitle,
      gift.communicationOptIn ? 1 : 0,
      gift.recurring ? 1 : 0,
      gift.transactedAt,
      initialStatus,
      now,
      now,
    )
    .run();
  const inserted = Boolean(result?.meta?.changes);
  // The donor's first thank you is closed for review and may have gone out, so
  // this charge sends none (a second one would read like a machine) and a
  // person decides.
  if (inserted && earlier === "review")
    await recordTransactionalFailure(
      env,
      "givebutter-thank-you",
      gift.email,
      new Error(
        `Monthly charge ${gift.transactionId}: no thank you sent; the donor's first thank you is under review and may have gone out`,
      ),
    );
  return { ...gift, inserted };
}

// The note that opens last_error on a thank you closed for a person to check:
// it may already have gone out, so nothing resends it automatically.
const REVIEW_NOTE = "Review before resending:";

// An earlier monthly charge from the same donor to the same campaign that was
// thanked, or is about to be: "thanked". One closed for review (it may have
// gone out): "review", so this charge skips its thank you and a person is
// told. A first thank-you that plainly failed doesn't count, so the next
// charge carries it instead.
async function monthlyAlreadyThanked(env, gift) {
  const row = await env.WAIVERS_DB.prepare(
    `SELECT CASE WHEN email_status = 'failed' THEN 'review' ELSE 'thanked' END AS earlier_thanks
       FROM donor_gifts
      WHERE email = ? AND campaign_id = ? AND recurring = 1 AND transaction_id <> ?
        AND (email_status IN ('pending', 'sending', 'retry', 'sent')
          OR (email_status = 'failed' AND last_error LIKE ?))
      ORDER BY CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END
      LIMIT 1`,
  )
    .bind(gift.email, gift.campaignId, gift.transactionId, `${REVIEW_NOTE}%`)
    .first();
  if (!row) return null;
  return row.earlier_thanks === "review" ? "review" : "thanked";
}

export async function claimAndThank(env, gift) {
  // A missing key or binding is local: nothing was sent, so nothing is claimed
  // and the gift stays owed for the next run, never marked failed.
  if (!mailConfigured(env)) return { emailed: false, notConfigured: true };
  // The conditional update is the one-way gate. Concurrent or retried webhook
  // deliveries can all reach here, but only one can claim pending -> sending.
  // It also starts the retry clock (first_attempted_at, never reset) and
  // refuses a row whose window has closed, or one attempted before the clock
  // existed (Gmail era): nobody can say when that one first went out.
  const claimedAt = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const windowStart = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
  const leaseToken = crypto.randomUUID();
  const claim = await env.WAIVERS_DB.prepare(
    `UPDATE donor_gifts
        SET email_status = 'sending', email_attempted_at = ?, updated_at = ?,
            lease_token = ?, attempt_count = attempt_count + 1,
            first_attempted_at = COALESCE(first_attempted_at, ?)
      WHERE transaction_id = ? AND attempt_count < ?
        ${env.MAIL_TRANSPORT === "gmail" ? "AND email_status = 'pending' AND attempt_count = 0" : ""}
        AND (attempt_count = 0 OR first_attempted_at IS NOT NULL)
        AND (first_attempted_at IS NULL OR first_attempted_at > ?)
        AND (email_status = 'pending'
          OR (email_status = 'sending' AND email_attempted_at < ?)
          OR (email_status = 'retry' AND next_attempt_at <= ?))`,
  )
    .bind(
      claimedAt,
      claimedAt,
      leaseToken,
      claimedAt,
      gift.transactionId,
      MAX_EMAIL_ATTEMPTS,
      windowStart,
      staleBefore,
      claimedAt,
    )
    .run();
  if (!claim?.meta?.changes) return { emailed: false, duplicate: true };
  const state = await env.WAIVERS_DB.prepare(
    "SELECT attempt_count, first_attempted_at FROM donor_gifts WHERE transaction_id = ? AND lease_token = ?",
  )
    .bind(gift.transactionId, leaseToken)
    .first();
  const attemptNumber = number(state?.attempt_count);
  const firstAttemptedAt = state?.first_attempted_at;

  try {
    // Past 23 hours the same key is a new send to Resend, and with no clock (a
    // lost lease reads none) nobody can say when it first went out: never send.
    // A lost lease's row belongs to the other worker, so the fenced update
    // below changes nothing; a row that really has no clock is closed for review.
    const refusal = windowRefusal(firstAttemptedAt);
    if (refusal) {
      const closed = new Error(`${REVIEW_NOTE} ${refusal}`);
      closed.windowClosed = true;
      throw closed;
    }
    const sent = await sendDonorThankYou(env, gift);
    const sentAt = new Date().toISOString();
    if (sent?.dropped) {
      // Outside production a non-team address is never mailed: nothing is owed.
      await env.WAIVERS_DB.prepare(
        `UPDATE donor_gifts
            SET email_status = 'no_email', next_attempt_at = NULL, last_error = ?,
                lease_token = NULL, updated_at = ?
          WHERE transaction_id = ? AND lease_token = ? AND email_status = 'sending'`,
      )
        .bind(
          `Not sent: dropped outside production (${sent.reason})`,
          sentAt,
          gift.transactionId,
          leaseToken,
        )
        .run();
      return { emailed: false, dropped: true };
    }
    const completed = await env.WAIVERS_DB.prepare(
      `UPDATE donor_gifts
          SET email_status = ?, email_sent_at = ?, next_attempt_at = NULL,
              last_error = NULL, lease_token = NULL, updated_at = ?
        WHERE transaction_id = ? AND lease_token = ? AND email_status = 'sending'`,
    )
      .bind("sent", sentAt, sentAt, gift.transactionId, leaseToken)
      .run();
    return completed?.meta?.changes
      ? { emailed: true }
      : { emailed: false, obsolete: true };
  } catch (err) {
    const failedAt = new Date().toISOString();
    // Resend says whether a retry is safe; a refused send (bad address, From,
    // a reused key with a different body) never gets better by retrying.
    // No retry is ever scheduled past the window's cutoff.
    let retryAt = null;
    if (
      !err?.windowClosed &&
      env.MAIL_TRANSPORT !== "gmail" &&
      !(env.MAIL_TRANSPORT === "resend" && err?.retryable !== true) &&
      attemptNumber < MAX_EMAIL_ATTEMPTS
    )
      retryAt = nextAttemptAt(firstAttemptedAt, attemptNumber, { delay: retryDelayMs });
    const terminal = !retryAt;
    const updated = await env.WAIVERS_DB.prepare(
      `UPDATE donor_gifts
          SET email_status = ?, next_attempt_at = ?, last_error = ?,
              lease_token = NULL, updated_at = ?
        WHERE transaction_id = ? AND lease_token = ? AND email_status = 'sending'`,
    )
      .bind(
        terminal ? "failed" : "retry",
        retryAt,
        text(err?.message || err).slice(0, 500),
        failedAt,
        gift.transactionId,
        leaseToken,
      )
      .run();
    if (!updated?.meta?.changes) return { emailed: false, obsolete: true };
    await recordTransactionalFailure(env, "givebutter-thank-you", gift.email, err);
    return { emailed: false, failed: terminal, retry: !terminal };
  }
}

// The production Worker already wakes every ten minutes. Reclaiming a stale
// lease here closes the process-death gap between claiming a row and recording
// the email outcome. On Resend the send carries the Idempotency-Key
// donor-thanks-<transaction id> over a body built only from the gift row, and
// no attempt is made or scheduled more than 23 hours after the first
// (src/mail-window.js), so a reclaim cannot email twice. Rows outside that
// rule are closed as failed with a "Review" note, since this table has no
// review state.
export async function recoverDonorEmails(env) {
  if (!env.WAIVERS_DB)
    return {
      ok: false,
      scanned: 0,
      sent: 0,
      queued: 0,
      failed: 0,
      error: "WAIVERS_DB binding not configured",
    };
  if (!mailConfigured(env))
    return {
      ok: false,
      scanned: 0,
      sent: 0,
      queued: 0,
      failed: 0,
      error: "SEND_EMAIL binding not configured",
    };
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  // Gmail has no caller idempotency key. Never inherit uncertain legacy retries
  // or reclaim a post-send crash as permission to send again.
  if (env.MAIL_TRANSPORT === "gmail") {
    await env.WAIVERS_DB.prepare(
      `UPDATE donor_gifts SET email_status='failed',
      lease_token=NULL, last_error='Gmail cutover: ambiguous prior attempt requires review', updated_at=?
      WHERE (email_status='sending' AND email_attempted_at < ?)
         OR email_status='retry' OR (email_status='pending' AND attempt_count > 0)`,
    )
      .bind(now, staleBefore)
      .run();
  }
  // Attempted before the retry clock existed, or past the window: a person
  // checks Resend's log (or hello@'s Sent mail) before anything is resent.
  const windowStart = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
  const parked = await env.WAIVERS_DB.prepare(
    `UPDATE donor_gifts SET email_status = 'failed', lease_token = NULL, updated_at = ?,
        last_error = CASE WHEN first_attempted_at IS NULL
          THEN 'Review before resending: attempted before the Resend move'
          ELSE 'Review before resending: retry window (23 hours) closed' END
      WHERE (email_status IN ('pending', 'retry')
             OR (email_status = 'sending' AND email_attempted_at < ?))
        AND attempt_count > 0
        AND (first_attempted_at IS NULL OR first_attempted_at <= ?)
      RETURNING transaction_id, email`,
  )
    .bind(now, staleBefore, windowStart)
    .all();
  for (const row of parked?.results || [])
    await recordTransactionalFailure(
      env,
      "givebutter-thank-you",
      row.email,
      new Error(`Thank you for ${row.transaction_id} needs review before any resend`),
    );
  await env.WAIVERS_DB.prepare(
    `UPDATE donor_gifts
        SET email_status = 'failed', lease_token = NULL,
            last_error = 'delivery lease exhausted', updated_at = ?
      WHERE email_status = 'sending' AND email_attempted_at < ?
        AND attempt_count >= ?`,
  )
    .bind(now, staleBefore, MAX_EMAIL_ATTEMPTS)
    .run();
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
      LIMIT 50`,
  )
    .bind(MAX_EMAIL_ATTEMPTS, staleBefore, now)
    .all();
  const gifts = (result?.results || []).map(giftFromRow);
  const outcomes = await Promise.all(gifts.map((gift) => claimAndThank(env, gift)));
  const remaining = await env.WAIVERS_DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN email_status IN ('pending','sending','retry') THEN 1 ELSE 0 END), 0) AS queued,
       COALESCE(SUM(CASE WHEN email_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
       FROM donor_gifts`,
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

// The Hustle & Heart Fund on Givebutter. A gift to it gets the /donate page's
// own sentence for where the money goes right now; any other campaign keeps
// the general line.
const HUSTLE_HEART_CAMPAIGN_ID = "683765";

export function giftLine(gift) {
  return gift.campaignId === HUSTLE_HEART_CAMPAIGN_ID
    ? "Right now, your gift keeps Chicago Pickleball: Wheelie Big Dills on court every week, then on the road to the US Open."
    : "Your gift helps adaptive athletes take part through equipment, training, and travel.";
}

export async function sendDonorThankYou(env, gift) {
  const name = gift.firstName || "there";
  const updates = gift.communicationOptIn
    ? "Because you chose to hear from us, we'll share meaningful campaign updates and show you what gifts like yours helped make possible."
    : "You can follow the crew whenever you want at adapttolife.org/pickleball.";
  // A monthly donor hears from us once; Givebutter's receipt comes every month.
  const receipt = gift.recurring
    ? "Givebutter sent your official receipt separately and will send one each month."
    : "Givebutter sent your official receipt separately.";
  const line = giftLine(gift);
  const textBody = [
    `Hi ${name},`,
    "",
    "Thank you for putting an athlete in the game.",
    "",
    line,
    "",
    `${receipt} ${updates}`,
    "",
    "See where the money goes: https://adapttolife.org/numbers",
    "Meet the crew: https://adapttolife.org/pickleball",
    "",
    "With hustle and heart,",
    houseSignoff(),
  ].join("\n");
  const html = houseShell(
    `<p>Hi ${esc(name)},</p>` +
      `<p><strong>Thank you for putting an athlete in the game.</strong></p>` +
      `<p>${esc(line)}</p>` +
      `<p>${esc(receipt)} ${esc(updates)}</p>` +
      `<p><a href="https://adapttolife.org/numbers">See where the money goes</a><br>` +
      `<a href="https://adapttolife.org/pickleball">Meet the crew</a></p>` +
      `<p>With hustle and heart,</p>`,
  );
  return cfSend(env, {
    from: HOUSE_FROM,
    to: gift.email,
    replyTo: HOUSE_INBOX,
    subject: "Thank you for putting an athlete in the game",
    text: textBody,
    html,
    idempotencyKey: `donor-thanks-${gift.transactionId}`,
    tags: { brand: HOUSE_BRAND, kind: "donor-thanks" },
  });
}

function normalizeGift(t) {
  return {
    transactionId: text(t.id),
    contactId: text(t.contact_id),
    firstName: text(t.first_name),
    lastName: text(t.last_name),
    email: text(t.email).toLowerCase(),
    amount: number(t.amount),
    donated: number(t.donated),
    campaignId: text(t.campaign_id),
    campaignTitle: text(t.campaign_title),
    communicationOptIn: truthy(t.communication_opt_in),
    recurring: truthy(t.is_recurring) || !!text(t.plan_id),
    transactedAt: text(t.transacted_at) || new Date().toISOString(),
  };
}

function giftFromRow(row) {
  return {
    transactionId: text(row.transaction_id),
    contactId: text(row.contact_id),
    firstName: text(row.first_name),
    lastName: text(row.last_name),
    email: text(row.email),
    amount: number(row.amount),
    donated: number(row.donated),
    campaignId: text(row.campaign_id),
    campaignTitle: text(row.campaign_title),
    communicationOptIn: truthy(row.communication_opt_in),
    recurring: truthy(row.recurring),
    transactedAt: text(row.transacted_at),
    attemptCount: number(row.attempt_count),
  };
}

function retryDelayMs(attempt) {
  return 10 * 60 * 1000 * 3 ** Math.max(0, attempt - 1);
}

function validSignature(given, secret) {
  // Givebutter sends the per-webhook signing secret itself in Signature; it is
  // not an HMAC of the body. Compare without data-dependent early exit.
  return safeEqual(String(given || "").trim(), String(secret || "").trim());
}

async function readBodyLimited(request, maxBytes) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > maxBytes)
    throw Object.assign(new Error("Payload too large"), { name: "BodyTooLargeError" });
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
      throw Object.assign(new Error("Payload too large"), {
        name: "BodyTooLargeError",
      });
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
function truthy(value) {
  return value === true || value === 1 || String(value).toLowerCase() === "true";
}
function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
function text(value) {
  return String(value ?? "")
    .trim()
    .slice(0, 1000);
}
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
