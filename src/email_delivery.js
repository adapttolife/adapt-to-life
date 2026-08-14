const PREFIX = "cf.email.sending.message.";
const TERMINAL_FAILURES = new Set(["bounced", "failed", "rejected", "complained"]);
const KNOWN = new Set(["delivered", "deferred", ...TERMINAL_FAILURES]);

function eventStatus(event) {
  const type = String(event?.type || "");
  return type.startsWith(PREFIX) ? type.slice(PREFIX.length) : "";
}

function failureDetail(event, status) {
  const payload = event.payload || {};
  const delivery = payload.delivery || {};
  const bounce = payload.bounce || {};
  return [
    `Email Sending ${status}`,
    `message=${payload.messageId || "unknown"}`,
    `event=${payload.eventId || "unknown"}`,
    delivery.smtpStatusCode ? `smtp=${delivery.smtpStatusCode}` : "",
    delivery.smtpResponse || bounce.reason || "",
  ].filter(Boolean).join("; ").slice(0, 2000);
}

// Queue event subscriptions are at-least-once. The event ledger makes effects
// idempotent; terminal states are monotonic, so a late deferred event cannot
// reverse a delivered or failed outcome.
export async function processEmailSendingEvent(env, event) {
  const status = eventStatus(event);
  const payload = event?.payload || {};
  const eventId = String(payload.eventId || "");
  const messageId = String(payload.messageId || "");
  if (!KNOWN.has(status) || !eventId || !messageId) throw new Error("invalid Email Sending lifecycle event");

  const db = env.AGENT_MAIL_DB;
  const message = await db
    .prepare(`SELECT id, thread_id, to_addr, delivery_status FROM messages WHERE direction = 'out' AND message_id = ? LIMIT 1`)
    .bind(messageId).first();
  // An event can beat the /send or /reply D1 write. Queue retry preserves it.
  if (!message) throw new Error(`outbound message not yet recorded: ${messageId}`);

  const seen = await db.prepare(`SELECT 1 AS ok FROM email_delivery_events WHERE event_id = ?`).bind(eventId).first();
  if (seen) return { duplicate: true, status };

  const alreadyTerminal = ["delivered", ...TERMINAL_FAILURES].includes(message.delivery_status);
  const statements = [db.prepare(
    `INSERT INTO email_delivery_events
       (event_id, message_id, event_type, terminal, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(eventId, messageId, event.type, payload.terminal ? 1 : 0, JSON.stringify(event), event?.metadata?.eventTimestamp || null)];
  if (!alreadyTerminal) {
    statements.push(db.prepare(
      `UPDATE messages SET delivery_status = ?, delivery_event_id = ?, delivery_updated_at = datetime('now') WHERE id = ?`
    ).bind(status, eventId, message.id));
  }

  if (status === "deferred" || TERMINAL_FAILURES.has(status)) {
    statements.push(db.prepare(
      `INSERT INTO send_failures (id, ts, route, to_addr, error) VALUES (?, ?, ?, ?, ?)`
    ).bind(
      eventId,
      Math.floor(Date.now() / 1000),
      `email.${status}`,
      String(payload.recipient || message.to_addr || ""),
      failureDetail(event, status)
    ));
  }

  if (!alreadyTerminal && status === "delivered") {
    statements.push(db.prepare(
      `UPDATE threads
          SET status = 'replied', last_at = datetime('now')
        WHERE id = ?
          AND status IN ('new', 'agent_working')
          AND NOT EXISTS (
            SELECT 1 FROM messages
             WHERE thread_id = ? AND direction = 'out' AND delivery_status IN ('pending', 'deferred')
          )
          AND 'out' = (
            SELECT direction FROM messages
             WHERE thread_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1
          )`
    ).bind(message.thread_id, message.thread_id, message.thread_id));
  } else if (!alreadyTerminal && TERMINAL_FAILURES.has(status)) {
    statements.push(db.prepare(
      `UPDATE threads SET status = 'needs_review', last_at = datetime('now') WHERE id = ? AND status NOT IN ('human', 'resolved')`
    ).bind(message.thread_id));
  }

  // D1 batch is a transaction: if any durable effect fails, the event ledger,
  // message state, pager row, and thread state all roll back together. A Queue
  // retry therefore sees no ledger row and safely replays every effect.
  await db.batch(statements);
  return { duplicate: false, status };
}

export async function handleEmailSendingBatch(batch, env) {
  for (const message of batch.messages) {
    try {
      await processEmailSendingEvent(env, message.body);
      message.ack();
    } catch (error) {
      console.error("Email Sending lifecycle event failed", {
        eventId: message?.body?.payload?.eventId,
        messageId: message?.body?.payload?.messageId,
        error: String(error?.message || error),
      });
      message.retry();
    }
  }
}
