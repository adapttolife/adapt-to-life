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

const STATUSES = ["new", "agent_working", "needs_review", "human", "replied", "resolved"];

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

  const msgId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO messages (id, thread_id, direction, from_addr, to_addr, subject, body_text, r2_key, message_id, in_reply_to)
       VALUES (?, ?, 'in', ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(msgId, thread.id, fromAddr, inbox, subject, parsed.text || "", r2Key, messageId, inReplyTo)
    .run();

  await db
    .prepare(`UPDATE threads SET last_at = datetime('now') WHERE id = ?`)
    .bind(thread.id)
    .run();

  // Mirror to the human cockpit (best-effort; never blocks ingestion).
  ctx.waitUntil(mirrorThread(env, db, thread.id).catch((e) => console.error("agent-mail mirror failed:", e)));
}

async function findOrCreateThread(db, { inbox, fromAddr, subject, inReplyTo }) {
  // Stitch replies into an existing thread when the inbound references a known message.
  if (inReplyTo) {
    const prior = await db
      .prepare(`SELECT t.* FROM messages m JOIN threads t ON t.id = m.thread_id WHERE m.message_id = ? LIMIT 1`)
      .bind(inReplyTo)
      .first();
    if (prior) return prior;
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
    if (request.method === "GET" && path.startsWith("thread/")) {
      return await apiRead(env, path.slice("thread/".length), caller);
    }
    if (request.method === "GET" && path.startsWith("attachments/")) {
      return await apiAttachments(env, path.slice("attachments/".length), caller);
    }
    if (request.method === "POST" && path === "reply") {
      return await apiReply(env, await request.json(), caller);
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
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);

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

async function apiRead(env, threadId, caller) {
  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(threadId).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);
  if (!(await callerOwnsThread(env, caller, thread))) return forbidden();
  const { results } = await db
    .prepare(
      `SELECT id, direction, from_addr AS "from", to_addr AS "to", subject, body_text, r2_key, created_at
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
  const { thread_id, body_text, body_html } = body || {};
  if (!thread_id || !body_text) return jsonResp({ outcome: "error", error: "thread_id and body_text required" }, 422);

  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(thread_id).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);
  if (!(await callerOwnsThread(env, caller, thread))) return forbidden();
  if (thread.status === "human") {
    return jsonResp({ outcome: "error", error: "thread is owned by a human; agent reply refused" }, 409);
  }

  // Reply to the most recent inbound sender, in the original thread.
  const last = await db
    .prepare(`SELECT * FROM messages WHERE thread_id = ? AND direction = 'in' ORDER BY created_at DESC LIMIT 1`)
    .bind(thread_id)
    .first();
  const to = last ? last.from_addr : thread.from_addr;
  const subject = /^re:/i.test(thread.subject || "") ? thread.subject : `Re: ${thread.subject || ""}`.trim();
  const inReplyTo = last ? last.message_id : null;

  // Send natively as the agent's own inbox on agents.adapttolife.org (the subdomain is
  // onboarded to Cloudflare Email Sending), so replies thread straight back to the agent.
  const fromAddr = thread.inbox;

  const sent = await cfSend(env, {
    from: fromAddr,
    to,
    subject,
    text: body_text,
    html: body_html || undefined,
    headers: inReplyTo ? { "In-Reply-To": inReplyTo, References: inReplyTo } : undefined,
  });

  const msgId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO messages (id, thread_id, direction, from_addr, to_addr, subject, body_text, message_id, in_reply_to)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?)`
    )
    .bind(msgId, thread_id, fromAddr, to, subject, body_text, sent.id || null, inReplyTo)
    .run();
  await db.prepare(`UPDATE threads SET status = 'replied', last_at = datetime('now') WHERE id = ?`).bind(thread_id).run();

  await mirrorThread(env, db, thread_id).catch((e) => console.error("agent-mail mirror failed:", e));
  return jsonResp({ outcome: "ok", data: { message_id: sent.id || null } });
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
  await mirrorThread(env, db, thread_id).catch((e) => console.error("agent-mail mirror failed:", e));

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
    console.error("agent-mail airtable create failed:", res.status, await safeText(res));
  }
}

// ───────────────────────── helpers ─────────────────────────

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
