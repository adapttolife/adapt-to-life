// Outbound email — Cloudflare Email Sending via the native `send_email` Worker binding.
// One helper for every outbound path (agent replies, waiver receipts). There is no API
// key to manage: the SEND_EMAIL binding is ambient. Each sender domain is onboarded to
// Cloudflare Email Service (SPF/DKIM on the zone). This replaces the old Resend HTTP API.
//
// Shape mirrors Cloudflare's structured message builder — no raw MIME needed:
//   from, to, replyTo, cc, bcc, subject, text, html, headers, attachments
// attachments: [{ filename, content: <ArrayBuffer|Uint8Array — raw bytes, NOT base64>, type, disposition, contentId? }]
// Inline images (Spec 70 P2): the builder's Attachment interface is
//   { content; filename; type; disposition: "attachment" | "inline"; contentId?: string }
// (Email Service Workers API reference), so cid-referenced inline PNGs ride the
// structured path — disposition:"inline" + contentId, <img src="cid:..."> in html.
// No legacy raw-MIME EmailMessage needed.
export async function cfSend(env, { from, to, replyTo, cc, bcc, subject, text, html, headers, attachments }) {
  if (!env.SEND_EMAIL) throw new Error("SEND_EMAIL binding not configured");
  const msg = { from, to, subject };
  if (text) msg.text = text;
  if (html) msg.html = html;
  if (replyTo) msg.replyTo = replyTo;
  if (cc) msg.cc = cc;
  if (bcc) msg.bcc = bcc;
  if (headers) msg.headers = headers;
  if (attachments) msg.attachments = attachments;
  const res = await env.SEND_EMAIL.send(msg);
  return res || {};
}

// ---------------------------------------------------------------------------
// The house shell for transactional mail.
//
// Every automated message we send from hello@ now renders through this: the
// contact receipt, the grant-application receipt, and the signed-waiver
// receipt. Before this they used two different font stacks, two ink colours and
// two sign-offs, so three emails from one address read as two organisations to
// anyone who got more than one of them.
//
// Deliberately plain. These are transactional notes, not campaigns, and they
// have to survive any mail client without a layout engine behind it. The
// newsletter is where design lives; this is where trust does.
// ---------------------------------------------------------------------------
export const HOUSE_FROM = "Adapt To Life <hello@adapttolife.org>";
export const HOUSE_INBOX = "hello@adapttolife.org";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const SIGNOFF_TEXT = "Adapt To Life\n501(c)(3) nonprofit, EIN 41-3213344";

export function houseShell(bodyHtml) {
  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;` +
    `font-size:16px;line-height:1.6;color:#1c1a15;max-width:560px">` +
    bodyHtml +
    `<p style="margin-top:28px;color:#6b6b70;font-size:14px">Adapt To Life<br>` +
    `501(c)(3) nonprofit &middot; EIN 41-3213344</p>` +
    `</div>`
  );
}

export function houseSignoff() {
  return SIGNOFF_TEXT;
}

// A quoted block: what someone sent us, or what we have on file. Same treatment
// everywhere so "here is what we got" always looks the same.
export function houseQuote(innerHtml) {
  return (
    `<div style="margin:8px 0 0;padding:12px 16px;border-left:3px solid #e3e0d9;` +
    `background:#faf8f4;color:#3f3d38;white-space:pre-wrap">${innerHtml}</div>`
  );
}

export function houseLabel(text) {
  return `<p style="margin-top:24px;color:#6b6b70;font-size:14px">${esc(text)}</p>`;
}
