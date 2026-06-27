// Spec 32 — Cloudflare-native agent email (agents.adapttolife.org).
//
// Two entry points, both called from src/index.js:
//   handleEmail(message, env, ctx)      Cloudflare Email Worker — inbound mail for *@agents.adapttolife.org
//   handleAgentMailApi(request, env, url) authenticated HTTP API the agentos MCP calls
//
// Source of truth: D1 (env.AGENT_MAIL_DB) for threads/messages; R2 (env.AGENT_MAIL_BUCKET) for raw .eml.
// Humans read a write-through Airtable mirror (never on the agent hot path). Outbound via Resend.
// Patterns reused from src/waiver.js (Resend) and src/index.js (Airtable REST).

import PostalMime from "postal-mime";

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

export async function handleAgentMailApi(request, env, url) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.AGENT_MAIL_TOKEN || auth !== `Bearer ${env.AGENT_MAIL_TOKEN}`) {
    return jsonResp({ outcome: "error", error: "unauthorized" }, 401);
  }

  const path = url.pathname.slice("/api/agent-mail/".length);

  try {
    if (request.method === "GET" && path === "list") {
      return await apiList(env, url);
    }
    if (request.method === "GET" && path.startsWith("thread/")) {
      return await apiRead(env, path.slice("thread/".length));
    }
    if (request.method === "POST" && path === "reply") {
      return await apiReply(env, await request.json());
    }
    if (request.method === "POST" && path === "status") {
      return await apiSetStatus(env, await request.json());
    }
    return jsonResp({ outcome: "error", error: "not found" }, 404);
  } catch (err) {
    console.error("agent-mail api error:", err);
    return jsonResp({ outcome: "error", error: String(err && err.message || err) }, 500);
  }
}

async function apiList(env, url) {
  const inbox = url.searchParams.get("inbox");
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 100);

  const where = [];
  const binds = [];
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

async function apiRead(env, threadId) {
  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(threadId).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);
  const { results } = await db
    .prepare(
      `SELECT direction, from_addr AS "from", to_addr AS "to", subject, body_text, r2_key, created_at
       FROM messages WHERE thread_id = ? ORDER BY created_at ASC`
    )
    .bind(threadId)
    .all();
  return jsonResp({ outcome: "ok", data: { thread, messages: results || [] } });
}

async function apiReply(env, body) {
  const { thread_id, body_text, body_html } = body || {};
  if (!thread_id || !body_text) return jsonResp({ outcome: "error", error: "thread_id and body_text required" }, 422);

  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT * FROM threads WHERE id = ?`).bind(thread_id).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);
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

  const sent = await resendSend(env, {
    from: thread.inbox,
    to,
    subject,
    text: body_text,
    html: body_html || undefined,
    inReplyTo,
  });

  const msgId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO messages (id, thread_id, direction, from_addr, to_addr, subject, body_text, message_id, in_reply_to)
       VALUES (?, ?, 'out', ?, ?, ?, ?, ?, ?)`
    )
    .bind(msgId, thread_id, thread.inbox, to, subject, body_text, sent.id || null, inReplyTo)
    .run();
  await db.prepare(`UPDATE threads SET status = 'replied', last_at = datetime('now') WHERE id = ?`).bind(thread_id).run();

  await mirrorThread(env, db, thread_id).catch((e) => console.error("agent-mail mirror failed:", e));
  return jsonResp({ outcome: "ok", data: { message_id: sent.id || null } });
}

async function apiSetStatus(env, body) {
  const { thread_id, status, assigned_agent } = body || {};
  if (!thread_id || !STATUSES.includes(status)) {
    return jsonResp({ outcome: "error", error: `status must be one of ${STATUSES.join("|")}` }, 422);
  }
  const db = env.AGENT_MAIL_DB;
  const thread = await db.prepare(`SELECT id FROM threads WHERE id = ?`).bind(thread_id).first();
  if (!thread) return jsonResp({ outcome: "error", error: "thread not found" }, 404);

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

// ───────────────────────── outbound (Resend) ─────────────────────────

async function resendSend(env, { from, to, subject, text, html, inReplyTo }) {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");
  const payload = { from, to, subject, text };
  if (html) payload.html = html;
  if (inReplyTo) payload.headers = { "In-Reply-To": inReplyTo, References: inReplyTo };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await safeText(res)}`);
  return res.json();
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
function jsonResp(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
async function safeText(res) {
  try { return await res.text(); } catch { return "(no body)"; }
}
