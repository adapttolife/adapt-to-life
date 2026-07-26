// Spec 32 — Cloudflare-native agent email (agents.adapttolife.org).
//
// Two entry points, both called from src/index.js:
//   handleEmail(message, env, ctx)      Cloudflare Email Worker — inbound mail for *@agents.adapttolife.org
//   handleAgentMailApi(request, env, url) authenticated HTTP API the agentos MCP calls
//
// Source of truth: D1 (env.AGENT_MAIL_DB) for threads/messages; R2 (env.AGENT_MAIL_BUCKET) for raw .eml.
// Humans read a write-through Airtable mirror (never on the agent hot path). Outbound via
// Cloudflare Email Sending (src/email.js cfSend). Airtable REST patterns reused from src/index.js.

import PostalMime from "postal-mime";
import { cfSend } from "./email.js";
import { resolveMarkdownBody } from "./md_render.js";
import { renderMarkdownChartPngs } from "./chart_png.js";
import { reportFooterHtml, reportLink } from "./report_view.js";

const STATUSES = ["new", "agent_working", "needs_review", "human", "replied", "resolved"];

// Spec 33 outbound caps. Applied to every caller (operator included): a runaway
// loop through the admin lane is still a loop.
// Spec 80 adds the TERMINAL halt the hourly throttle lacks: fleet agents are
// bell-allowlisted both ways, so two agents replying forever is a slow-motion
// loop the hourly cap only paces. Past repliesPerThreadPerDay the thread flips
// needs_review — a human ends the conversation, not a faster retry.
const SEND_LIMITS = { perThreadPerHour: 5, perInboxPerHour: 20, repliesPerThreadPerDay: 6 };

// Outbound attachments. API callers pass base64; the Email Sending binding wants
// raw bytes. Executable types are refused: agents send reports and data files,
// never programs.
//
// Cloudflare Email Sending caps TOTAL MESSAGE size at 5 MiB for ordinary
// recipients, but 25 MiB when every recipient is a verified Email Routing
// destination address. Our whole fleet plus Alec are verified, which is the
// case that actually matters — a full-resolution print file is ~5-10 MB and was
// being refused for no platform reason.
//
// Sizing: MIME base64 inflates payloads by 4/3, plus ~2.7% for CRLF line breaks
// (~1.37x total), and the body/headers ride along too. So the DECODED budget is
// the message cap divided by ~1.37, less headroom for the body.
//
// This also fixes a latent bug: the old 4 MiB decoded limit became ~5.5 MiB on
// the wire, already OVER the 5 MiB unverified cap. It only ever worked because
// nothing had yet sent an attachment that large to an unverified recipient.
const OUT_ATTACHMENT_LIMITS = {
  count: 4,
  totalBytes: 3.5 * 1024 * 1024,          // 5 MiB cap  -> ~4.8 MiB on the wire
};
const OUT_ATTACHMENT_LIMITS_VERIFIED = {
  count: 10,
  totalBytes: 17 * 1024 * 1024,           // 25 MiB cap -> ~23.3 MiB on the wire
};

// Verified Email Routing destinations. Regenerate with:
//   cfrun bash -c 'curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
//     "https://api.cloudflare.com/client/v4/accounts/<acct>/email/routing/addresses?per_page=50"'
// Verification is a manual step Alec performs in the dashboard, so this list
// changes rarely; an address missing here just gets the smaller (safe) budget.
const VERIFIED_DESTINATIONS = new Set([
  "alec@alecability.com",
  "charlie@alectranel.com",
  "cheech@agents.adapttolife.org",
  "hello@agents.adapttolife.org",
  "julia@agents.adapttolife.org",
  "julia@alectranel.com",
  "julio@agents.adapttolife.org",
  "nick@libertyoneim.com",
  "stingel@alectranel.com",
]);

// Every recipient must be verified to earn the larger budget — the platform cap
// applies to the message, so one unverified recipient governs the whole send.
export function attachmentLimitsFor(recipients) {
  const list = (Array.isArray(recipients) ? recipients : [recipients])
    .filter(Boolean)
    .map((r) => String(r).toLowerCase().trim());
  if (!list.length) return OUT_ATTACHMENT_LIMITS;
  return list.every((r) => VERIFIED_DESTINATIONS.has(r))
    ? OUT_ATTACHMENT_LIMITS_VERIFIED
    : OUT_ATTACHMENT_LIMITS;
}
const OUT_ATTACHMENT_BLOCKED = /\.(exe|dll|bat|cmd|com|scr|jar|msi|ps1|sh|vbs|js|apk|html?)$/i;

// Validate + decode API attachments ([{filename, content_b64, type?}]) into the
// cfSend shape. Returns { list, note } on success ({ list: undefined } when the
// field is absent), or { error: <422 message> } on bad input. `note` is a short
// human-readable suffix recorded with the message body so attachments are
// visible in thread reads and the Airtable mirror without a schema change.
function decodeOutAttachments(raw, recipients) {
  if (raw === undefined || raw === null) return { list: undefined, note: "" };
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "attachments must be a non-empty array of {filename, content_b64, type?}" };
  }
  const limits = attachmentLimitsFor(recipients);
  if (raw.length > limits.count) {
    return { error: `at most ${limits.count} attachments per message` };
  }
  const list = [];
  const names = [];
  let total = 0;
  for (const a of raw) {
    const filename = String((a && a.filename) || "").trim().replace(/[/\\]/g, "_").slice(0, 120);
    if (!filename || !(a && a.content_b64)) return { error: "each attachment needs filename and content_b64" };
    if (OUT_ATTACHMENT_BLOCKED.test(filename)) return { error: `attachment type not allowed: ${filename}` };
    let bytes;
    try {
      const bin = atob(String(a.content_b64).replace(/\s+/g, ""));
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return { error: `attachment ${filename}: content_b64 is not valid base64` };
    }
    total += bytes.byteLength;
    if (total > limits.totalBytes) {
      const mib = (limits.totalBytes / 1048576).toFixed(1);
      const hint = limits === OUT_ATTACHMENT_LIMITS
        ? " (recipient is not a verified Email Routing destination, so the platform caps this message at 5 MiB; verified destinations get 25 MiB)"
        : "";
      return { error: `attachments exceed ${limits.totalBytes} decoded bytes total (${mib} MiB)${hint}` };
    }
    list.push({
      filename,
      content: bytes.buffer,
      type: String((a && a.type) || "application/octet-stream"),
      disposition: "attachment",
    });
    names.push(`${filename} (${(bytes.byteLength / 1024).toFixed(1)} KB)`);
  }
  return { list, note: `\n\n[attachments: ${names.join(", ")}]` };
}

// Spec 70 P2 — line/scatter chart blocks in body_markdown render to inline
// PNGs (cid-referenced) at this one choke point, shared by /send and /reply.
// Only the default register runs the pipeline: an explicit body_html wins
// unchanged (Spec 53), and then no markdown render happens at all. Returns
// { images, attachments } and never throws — a failed PNG leaves its block
// to chart_render.js's table degrade inside resolveMarkdownBody.
async function chartPngsFor(body) {
  const b = body || {};
  if (b.body_markdown == null || b.body_html != null) return { images: undefined, attachments: [] };
  return await renderMarkdownChartPngs(b.body_markdown);
}

// cfSend attachment list = caller attachments + generated inline chart PNGs
// (undefined when there is neither, matching cfSend's optional field).
function mergeAttachments(list, chartAttachments) {
  if (!chartAttachments || chartAttachments.length === 0) return list;
  return [...(list || []), ...chartAttachments];
}

// Spec 53 — email house style: body_markdown is the default register for
// ordinary agent mail. When present, the Worker renders reading-view HTML and
// derives the plain-text fallback at this one choke point, so every agent and
// harness inherits the same polish. Explicit body_html/body_text always win
// (the report register — Scorecard weekly, Cheech weekly-report — ships its
// own reviewed HTML and is untouched by this).

// Spec 33 loop prevention: machine-generated mail (bounces, auto-replies,
// out-of-office, no-reply senders) is archived like everything else but is never
// a valid reply target — replying to an auto-responder is how mail loops start.
// Returns a short reason string, or null for human mail.
export function classifyMachine(parsed, fromAddr) {
  const headers = {};
  for (const h of parsed.headers || []) headers[String(h.key).toLowerCase()] = String(h.value || "");

  const autoSubmitted = headers["auto-submitted"];
  if (autoSubmitted && autoSubmitted.trim().toLowerCase() !== "no") return "auto-submitted";
  const precedence = (headers["precedence"] || "").trim().toLowerCase();
  if (["bulk", "junk", "auto_reply", "list"].includes(precedence)) return `precedence:${precedence}`;
  if ("x-auto-response-suppress" in headers) return "x-auto-response-suppress";
  if ("x-autoreply" in headers || "x-autorespond" in headers) return "x-autoreply";

  const local = String(fromAddr || "").toLowerCase().split("@")[0];
  if (/^(mailer-daemon|postmaster|bounce|bounces)$/.test(local) || /(^|[-._])(no-?reply|do-?not-?reply)([-._]|$)/.test(local)) {
    return "sender:" + local;
  }

  const subject = String(parsed.subject || "");
  if (/^(auto:|automatic reply|out of office|autoreply)/i.test(subject) || /delivery status notification|undeliverable|mail delivery failed/i.test(subject)) {
    return "subject:auto";
  }
  return null;
}

// ───────────────────────── inbound ─────────────────────────

export async function handleEmail(message, env, ctx) {
  // Read the raw message once so we can both parse it and archive it to R2.
  const rawBuf = await new Response(message.raw).arrayBuffer();
  const parsed = await PostalMime.parse(rawBuf);

  const inbox = String(message.to || "").toLowerCase().trim();
  const fromAddr = (parsed.from && parsed.from.address) || String(message.from || "").toLowerCase();
  const subject = parsed.subject || "(no subject)";
  const messageId = parsed.messageId || null;
  const inReplyTo = parsed.inReplyTo || (Array.isArray(parsed.references) ? parsed.references[parsed.references.length - 1] : null);

  // Archive the raw message + attachments in R2; D1 stores the pointer.
  const r2Key = `raw/${inbox}/${isoDay()}/${crypto.randomUUID()}.eml`;
  await env.AGENT_MAIL_BUCKET.put(r2Key, rawBuf, {
    httpMetadata: { contentType: "message/rfc822" },
    customMetadata: { inbox, from: fromAddr, message_id: messageId || "" },
  });

  const db = env.AGENT_MAIL_DB;
  const thread = await findOrCreateThread(db, { inbox, fromAddr, subject, inReplyTo });
  const machine = classifyMachine(parsed, fromAddr);

  const msgId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO messages (id, thread_id, direction, from_addr, to_addr, subject, body_text, r2_key, message_id, in_reply_to, is_machine)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(msgId, thread.id, fromAddr, inbox, subject, parsed.text || "", r2Key, messageId, inReplyTo, machine ? 1 : 0)
    .run();

  await db
    .prepare(`UPDATE threads SET last_at = datetime('now') WHERE id = ?`)
    .bind(thread.id)
    .run();

  // Inbox locks: an inbox with `inbox_locks` rows accepts WORKING mail only from
  // its listed senders. Everyone else's mail is still captured and mirrored (the
  // record never drops), but the thread lands `resolved` — out of the agent's
  // working list and never a bell. This guards decision inboxes (e.g. Stingel's,
  // where inbound drives actions): spam and strangers can't enter the loop.
  const lockedOut = await lockedOutSender(db, inbox, fromAddr);
  if (lockedOut) {
    await db.prepare(`UPDATE threads SET status = 'resolved' WHERE id = ?`).bind(thread.id).run();
    console.log(`agent-mail: locked inbox ${inbox} — quarantined sender ${fromAddr}`);
  }

  // Mirror to the human cockpit (best-effort; never blocks ingestion).
  ctx.waitUntil(mirrorThread(env, db, thread.id).catch(async (e) => {
    console.error("agent-mail mirror failed:", e);
    await recordSendFailure(env, "mirror", inbox, e);
  }));

  // Spec 47 mail bell: wake the owning agent's Hermes webhook gateway — push,
  // not poll. Machine mail (bounces/auto-replies) is archived but never rings,
  // and neither do senders outside the allowlist: unknown/spam mail is captured
  // silently (D1 + mirror) instead of spending agent tokens on a wake. This is
  // a token-protection layer, not a security boundary — From is spoofable; the
  // reply gates (Spec 33) remain the line that matters for outbound.
  if (!machine && thread.assigned_agent && !lockedOut) {
    // Self-echo guard (Spec 80, found live 2026-07-13): an agent's reply to a
    // fleet sibling stitches (References) back into its OWN thread as inbound
    // and would re-ring its own bell — one paid turn per reply that decides
    // "do nothing" (Charlie's Opus turn caught its echo; the class is
    // structural). Compare against THREAD.inbox, not the envelope `inbox`:
    // the echo arrives addressed to the sibling (to=julia@) but stitches into
    // the replier's thread, and the bell fires on thread.assigned_agent — the
    // envelope-address compare shipped first and missed exactly this (wire
    // check 3; Charlie's second turn flagged it). A message FROM the thread's
    // own address is never a wake-worthy event on that thread.
    if (String(fromAddr || "").toLowerCase().trim() === String(thread.inbox || "").toLowerCase()) {
      console.log(`agent-mail: bell suppressed — self-echo: ${fromAddr} on thread ${thread.id} (${thread.inbox})`);
    } else if (await senderAllowed(db, fromAddr)) {
      const bellAgent = thread.assigned_agent;
      ctx.waitUntil(ringBell(env, bellAgent, { inbox, thread_id: thread.id, from: fromAddr, subject, message_uuid: msgId })
        .catch(async (e) => {
          console.error("agent-mail bell failed:", e);
          await recordSendFailure(env, "bell", bellAgent, e);
        }));
    } else {
      console.log(`agent-mail: bell suppressed — sender not allowlisted: ${fromAddr} → ${inbox}`);
    }
  }
}

// True when `inbox` has lock rows and `fromAddr` matches none of them (exact
// address or '@domain' suffix, same pattern language as allowed_senders). An
// unlocked inbox (no rows) is never locked out. Lookup errors quarantine (the
// mail is already captured; never admit a sender into a locked loop on doubt).
async function lockedOutSender(db, inbox, fromAddr) {
  try {
    const { results } = await db.prepare(`SELECT pattern FROM inbox_locks WHERE inbox = ?`).bind(inbox).all();
    if (!results || !results.length) return false;
    const addr = String(fromAddr || "").toLowerCase().trim();
    const at = addr.indexOf("@");
    const domain = at >= 0 ? addr.slice(at) : "";
    return !results.some((r) => r.pattern === addr || (domain && r.pattern === domain));
  } catch (e) {
    console.error("agent-mail inbox_locks lookup failed (quarantining):", e);
    return true;
  }
}

// D1 `allowed_senders`: pattern is an exact lowercase address ('nick@example.com')
// or a domain suffix ('@example.com'). Operator-managed via wrangler d1 execute.
// Fails CLOSED for the bell but never for ingestion: any lookup error means "no
// ring" — the mail is already archived by the time this runs.
async function senderAllowed(db, fromAddr) {
  try {
    const addr = String(fromAddr || "").toLowerCase().trim();
    const at = addr.indexOf("@");
    if (at < 0) return false;
    const row = await db
      .prepare(`SELECT 1 AS ok FROM allowed_senders WHERE pattern = ? OR pattern = ?`)
      .bind(addr, addr.slice(at))
      .first();
    return !!row;
  } catch (e) {
    console.error("agent-mail allowlist lookup failed (bell suppressed):", e);
    return false;
  }
}

// POST a signed "you've got mail" event to bell-<agent>.alectranel.com. Best
// effort by design (Spec 47 decision 7): a missed bell means the mail waits for
// the next touch — ingestion and the D1 record are never at risk.
export async function ringBell(env, agent, { inbox, thread_id, from, subject, message_uuid }) {
  let secrets = {};
  try { secrets = JSON.parse(env.MAIL_BELL_SECRETS || "{}"); } catch { /* unset or malformed = no bells */ }
  const secret = secrets[agent];
  if (!secret) return; // agent has no bell (e.g. julio, pull-only)

  const body = JSON.stringify({ event: "mail.received", agent, inbox, thread_id, from, subject });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

  const res = await fetch(`https://bell-${agent}.alectranel.com/webhooks/agent-mail`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Signature": sig, "X-Request-ID": message_uuid },
    body,
  });
  if (!res.ok) {
    const detail = `HTTP ${res.status} ${await res.text().catch(() => "")}`.trim();
    console.error(`agent-mail bell ${agent}: ${detail}`);
    await recordSendFailure(env, "bell", agent, detail);
  }
}

// Spec 33 §6 — send-failure ledger. A failed outbound step (cfSend, Airtable
// mirror, agent bell) used to be loud in Worker logs but paged no one; every
// such failure path lands one row here, and the fleet watchdog polls
// GET /send-failures to page per row. Fail-open by contract: a failed insert
// console.errors and never breaks the send flow it rides on.
async function recordSendFailure(env, route, toAddr, err) {
  try {
    await env.AGENT_MAIL_DB
      .prepare(`INSERT INTO send_failures (id, ts, route, to_addr, error) VALUES (?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        Math.floor(Date.now() / 1000),
        route,
        String(toAddr || ""),
        String((err && err.message) || err).slice(0, 2000)
      )
      .run();
  } catch (e) {
    console.error("agent-mail send_failures insert failed:", e);
  }
}

export async function findOrCreateThread(db, { inbox, fromAddr, subject, inReplyTo }) {
  // Message-IDs are globally unique, but a reply must stay inside the envelope
  // recipient's inbox. Without this scope, a fleet reply arriving at Julia can
  // stitch back into the sender's eng-intake thread and disappear from Julia's
  // scoped view (Spec 108 live-wire finding).
  if (inReplyTo) {
    const prior = await db
      .prepare(
        `SELECT t.* FROM messages m JOIN threads t ON t.id = m.thread_id
         WHERE m.message_id = ? AND t.inbox = ? LIMIT 1`
      )
      .bind(inReplyTo, inbox)
      .first();
    if (prior) return prior;
  }

  // Fallback stitch by subject + counterparty. Needed for replies to
  // agent-INITIATED mail: Email Sending forbids a custom Message-ID, so we never
  // learn the id the reply's References chain points at. A recent thread on this
  // inbox with the same counterparty and the same bare subject is that conversation.
  const bare = bareSubject(subject);
  if (bare) {
    const { results } = await db
      .prepare(
        `SELECT * FROM threads WHERE inbox = ? AND from_addr = ? AND last_at > datetime('now', '-30 days')
         ORDER BY last_at DESC LIMIT 25`
      )
      .bind(inbox, fromAddr)
      .all();
    for (const t of results || []) {
      if (bareSubject(t.subject) === bare) return t;
    }
  }

  const id = crypto.randomUUID();
  // New thread: owner defaults to the inbox's default_agent (per-agent inbox = that agent;
  // shared inbox = the router default). Unknown inboxes still capture mail, unrouted.
  const ib = await db.prepare(`SELECT default_agent FROM inboxes WHERE address = ?`).bind(inbox).first();
  const assigned = ib ? ib.default_agent : null;
  await db
    .prepare(
      `INSERT INTO threads (id, inbox, assigned_agent, status, subject, from_addr) VALUES (?, ?, ?, 'new', ?, ?)`
    )
    .bind(id, inbox, assigned, subject, fromAddr)
    .run();
  return db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(id).first();
}

// ───────────────────────── HTTP API (for the MCP) ─────────────────────────

// Callers are either the OPERATOR (the AGENT_MAIL_TOKEN worker secret — admin
// tooling, sees everything) or an AGENT (per-agent token; only its SHA-256 hash
// lives in agent_tokens, the plaintext stays in that agent's 1Password vault +
// profile .env). Agent scope is a trust-domain boundary enforced here, in SQL —
// the inbox query param is a filter, never an authority claim.
async function resolveCaller(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!auth.startsWith("Bearer ")) return null;
  const token = auth.slice("Bearer ".length).trim();
  if (!token) return null;
  if (env.AGENT_MAIL_TOKEN && token === env.AGENT_MAIL_TOKEN) return { operator: true, agent: null };
  const row = await env.AGENT_MAIL_DB
    .prepare(`SELECT agent FROM agent_tokens WHERE token_hash = ?`)
    .bind(await sha256Hex(token))
    .first();
  return row ? { operator: false, agent: row.agent } : null;
}

// Operator: always. Agent: threads assigned to it, or on an inbox it owns
// (default_agent) — covers handoffs in both directions.
async function callerOwnsThread(env, caller, thread) {
  if (caller.operator) return true;
  if (thread.assigned_agent === caller.agent) return true;
  const ib = await env.AGENT_MAIL_DB
    .prepare(`SELECT 1 AS ok FROM inboxes WHERE address = ? AND default_agent = ?`)
    .bind(thread.inbox, caller.agent)
    .first();
  return !!ib;
}

const forbidden = () => jsonResp({ outcome: "error", error: "forbidden: outside your inbox scope" }, 403);

export async function handleAgentMailApi(request, env, url) {
  const caller = await resolveCaller(request, env);
  if (!caller) {
    return jsonResp({ outcome: "error", error: "unauthorized" }, 401);
  }

  const path = url.pathname.slice("/api/agent-mail/".length);

  try {
    if (request.method === "GET" && path === "list") {
      return await apiList(env, url, caller);
    }
    if (request.method === "GET" && path === "send-failures") {
      return await apiSendFailures(env, url, caller);
    }
    if (request.method === "GET" && path === "stale-threads") {
      return await apiStaleThreads(env, url, caller);
    }
    if (request.method === "GET" && path === "reports") {
      return await apiReports(env, url, caller);
    }
    if (request.method === "GET" && path.startsWith("thread/")) {
      return await apiRead(env, path.slice("thread/".length), caller);
    }
    if (request.method === "GET" && path.startsWith("attachments/")) {
      return await apiAttachments(env, path.slice("attachments/".length), caller);
    }
    if (request.method === "POST" && path === "reply") {
      return await apiReply(env, await request.json(), caller);
    }
    if (request.method === "POST" && path === "send") {
      return await apiSend(env, await request.json(), caller);
    }
    if (request.method === "POST" && path === "status") {
      return await apiSetStatus(env, await request.json(), caller);
    }
    return jsonResp({ outcome: "error", error: "not found" }, 404);
  } catch (err) {
    console.error("agent-mail api error:", err);
    return jsonResp({ outcome: "error", error: String(err && err.message || err) }, 500);
  }
}

async function apiList(env, url, caller) {
  const inbox = url.searchParams.get("inbox");
  const status = url.searchParams.get("status");
  const limit = clampLimit(url.searchParams.get("limit"));

  const where = [];
  const binds = [];
  if (!caller.operator) {
    if (inbox) {
      const owned = await env.AGENT_MAIL_DB
        .prepare(`SELECT 1 AS ok FROM inboxes WHERE address = ? AND default_agent = ?`)
        .bind(inbox.toLowerCase(), caller.agent)
        .first();
      if (!owned) return forbidden();
    } else {
      where.push("(inbox IN (SELECT address FROM inboxes WHERE default_agent = ?) OR assigned_agent = ?)");
      binds.push(caller.agent, caller.agent);
    }
  }
  if (inbox) { where.push("inbox = ?"); binds.push(inbox.toLowerCase()); }
  if (status) { where.push("status = ?"); binds.push(status); }
  const sql =
    `SELECT id AS thread_id, inbox, from_addr AS "from", subject, status, assigned_agent, last_at
     FROM threads ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY last_at DESC LIMIT ?`;
  binds.push(limit);

  const { results } = await env.AGENT_MAIL_DB.prepare(sql).bind(...binds).all();
  return jsonResp({ outcome: "ok", data: results || [] });
}

// Spec 33 §6 — the fleet watchdog's poll surface: send_failures rows newer than
// ?since=<epoch>. Same resolveCaller gate as every route here, but operator
// token ONLY (agents have no business reading the fleet-wide failure feed).
async function apiSendFailures(env, url, caller) {
  if (!caller.operator) return forbidden();
  const since = parseInt(url.searchParams.get("since") || "0", 10) || 0;
  const { results } = await env.AGENT_MAIL_DB
    .prepare(`SELECT id, ts, route, to_addr, error FROM send_failures WHERE ts > ? ORDER BY ts ASC LIMIT 200`)
    .bind(since)
    .all();
  return jsonResp({ outcome: "ok", data: results || [] });
}

// Spec 80 — the fleet watchdog's OUTCOME rung: threads no agent has answered.
// Process liveness (is the bell up?) is not artifact truth (did the reply
// happen?); this is the one query that catches a silently-dead bell, a wedged
// spool, or a failed turn on ANY inbox, in the current architecture and the
// next one. Operator token only. Excludes statuses that wait on humans by
// design (needs_review, human) — those are somebody's job already — and
// ownerless threads (assigned_agent NULL): report sinks like dmarc@ receive
// mail nobody answers; an unanswered thread is only a failure when an agent
// owns it (first live probe surfaced exactly this class, 2026-07-13).
async function apiStaleThreads(env, url, caller) {
  if (!caller.operator) return forbidden();
  const hours = Math.min(Math.max(parseInt(url.searchParams.get("hours") || "4", 10) || 4, 1), 168);
  const { results } = await env.AGENT_MAIL_DB
    .prepare(
      `SELECT id AS thread_id, inbox, assigned_agent, status, subject, from_addr, last_at
       FROM threads WHERE status IN ('new', 'agent_working') AND assigned_agent IS NOT NULL AND last_at < datetime('now', ?)
       ORDER BY last_at ASC LIMIT 100`
    )
    .bind(`-${hours} hours`)
    .all();
  return jsonResp({ outcome: "ok", data: results || [] });
}

// Spec 70 P4 — the reports-concierge substrate: an agent-scoped list/search
// surface over the report archive. Every outbound report already lives in
// messages.body_markdown (the same column the /r/ viewer renders from) —
// this route just lets an agent find its own past reports ("resend week 1",
// "combine the last 3 months") without a fleet-wide directory. Recompose and
// judgment stay in the agent; this is read-only. Operator sees every report;
// an agent sees only reports on threads it owns — same ownership predicate
// family as apiList's inbox-less branch (thread's inbox default_agent OR the
// thread's own assigned_agent). A row only counts as a "report" under the
// same rule the /lib/ library view uses: direction='out' AND body_markdown
// IS NOT NULL (report_view.js handleLibraryView, ~:983-990).
function escapeLike(s) {
  return String(s).replace(/[\\%_]/g, (c) => "\\" + c);
}

// SQLite treats LIMIT -1 as "no limit" — a negative or zero limit param must
// clamp to the floor, never pass through to the query.
function clampLimit(raw) {
  const n = parseInt(raw || "20", 10) || 20;
  return Math.min(Math.max(n, 1), 100);
}

async function apiReports(env, url, caller) {
  const to = url.searchParams.get("to");
  const since = url.searchParams.get("since");
  const until = url.searchParams.get("until");
  const q = url.searchParams.get("q");
  const includeBody = url.searchParams.get("body") === "1";
  const limit = clampLimit(url.searchParams.get("limit"));

  const where = ["messages.direction = 'out'", "messages.body_markdown IS NOT NULL"];
  const binds = [];
  if (!caller.operator) {
    where.push(
      "(threads.inbox IN (SELECT address FROM inboxes WHERE default_agent = ?) OR threads.assigned_agent = ?)"
    );
    binds.push(caller.agent, caller.agent);
  }
  if (to) {
    where.push("lower(messages.to_addr) = ?");
    binds.push(to.toLowerCase());
  }
  if (since) {
    where.push("messages.created_at >= ?");
    binds.push(since);
  }
  if (until) {
    where.push("messages.created_at <= ?");
    binds.push(until);
  }
  if (q) {
    where.push("messages.subject LIKE ? ESCAPE '\\'");
    binds.push(`%${escapeLike(q)}%`);
  }

  const cols = includeBody
    ? `messages.id AS id, messages.thread_id AS thread_id, messages.to_addr AS "to", messages.subject AS subject, messages.created_at AS created_at, messages.body_markdown AS body_markdown`
    : `messages.id AS id, messages.thread_id AS thread_id, messages.to_addr AS "to", messages.subject AS subject, messages.created_at AS created_at`;

  const sql =
    `SELECT ${cols}
     FROM messages JOIN threads ON messages.thread_id = threads.id
     WHERE ${where.join(" AND ")}
     ORDER BY messages.created_at DESC LIMIT ?`;
  binds.push(limit);

  const { results } = await env.AGENT_MAIL_DB.prepare(sql).bind(...binds).all();
  const reports = await Promise.all(
    (results || []).map(async (r) => ({
      id: r.id,
      thread_id: r.thread_id,
      to: r.to,
      subject: r.subject,
      created_at: r.created_at,
      report_url: await reportLink(env, r.id),
      ...(includeBody ? { body_markdown: r.body_markdown } : {}),
    }))
  );
  return jsonResp({ outcome: "ok", reports });
}

async function apiRead(env, threadId, caller) {
  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(threadId).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);
  if (!(await callerOwnsThread(env, caller, thread))) return forbidden();
  const { results } = await db
    .prepare(
      `SELECT id, direction, from_addr AS "from", to_addr AS "to", subject, body_text, body_markdown, body_html, r2_key, created_at
       FROM messages WHERE thread_id = ? ORDER BY created_at ASC`
    )
    .bind(threadId)
    .all();
  return jsonResp({ outcome: "ok", data: { thread, messages: results || [] } });
}

// Attachments of one inbound message, extracted on demand from the archived raw
// .eml in R2 (attachments are never stored separately — the .eml is the archive).
// Spec 42: lets a skill pull a forwarded receipt PDF/image for filing.
const MAX_ATTACHMENTS_BYTES = 8 * 1024 * 1024;

async function apiAttachments(env, messageId, caller) {
  const db = env.AGENT_MAIL_DB;
  const msg = await db.prepare(`SELECT r2_key, thread_id FROM messages WHERE id = ?`).bind(messageId).first();
  if (!msg) return jsonResp({ outcome: "error", error: "message not found" }, 404);
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(msg.thread_id).first();
  if (thread && !(await callerOwnsThread(env, caller, thread))) return forbidden();
  if (!msg.r2_key) return jsonResp({ outcome: "error", error: "message has no archived raw copy (outbound message?)" }, 404);

  const obj = await env.AGENT_MAIL_BUCKET.get(msg.r2_key);
  if (!obj) return jsonResp({ outcome: "error", error: "raw message missing from R2 archive" }, 404);
  const parsed = await PostalMime.parse(await obj.arrayBuffer());

  let total = 0;
  const attachments = [];
  for (const att of parsed.attachments || []) {
    const bytes = new Uint8Array(att.content instanceof ArrayBuffer ? att.content : att.content || []);
    total += bytes.byteLength;
    if (total > MAX_ATTACHMENTS_BYTES) {
      return jsonResp({ outcome: "error", error: `attachments exceed ${MAX_ATTACHMENTS_BYTES} bytes total` }, 413);
    }
    attachments.push({
      filename: att.filename || "attachment.bin",
      type: att.mimeType || "application/octet-stream",
      size: bytes.byteLength,
      content_b64: bytesToB64(bytes),
    });
  }
  return jsonResp({ outcome: "ok", data: { message_id: messageId, count: attachments.length, attachments } });
}

async function apiReply(env, body, caller) {
  const { thread_id, body_markdown, attachments } = body || {};
  const chartPngs = await chartPngsFor(body);
  const { body_text, body_html } = resolveMarkdownBody(body || {}, { chartImages: chartPngs.images });
  if (!thread_id || !body_text) return jsonResp({ outcome: "error", error: "thread_id and body_text (or body_markdown) required" }, 422);

  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(thread_id).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);
  if (!(await callerOwnsThread(env, caller, thread))) return forbidden();
  if (thread.status === "human") {
    return jsonResp({ outcome: "error", error: "thread is owned by a human; agent reply refused" }, 409);
  }

  // Attachment budget depends on the recipient, so this waits for the thread.
  const att = decodeOutAttachments(attachments, thread.from_addr);
  if (att.error) return jsonResp({ outcome: "error", error: att.error }, 422);

  // Reply to the most recent inbound sender, in the original thread.
  const last = await db
    .prepare(`SELECT * FROM messages WHERE thread_id = ? AND direction = 'in' ORDER BY created_at DESC LIMIT 1`)
    .bind(thread_id)
    .first();
  if (last && last.is_machine) {
    return jsonResp({ outcome: "error", error: "last inbound is machine-generated (bounce/auto-reply); reply refused to prevent a mail loop" }, 409);
  }

  const sentLastHour = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN m.thread_id = ? THEN 1 ELSE 0 END) AS thread_n,
         COUNT(*) AS inbox_n
       FROM messages m JOIN threads t ON t.id = m.thread_id
       WHERE t.inbox = ? AND m.direction = 'out' AND m.created_at > datetime('now', '-1 hour')`
    )
    .bind(thread_id, thread.inbox)
    .first();
  if ((sentLastHour?.thread_n || 0) >= SEND_LIMITS.perThreadPerHour || (sentLastHour?.inbox_n || 0) >= SEND_LIMITS.perInboxPerHour) {
    return jsonResp(
      { outcome: "error", error: `outbound rate limit: ${SEND_LIMITS.perThreadPerHour}/thread/hour, ${SEND_LIMITS.perInboxPerHour}/inbox/hour; try later or flag needs_review` },
      429
    );
  }

  // Spec 80 ping-pong halt: the hourly cap paces a loop, this ends it. The Nth
  // same-day reply flips the thread to a human and refuses — terminal, not a
  // retry-later. status flips BEFORE the refusal so a caller that ignores the
  // 429 finds the thread already out of its hands.
  const sentToday = await db
    .prepare(`SELECT COUNT(*) AS n FROM messages WHERE thread_id = ? AND direction = 'out' AND created_at > datetime('now', 'start of day')`)
    .bind(thread_id)
    .first();
  if ((sentToday?.n || 0) >= SEND_LIMITS.repliesPerThreadPerDay) {
    await db.prepare(`UPDATE threads SET status = 'needs_review' WHERE id = ?`).bind(thread_id).run();
    return jsonResp(
      { outcome: "error", error: `ping-pong halt (Spec 80): ${SEND_LIMITS.repliesPerThreadPerDay} agent replies on this thread today — thread flipped to needs_review; a human continues it` },
      429
    );
  }

  const to = last ? last.from_addr : thread.from_addr;
  const subject = /^re:/i.test(thread.subject || "") ? thread.subject : `Re: ${thread.subject || ""}`.trim();
  const inReplyTo = last ? last.message_id : null;

  // Send natively as the agent's own inbox on agents.adapttolife.org (the subdomain is
  // onboarded to Cloudflare Email Sending), so replies thread straight back to the agent.
  const fromAddr = thread.inbox;

  // Spec 70 P3: mint the D1 message id BEFORE composing/sending, so the
  // interactive-report permalink (HMAC of this id) can ride the email footer.
  // Footer appears only in the markdown register, only with chart blocks,
  // only when REPORT_LINK_SECRET exists — "" otherwise, never an error.
  const msgId = crypto.randomUUID();
  const footer = await reportFooterHtml(env, body, msgId, to);
  const htmlOut = body_html ? body_html + footer : undefined;

  let sent;
  try {
    sent = await cfSend(env, {
      from: fromAddr,
      to,
      subject,
      text: body_text,
      html: htmlOut,
      headers: inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined,
      attachments: mergeAttachments(att.list, chartPngs.attachments),
    });
  } catch (e) {
    // Spec 33 §6: record, then rethrow — the caller still gets the API 500.
    await recordSendFailure(env, "cfSend", to, e);
    throw e;
  }

  await db
    .prepare(
      `INSERT INTO messages (id, thread_id, direction, from_addr, to_addr, subject, body_text, body_markdown, body_html, message_id, in_reply_to)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(msgId, thread_id, fromAddr, to, subject, body_text + att.note, body_markdown || null, htmlOut || null, sent.id || null, inReplyTo)
    .run();
  await db.prepare(`UPDATE threads SET status = 'replied', last_at = datetime('now') WHERE id = ?`).bind(thread_id).run();

  await mirrorThread(env, db, thread_id).catch(async (e) => {
    console.error("agent-mail mirror failed:", e);
    await recordSendFailure(env, "mirror", thread.inbox, e);
  });
  return jsonResp({ outcome: "ok", data: { message_id: sent.id || null } });
}

// Agent-initiated outbound (Spec 33): a new thread that STARTS with an outgoing
// message — reports, digests, agent→agent handoffs. Scope mirrors /reply: an
// agent may send only AS an inbox it owns. threads.from_addr stays the
// counterparty (here the recipient), matching what /list shows for inbound.
async function apiSend(env, body, caller) {
  const { from, to, subject, body_markdown, attachments } = body || {};
  const chartPngs = await chartPngsFor(body);
  const { body_text, body_html } = resolveMarkdownBody(body || {}, { chartImages: chartPngs.images });
  if (!to || !subject || !body_text) return jsonResp({ outcome: "error", error: "to, subject, and body_text (or body_markdown) required" }, 422);
  const att = decodeOutAttachments(attachments, to);
  if (att.error) return jsonResp({ outcome: "error", error: att.error }, 422);
  const toAddr = String(to).toLowerCase().trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toAddr)) return jsonResp({ outcome: "error", error: "to must be a single email address" }, 422);

  const db = env.AGENT_MAIL_DB;
  let fromAddr = String(from || "").toLowerCase().trim();
  if (caller.operator) {
    if (!fromAddr) return jsonResp({ outcome: "error", error: "operator sends must name a from inbox" }, 422);
    const ib = await db.prepare(`SELECT 1 AS ok FROM inboxes WHERE address = ?`).bind(fromAddr).first();
    if (!ib) return jsonResp({ outcome: "error", error: "from is not a registered inbox" }, 422);
  } else {
    const { results } = await db.prepare(`SELECT address FROM inboxes WHERE default_agent = ?`).bind(caller.agent).all();
    const owned = (results || []).map((r) => r.address);
    if (!fromAddr) {
      if (owned.length !== 1) {
        return jsonResp({ outcome: "error", error: `you own ${owned.length} inboxes; pass from as one of: ${owned.join(", ")}` }, 422);
      }
      fromAddr = owned[0];
    } else if (!owned.includes(fromAddr)) {
      return forbidden();
    }
  }

  const sentLastHour = await db
    .prepare(
      `SELECT COUNT(*) AS inbox_n FROM messages m JOIN threads t ON t.id = m.thread_id
       WHERE t.inbox = ? AND m.direction = 'out' AND m.created_at > datetime('now', '-1 hour')`
    )
    .bind(fromAddr)
    .first();
  if ((sentLastHour?.inbox_n || 0) >= SEND_LIMITS.perInboxPerHour) {
    return jsonResp(
      { outcome: "error", error: `outbound rate limit: ${SEND_LIMITS.perInboxPerHour}/inbox/hour; try later or flag needs_review` },
      429
    );
  }

  // Spec 70 P3: mint the D1 message id BEFORE the send — the interactive-
  // report footer link is an HMAC of this id (same contract as /reply).
  const msgId = crypto.randomUUID();
  const footer = await reportFooterHtml(env, body, msgId, toAddr);
  const htmlOut = body_html ? body_html + footer : undefined;

  // Email Sending forbids a custom Message-ID (whitelist + X-* only), so we
  // cannot know the id the recipient's reply will reference — replies stitch by
  // the subject+counterparty fallback in findOrCreateThread instead.
  try {
    await cfSend(env, {
      from: fromAddr,
      to: toAddr,
      subject,
      text: body_text,
      html: htmlOut,
      attachments: mergeAttachments(att.list, chartPngs.attachments),
    });
  } catch (e) {
    // Spec 33 §6: record, then rethrow — the caller still gets the API 500.
    await recordSendFailure(env, "cfSend", toAddr, e);
    throw e;
  }

  const assigned = caller.agent
    || (await db.prepare(`SELECT default_agent FROM inboxes WHERE address = ?`).bind(fromAddr).first())?.default_agent
    || null;
  const threadId = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO threads (id, inbox, assigned_agent, status, subject, from_addr) VALUES (?, ?, ?, 'replied', ?, ?)`)
    .bind(threadId, fromAddr, assigned, subject, toAddr)
    .run();
  await db
    .prepare(
      `INSERT INTO messages (id, thread_id, direction, from_addr, to_addr, subject, body_text, body_markdown, body_html)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?)`
    )
    .bind(msgId, threadId, fromAddr, toAddr, subject, body_text + att.note, body_markdown || null, htmlOut || null)
    .run();

  await mirrorThread(env, db, threadId).catch(async (e) => {
    console.error("agent-mail mirror failed:", e);
    await recordSendFailure(env, "mirror", fromAddr, e);
  });
  return jsonResp({ outcome: "ok", data: { thread_id: threadId } });
}

async function apiSetStatus(env, body, caller) {
  const { thread_id, status, assigned_agent } = body || {};
  if (!thread_id || !STATUSES.includes(status)) {
    return jsonResp({ outcome: "error", error: `status must be one of ${STATUSES.join("|")}` }, 422);
  }
  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(thread_id).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);
  if (!(await callerOwnsThread(env, caller, thread))) return forbidden();

  if (assigned_agent !== undefined && assigned_agent !== null) {
    await db.prepare(`UPDATE threads SET status = ?, assigned_agent = ?, last_at = datetime('now') WHERE id = ?`)
      .bind(status, assigned_agent, thread_id).run();
  } else {
    await db.prepare(`UPDATE threads SET status = ?, last_at = datetime('now') WHERE id = ?`)
      .bind(status, thread_id).run();
  }
  await mirrorThread(env, db, thread_id).catch(async (e) => {
    console.error("agent-mail mirror failed:", e);
    await recordSendFailure(env, "mirror", thread.inbox, e);
  });

  const updated = await db.prepare(`SELECT id AS thread_id, status, assigned_agent FROM threads WHERE id = ?`).bind(thread_id).first();
  return jsonResp({ outcome: "ok", data: updated });
}

// ───────────────────────── human mirror (Airtable) ─────────────────────────

async function mirrorThread(env, db, threadId) {
  // Off the agent hot path: keep a human-readable Airtable row per thread.
  // No-op until the table id is configured (so the system runs before T04 lands).
  if (!env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID || !env.AIRTABLE_AGENT_MAIL_TABLE_ID) return;

  const t = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(threadId).first();
  if (!t) return;
  const fields = {
    Thread: t.id,
    Inbox: t.inbox,
    From: t.from_addr,
    Subject: t.subject || "",
    Status: t.status,
    Agent: t.assigned_agent || "",
    Last: t.last_at,
  };

  const base = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_AGENT_MAIL_TABLE_ID}`;
  const headers = { Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, "Content-Type": "application/json" };

  if (t.airtable_id) {
    await fetch(`${base}/${t.airtable_id}`, { method: "PATCH", headers, body: JSON.stringify({ fields, typecast: true }) });
    return;
  }
  const res = await fetch(base, { method: "POST", headers, body: JSON.stringify({ records: [{ fields }], typecast: true }) });
  if (res.ok) {
    const data = await res.json();
    const recId = data.records && data.records[0] && data.records[0].id;
    if (recId) await db.prepare(`UPDATE threads SET airtable_id = ? WHERE id = ?`).bind(recId, t.id).run();
  } else {
    // Non-throwing failure: the call-site .catch never sees this, so the
    // Spec 33 §6 ledger row is written here.
    const detail = `airtable create ${res.status}: ${await safeText(res)}`.slice(0, 500);
    console.error("agent-mail airtable create failed:", detail);
    await recordSendFailure(env, "mirror", t.inbox, detail);
  }
}

// ───────────────────────── helpers ─────────────────────────

function bareSubject(s) {
  return String(s || "").replace(/^\s*((re|fwd?)\s*:\s*)+/i, "").trim().toLowerCase();
}
function isoDay() {
  return new Date().toISOString().slice(0, 10);
}
async function sha256Hex(s) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bytesToB64(bytes) {
  let bin = "";
  const chunk = 0x8000; // avoid call-stack limits on large parts
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}
function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
async function safeText(res) {
  try { return await res.text(); } catch { return "(no body)"; }
}
