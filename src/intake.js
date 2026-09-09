// Intake — every form submission across every Adapt To Life property lands here,
// and Alec gets an email about it.
//
// THE CONTRACT, and the reason each line of it exists:
//
//   1. The row is written BEFORE anything that can fail. If we cannot record the
//      submission we tell the submitter so, rather than losing them quietly.
//   2. The submitter's confirmation never waits on email or Sheets. Notification
//      happens after the response, through waitUntil.
//   3. Every side effect is a STAMP on the row (notified_at, sheet_synced_at),
//      never the success of a call. That is what makes this retryable: a retry
//      cannot double-send, a crash cannot lose a notification, and "did anyone
//      get told about this?" is a query rather than a guess.
//   4. Nothing here waits on a human remembering. The sweeper is a cron.
//
// There is no model, agent or judgement anywhere in this path. A form submission
// is deterministic code end to end. Something with judgement may READ this table
// later; nothing with judgement stands between a person and their record.

// Where notifications land. hello@adapttolife.org is the answer for all three
// properties (Alec, 2026-09-09). Overridable per environment so a review lane can
// prove delivery into an inbox that is actually readable from the box, which is
// the only way this path gets verified rather than assumed.
export const INTAKE_INBOX_DEFAULT = "hello@adapttolife.org";
export const INTAKE_FROM = "Adapt To Life Intake <hello@adapttolife.org>";
export const intakeInbox = (env) => (env && env.INTAKE_INBOX) || INTAKE_INBOX_DEFAULT;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Best-effort, never throws: a broken label must not break a submission. */
function line(k, v) {
  const s = String(v ?? "").trim();
  return s ? `${k}: ${s}\n` : "";
}

/**
 * Record one submission. Returns { ok, id } — callers decide the envelope.
 *
 * Throws nothing: a caller that cannot reach D1 gets { ok:false } and decides
 * whether that is fatal for its form. For forms whose primary store is elsewhere
 * (beehiiv, Airtable, ClickUp) intake is a mirror and a failure here must not
 * fail the submission; for forms where intake IS the store, it must.
 */
export async function recordIntake(env, entry) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  if (!env.INTAKE) {
    console.error("intake: INTAKE binding missing — submission not recorded", entry.kind);
    return { ok: false, id: null, error: "no INTAKE binding" };
  }
  try {
    await env.INTAKE.prepare(
      `INSERT INTO intake
         (id, received_at, site, kind, name, email, phone, summary, payload, source, is_canary)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id, now,
      entry.site || "unknown",
      entry.kind || "unknown",
      entry.name || null,
      entry.email || null,
      entry.phone || null,
      entry.summary || `${entry.kind} from ${entry.site}`,
      JSON.stringify(entry.payload ?? {}),
      entry.source || null,
      entry.isCanary ? 1 : 0
    ).run();
    // Some forms already have a notification Alec receives (the waiver receipt
    // BCCs him a copy of the signed release). Those are recorded for the shared
    // record and the sheet, but stamped as notified so the sweeper does not send
    // a second email about the same submission.
    if (entry.alreadyNotified) {
      await env.INTAKE.prepare(
        `UPDATE intake SET notified_at = ?, notify_error = 'covered by this form''s own receipt' WHERE id = ?`
      ).bind(now, id).run();
    }
    return { ok: true, id };
  } catch (err) {
    console.error("intake: insert failed:", err);
    return { ok: false, id: null, error: String(err) };
  }
}

/** The notification Alec actually reads. Plain, scannable, reply-to the person. */
function notificationBody(row) {
  let payload = {};
  try { payload = JSON.parse(row.payload || "{}"); } catch (_) { /* keep {} */ }

  const facts =
    line("Name", row.name) +
    line("Email", row.email) +
    line("Phone", row.phone) +
    line("Site", row.site) +
    line("Form", row.kind) +
    line("Source", row.source) +
    line("Received", row.received_at);

  const extras = Object.entries(payload)
    .filter(([k, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => line(k, typeof v === "object" ? JSON.stringify(v) : v))
    .join("");

  const text =
    `${row.summary}\n\n${facts}` +
    (extras ? `\n${extras}` : "") +
    `\nReply to this email to answer them directly.\n` +
    `\nintake id ${row.id}\n`;

  const html =
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1a15;max-width:620px">` +
    `<p style="margin:0 0 14px;font-size:17px"><strong>${esc(row.summary)}</strong></p>` +
    `<table style="border-collapse:collapse;margin:0 0 14px">` +
    [["Name", row.name], ["Email", row.email], ["Phone", row.phone],
     ["Site", row.site], ["Form", row.kind], ["Source", row.source],
     ["Received", row.received_at]]
      .filter(([, v]) => String(v ?? "").trim())
      .map(([k, v]) => `<tr><td style="padding:2px 14px 2px 0;color:#6b6b70">${esc(k)}</td><td style="padding:2px 0">${esc(v)}</td></tr>`)
      .join("") +
    Object.entries(payload)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => `<tr><td style="padding:2px 14px 2px 0;color:#6b6b70">${esc(k)}</td><td style="padding:2px 0">${esc(typeof v === "object" ? JSON.stringify(v) : v)}</td></tr>`)
      .join("") +
    `</table>` +
    `<p style="margin:0 0 14px;color:#6b6b70">Reply to this email to answer them directly.</p>` +
    `<p style="margin:0;color:#9a9aa0;font-size:12px">intake id ${esc(row.id)}</p></div>`;

  return { text, html };
}

/**
 * Notify on one row and stamp it. Returns true only if the stamp landed, because
 * an unstamped row is one the sweeper must pick up again.
 */
export async function notifyIntakeRow(env, row) {
  if (!env.SEND_EMAIL) {
    console.error("intake: SEND_EMAIL binding missing — cannot notify", row.id);
    await bumpAttempt(env, row.id, "no SEND_EMAIL binding");
    return false;
  }
  const { text, html } = notificationBody(row);
  const subject = row.is_canary
    ? `[canary] ${row.summary}`
    : row.summary;
  try {
    await env.SEND_EMAIL.send({
      from: INTAKE_FROM,
      to: intakeInbox(env),
      // Reply goes to the person who submitted, so answering is one tap.
      replyTo: row.email || intakeInbox(env),
      subject,
      text,
      html,
    });
  } catch (err) {
    console.error("intake: notify failed", row.id, err);
    await bumpAttempt(env, row.id, String(err).slice(0, 400));
    return false;
  }
  try {
    await env.INTAKE.prepare(
      `UPDATE intake SET notified_at = ?, notify_error = NULL WHERE id = ?`
    ).bind(new Date().toISOString(), row.id).run();
    return true;
  } catch (err) {
    // Sent but not stamped: the sweeper will send again. A duplicate
    // notification is a far smaller failure than a silent one.
    console.error("intake: stamp failed after send", row.id, err);
    return false;
  }
}

async function bumpAttempt(env, id, error) {
  try {
    await env.INTAKE.prepare(
      `UPDATE intake SET notify_attempts = notify_attempts + 1, notify_error = ? WHERE id = ?`
    ).bind(error, id).run();
  } catch (_) { /* the row still stands; the sweeper will find it */ }
}

/** Fetch and notify one row by id — the request path's fire-and-stamp. */
export async function notifyIntake(env, id) {
  try {
    const row = await env.INTAKE.prepare(`SELECT * FROM intake WHERE id = ?`).bind(id).first();
    if (!row) return false;
    return await notifyIntakeRow(env, row);
  } catch (err) {
    console.error("intake: notify lookup failed", id, err);
    return false;
  }
}

/**
 * The cron's job: anything still unnotified gets another try. This is what makes
 * an email outage a delay instead of a loss.
 */
export async function sweepIntake(env, limit = 25) {
  let rows = [];
  try {
    const res = await env.INTAKE.prepare(
      `SELECT * FROM intake
        WHERE notified_at IS NULL AND notify_attempts < 20
        ORDER BY received_at ASC LIMIT ?`
    ).bind(limit).all();
    rows = res.results || [];
  } catch (err) {
    console.error("intake: sweep query failed:", err);
    return { swept: 0, sent: 0, failed: 0 };
  }
  let sent = 0, failed = 0;
  for (const row of rows) {
    if (await notifyIntakeRow(env, row)) sent++; else failed++;
  }
  if (rows.length) console.log(`intake sweep: ${rows.length} owed, ${sent} sent, ${failed} failed`);
  return { swept: rows.length, sent, failed };
}

/**
 * The end-to-end canary. Writes a real row through the real path and notifies on
 * it, so a missing binding, a dropped secret or a stopped cron shows up as a
 * failing check rather than as a person nobody ever answered. Old canary rows
 * are swept so they never accumulate or look like people.
 */
export async function canaryIsFresh(env, hours = 6) {
  try {
    const cut = new Date(Date.now() - hours * 3600e3).toISOString();
    const row = await env.INTAKE.prepare(
      `SELECT COUNT(*) AS n FROM intake
        WHERE is_canary = 1 AND notified_at IS NOT NULL AND notified_at > ?`
    ).bind(cut).first();
    return (row?.n || 0) > 0;
  } catch (err) {
    // Fails closed: if we cannot tell, run one. A redundant canary costs an
    // email; a skipped one costs the guarantee.
    console.error("intake: canary freshness check failed:", err);
    return false;
  }
}

export async function runIntakeCanary(env, site) {
  const stamp = new Date().toISOString();
  const rec = await recordIntake(env, {
    site,
    kind: "canary",
    name: "Intake canary",
    email: intakeInbox(env),
    summary: `Intake canary from ${site}`,
    source: "scheduled-canary",
    payload: { note: "Automated end-to-end check. If this stops arriving, intake is broken.", at: stamp },
    isCanary: true,
  });
  if (!rec.ok) {
    console.error("intake canary: could not write a row —", rec.error);
    return { ok: false, stage: "write" };
  }
  const notified = await notifyIntake(env, rec.id);
  try {
    await env.INTAKE.prepare(
      `DELETE FROM intake WHERE is_canary = 1 AND received_at < ?`
    ).bind(new Date(Date.now() - 7 * 864e5).toISOString()).run();
  } catch (_) { /* housekeeping only */ }
  return { ok: notified, stage: notified ? "done" : "notify", id: rec.id };
}
