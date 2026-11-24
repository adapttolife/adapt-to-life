// One mail module, the same file in adapt-to-life and adaptivesportsnearme
// (docs/EMAIL.md, "The send contract (both repos)"). MAIL_TRANSPORT picks the
// provider: "resend" (the target), "gmail" or the Cloudflare SEND_EMAIL binding
// (kept until every Worker runs resend). A provider error NEVER falls through to
// a second provider.
const encoder = new TextEncoder();
function base64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
const b64text = (s) => base64(encoder.encode(String(s)));
const url64 = (s) =>
  b64text(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function header(value) {
  const s = String(value ?? "");
  if (/[\r\n\0]/.test(s)) throw new Error("Unsafe mail header");
  return s;
}
function mailbox(value) {
  const s = header(value).trim();
  const match = s.match(/^(?:([^<>]+)\s*<)?([^<>\s,;@]+@[^<>\s,;@]+\.[^<>\s,;@]+)>?$/);
  if (!match || s.includes("<") !== s.endsWith(">"))
    throw new Error("Invalid mail address");
  const address = match[2].toLowerCase();
  return {
    address,
    formatted: match[1]
      ? `=?UTF-8?B?${b64text(match[1].trim())}?= <${address}>`
      : address,
  };
}
function addresses(value) {
  return (Array.isArray(value) ? value : [value])
    .map((v) => mailbox(v).formatted)
    .join(", ");
}
const folded = (bytes) =>
  base64(bytes)
    .match(/.{1,76}/g)
    ?.join("\r\n") || "";
function textPart(type, value) {
  return `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${folded(encoder.encode(value || ""))}`;
}
export function buildMime(message, allowedFrom) {
  if (!allowedFrom || mailbox(message.from).address !== mailbox(allowedFrom).address)
    throw new Error("Gmail sender is not the configured authorized identity");
  const h = [
    `From: ${mailbox(message.from).formatted}`,
    `To: ${addresses(message.to)}`,
    `Subject: =?UTF-8?B?${b64text(header(message.subject))}?=`,
    "MIME-Version: 1.0",
  ];
  for (const [key, value] of [
    ["Reply-To", message.replyTo],
    ["Cc", message.cc],
    ["Bcc", message.bcc],
  ])
    if (value) h.push(`${key}: ${addresses(value)}`);
  for (const [key, value] of Object.entries(message.headers || {})) {
    if (!/^(?:In-Reply-To|References|Auto-Submitted|X-[A-Za-z0-9-]+)$/i.test(key))
      throw new Error("Unsupported custom mail header");
    h.push(`${key}: ${header(value)}`);
  }
  const alt = "alt_" + crypto.randomUUID();
  let body = `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${textPart("text/plain", message.text)}\r\n--${alt}\r\n${textPart("text/html", message.html || message.text)}\r\n--${alt}--`;
  if (message.attachments?.length) {
    const mixed = "mixed_" + crypto.randomUUID();
    const parts = [body];
    for (const a of message.attachments) {
      const filename = header(a.filename || "attachment");
      if (/["\\]/.test(filename)) throw new Error("Unsafe attachment filename");
      const type = header(a.type || "application/octet-stream");
      if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type))
        throw new Error("Invalid attachment type");
      const bytes =
        a.content instanceof Uint8Array
          ? a.content
          : a.content instanceof ArrayBuffer
            ? new Uint8Array(a.content)
            : null;
      if (!bytes) throw new Error("Attachment must contain bytes");
      const disposition = a.disposition === "inline" ? "inline" : "attachment";
      const cid = a.contentId
        ? `\r\nContent-ID: <${header(a.contentId).replace(/[<>]/g, "")}>`
        : "";
      parts.push(
        `Content-Type: ${type}\r\nContent-Disposition: ${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}${cid}\r\nContent-Transfer-Encoding: base64\r\n\r\n${folded(bytes)}`,
      );
    }
    body = `Content-Type: multipart/mixed; boundary="${mixed}"\r\n\r\n--${mixed}\r\n${parts.join(`\r\n--${mixed}\r\n`)}\r\n--${mixed}--`;
  }
  return h.join("\r\n") + "\r\n" + body + "\r\n";
}
export function mailConfigured(env) {
  if (env.MAIL_TRANSPORT === "resend")
    return !!(env.RESEND_API_KEY && env.MAIL_FROM_DOMAINS && env.ENV_NAME);
  if (env.MAIL_TRANSPORT === "gmail")
    return !!(
      env.GMAIL_CLIENT_ID &&
      env.GMAIL_CLIENT_SECRET &&
      env.GMAIL_REFRESH_TOKEN &&
      env.GMAIL_FROM
    );
  if (env.MAIL_TRANSPORT && env.MAIL_TRANSPORT !== "cloudflare") return false;
  return !!env.SEND_EMAIL;
}
export async function sendMail(env, message) {
  if (!mailConfigured(env)) throw new Error("Mail transport is not configured");
  if (env.MAIL_TRANSPORT === "resend") return sendResend(env, message);
  // The older transports do not know the Resend-only fields; they keep the
  // exact message shape they had before.
  const { idempotencyKey: _key, tags: _tags, ...legacy } = message || {};
  if (env.MAIL_TRANSPORT !== "gmail") return (await env.SEND_EMAIL.send(legacy)) || {};
  const raw = url64(buildMime(legacy, env.GMAIL_FROM));
  // No global token cache: credentials and sender identities must not cross envs.
  const auth = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!auth.ok)
    throw new Error(`Gmail authorization rejected (${auth.status}); no mail submitted`);
  const token = await auth.json();
  if (!token.access_token || token.token_type?.toLowerCase() !== "bearer")
    throw new Error("Invalid Gmail authorization response; no mail submitted");
  // One HTTP submission only. An exception, malformed receipt or lost response is
  // ambiguous; owning delivery ledgers retain review state rather than resending.
  const sent = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!sent.ok)
    throw new Error(`Gmail send failed (${sent.status}); review before retry`);
  const receipt = await sent.json();
  if (typeof receipt.id !== "string" || !receipt.id)
    throw new Error("Gmail returned no message ID; review before retry");
  return {
    messageId: receipt.id,
    id: receipt.id,
    threadId: receipt.threadId,
    provider: "gmail",
    accepted: true,
  };
}

// ---------------------------------------------------------------------------
// Resend. Every send carries a stable Idempotency-Key and the tags that say what
// it was, is checked before the network, and outside production reaches only
// the team allow list. Errors say whether a retry is safe (`retryable`).
// ---------------------------------------------------------------------------
const RESEND_URL = "https://api.resend.com/emails";
const RESEND_HEADER =
  /^(?:List-Unsubscribe|List-Unsubscribe-Post|In-Reply-To|References|Auto-Submitted|X-[A-Za-z0-9-]+)$/i;
const TAG_VALUE = /^[A-Za-z0-9_-]{1,256}$/;

export class MailError extends Error {
  constructor(message, { retryable = false, status } = {}) {
    super(message);
    this.name = "MailError";
    this.retryable = retryable;
    if (status !== undefined) this.status = status;
  }
}
const refuse = (message) => new MailError(message, { retryable: false });

const commaList = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

function recipients(value) {
  if (value === undefined || value === null || value === "") return [];
  return (Array.isArray(value) ? value : [value]).map((v) => {
    const s = header(v).trim();
    return { raw: s, address: mailbox(s).address };
  });
}

// "a@b.org" matches the address exactly; "@b.org" matches any address at b.org.
export function mailAllowed(address, allow) {
  const a = String(address || "").toLowerCase();
  return commaList(allow).some((entry) =>
    entry.startsWith("@") ? a.endsWith(entry) : a === entry,
  );
}

function attachmentBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  throw refuse("Attachment must contain bytes");
}

// Builds the exact Resend request body. Throws (retryable: false) before any
// network call when the message breaks the contract.
export function resendPayload(env, message) {
  const m = message || {};
  const key = m.idempotencyKey;
  if (typeof key !== "string" || !key.trim() || key.length > 256 || /[\r\n\0]/.test(key))
    throw refuse("Resend send needs an idempotencyKey");
  const tags = m.tags || {};
  if (!tags.brand || !tags.kind) throw refuse("Resend send needs tags.brand and tags.kind");
  const allTags = { ...tags, env: env.ENV_NAME };
  for (const [name, value] of Object.entries(allTags))
    if (!TAG_VALUE.test(name) || !TAG_VALUE.test(String(value ?? "")))
      throw refuse(`Invalid mail tag ${name}`);

  let from;
  try {
    from = mailbox(m.from);
  } catch {
    throw refuse("Invalid From address");
  }
  const fromDomain = from.address.split("@")[1];
  if (!commaList(env.MAIL_FROM_DOMAINS).includes(fromDomain))
    throw refuse("From domain is not an allowed sending domain");

  let to, cc, bcc, replyTo, subject;
  try {
    to = recipients(m.to);
    cc = recipients(m.cc);
    bcc = recipients(m.bcc);
    replyTo = recipients(m.replyTo);
    subject = header(m.subject);
  } catch (e) {
    throw refuse(e.message);
  }
  if (!to.length) throw refuse("Mail has no recipient");

  const headers = {};
  for (const [name, value] of Object.entries(m.headers || {})) {
    if (!RESEND_HEADER.test(name)) throw refuse("Unsupported custom mail header");
    if (/[\r\n\0]/.test(String(value ?? ""))) throw refuse("Unsafe mail header");
    headers[name] = String(value ?? "");
  }

  const attachments = (m.attachments || []).map((a) => {
    const filename = String(a.filename || "attachment");
    if (/[\r\n\0"\\]/.test(filename)) throw refuse("Unsafe attachment filename");
    const type = String(a.type || "application/octet-stream");
    if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type)) throw refuse("Invalid attachment type");
    const out = { filename, content: base64(attachmentBytes(a.content)), content_type: type };
    if (a.contentId) out.content_id = String(a.contentId).replace(/[<>\r\n\0]/g, "");
    return out;
  });

  const body = {
    from: m.from.trim(),
    to: to.map((r) => r.raw),
    subject,
    text: String(m.text ?? ""),
    tags: Object.entries(allTags).map(([name, value]) => ({ name, value: String(value) })),
  };
  if (m.html) body.html = String(m.html);
  if (cc.length) body.cc = cc.map((r) => r.raw);
  if (bcc.length) body.bcc = bcc.map((r) => r.raw);
  if (replyTo.length) body.reply_to = replyTo.map((r) => r.raw);
  if (Object.keys(headers).length) body.headers = headers;
  if (attachments.length) body.attachments = attachments;
  return { key, body, addresses: [...to, ...cc, ...bcc].map((r) => r.address) };
}

async function sendResend(env, message) {
  const { key, body, addresses } = resendPayload(env, message);
  // Staging and previews share production's databases: only team addresses.
  if (env.ENV_NAME !== "production" && !addresses.every((a) => mailAllowed(a, env.MAIL_ALLOW))) {
    console.log(
      `mail dropped outside production (not-allowed): ${message.tags.brand}/${message.tags.kind}`,
    );
    return { dropped: true, reason: "not-allowed" };
  }
  let res;
  try {
    res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    // A timeout or dropped connection is ambiguous, and safe to retry: the same
    // key and body return the first result for 24 hours.
    throw new MailError(`Resend request failed (${e?.name || "network"})`, {
      retryable: true,
    });
  }
  if (!res.ok) {
    // Resend's error name ("validation_error", "rate_limit_exceeded") is safe to
    // keep; its free-text message can echo the request, so it is not kept.
    const detail = await res.json().catch(() => ({}));
    const name = /^[a-z_]{1,60}$/.test(detail?.name || "") ? ` ${detail.name}` : "";
    throw new MailError(`Resend send failed (${res.status}${name})`, {
      retryable: res.status === 429 || res.status >= 500,
      status: res.status,
    });
  }
  const receipt = await res.json().catch(() => ({}));
  if (typeof receipt?.id !== "string" || !receipt.id)
    throw new MailError("Resend returned no message id", { retryable: true });
  return { id: receipt.id, messageId: receipt.id, provider: "resend", accepted: true };
}

// A short, stable hash for idempotency keys built from personal data (an email
// address never appears in a key, a tag or Resend's log in the clear).
export async function keyHash(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(String(value ?? "").trim().toLowerCase()),
  );
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
