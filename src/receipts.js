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
// The bcc does double duty on purpose: the person hears back, and the house is
// told a submission arrived, in one send with one failure mode instead of two.
//
// HARD RULE: a receipt must never fail a submission. By the time these run the
// record is already saved, and a bounced confirmation is a far smaller problem
// than telling someone their grant application did not go through. Every path
// here swallows its error and logs it.
import {
  cfSend, HOUSE_FROM, HOUSE_INBOX, houseShell, houseQuote, houseLabel, esc,
  recordTransactionalFailure,
} from "./email.js";
import { fundPosition, usd } from "./fund.js";

const FUND_URL = "https://adapttolife.org/hustle-and-heart";

// Where the internal copy of a GRANT APPLICATION goes.
//
// A grant application carries disability detail, financial need and a personal
// story: it is the most sensitive data this organisation holds. hello@ is the
// public contact address printed in every page footer and it is a shared seat
// that working staff sign into, so "who can read an applicant's file" currently
// answers itself as "anyone with the shared password." That is a policy a
// 501(c)(3) should be able to answer deliberately.
//
// This var is the seam. It stays on hello@ until a dedicated, restricted
// grants@ mailbox exists in Workspace, and flipping it is one line in
// wrangler.jsonc with no code change. Contact-form and waiver receipts stay on
// hello@ on purpose: those are ordinary correspondence.
const grantsInbox = (env) => env.GRANTS_INBOX || HOUSE_INBOX;

async function send(env, msg, label) {
  try {
    if (!env.SEND_EMAIL) {
      // Staging has no send_email binding by design, so this is the normal path
      // there and must stay quiet rather than look like a fault. Deliberately
      // NOT recorded as a failure: staging is supposed to look like this, and a
      // ledger that cries wolf on every staging deploy gets ignored on the day
      // it is right.
      console.log(`${label}: SEND_EMAIL not bound, skipping`);
      return false;
    }
    await cfSend(env, msg);
    return true;
  } catch (err) {
    console.error(`${label} failed:`, err);
    // Still swallowed for the caller — the submission is already saved and must
    // not fail — but no longer invisible. This is what the fleet watchdog pages on.
    await recordTransactionalFailure(env, `receipt:${label}`, msg && msg.to, err);
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
  const html = houseShell(
    `<p>Hi ${esc(first)},</p>` +
      `<p>Thanks for reaching out. Your message reached us and a person will read it.</p>` +
      `<p>We reply as soon as we can. If it is urgent, just answer this email.</p>` +
      houseLabel("What you sent") +
      houseQuote(esc(message || "(no message)"))
  );
  return send(
    env,
    {
      from: HOUSE_FROM,
      to: email,
      bcc: HOUSE_INBOX,
      replyTo: HOUSE_INBOX,
      subject,
      text,
      html,
      // Gives the house something to filter on without opening the message.
      headers: { "X-ATL-Form": "contact", "X-ATL-Type": String(type || "") },
    },
    "contact receipt"
  );
}

// Grant application. This one carries the most weight of anything we send.
//
// Somebody has just asked for money for equipment they need, and the two ways
// to get it wrong are opposite: silence reads as "it did not go through," and a
// warm, confident acknowledgement reads as "the money is coming." The fund has
// a few hundred dollars in it. So this email does three jobs the old one did
// not:
//
//   1. States the stage plainly, with the real number when we can read it, so
//      nobody builds a plan around a grant that may be months away.
//   2. Promises only what we control: a person reads it, and you hear back. No
//      timeline, because we cannot hold one yet.
//   3. Invites, without conditioning. The invitation to help the fund grow is
//      explicitly optional and explicitly severed from the application, because
//      an applicant must never believe that fundraising buys consideration.
//      That sentence is a control, not a courtesy. Do not delete it.
//
// The fund position is best-effort. If Givebutter is unreachable the sentence
// is dropped rather than guessed: a wrong number here is worse than no number.
export async function sendApplyReceipt(env, { name, email, sport, need }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const subject = "Your Hustle & Heart Fund application";

  let position = "";
  try {
    const f = await fundPosition(env);
    if (f.live) position = ` We have raised ${usd(f.raised)} toward ${usd(f.goal)} so far.`;
  } catch (err) {
    console.error("apply receipt: fund position unavailable:", err);
  }

  const inbox = grantsInbox(env);

  // Say "the Hustle & Heart Fund", never "Adapt To Life", and never a metaphor.
  // The first draft read "Adapt To Life is a young fund and it is still filling"
  // and Alec read it as a claim that the ORGANISATION was unfinished, sitting a
  // paragraph away from talk of pending filings. ATL is a fully recognised
  // 501(c)(3) with an EIN and a determination letter. What is small is the money.
  // Name the fund, name the money, and let the figure below do the rest.
  const picture =
    `A person reads every one. Here is the honest picture so you are not left ` +
    `guessing: the Hustle & Heart Fund is new and the money in it is small.${position} ` +
    `We fund what we can as money comes in, so some requests move quickly and ` +
    `others wait for the fund to catch up. Applying is not a promise of a grant. ` +
    `What we do promise is that a person reads it and that you hear where it stands.`;

  const text =
    `Hi ${first},\n\n` +
    `Your application reached us. Nothing else is needed from you right now.\n\n` +
    `${picture}\n\n` +
    `If we need anything to make a decision, we will email you at this address.\n\n` +
    (sport ? `Sport: ${sport}\n` : "") +
    (need ? `What you asked for: ${need}\n` : "") +
    (sport || need ? `\n` : "") +
    `Optional, and it has no bearing on your application: the fund grows fastest ` +
    `through people who already care about one athlete. If you want to help it along, ` +
    `share it with the people who root for you.\n${FUND_URL}\n\n` +
    `Adapt To Life\n501(c)(3) nonprofit, EIN 41-3213344`;

  const html = houseShell(
    `<p>Hi ${esc(first)},</p>` +
      `<p>Your application reached us. Nothing else is needed from you right now.</p>` +
      `<p>${esc(picture)}</p>` +
      `<p>If we need anything to make a decision, we will email you at this address.</p>` +
      (sport || need
        ? houseLabel("What we have") +
          houseQuote(
            (sport ? `<div>Sport: ${esc(sport)}</div>` : "") +
              (need ? `<div>What you asked for: ${esc(need)}</div>` : "")
          )
        : "") +
      `<p style="margin-top:24px">Optional, and it has no bearing on your application: ` +
      `the fund grows fastest through people who already care about one athlete. If you ` +
      `want to help it along, <a href="${FUND_URL}" style="color:#c2410c">share it with ` +
      `the people who root for you</a>.</p>`
  );

  return send(
    env,
    {
      from: HOUSE_FROM,
      to: email,
      bcc: inbox,
      replyTo: inbox,
      subject,
      text,
      html,
      headers: { "X-ATL-Form": "apply" },
    },
    "apply receipt"
  );
}

// Volunteer board. The failure mode here is specific and expensive: a
// professional offers pro bono work, hears nothing, and concludes the
// organisation is not serious. They do not offer twice, and they tell people.
//
// So this email does exactly three things and resists doing a fourth:
//
//   1. Says what they picked, back to them. It proves a human system received a
//      real thing and not a form submission into a void.
//   2. Promises only what we control: a person reads it, and you hear back
//      either way. No timeline, because we cannot hold one, and the page does
//      not offer one.
//   3. Stops. It does not upsell a donation. Someone who just offered their time
//      and got asked for money in the same breath learns what we actually
//      wanted, and the ask costs more than it earns.
export async function sendVolunteerReceipt(env, { name, email, roles, bring }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const picked = Array.isArray(roles) ? roles.filter(Boolean) : [];
  const subject = "Thanks for offering to help";

  // "Either way" is the whole promise. It is the sentence that makes it safe to
  // raise a hand, and it is the one thing on the page we can actually hold.
  const promise =
    `A person reads every one of these. We will come back to you with what the ` +
    `work would actually look like, or with an honest no if there is no fit right ` +
    `now. You hear back either way.`;

  const text =
    `Hi ${first},\n\n` +
    `Thanks for putting your hand up. That reached us.\n\n` +
    `${promise}\n\n` +
    (picked.length ? `What you picked:\n${picked.map((r) => `  - ${r}`).join("\n")}\n\n` : "") +
    (bring ? `What you told us:\n${bring}\n\n` : "") +
    `If anything changes on your end, or you thought of something after you hit ` +
    `send, just reply to this email.\n\n` +
    `Adapt To Life\n501(c)(3) nonprofit, EIN 41-3213344`;

  const html = houseShell(
    `<p>Hi ${esc(first)},</p>` +
      `<p>Thanks for putting your hand up. That reached us.</p>` +
      `<p>${esc(promise)}</p>` +
      (picked.length
        ? houseLabel("What you picked") +
          houseQuote(picked.map((r) => `<div>${esc(r)}</div>`).join(""))
        : "") +
      (bring ? houseLabel("What you told us") + houseQuote(esc(bring)) : "") +
      `<p>If anything changes on your end, or you thought of something after you ` +
      `hit send, just reply to this email.</p>`
  );

  return send(
    env,
    {
      from: HOUSE_FROM,
      to: email,
      bcc: HOUSE_INBOX,
      replyTo: HOUSE_INBOX,
      subject,
      text,
      html,
      // Lets the house filter the board without opening the message.
      headers: { "X-ATL-Form": "volunteer", "X-ATL-Roles": picked.join("; ").slice(0, 200) },
    },
    "volunteer receipt"
  );
}
