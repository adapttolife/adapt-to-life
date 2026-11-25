// Joining a list (docs/EMAIL.md, "Contacts, lists and unsubscribing").
//
// One row per brand and address in newsletter_signups (agent-mail D1), written
// BEFORE Resend is called. Then three steps, each stamped when it is done:
//
//   contact  the contact exists in the Resend team and is in the brand's Segment
//   topic    the contact is opted in to the brand's Topic (its permission for
//            that brand's mail); if they had left everything (the team wide
//            `unsubscribed` flag), joining clears it, which is safe because every
//            brand Topic is opt_out: it only re-opens lists they each said yes to
//   welcome  the brand Topic is checked, then the welcome goes out through the
//            mail module, rendered once and resent byte for byte under the same
//            Idempotency-Key inside the 23 hour window (src/mail-window.js)
//
// The first try runs right after the response; the cron (sweepSignups) finishes
// any step that did not complete. A half-finished signup never answers "already
// on the list": only a row whose contact and Topic steps are done does.
//
// Someone already in the team (another brand's list, a beta tester) still gets
// this brand's Topic and welcome. Someone who was on this brand's list before
// the ledger existed (Nov 25 2026) and joins again gets the Topic, not a second
// welcome. Outside production nothing is written to Resend for an address that
// is not on MAIL_ALLOW.
import { mailAllowed } from "./mail-transport.js";
import { recordTransactionalFailure } from "./email.js";
import { brandFor, segmentIdFor, topicIdFor } from "./newsletter-brands.js";
import {
  WELCOME_FOR,
  brandStatus,
  continueSeries,
  hadWelcome,
  listMessage,
  normalizeEmail,
  refused,
  resendCall,
  ResendCallError,
  sendListMessage,
} from "./newsletter-series.js";
import {
  RETRY_WINDOW_MS,
  nextAttemptAt,
  retryDelayMs,
  windowRefusal,
} from "./mail-window.js";

const fail = {
  ok: false,
  status: 502,
  error: "Sign-up is temporarily unavailable. Please try again soon.",
};
// Contact and Topic steps are safe to repeat; they stop for a person after this
// many tries (about a day with the shared backoff).
export const MAX_SIGNUP_ATTEMPTS = 10;
const ownEnv = (env) => env.ENV_NAME || "production";
const nowIso = () => new Date().toISOString();

export function signupConfigured(env, brandKey = "atl") {
  const brand = brandFor(brandKey);
  return Boolean(
    brand &&
    env.AGENT_MAIL_DB &&
    env.RESEND_API_KEY &&
    segmentIdFor(env, brand) &&
    topicIdFor(env, brand),
  );
}

// Record the join and start the steps. Answers before Resend is reached: the
// row is the promise, and the sweep keeps it. `ctx.waitUntil` runs the first
// try after the response; without a ctx it runs before returning.
export async function safeNewsletterSubscribe(
  env,
  input,
  source = "",
  { brand: brandKey = "atl", name = "", ctx } = {},
) {
  if (!signupConfigured(env, brandKey)) return { ...fail, status: 503 };
  const db = env.AGENT_MAIL_DB;
  const email = normalizeEmail(input);
  const first = typeof name === "string" ? name.trim().slice(0, 60) : "";
  const where = "env=? AND brand=? AND email=?";
  const key = [ownEnv(env), brandKey, email];
  let existing = false;
  try {
    const inserted = await db
      .prepare(
        "INSERT INTO newsletter_signups (env,brand,email,name,source,joined_at) VALUES (?,?,?,?,?,?) ON CONFLICT(env,brand,email) DO NOTHING RETURNING email",
      )
      .bind(...key, first || null, String(source || "").slice(0, 80), nowIso())
      .first();
    if (!inserted) {
      const row = await db
        .prepare(
          `SELECT state,contact_at,topic_at FROM newsletter_signups WHERE ${where}`,
        )
        .bind(...key)
        .first();
      if (row?.contact_at && row?.topic_at) {
        existing = true;
        // On the list as far as this ledger knows. They may have left since
        // through Resend's own preference page, which this ledger never hears
        // about, so a finished signup re-checks its Topic (no second welcome:
        // welcome_at is kept). One in progress is left to finish.
        if (row.state !== "done") return { ok: true, existing: true };
        await db
          .prepare(
            `UPDATE newsletter_signups SET topic_at=NULL,state='pending',next_attempt_at=NULL,attempts=0,error=NULL WHERE ${where} AND state='done'`,
          )
          .bind(...key)
          .run();
      } else {
        // Half finished, parked for a person, or unsubscribed since: finish it
        // again now. A running row is left to its owner (the sweep recovers it).
        // A welcome first tried more than 24 hours ago is past Resend's memory
        // of its key, so this new signup gets a fresh copy and a fresh window.
        const stale = new Date(Date.now() - 24 * 3600e3).toISOString();
        await db
          .prepare(
            `UPDATE newsletter_signups SET state='pending',next_attempt_at=NULL,unsubscribed_at=NULL,attempts=0,error=NULL,
               welcome_rendered=CASE WHEN welcome_at IS NULL AND welcome_first_attempted_at<? THEN NULL ELSE welcome_rendered END,
               welcome_first_attempted_at=CASE WHEN welcome_at IS NULL AND welcome_first_attempted_at<? THEN NULL ELSE welcome_first_attempted_at END
             WHERE ${where} AND state<>'running'`,
          )
          .bind(stale, stale, ...key)
          .run();
      }
    }
  } catch (error) {
    console.error("newsletter signup not recorded", {
      brand: brandKey,
      reason: String(error?.message || error).slice(0, 200),
    });
    return fail;
  }
  const run = processSignup(env, brandKey, email).catch((error) =>
    console.error("newsletter signup step failed", {
      brand: brandKey,
      reason: String(error?.message || error).slice(0, 200),
    }),
  );
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(run);
  else await run;
  return existing ? { ok: true, existing: true } : { ok: true };
}

const enc = encodeURIComponent;

// Step 1: the contact exists and is in the brand's Segment. A missing contact is
// created; an existing one (found first, or a 409 on create) is added to the
// Segment and otherwise left alone.
async function ensureContact(env, brand, email, name) {
  const segment = segmentIdFor(env, brand);
  const found = await resendCall(env, "GET", `/contacts/${enc(email)}`);
  if (found.status === 404) {
    const body = { email, unsubscribed: false, segments: [{ id: segment }] };
    if (name) body.first_name = name;
    const made = await resendCall(env, "POST", "/contacts", body);
    if (made.ok) {
      const contact = await made.json().catch(() => null);
      // Accepted without an id: unclear, and safe to look again later.
      if (!contact?.id)
        throw new ResendCallError("Resend returned no contact id", { retryable: true });
      return { id: contact.id, created: true };
    }
    if (made.status !== 409) throw await refused(made, "create the contact");
  } else if (!found.ok) {
    throw await refused(found, "look up the contact");
  }
  const joined = await resendCall(
    env,
    "POST",
    `/contacts/${enc(email)}/segments/${enc(segment)}`,
  );
  if (!joined.ok && joined.status !== 409)
    throw await refused(joined, "add the contact to the brand's Segment");
  return { id: null, created: false };
}

// Step 2: opted in to the brand's Topic, and the team wide flag cleared if they
// had left everything (docs/EMAIL.md: safe, every brand Topic is opt_out).
async function optIn(env, brand, email, { justCreated = false } = {}) {
  const topic = topicIdFor(env, brand);
  const res = await resendCall(env, "PATCH", `/contacts/${enc(email)}/topics`, [
    { id: topic, subscription: "opt_in" },
  ]);
  if (!res.ok) throw await refused(res, "opt the contact in to the brand's Topic");
  // A contact made a moment ago with unsubscribed:false needs no second look.
  if (justCreated) return;
  const contact = await resendCall(env, "GET", `/contacts/${enc(email)}`);
  if (!contact.ok) throw await refused(contact, "look up the contact");
  if ((await contact.json())?.unsubscribed) {
    const cleared = await resendCall(env, "PATCH", `/contacts/${enc(email)}`, {
      unsubscribed: false,
    });
    if (!cleared.ok) throw await refused(cleared, "clear the contact's team wide flag");
  }
}

// Writes to this Worker's row. `onlyRunning` keeps a late write from undoing a
// state another path already settled (a finished send, an unsubscribe).
async function save(db, key, fields, { onlyRunning = false } = {}) {
  const keys = Object.keys(fields);
  await db
    .prepare(
      `UPDATE newsletter_signups SET ${keys.map((k) => `${k}=?`).join(",")} WHERE env=? AND brand=? AND email=?${onlyRunning ? " AND state='running'" : ""}`,
    )
    .bind(...keys.map((k) => fields[k]), key.env, key.brand, key.email)
    .run();
}

// The welcome as it will go out on every attempt, and the start of its window,
// written together before the first call to Resend and never changed after.
async function frozenWelcome(env, db, brand, email, claim) {
  const key = [ownEnv(env), brand.key, email];
  if (claim.welcome_rendered && claim.welcome_first_attempted_at)
    return {
      msg: JSON.parse(claim.welcome_rendered),
      firstAttemptedAt: claim.welcome_first_attempted_at,
      first: false,
    };
  const msg = await listMessage(env, email, WELCOME_FOR[brand.key]);
  await db
    .prepare(
      "UPDATE newsletter_signups SET welcome_rendered=COALESCE(welcome_rendered,?),welcome_first_attempted_at=COALESCE(welcome_first_attempted_at,?) WHERE env=? AND brand=? AND email=?",
    )
    .bind(JSON.stringify(msg), nowIso(), ...key)
    .run();
  const saved = await db
    .prepare(
      "SELECT welcome_rendered,welcome_first_attempted_at FROM newsletter_signups WHERE env=? AND brand=? AND email=?",
    )
    .bind(...key)
    .first();
  if (!saved?.welcome_rendered || !saved.welcome_first_attempted_at)
    throw new Error("Rendered welcome was not stored");
  return {
    msg: JSON.parse(saved.welcome_rendered),
    firstAttemptedAt: saved.welcome_first_attempted_at,
    first: true,
  };
}

// One pass over a signup's unfinished steps, if it is due and this Worker owns
// it. The outcome is written to the row; it throws only if D1 itself fails.
export async function processSignup(env, brandKey, input) {
  const db = env.AGENT_MAIL_DB;
  const brand = brandFor(brandKey);
  const email = normalizeEmail(input);
  const at = nowIso();
  const claim = await db
    .prepare(
      "UPDATE newsletter_signups SET state='running',attempts=attempts+1,started_at=?,error=NULL WHERE env=? AND brand=? AND email=? AND state='pending' AND (next_attempt_at IS NULL OR next_attempt_at<=?) RETURNING *",
    )
    .bind(at, ownEnv(env), brandKey, email, at)
    .first();
  if (!claim) return { state: "skipped" };
  const key = { env: ownEnv(env), brand: brandKey, email };
  const done = (fields = {}) =>
    save(db, key, { state: "done", next_attempt_at: null, ...fields });
  // Whether they left this list while this pass was running (the row's
  // unsubscribed_at, set by unsubscribe()). Checked before any step that
  // would opt them in or mail them.
  const leftSince = async () =>
    Boolean(
      (
        await db
          .prepare(
            "SELECT unsubscribed_at FROM newsletter_signups WHERE env=? AND brand=? AND email=?",
          )
          .bind(key.env, key.brand, key.email)
          .first()
      )?.unsubscribed_at,
    );

  // They left this brand's list after joining: the open steps stop here. Without
  // this the topic step would opt them back in. Signing up again clears it.
  if (claim.unsubscribed_at) {
    await done({ note: "unsubscribed before the signup finished" });
    return { state: "done", unsubscribed: true };
  }

  // Outside production only team addresses reach Resend at all.
  if (!mailAllowed(env, email)) {
    await done({
      note: `Not added: ${ownEnv(env)} writes only MAIL_ALLOW addresses to Resend`,
    });
    return { state: "done", dropped: true };
  }

  let step = "contact";
  let msg;
  let firstAttemptedAt;
  let firstSend = false;
  let sendStarted = false;
  let windowClosed = false;
  try {
    let contact = { id: null, created: false };
    if (!claim.contact_at) {
      contact = await ensureContact(env, brand, email, claim.name);
      await save(db, key, { contact_at: nowIso() });
    }
    step = "topic";
    if (!claim.topic_at) {
      if (await leftSince()) {
        await done({ note: "unsubscribed before the signup finished" });
        return { state: "done", unsubscribed: true };
      }
      await optIn(env, brand, email, { justCreated: contact.created });
      await save(db, key, { topic_at: nowIso() });
    }
    step = "welcome";
    if (!claim.welcome_at) {
      let skip = null;
      if (env.WELCOME_SERIES !== "on") skip = "welcome off (WELCOME_SERIES)";
      else if (
        !claim.welcome_first_attempted_at &&
        brand.key === "atl" &&
        (await hadWelcome(env, email))
      )
        skip = "welcomed before the signup ledger";
      else {
        // Every list email checks the brand Topic first (docs/EMAIL.md).
        const status = await brandStatus(env, email, brand.key);
        if (status !== "subscribed") skip = `not sent: ${status}`;
      }
      if (skip) {
        await done({ welcome_at: nowIso(), note: skip });
        return { state: "done", welcome: "skipped" };
      }
      let first;
      ({ msg, firstAttemptedAt, first } = await frozenWelcome(
        env,
        db,
        brand,
        email,
        claim,
      ));
      const refusal = windowRefusal(firstAttemptedAt);
      if (refusal) {
        windowClosed = true;
        throw new Error(refusal);
      }
      firstSend = first;
      sendStarted = true;
      const sent = await sendListMessage(env, msg);
      if (sent.dropped) {
        await done({
          welcome_at: nowIso(),
          note: `Not sent: dropped outside production (${sent.reason})`,
        });
        return { state: "done", welcome: "dropped" };
      }
      if (!sent.id)
        throw Object.assign(new Error("Resend returned no message id"), {
          retryable: true,
        });
      await done({ welcome_at: nowIso(), welcome_id: sent.id });
      // The send is settled; a hiccup recording the journey must not undo it.
      if (brand.key === "atl")
        await continueSeries(env, email, { contactId: contact.id }).catch((e) =>
          console.error("welcome journey not recorded", String(e?.message || e)),
        );
      return { state: "done", welcome: "sent", id: sent.id };
    }
    await done();
    return { state: "done" };
  } catch (err) {
    const error = `${step}: ${String(err?.message || err)}`.slice(0, 400);
    // After a welcome send began, only a retryable failure retries, and only
    // inside the window. Before that every step is safe to repeat: a refusal
    // Resend calls final goes to a person, anything else (a timeout, a 429, a
    // missing link secret) tries again with backoff, up to the cap.
    let next = null;
    if (windowClosed) next = null;
    else if (sendStarted)
      next =
        err?.retryable === true
          ? nextAttemptAt(firstAttemptedAt, claim.attempts)
          : null;
    else if (err?.retryable !== false && claim.attempts < MAX_SIGNUP_ATTEMPTS)
      next = new Date(Date.now() + retryDelayMs(claim.attempts)).toISOString();
    const state = next ? "pending" : "review";
    await save(db, key, { state, next_attempt_at: next, error }, { onlyRunning: true });
    console.error("newsletter signup step failed", {
      brand: brandKey,
      step,
      state,
      error,
    });
    // A person hears about it: when it stops, on the first failed welcome send,
    // and on a first failure that is not a passing one (a missing secret, say).
    if (
      state === "review" ||
      (sendStarted && firstSend) ||
      (claim.attempts === 1 && err?.retryable !== true)
    )
      await recordTransactionalFailure(
        env,
        `newsletter:${brandKey} ${step}`,
        email,
        err,
      );
    return { state, error };
  }
}

// Cron: signups cut off mid step, then everything due, a few at a time (each
// is several Resend calls, and Resend allows a few a second).
export async function sweepSignups(env, { limit = 10 } = {}) {
  const db = env.AGENT_MAIL_DB;
  if (!db || !env.RESEND_API_KEY) return { processed: 0 };
  const cut = new Date(Date.now() - 15 * 60e3).toISOString();
  const windowStart = new Date(Date.now() - RETRY_WINDOW_MS).toISOString();
  // Contact and Topic steps are safe to repeat. A welcome that may have been
  // sent is safe to repeat only with its frozen copy inside the window.
  const interrupted = await db
    .prepare(
      `UPDATE newsletter_signups SET state=CASE
         WHEN unsubscribed_at IS NOT NULL THEN 'done'
         WHEN welcome_at IS NOT NULL OR welcome_first_attempted_at IS NULL THEN 'pending'
         WHEN welcome_rendered IS NOT NULL AND welcome_first_attempted_at>? THEN 'pending'
         ELSE 'review' END,
       error='Interrupted; finishing the remaining steps'
       WHERE state='running' AND started_at<? AND env=?
       RETURNING brand,email,state`,
    )
    .bind(windowStart, cut, ownEnv(env))
    .all();
  for (const r of interrupted.results || [])
    if (r.state === "review")
      await recordTransactionalFailure(
        env,
        `newsletter:${r.brand} welcome`,
        r.email,
        new Error(
          "Interrupted welcome past its retry window; check Resend's log by tag before resending",
        ),
      );
  const due = await db
    .prepare(
      "SELECT brand,email FROM newsletter_signups WHERE state='pending' AND env=? AND (next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY joined_at LIMIT ?",
    )
    .bind(ownEnv(env), nowIso(), limit)
    .all();
  for (const r of due.results || []) {
    if (!signupConfigured(env, r.brand)) continue;
    await processSignup(env, r.brand, r.email);
  }
  return { processed: (due.results || []).length };
}
