import { mailConfigured, sendMail } from "./mail-transport.js";
// Durable acceptance, independent delivery steps, one scheduled recovery owner.
// No marketing enrollment. Raw application detail never enters shared intake.
//
// Mail rules (docs/EMAIL.md, "How a site sends"):
// - Every row records the environment that created it (`env`). Staging and
//   production share this database, so each Worker only ever sends its own rows.
// - The receipt is rendered once, stored in `rendered`, and every attempt sends
//   exactly that under the same Idempotency-Key, so Resend can collapse a retry
//   after a lost response instead of mailing the person twice.
// - A retryable failure (429, 5xx, timeout) goes back to pending with backoff
//   for up to 23 hours from the first attempt (Resend remembers a key for 24),
//   then to review. Any other failure goes straight to review.
// - A send the transport dropped outside production is done, with a note.
import {
  queueOriginal,
  processOriginal,
  recoverOriginals,
  reconcileOriginal,
} from "./form-records.js";
import { renderReceipt } from "./receipts.js";
import { recordTransactionalFailure } from "./email.js";

const KINDS = new Set(["contact", "apply", "volunteer"]);
const now = () => new Date().toISOString();
// The environment that owns a row. Rows written before `env` existed default to
// 'production' in the table, and so does a Worker without ENV_NAME.
export const ownEnv = (env) => env.ENV_NAME || "production";
export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
// 10, 20, 40, 80, 160 minutes, then every 3 hours until the window closes.
export const retryDelayMs = (attempts) =>
  Math.min(10 * 60e3 * 2 ** Math.max(0, attempts - 1), 3 * 60 * 60e3);
const pending = (db, id, channel, envName) =>
  db
    .prepare(
      "INSERT OR IGNORE INTO form_deliveries (submission_id,channel,env) VALUES (?,?,?)",
    )
    .bind(id, channel, envName);

export async function acceptForm(env, kind, sub, suppliedId, ctx) {
  if (!KINDS.has(kind)) throw Error("Unsupported form");
  const db = env.WAIVERS_DB;
  const id =
    typeof suppliedId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      suppliedId,
    )
      ? suppliedId
      : crypto.randomUUID();
  const payload = JSON.stringify(sub);
  try {
    if (!db || !env.INTAKE) throw Error("Required durable binding missing");
    // One D1 transaction. A success response is impossible before both source
    // and outbox exist. INSERT OR IGNORE never overwrites an accepted original.
    await db.batch([
      db
        .prepare(
          "INSERT OR IGNORE INTO form_submissions (id,kind,payload,received_at) VALUES (?,?,?,?)",
        )
        .bind(id, kind, payload, now()),
      ...["intake", "receipt"].map((channel) => pending(db, id, channel, ownEnv(env))),
      ...(kind === "contact" ? [queueOriginal(db, id, payload, ownEnv(env))] : []),
    ]);
    const stored = await db
      .prepare("SELECT kind,payload FROM form_submissions WHERE id=?")
      .bind(id)
      .first();
    if (!stored || stored.kind !== kind || stored.payload !== payload) {
      return {
        ok: false,
        status: 409,
        error:
          "This submission changed during a retry. Please reopen the form and try again.",
      };
    }
    // waitUntil is an acceleration only. The persisted outbox is the guarantee.
    if (ctx?.waitUntil)
      ctx.waitUntil(
        processForm(env, id).catch((e) =>
          console.error("form dispatch failed", id, e.message),
        ),
      );
    return { ok: true, status: 200, id };
  } catch (e) {
    console.error("form acceptance failed", kind, e.message);
    return {
      ok: false,
      status: 503,
      error:
        "Your message has not been saved. Please try again or email hello@adapttolife.org.",
    };
  }
}

export function intakeProjection(row, sub) {
  const sponsor = row.kind === "contact" && sub.type === "Giving or sponsoring";
  const kind = sponsor ? "sponsor" : row.kind;
  const details =
    row.kind === "apply"
      ? {
          note: "Application received. Sensitive details remain in the restricted application record.",
        }
      : row.kind === "volunteer"
        ? { roles: sub.roles, source: sub.source }
        : {
            type: sub.type,
            source: sub.source,
            tier: sub.tier || "",
            amount: sub.amount || "",
          };
  return { kind, summary: `New ${kind}: ${sub.name}`, details };
}

async function mirror(env, row, sub) {
  const { kind, summary, details } = intakeProjection(row, sub);
  // Stable ID makes retries safe across the two databases. The existing shared
  // intake worker owns internal notification; the existing host sync owns Sheets.
  const original = await env.WAIVERS_DB.prepare(
    "SELECT submission_id FROM form_record_deliveries WHERE submission_id=?",
  )
    .bind(row.id)
    .first();
  await env.INTAKE.batch([
    env.INTAKE.prepare(
      `INSERT OR IGNORE INTO intake
    (id,received_at,site,kind,name,email,phone,summary,payload,source,is_canary)
    VALUES (?,?,?,?,?,?,?,?,?,?,0)
    ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,
      sheet_synced_at=CASE WHEN intake.payload<>excluded.payload THEN NULL ELSE intake.sheet_synced_at END`,
    ).bind(
      row.id,
      row.received_at,
      "adapttolife.org",
      kind,
      sub.name,
      sub.email,
      sub.phone || null,
      summary,
      JSON.stringify(details),
      sub.source || `adapttolife.org/${row.kind}`,
    ),
    // New contact requests have their own durable original-email owner. Do not
    // also enqueue the old metadata-only notice. Other producers remain unchanged.
    ...(original
      ? []
      : [
          env.INTAKE.prepare(
            "INSERT OR IGNORE INTO intake_delivery_claims(intake_id,state) VALUES (?,'pending')",
          ).bind(row.id),
        ]),
  ]);
  const saved = await env.INTAKE.prepare("SELECT id FROM intake WHERE id=?")
    .bind(row.id)
    .first();
  if (!saved) throw Error("Intake mirror readback missing");
  await reconcileOriginal(env, row.id);
  return row.id;
}

async function finish(db, id, channel, state, receipt, error, nextAttemptAt = null) {
  await db
    .prepare(
      "UPDATE form_deliveries SET state=?,completed_at=?,receipt=?,error=?,next_attempt_at=? WHERE submission_id=? AND channel=? AND state='running'",
    )
    .bind(
      state,
      state === "done" ? now() : null,
      receipt || null,
      error || null,
      nextAttemptAt,
      id,
      channel,
    )
    .run();
}

// The receipt exactly as it will be sent on every attempt. Rendered on the first
// attempt only; a later attempt reads the stored copy back.
async function frozenReceipt(env, db, id, row, sub, stored) {
  if (stored) return JSON.parse(stored);
  const msg = await renderReceipt(
    { ...env, INTAKE_SEPARATE_NOTIFICATION: true, INTAKE_SUBMISSION_ID: id },
    row.kind,
    sub,
  );
  await db
    .prepare(
      "UPDATE form_deliveries SET rendered=? WHERE submission_id=? AND channel='receipt' AND rendered IS NULL",
    )
    .bind(JSON.stringify(msg), id)
    .run();
  const saved = await db
    .prepare("SELECT rendered FROM form_deliveries WHERE submission_id=? AND channel='receipt'")
    .bind(id)
    .first();
  if (!saved?.rendered) throw Error("Rendered receipt was not stored");
  return JSON.parse(saved.rendered);
}

export async function processForm(env, id) {
  const db = env.WAIVERS_DB;
  const row = await db
    .prepare("SELECT * FROM form_submissions WHERE id=?")
    .bind(id)
    .first();
  if (!row) throw Error("Missing durable form");
  const sub = JSON.parse(row.payload);
  async function deliver(channel) {
    // A conditional UPDATE is the cross-isolate lock. Running external sends
    // are NEVER blindly reclaimed: a crash may follow provider acceptance.
    // Only this environment's rows, and only once their backoff has passed.
    const at = now();
    const claim = await db
      .prepare(
        "UPDATE form_deliveries SET state='running',attempts=attempts+1,started_at=?,first_attempt_at=COALESCE(first_attempt_at,?),error=NULL WHERE submission_id=? AND channel=? AND state='pending' AND env=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING attempts,first_attempt_at,rendered",
      )
      .bind(at, at, id, channel, ownEnv(env), at)
      .first();
    if (!claim) return;
    let externalStarted = false;
    let msg;
    try {
      let receipt;
      let note = null;
      if (channel === "intake") receipt = await mirror(env, row, sub);
      else {
        if (!mailConfigured(env)) throw Error("Receipt mail binding missing");
        msg = await frozenReceipt(env, db, id, row, sub, claim.rendered);
        externalStarted = true;
        const sent = await sendMail(env, msg);
        if (sent?.dropped) {
          receipt = JSON.stringify({ dropped: true, reason: sent.reason });
          note = `Not sent: dropped outside production (${sent.reason})`;
        } else {
          if (typeof sent?.messageId !== "string" || !sent.messageId.trim())
            throw Error(
              "Email acceptance uncertain; review delivery ledger before retry",
            );
          // Provider correlation is not an RFC Message-ID or recipient delivery.
          // Keep the actual provider response, never a pre-minted success marker.
          receipt = JSON.stringify({
            messageId: sent.messageId,
            status: "accepted",
            provider: sent.provider || "cloudflare",
            to: msg.to,
            bcc: msg.bcc || null,
          });
        }
      }
      await finish(db, id, channel, "done", receipt, note);
    } catch (e) {
      const error = String(e.message).slice(0, 400);
      // Local failures before any send retry automatically. After a send began,
      // only an idempotent (Resend) retryable failure retries, inside the window;
      // anything ambiguous stays reviewable rather than duplicating mail.
      const age = Date.now() - Date.parse(claim.first_attempt_at || at);
      const retry =
        !externalStarted ||
        (e?.retryable === true && msg?.idempotencyKey && age < RETRY_WINDOW_MS);
      await finish(
        db,
        id,
        channel,
        retry ? "pending" : "review",
        null,
        error,
        retry && externalStarted
          ? new Date(Date.now() + retryDelayMs(claim.attempts)).toISOString()
          : null,
      );
      // A person hears about it: on the first failed send, and when it stops.
      if (externalStarted && (!retry || claim.attempts === 1))
        await recordTransactionalFailure(env, `receipt:${row.kind} receipt`, msg?.to, e);
    }
  }
  // Correspondence and the shared intake record run independently.
  await Promise.allSettled([
    processOriginal(env, id),
    deliver("receipt"),
    deliver("intake"),
  ]);
}

export async function sweepForms(env) {
  const db = env.WAIVERS_DB;
  if (!db) throw Error("WAIVERS_DB missing");
  const cut = new Date(Date.now() - 15 * 60e3).toISOString();
  // ClickUp was retired on 2026-10-02 (Alec: everything feeds the Google Sheet).
  // A ClickUp step queued before then has no deliverer; close it with the reason
  // instead of leaving the submission owed forever.
  await db
    .prepare(
      "UPDATE form_deliveries SET state='done',completed_at=?,error='ClickUp retired 2026-10-02; no task created' WHERE channel='clickup' AND state='pending'",
    )
    .bind(now())
    .run();
  // An interrupted Resend receipt with its frozen copy is safe to send again
  // inside the window (same key, same body); anything else needs a person.
  const windowStart = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
  await db
    .prepare(
      `UPDATE form_deliveries SET state=CASE
         WHEN channel='intake' THEN 'pending'
         WHEN ?=1 AND rendered IS NOT NULL AND first_attempt_at>? THEN 'pending'
         ELSE 'review' END,
       error='Interrupted delivery; inspect destination before retry'
       WHERE state='running' AND started_at<? AND env=?`,
    )
    .bind(env.MAIL_TRANSPORT === "resend" ? 1 : 0, windowStart, cut, ownEnv(env))
    .run();
  const rows = await db
    .prepare(
      "SELECT DISTINCT submission_id FROM form_deliveries WHERE state='pending' AND env=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY submission_id LIMIT 25",
    )
    .bind(ownEnv(env), now())
    .all();
  await Promise.allSettled([
    recoverOriginals(env),
    ...(rows.results || []).map((row) => processForm(env, row.submission_id)),
  ]);
  return { processed: (rows.results || []).length };
}
