// Explicit Gmail opt-in. Existing callers keep their provider until deliberately
// configured; Gmail errors NEVER fall through to a second provider or retry send.
const encoder = new TextEncoder();
function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
const b64text = s => base64(encoder.encode(String(s)));
const url64 = s => b64text(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function header(value) {
  const s = String(value ?? '');
  if (/[\r\n\0]/.test(s)) throw new Error('Unsafe mail header');
  return s;
}
function mailbox(value) {
  const s = header(value).trim();
  const match = s.match(/^(?:([^<>]+)\s*<)?([^<>\s,;@]+@[^<>\s,;@]+\.[^<>\s,;@]+)>?$/);
  if (!match || (s.includes('<') !== s.endsWith('>'))) throw new Error('Invalid mail address');
  const address = match[2].toLowerCase();
  return { address, formatted: match[1] ? `=?UTF-8?B?${b64text(match[1].trim())}?= <${address}>` : address };
}
function addresses(value) {
  return (Array.isArray(value) ? value : [value]).map(v => mailbox(v).formatted).join(', ');
}
const folded = bytes => base64(bytes).match(/.{1,76}/g)?.join('\r\n') || '';
function textPart(type, value) {
  return `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${folded(encoder.encode(value || ''))}`;
}
export function buildMime(message, allowedFrom) {
  if (!allowedFrom || mailbox(message.from).address !== mailbox(allowedFrom).address) throw new Error('Gmail sender is not the configured authorized identity');
  const h = [`From: ${mailbox(message.from).formatted}`, `To: ${addresses(message.to)}`, `Subject: =?UTF-8?B?${b64text(header(message.subject))}?=`, 'MIME-Version: 1.0'];
  for (const [key, value] of [['Reply-To', message.replyTo], ['Cc', message.cc], ['Bcc', message.bcc]]) if (value) h.push(`${key}: ${addresses(value)}`);
  for (const [key, value] of Object.entries(message.headers || {})) {
    if (!/^(?:In-Reply-To|References|Auto-Submitted|X-[A-Za-z0-9-]+)$/i.test(key)) throw new Error('Unsupported custom mail header');
    h.push(`${key}: ${header(value)}`);
  }
  const alt = 'alt_' + crypto.randomUUID();
  let body = `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n--${alt}\r\n${textPart('text/plain', message.text)}\r\n--${alt}\r\n${textPart('text/html', message.html || message.text)}\r\n--${alt}--`;
  if (message.attachments?.length) {
    const mixed = 'mixed_' + crypto.randomUUID();
    const parts = [body];
    for (const a of message.attachments) {
      const filename = header(a.filename || 'attachment');
      if (/["\\]/.test(filename)) throw new Error('Unsafe attachment filename');
      const type = header(a.type || 'application/octet-stream');
      if (!/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(type)) throw new Error('Invalid attachment type');
      const bytes = a.content instanceof Uint8Array ? a.content : a.content instanceof ArrayBuffer ? new Uint8Array(a.content) : null;
      if (!bytes) throw new Error('Attachment must contain bytes');
      const disposition = a.disposition === 'inline' ? 'inline' : 'attachment';
      const cid = a.contentId ? `\r\nContent-ID: <${header(a.contentId).replace(/[<>]/g, '')}>` : '';
      parts.push(`Content-Type: ${type}\r\nContent-Disposition: ${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}${cid}\r\nContent-Transfer-Encoding: base64\r\n\r\n${folded(bytes)}`);
    }
    body = `Content-Type: multipart/mixed; boundary="${mixed}"\r\n\r\n--${mixed}\r\n${parts.join(`\r\n--${mixed}\r\n`)}\r\n--${mixed}--`;
  }
  return h.join('\r\n') + '\r\n' + body + '\r\n';
}
export function mailConfigured(env) {
  if (env.MAIL_TRANSPORT === 'gmail') return !!(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN && env.GMAIL_FROM);
  if (env.MAIL_TRANSPORT && env.MAIL_TRANSPORT !== 'cloudflare') return false;
  return !!env.SEND_EMAIL;
}
export async function sendMail(env, message) {
  if (!mailConfigured(env)) throw new Error('Mail transport is not configured');
  if (env.MAIL_TRANSPORT !== 'gmail') return (await env.SEND_EMAIL.send(message)) || {};
  const raw = url64(buildMime(message, env.GMAIL_FROM));
  // No global token cache: credentials and sender identities must not cross envs.
  const auth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET, refresh_token: env.GMAIL_REFRESH_TOKEN }),
    signal: AbortSignal.timeout(10000),
  });
  if (!auth.ok) throw new Error(`Gmail authorization rejected (${auth.status}); no mail submitted`);
  const token = await auth.json();
  if (!token.access_token || token.token_type?.toLowerCase() !== 'bearer') throw new Error('Invalid Gmail authorization response; no mail submitted');
  // One HTTP submission only. An exception, malformed receipt or lost response is
  // ambiguous; owning delivery ledgers retain review state rather than resending.
  const sent = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }), signal: AbortSignal.timeout(15000),
  });
  if (!sent.ok) throw new Error(`Gmail send failed (${sent.status}); review before retry`);
  const receipt = await sent.json();
  if (typeof receipt.id !== 'string' || !receipt.id) throw new Error('Gmail returned no message ID; review before retry');
  return { messageId: receipt.id, id: receipt.id, threadId: receipt.threadId, provider: 'gmail', accepted: true };
}
