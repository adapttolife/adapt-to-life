// Submission receipts — the contact form and the grant application.
//
// Why this exists: for weeks neither form sent anything. A message or a grant
// application landed in an Airtable row and that was the whole story. Two
// Airtable automations had been built to cover it and both sat at
// deploymentStatus "undeployed", so nothing fired and nothing said so. Alec
// found it by filling in his own contact form and waiting for an email that was
// never coming.
//
// So this lives in the Worker rather than in Airtable: same code path as the
// write, visible in the diff, and reachable by the standing site check. The
// send is via Cloudflare's native SEND_EMAIL binding, the same cfSend path the
// waiver receipt has used in production all along — no API key, sender domain
// already onboarded with SPF/DKIM.
//
// The bcc does double duty on purpose: the person hears back, and hello@ is
// told a submission arrived, in one send with one failure mode instead of two.
//
// HARD RULE: a receipt must never fail a submission. By the time these run the
// record is already saved, and a bounced confirmation is a far smaller problem
// than telling someone their grant application did not go through. Every path
// here swallows its error and logs it.
import { cfSend } from "./email.js";

const FROM = "Adapt To Life <hello@adapttolife.org>";
const HOUSE = "hello@adapttolife.org";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

// One shell so both receipts read as the same organisation. Deliberately plain:
// this is a transactional note, not a campaign, and it should survive any mail
// client without a layout engine behind it.
function shell(bodyHtml) {
  return (
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;` +
    `font-size:16px;line-height:1.6;color:#1c1a15;max-width:560px">` +
    bodyHtml +
    `<p style="margin-top:28px;color:#6b6b70;font-size:14px">Adapt To Life<br>` +
    `501(c)(3) nonprofit &middot; EIN 41-3213344</p>` +
    `</div>`
  );
}

async function send(env, msg, label) {
  try {
    if (!env.SEND_EMAIL) {
      // Staging has no send_email binding by design, so this is the normal path
      // there and must stay quiet rather than look like a fault.
      console.log(`${label}: SEND_EMAIL not bound, skipping`);
      return false;
    }
    await cfSend(env, msg);
    return true;
  } catch (err) {
    console.error(`${label} failed:`, err);
    return false;
  }
}

// Contact form. Short on purpose — it confirms receipt and sets the reply
// expectation the page already makes, and does not pretend to be more.
export async function sendContactReceipt(env, { name, email, message, type }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const subject = "We got your message";
  const text =
    `Hi ${first},\n\n` +
    `Thanks for reaching out. Your message reached us and a person will read it.\n\n` +
    `We reply as soon as we can. If it is urgent, just answer this email.\n\n` +
    `What you sent:\n${message || "(no message)"}\n\n` +
    `Adapt To Life\n501(c)(3) nonprofit, EIN 41-3213344`;
  const html = shell(
    `<p>Hi ${esc(first)},</p>` +
      `<p>Thanks for reaching out. Your message reached us and a person will read it.</p>` +
      `<p>We reply as soon as we can. If it is urgent, just answer this email.</p>` +
      `<p style="margin-top:24px;color:#6b6b70;font-size:14px">What you sent</p>` +
      `<blockquote style="margin:8px 0 0;padding:12px 16px;border-left:3px solid #e3e0d9;` +
      `background:#faf8f4;color:#3f3d38;white-space:pre-wrap">${esc(message || "(no message)")}</blockquote>`
  );
  return send(
    env,
    {
      from: FROM,
      to: email,
      bcc: HOUSE,
      replyTo: HOUSE,
      subject,
      text,
      html,
      // Gives hello@ something to filter on without opening the message.
      headers: { "X-ATL-Form": "contact", "X-ATL-Type": String(type || "") },
    },
    "contact receipt"
  );
}

// Grant application. This one carries more weight: somebody has just asked for
// money for equipment they need, and silence reads as "it did not go through."
// It names the next step rather than only acknowledging.
export async function sendApplyReceipt(env, { name, email, sport, need }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const subject = "Your Hustle & Heart Fund application";
  const text =
    `Hi ${first},\n\n` +
    `Your application reached us. Nothing else is needed from you right now.\n\n` +
    `A person reviews every application. If we need anything to make a decision, ` +
    `we will email you at this address, so keep an eye out.\n\n` +
    (sport ? `Sport: ${sport}\n` : "") +
    (need ? `What you asked for: ${need}\n` : "") +
    `\nAdapt To Life\n501(c)(3) nonprofit, EIN 41-3213344`;
  const html = shell(
    `<p>Hi ${esc(first)},</p>` +
      `<p>Your application reached us. Nothing else is needed from you right now.</p>` +
      `<p>A person reviews every application. If we need anything to make a decision, ` +
      `we will email you at this address, so keep an eye out.</p>` +
      (sport || need
        ? `<p style="margin-top:24px;color:#6b6b70;font-size:14px">What we have</p>` +
          `<div style="padding:12px 16px;border-left:3px solid #e3e0d9;background:#faf8f4;color:#3f3d38">` +
          (sport ? `<div>Sport: ${esc(sport)}</div>` : "") +
          (need ? `<div>What you asked for: ${esc(need)}</div>` : "") +
          `</div>`
        : "")
  );
  return send(
    env,
    {
      from: FROM,
      to: email,
      bcc: HOUSE,
      replyTo: HOUSE,
      subject,
      text,
      html,
      headers: { "X-ATL-Form": "apply" },
    },
    "apply receipt"
  );
}
