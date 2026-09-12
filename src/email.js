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

// ---------------------------------------------------------------------------
// Transactional-send failure ledger.
//
// The three automated emails this site sends — contact receipt, grant-application
// receipt, signed-waiver receipt — all swallow their errors on purpose. A receipt
// must never fail a submission: by the time it runs the record is already saved,
// and telling someone their grant application did not go through because a
// confirmation bounced would be far worse than a missing confirmation.
//
// But "swallow" had meant console.error and nothing else, so a receipt that
// stopped sending would page nobody and show up nowhere. Every applicant would
// quietly stop hearing back and the first signal would be a person asking why
// they never got a reply.
//
// The agent-mail Worker already solved exactly this: a `send_failures` row per
// failed outbound step, served at GET /send-failures, polled by the fleet
// watchdog which pages one bullet per row. This Worker already binds the same D1
// database, so the fix is to write to that table rather than to invent a second
// monitoring path. Same table, same watchdog, distinct `route` values.
//
// Fail-open by contract, twice over: a failed insert console.errors and returns,
// and a missing binding (staging has no D1 by design) is a silent no-op. This
// function must never be able to turn a swallowed receipt failure into a thrown
// one — that would resurrect the exact bug it exists to report.
// ---------------------------------------------------------------------------
export async function recordTransactionalFailure(env, route, toAddr, err) {
  try {
    if (!env.AGENT_MAIL_DB) return;
    await env.AGENT_MAIL_DB
      .prepare(`INSERT INTO send_failures (id, ts, route, to_addr, error) VALUES (?, ?, ?, ?, ?)`)
      .bind(
        crypto.randomUUID(),
        Math.floor(Date.now() / 1000),
        route,
        String(toAddr || ""),
        String((err && err.message) || err).slice(0, 2000)
      )
      .run();
  } catch (e) {
    console.error("send_failures insert failed:", e);
  }
}

// ---------------------------------------------------------------------------
// The Adapt Body Shop shell.
//
// Same file as the house shell on purpose: there is ONE place transactional
// mail gets its chrome, and adding a second brand must mean adding a function
// here, never a hand-built <div> in a handler. That rule is what stopped the
// three ATL receipts drifting into three organisations, and the shop is exactly
// the kind of adjacent surface that would restart the drift.
//
// It is a different brand and the same organisation, so it inherits the plain,
// client-proof structure and changes only what a customer needs to see: the
// shop's name at the top, and the 501(c)(3) line at the bottom, because "your
// shirt money went somewhere" is the single most valuable thing this footer can
// say and it is true.
export const SHOP_NAME = "Adapt Body Shop";
export const SHOP_INBOX = "hello@adapttolife.org";
// FROM stays on the onboarded apex (Alec, 2026-09-04). adaptbodyshop.com is a
// Google Workspace alias domain but is NOT onboarded to Cloudflare Email
// Sending, so a From: on it would leave here unsigned. Reply-To and internal
// notifications use hello@adapttolife.org, the owner-selected organizational inbox.
// To flip the From later: onboard the zone (cf-bounce MX + SPF + DKIM, the exact three
// records adapttolife.org already has) and change this one line.
export const SHOP_FROM = `Adapt Body Shop <${HOUSE_INBOX}>`;

export function shopShell(bodyHtml) {
  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;` +
    `font-size:16px;line-height:1.6;color:#1a1a1a;max-width:560px">` +
    `<p style="margin:0 0 22px;font-family:'Space Mono',ui-monospace,Menlo,monospace;` +
    `font-size:12px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:#c63f22">` +
    `Adapt Body Shop</p>` +
    bodyHtml +
    `<p style="margin-top:28px;color:#6e6b62;font-size:14px">Adapt Body Shop<br>` +
    `The merch surface for Adapt To Life &middot; 501(c)(3) nonprofit &middot; EIN 41-3213344</p>` +
    `</div>`
  );
}
