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
