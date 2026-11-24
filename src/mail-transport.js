// The one mail module. This file is the same in adapt-to-life and
// adaptivesportsnearme: docs/EMAIL.md in adapt-to-life, "The send contract".
//
// MAIL_TRANSPORT picks exactly one provider: "resend" (the target for every
// Worker), "cloudflare" (kept: agent mail and the staging receipt preview pick
// it explicitly) or "gmail" (deleted once no Worker selects it). A provider
// error NEVER falls through to another provider.
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
// Attachment content is bytes: a Uint8Array, an ArrayBuffer or any typed-array
// view. A string is refused, never guessed at: a base64 string (the old Resend
// shape) and a plain-text body look alike, and decoding the wrong one would send
// a corrupt file. Senders convert to bytes before calling (Nov 23 2026 incident:
// the waiver receipt passed base64 and every Gmail receipt threw here).
function attachmentBytes(content) {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  if (ArrayBuffer.isView(content))
    return new Uint8Array(content.buffer, content.byteOffset, content.byteLength);
  return null;
}
// Custom headers a caller may set. The one click unsubscribe pair is what list
// mail needs; the rest are threading and auto reply markers.
const CUSTOM_HEADER =
  /^(?:List-Unsubscribe|List-Unsubscribe-Post|In-Reply-To|References|Auto-Submitted|X-[A-Za-z0-9-]+)$/i;
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
    if (!CUSTOM_HEADER.test(key)) throw new Error("Unsupported custom mail header");
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
      const bytes = attachmentBytes(a.content);
      if (!bytes || !bytes.byteLength)
        throw new Error(
          `Attachment must contain bytes (got ${
            typeof a.content === "string"
              ? "a string"
              : bytes
                ? "0 bytes"
                : typeof a.content
          })`,
        );
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
// A send error says whether trying again later is safe. 429, 5xx, a network
// timeout and 409 concurrent_idempotent_requests (the same key still in flight)
// are retryable. 409 invalid_idempotent_request (the same key with a different
// body) and every other refusal are not; so is every check that fails before
// the network.
export class MailError extends Error {
  constructor(message, { retryable = false, status = null } = {}) {
    super(message);
    this.name = "MailError";
    this.retryable = retryable;
    this.status = status;
  }
}
const commaList = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
const recipients = (value) =>
  (Array.isArray(value) ? value : value ? [value] : []).filter(
    (v) => String(v ?? "").trim() !== "",
  );
// Outside production only team addresses get mail: MAIL_ALLOW is a comma list of
// full addresses or "@domain". An unset list allows nobody. Exported so code that
// writes Resend contacts can apply the same rule before touching the list.
export function mailAllowed(env, address) {
  if (env?.ENV_NAME === "production") return true;
  let a;
  try {
    a = mailbox(address).address;
  } catch {
    return false;
  }
  return commaList(env?.MAIL_ALLOW).some((entry) =>
    entry.startsWith("@") ? a.endsWith(entry) : a === entry,
  );
}
export function mailConfigured(env) {
  if (env.MAIL_TRANSPORT === "resend")
    return !!(env.RESEND_API_KEY && commaList(env.MAIL_FROM_DOMAINS).length);
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
const TAG_VALUE = /^[A-Za-z0-9_-]{1,256}$/;
// Resend reads a display name with a comma or quote as something else; quote it.
function resendMailbox(value) {
  const { address } = mailbox(value);
  const name = header(value)
    .trim()
    .match(/^([^<>]+?)\s*</)?.[1];
  if (!name) return address;
  return /[",;:()\\]/.test(name)
    ? `"${name.replace(/["\\]/g, "\\$&")}" <${address}>`
    : `${name} <${address}>`;
}
// Everything checked here is checked before the network: a refused message is
// never half sent, and every refusal is a MailError with retryable: false.
export function resendRequest(env, message) {
  try {
    return buildResendRequest(env, message);
  } catch (error) {
    if (error instanceof MailError) throw error;
    throw new MailError(error?.message || "Invalid mail");
  }
}
function buildResendRequest(env, message) {
  const key = message.idempotencyKey;
  if (typeof key !== "string" || !key || key.length > 256 || /[\r\n\0]/.test(key))
    throw new MailError("Mail needs an idempotencyKey");
  const tags = message.tags || {};
  if (!tags.brand || !tags.kind) throw new MailError("Mail needs brand and kind tags");
  const tagList = Object.entries({ ...tags, env: env.ENV_NAME || "unknown" }).map(
    ([name, value]) => {
      if (!TAG_VALUE.test(name) || !TAG_VALUE.test(String(value)))
        throw new MailError("Invalid mail tag");
      return { name, value: String(value) };
    },
  );
  const from = mailbox(message.from);
  if (!commaList(env.MAIL_FROM_DOMAINS).includes(from.address.split("@")[1]))
    throw new MailError("Sender is not on this Worker's mail domain");
  const to = recipients(message.to).map(resendMailbox);
  const cc = recipients(message.cc).map(resendMailbox);
  const bcc = recipients(message.bcc).map(resendMailbox);
  if (!to.length) throw new MailError("Mail needs a recipient");
  const body = {
    from: resendMailbox(message.from),
    to,
    subject: header(message.subject),
    text: String(message.text || ""),
    tags: tagList,
  };
  if (message.html) body.html = String(message.html);
  if (cc.length) body.cc = cc;
  if (bcc.length) body.bcc = bcc;
  if (recipients(message.replyTo).length)
    body.reply_to = recipients(message.replyTo).map(resendMailbox);
  const headers = {};
  for (const [name, value] of Object.entries(message.headers || {})) {
    if (!CUSTOM_HEADER.test(header(name)))
      throw new MailError("Unsupported custom mail header");
    headers[name] = header(value);
  }
  if (Object.keys(headers).length) body.headers = headers;
  if (message.attachments?.length)
    body.attachments = message.attachments.map((a) => {
      const filename = header(a.filename || "attachment");
      const type = header(a.contentType || a.type || "application/octet-stream");
      if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type))
        throw new MailError("Invalid attachment type");
      const bytes = attachmentBytes(a.content);
      if (!bytes || !bytes.byteLength)
        throw new MailError(
          `Attachment must contain bytes (got ${typeof a.content === "string" ? "a string" : bytes ? "0 bytes" : typeof a.content})`,
        );
      const out = { filename, content: base64(bytes), content_type: type };
      if (a.contentId) out.content_id = header(a.contentId).replace(/[<>]/g, "");
      return out;
    });
  const everyone = [
    ...recipients(message.to),
    ...recipients(message.cc),
    ...recipients(message.bcc),
  ];
  return { key, body, allowed: everyone.every((r) => mailAllowed(env, r)) };
}
async function sendResend(env, message) {
  const { key, body, allowed } = resendRequest(env, message);
  // Staging, preview and dev never mail anyone outside the team. The caller
  // records this as done and not sent.
  if (!allowed) {
    console.log("Mail dropped outside production", {
      env: env.ENV_NAME,
      kind: message.tags.kind,
      reason: "not-allowed",
    });
    return {
      dropped: true,
      reason: "not-allowed",
      provider: "resend",
      accepted: false,
    };
  }
  let response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    // A timeout or dropped connection may still have reached Resend; the same
    // Idempotency-Key makes a later retry safe for 24 hours.
    throw new MailError(`Resend unreachable (${error?.name || "error"})`, {
      retryable: true,
    });
  }
  if (!response.ok) {
    // Resend's error name ("validation_error", "rate_limit_exceeded") is safe to
    // keep; its free-text message can echo the request, so it is never kept.
    let name = "";
    try {
      name = String((await response.json())?.name || "");
    } catch {}
    if (!/^[a-z_]{1,60}$/.test(name)) name = "";
    throw new MailError(
      `Resend refused the send (${response.status}${name ? ` ${name}` : ""})`,
      {
        retryable:
          response.status === 429 ||
          response.status >= 500 ||
          (response.status === 409 && name === "concurrent_idempotent_requests"),
        status: response.status,
      },
    );
  }
  let receipt = null;
  try {
    receipt = await response.json();
  } catch {}
  // Accepted without an id is never recorded as sent. Retrying is safe: the
  // same key and body return the first result for 24 hours.
  if (typeof receipt?.id !== "string" || !receipt.id)
    throw new MailError("Resend returned no message id", { retryable: true });
  return { id: receipt.id, messageId: receipt.id, provider: "resend", accepted: true };
}
// A stable hash for idempotency keys built from personal data, so an email
// address never appears in a key or in Resend's log in the clear.
export async function keyHash(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(
      String(value ?? "")
        .trim()
        .toLowerCase(),
    ),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function sendMail(env, message) {
  // Local configuration (a missing key or binding): nothing was sent, so a
  // later try is safe once it is fixed.
  if (!mailConfigured(env))
    throw new MailError("Mail transport is not configured", { retryable: true });
  if (env.MAIL_TRANSPORT === "resend") return sendResend(env, message);
  // The older transports have no use for these two; never hand them on.
  const { idempotencyKey, tags, ...legacy } = message;
  if (env.MAIL_TRANSPORT !== "gmail") return (await env.SEND_EMAIL.send(legacy)) || {};
  message = legacy;
  const raw = url64(buildMime(message, env.GMAIL_FROM));
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
