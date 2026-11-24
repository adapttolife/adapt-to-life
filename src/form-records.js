import { mailConfigured } from "./mail-transport.js";
// Independent internal correspondence for contact/sponsor forms only.
// No historical backfill; no customer resend; no grant/volunteer audience expansion.
// Same mail rules as the form outbox (src/forms.js): each row belongs to the
// environment that wrote it, the send carries a stable Idempotency-Key
// (contact-original-<submission id>) over a body built only from the stored
// record, and a retryable failure retries with backoff inside the 23-hour window.
import {
  cfSend,
  HOUSE_BRAND,
  HOUSE_FROM,
  HOUSE_INBOX,
  esc,
  houseShell,
  recordTransactionalFailure,
} from "./email.js";
const now = () => new Date().toISOString();
const ownEnv = (env) => env.ENV_NAME || "production";
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const retryDelayMs = (attempts) =>
  Math.min(10 * 60e3 * 2 ** Math.max(0, attempts - 1), 3 * 60 * 60e3);
export function queueOriginal(db, id, payload, envName = "production") {
  return db
    .prepare(
      `INSERT OR IGNORE INTO form_record_deliveries(submission_id,env)
    SELECT id,? FROM form_submissions WHERE id=? AND kind='contact' AND payload=?`,
    )
    .bind(envName, id, payload);
}
export async function reconcileOriginal(env, id) {
  // Outside production there is no shared intake row to stamp (src/forms.js
  // keeps staging rows out of it); just close the step.
  if (ownEnv(env) !== "production") {
    await env.WAIVERS_DB.prepare(
      "UPDATE form_record_deliveries SET mirrored_at=COALESCE(mirrored_at,?) WHERE submission_id=? AND state='done'",
    )
      .bind(now(), id)
      .run();
    return;
  }
  const d = await env.WAIVERS_DB.prepare(
    "SELECT completed_at FROM form_record_deliveries WHERE submission_id=? AND state='done'",
  )
    .bind(id)
    .first();
  if (!d) return;
  const stamped = await env.INTAKE.prepare(
    "UPDATE intake SET notified_at=COALESCE(notified_at,?),notify_error=NULL WHERE id=? RETURNING id",
  )
    .bind(d.completed_at, id)
    .first();
  if (stamped)
    await env.WAIVERS_DB.prepare(
      "UPDATE form_record_deliveries SET mirrored_at=? WHERE submission_id=? AND state='done'",
    )
      .bind(now(), id)
      .run();
}
export async function processOriginal(env, id) {
  const db = env.WAIVERS_DB;
  const at = now();
  const claim = await db
    .prepare(
      "UPDATE form_record_deliveries SET state='running',attempts=attempts+1,started_at=?,first_attempted_at=COALESCE(first_attempted_at,?),error=NULL WHERE submission_id=? AND state='pending' AND env=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING attempts,first_attempted_at",
    )
    .bind(at, at, id, ownEnv(env), at)
    .first();
  if (!claim) {
    await reconcileOriginal(env, id);
    return;
  }
  let externalStarted = false;
  try {
    const row = await db
      .prepare("SELECT * FROM form_submissions WHERE id=?")
      .bind(id)
      .first();
    if (!row || row.kind !== "contact") throw Error("Original-record scope mismatch");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    )
      throw Error("Invalid case reference");
    const sub = JSON.parse(row.payload);
    if (!mailConfigured(env)) throw Error("Original-record mail binding missing");
    // Whitelist accepted contact fields, never forward challenge tokens or raw extras.
    const fields = {
      Reference: id,
      Received: row.received_at,
      Name: sub.name,
      Email: sub.email,
      Phone: sub.phone,
      Type: sub.type,
      Source: sub.source,
      Tier: sub.tier,
      Amount: sub.amount,
    };
    const sponsor = sub.type === "Giving or sponsoring";
    const subject = `ATL ${sponsor ? "sponsorship" : "contact"} request — ${id}`;
    const text =
      `Original website request. This is an automated intake record, not a human reply.\n${sponsor ? "Sponsorship interest is not a payment or commitment.\n" : ""}\n` +
      Object.entries(fields)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join("\n") +
      `\n\nOriginal message:\n${sub.message || ""}\n\nReply to the visitor to continue the conversation. Customer acknowledgment and CRM delivery have independent status; this record does not certify them.`;
    // Even an invalid/rejected visitor address cannot reject the house envelope.
    // Only a syntactically safe address becomes Reply-To; it remains body context otherwise.
    const replyTo =
      typeof sub.email === "string" &&
      /^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(sub.email)
        ? sub.email
        : HOUSE_INBOX;
    externalStarted = true;
    const result = await cfSend(env, {
      from: HOUSE_FROM,
      to: HOUSE_INBOX,
      replyTo,
      subject,
      text,
      html: houseShell(`<div style="white-space:pre-wrap">${esc(text)}</div>`),
      headers: {
        "Auto-Submitted": "auto-generated",
        "X-ATL-Form": "contact",
        "X-ATL-Record": "original-request",
        "X-ATL-Intake-ID": id,
      },
      idempotencyKey: `contact-original-${id}`,
      tags: { brand: HOUSE_BRAND, kind: "contact-original" },
    });
    const dropped = !!result?.dropped;
    if (!dropped && (typeof result?.messageId !== "string" || !result.messageId.trim()))
      throw Error("Original-record acceptance uncertain: missing provider ID");
    await db
      .prepare(
        "UPDATE form_record_deliveries SET state='done',completed_at=?,receipt=?,error=?,next_attempt_at=NULL WHERE submission_id=? AND state='running'",
      )
      .bind(
        now(),
        JSON.stringify(
          dropped
            ? { dropped: true, reason: result.reason }
            : {
                messageId: result.messageId,
                provider: result.provider || "cloudflare",
                status: "accepted",
                to: HOUSE_INBOX,
              },
        ),
        dropped ? `Not sent: dropped outside production (${result.reason})` : null,
        id,
      )
      .run();
  } catch (e) {
    const age = Date.now() - Date.parse(claim.first_attempted_at || at);
    const retry = !externalStarted || (e?.retryable === true && age < RETRY_WINDOW_MS);
    await db
      .prepare(
        "UPDATE form_record_deliveries SET state=?,error=?,next_attempt_at=? WHERE submission_id=? AND state='running'",
      )
      .bind(
        retry ? "pending" : "review",
        String(e.message).slice(0, 400),
        retry && externalStarted
          ? new Date(Date.now() + retryDelayMs(claim.attempts)).toISOString()
          : null,
        id,
      )
      .run();
    if (externalStarted && (!retry || claim.attempts === 1))
      await recordTransactionalFailure(env, "receipt:contact original", HOUSE_INBOX, e);
    return;
  }
  // Cross-DB projection can retry after success without ever re-sending mail.
  await reconcileOriginal(env, id);
}
export async function recoverOriginals(env) {
  const db = env.WAIVERS_DB,
    cut = new Date(Date.now() - 15 * 60e3).toISOString();
  // Resend collapses a repeat of the same key and body for 24 hours, so an
  // interrupted Resend send inside the window can go again; others need review.
  const windowStart = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
  await db
    .prepare(
      `UPDATE form_record_deliveries SET
         state=CASE WHEN ?=1 AND first_attempted_at>? THEN 'pending' ELSE 'review' END,
         error='Interrupted original send: verify provider before retry'
       WHERE state='running' AND started_at<? AND env=?`,
    )
    .bind(env.MAIL_TRANSPORT === "resend" ? 1 : 0, windowStart, cut, ownEnv(env))
    .run();
  const rows = await db
    .prepare(
      "SELECT submission_id FROM form_record_deliveries WHERE env=? AND ((state='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?)) OR (state='done' AND mirrored_at IS NULL)) ORDER BY submission_id LIMIT 25",
    )
    .bind(ownEnv(env), now())
    .all();
  await Promise.allSettled(
    (rows.results || []).map((r) => processOriginal(env, r.submission_id)),
  );
}
