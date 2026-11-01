import { sendMail } from "./mail-transport.js";

const COOKIE = "asnm_admin";
const SESSION_SECONDS = 60 * 60 * 12;
const TOKEN_MINUTES = 15;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const now = () => new Date().toISOString();
const future = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();

export function adminEmail(value) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  return EMAIL_RE.test(email) &&
    /@(adapttolife\.org|adaptivesportsnearme\.com|faisaln\.com)$/i.test(email)
    ? email
    : "";
}

function token() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hash(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function signature(id, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(id));
  let text = "";
  for (const byte of new Uint8Array(signed)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function cookieValue(request) {
  const entry = String(request.headers.get("Cookie") || "")
    .split(";")
    .find((part) => part.trim().startsWith(`${COOKIE}=`));
  return entry ? entry.trim().slice(COOKIE.length + 1) : "";
}

export async function readAdminSession(request, db, secret) {
  const [id, supplied] = cookieValue(request).split(".");
  if (!id || !supplied || supplied !== (await signature(id, secret))) return null;
  const row = await db
    .prepare(
      "SELECT email FROM admin_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > ?",
    )
    .bind(id, now())
    .first();
  const email = adminEmail(row?.email);
  return email ? { id, email, cookie: `${COOKIE}=${id}.${supplied}` } : null;
}

export async function requestLogin(db, email) {
  const raw = token();
  await db
    .prepare(
      "INSERT INTO admin_login_tokens (id, token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      await hash(raw),
      email,
      future(TOKEN_MINUTES * 60),
      now(),
    )
    .run();
  return raw;
}

export async function consumeLogin(db, raw, secret, { secure = true } = {}) {
  if (!raw || raw.length > 500) return null;
  const row = await db
    .prepare(
      "SELECT id, email FROM admin_login_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?",
    )
    .bind(await hash(raw), now())
    .first();
  const email = adminEmail(row?.email);
  if (!row || !email) return null;
  const result = await db
    .prepare(
      "UPDATE admin_login_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL",
    )
    .bind(now(), row.id)
    .run();
  if (!Number(result.meta?.changes || 0)) return null;
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO admin_sessions (id, email, expires_at, created_at) VALUES (?, ?, ?, ?)",
    )
    .bind(id, email, future(SESSION_SECONDS), now())
    .run();
  const secureAttribute = secure ? "; Secure" : "";
  return {
    email,
    cookie: `${COOKIE}=${id}.${await signature(id, secret)}; HttpOnly${secureAttribute}; SameSite=Strict; Path=/; Max-Age=${SESSION_SECONDS}`,
  };
}

export async function sendAdminLink(env, email, link) {
  return sendMail(env, {
    from: `Adapt To Life <${env.GMAIL_FROM || "hello@adapttolife.org"}>`,
    to: email,
    replyTo: env.GMAIL_FROM || "hello@adapttolife.org",
    subject: "Your Adapt To Life admin sign-in link",
    text: `Use this one-time link to open the Adapt To Life admin dashboard:\n\n${link}\n\nIt expires in 15 minutes.`,
    html: `<p>Use this one-time link to open the Adapt To Life admin dashboard:</p><p><a href="${link}">Open the dashboard</a></p><p>It expires in 15 minutes.</p>`,
  });
}
