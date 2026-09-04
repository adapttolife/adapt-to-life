// Public forms -> the Adapt To Life CRM.
//
// ClickUp stays where the work gets done: a contact needs a reply, an
// application needs a decision, a volunteer needs a conversation. This is the
// other half — the person also becomes a row someone can find next year, when
// the task is long closed. Alec's call, 2026-09-04: both, not either.
//
// The house rule these tabs obey (skills/relationship-machine): **automation
// proposes, a person curates.** Machines append to their OWN intake tab. The
// curated People tab stays a human's; promoting a real relationship into it is
// a judgement, not a sync.
//
// Shape: the handler writes ONE D1 row and returns. The ten-minute cron that
// files signed waivers drains the queue into the sheet. The submitter never
// waits on Google, and a Sheets outage delays rows instead of losing them.

import { googleToken } from "./google.js";
import { bookId, ensureTab, appendRow, text, hyperlink } from "./sheets.js";

// One entry per form. Adding the next one is a KIND, not a module: name the
// tab, name the columns, say how a row reads. Everything else is shared.
//
// On what is DELIBERATELY not here: a grant application carries disability
// detail and financial need, which is why `GRANTS_INBOX` exists as its own
// setting rather than going to the public hello@ address. The CRM is shared
// with people outside the review group, so the Applications tab carries who
// applied and a link — the case itself stays in ClickUp. Same reasoning, same
// boundary; the CRM answers "who", ClickUp holds "what".
export const KINDS = {
  contact: {
    tab: "Contacts",
    headers: ["Received", "Name", "Email", "Reason", "Message", "Source", "ClickUp", "Synced"],
    row: (r) => [r.received_at.slice(0, 10), text(r.name), text(r.email), text(r.detail),
                 text(clip(json(r.payload).message, 300)), text(r.source),
                 hyperlink(r.clickup_url, "Task"), stamp(r)],
  },
  application: {
    tab: "Applications",
    headers: ["Received", "Applicant", "Email", "Phone", "Source", "ClickUp", "Synced"],
    row: (r) => [r.received_at.slice(0, 10), text(r.name), text(r.email), text(r.phone),
                 text(r.source), hyperlink(r.clickup_url, "Application"), stamp(r)],
  },
  volunteer: {
    tab: "Volunteers",
    headers: ["Received", "Name", "Email", "Phone", "Based", "Time", "Roles", "ClickUp", "Synced"],
    row: (r) => [r.received_at.slice(0, 10), text(r.name), text(r.email), text(r.phone),
                 text(json(r.payload).based), text(json(r.payload).time), text(r.detail),
                 hyperlink(r.clickup_url, "Task"), stamp(r)],
  },
};

const BATCH = 25;

// Called from a form handler through ctx.waitUntil: one D1 insert, off the
// response path, and it never throws into the handler. A submitter who got a
// "thanks" must never see an error because a spreadsheet was busy.
export function queueIntake(env, ctx, intake) {
  if (!env.WAIVERS_DB || !KINDS[intake.kind]) return;
  const work = env.WAIVERS_DB.prepare(
    `INSERT INTO crm_intake (id, kind, received_at, name, email, phone, organization, source, detail, clickup_id, clickup_url, payload)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    crypto.randomUUID(), intake.kind, new Date().toISOString(),
    intake.name || "", intake.email || "", intake.phone || "", intake.organization || "",
    intake.source || "", intake.detail || "",
    intake.clickup_id || "", intake.clickup_url || "",
    JSON.stringify(intake.payload || {})
  ).run().catch((err) => console.error("crm intake queue failed:", err));
  if (ctx && ctx.waitUntil) ctx.waitUntil(work); 
  return work;
}

export async function runCrmIntakeSync(env) {
  if (!env.GOOGLE_SA_JSON) return;
  const sheetId = bookId(env, "atlCrm");
  if (!sheetId) return;

  let rows;
  try {
    rows = (await env.WAIVERS_DB.prepare(
      `SELECT * FROM crm_intake WHERE crm_synced_at IS NULL ORDER BY created_at ASC LIMIT ?`
    ).bind(BATCH).all()).results || [];
  } catch (err) { console.error("crm intake: D1 query failed:", err); return; }
  if (!rows.length) return;

  let token;
  try { token = await googleToken(env); }
  catch (err) { console.error("crm intake: token mint failed:", err); return; }

  // One ensureTab per KIND actually present in this batch, not per row.
  const ready = new Map();
  for (const row of rows) {
    const kind = KINDS[row.kind];
    if (!kind) { await fail(env, row.id, `unknown intake kind: ${row.kind}`); continue; }
    try {
      if (!ready.has(row.kind)) {
        await ensureTab(token, sheetId, kind.tab, kind.headers);
        ready.set(row.kind, true);
      }
      await appendRow(token, sheetId, kind.tab, kind.row(row));
      await env.WAIVERS_DB.prepare("UPDATE crm_intake SET crm_synced_at = ?, crm_error = NULL WHERE id = ?")
        .bind(new Date().toISOString(), row.id).run();
    } catch (err) {
      console.error("crm intake: failed for", row.id, err);
      await fail(env, row.id, String(err).slice(0, 400));
      // A 403 or an outage hits every row the same way; stop rather than burn
      // the batch on the same error 25 times. The next cron picks it back up.
      if (!ready.has(row.kind)) return;
    }
  }
}

async function fail(env, id, message) {
  try { await env.WAIVERS_DB.prepare("UPDATE crm_intake SET crm_error = ? WHERE id = ?").bind(message, id).run(); }
  catch { /* the console line at the call site is the record here */ }
}

function json(s) { try { return JSON.parse(s || "{}") || {}; } catch { return {}; } }
function clip(v, n) { const s = String(v == null ? "" : v).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; }
function stamp(r) { return new Date().toISOString().slice(0, 10); }
