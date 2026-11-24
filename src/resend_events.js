// POST /api/resend-events: Resend's delivery events for the mail this Worker
// sends (docs/EMAIL.md, "Knowing it worked").
//
// Resend signs each delivery the Svix way: HMAC-SHA256 over
// "<svix-id>.<svix-timestamp>.<raw body>" with the webhook secret (the part
// after "whsec_", base64). We check it on the raw bytes before parsing,
// refuse a timestamp more than five minutes off, and store each svix-id once,
// because Resend retries and replays deliveries.
//
// Only events tagged with a brand this Worker sends for (Adapt To Life and
// Adapt Body Shop) AND this Worker's own ENV_NAME are kept: staging and
// production share the database, and one Resend team sends for other brands.
// Bounces, complaints and failures are written to send_failures once, which is
// the table the fleet alert path reads.
const TOLERANCE_SECONDS = 5 * 60;
const MAX_BODY_BYTES = 256 * 1024;
const BRANDS = new Set(["adapttolife", "bodyshop"]);
const FAILURES = new Set(["email.bounced", "email.complained", "email.failed"]);
const encoder = new TextEncoder();

const reply = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

function fromBase64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// True when one of the v1 signatures in the header matches. crypto.subtle.verify
// compares in constant time.
export async function verifySvix({ id, timestamp, signature, body, secret, nowSeconds }) {
  if (!id || !timestamp || !signature || !secret) return { ok: false, why: "missing" };
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, why: "timestamp" };
  const now = nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS)
    return { ok: false, why: "stale" };
  let keyBytes;
  try {
    keyBytes = fromBase64(String(secret).replace(/^whsec_/, ""));
  } catch {
    return { ok: false, why: "secret" };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signed = encoder.encode(`${id}.${timestamp}.${body}`);
  for (const part of String(signature).split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    let sig;
    try {
      sig = fromBase64(value);
    } catch {
      continue;
    }
    if (await crypto.subtle.verify("HMAC", key, sig, signed)) return { ok: true };
  }
  return { ok: false, why: "signature" };
}

// Resend sends tags as an object ({ brand: "adapttolife" }); accept the
// [{ name, value }] list form too.
export function eventTags(data) {
  const tags = data?.tags;
  if (Array.isArray(tags))
    return Object.fromEntries(
      tags.filter((t) => t && typeof t.name === "string").map((t) => [t.name, String(t.value ?? "")]),
    );
  if (tags && typeof tags === "object")
    return Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, String(v ?? "")]));
  return {};
}

const clip = (v, n = 500) => (v === undefined || v === null ? null : String(v).slice(0, n));

export async function handleResendEvents(request, env) {
  if (request.method !== "POST") return reply(405, { ok: false, error: "Method not allowed" });
  // 503 makes Resend retry later instead of dropping the event.
  if (!env.RESEND_WEBHOOK_SECRET || !env.AGENT_MAIL_DB)
    return reply(503, { ok: false, error: "Not configured" });
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY_BYTES) return reply(413, { ok: false, error: "Too large" });
  const body = await request.text();
  if (encoder.encode(body).length > MAX_BODY_BYTES)
    return reply(413, { ok: false, error: "Too large" });

  const id = request.headers.get("svix-id") || "";
  const check = await verifySvix({
    id,
    timestamp: request.headers.get("svix-timestamp") || "",
    signature: request.headers.get("svix-signature") || "",
    body,
    secret: env.RESEND_WEBHOOK_SECRET,
  });
  if (!check.ok) return reply(401, { ok: false, error: "Invalid signature" });

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return reply(400, { ok: false, error: "Invalid JSON" });
  }
  const type = typeof event?.type === "string" ? event.type.slice(0, 64) : "";
  const data = event?.data || {};
  const tags = eventTags(data);
  // Someone else's mail (another brand, or the other environment): acknowledge
  // so Resend stops retrying, and keep nothing.
  if (!type || !BRANDS.has(tags.brand) || tags.env !== env.ENV_NAME)
    return reply(200, { ok: true, ignored: true });

  const recipient = clip(Array.isArray(data.to) ? data.to.join(", ") : data.to, 320);
  const detailObj = data.bounce || data.failed || data.complaint || null;
  const detail = detailObj ? clip(JSON.stringify(detailObj), 1000) : null;
  const db = env.AGENT_MAIL_DB;
  const receivedAt = new Date().toISOString();
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO resend_events
           (svix_id,received_at,event_at,type,email_id,brand,kind,env,recipient,detail)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        clip(id, 200),
        receivedAt,
        clip(event.created_at, 64),
        type,
        clip(data.email_id, 200),
        tags.brand,
        clip(tags.kind, 256),
        tags.env,
        recipient,
        detail,
      ),
  ];
  if (FAILURES.has(type)) {
    // The id is derived from the svix-id, so a replay can never add a second row.
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO send_failures (id, ts, route, to_addr, error) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(
          `resend:${clip(id, 200)}`,
          Math.floor(Date.now() / 1000),
          `resend:${type.replace(/^email\./, "")}`,
          recipient || "",
          clip(
            `${tags.brand}/${tags.kind || "?"} ${data.email_id || ""} ${detail || ""}`.trim(),
            2000,
          ),
        ),
    );
  }
  const results = await db.batch(statements);
  const fresh = Boolean(results?.[0]?.meta?.changes);
  return reply(200, { ok: true, recorded: fresh, duplicate: !fresh });
}
