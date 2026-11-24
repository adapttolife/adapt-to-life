# Email across Adapt To Life, Adaptive Sports Near Me and Adapt Body Shop

The one page for how our sites send email. It covers all three brands, because all three belong to
Adapt To Life NFP, share one Google Workspace and one Resend team. Read it before you add, change or
debug any email. It replaces `docs/gmail-site-mail.md` (the September 2026 Gmail setup).

Status: **design, Nov 24 2026.** Sections marked *today* describe what runs now; the rest is the
target. Change this page in the same PR as any code that changes the picture.

## The rule

**Sites send through Resend. People answer in Google Workspace.**

- Every automated email (receipts, the signed waiver, donor thank yous, sign-in links, staff
  notices, the welcome, the newsletter) leaves through Resend, from a `mail.` subdomain.
- Every reply lands in a person's inbox in Workspace, because Reply-To is the brand's `hello@`.
- No site holds a Google mail credential. A Workspace move, a password change or a deleted user can
  never stop site mail again.

Why: on Nov 23 2026 the move to the nonprofit Workspace deleted the old hello@ user. That cancelled
the Gmail refresh token both sites sent with, and every receipt, waiver email, donor thank you and
admin sign-in link on adapttolife.org and adaptivesportsnearme.com failed from that afternoon. The
newsletter, already on Resend, kept working. Workspace is built for people, not for sites.

## Brands and addresses

| Brand | Sends from | Replies go to | Resend domain | Code |
|---|---|---|---|---|
| Adapt To Life | `Adapt To Life <hello@mail.adapttolife.org>`; the newsletter signs as `Alec at Adapt To Life` | `hello@adapttolife.org` | `mail.adapttolife.org`, verified | `adapt-to-life` repo |
| Adaptive Sports Near Me | `Adaptive Sports Near Me <hello@mail.adaptivesportsnearme.com>` | `hello@adaptivesportsnearme.com` | `mail.adaptivesportsnearme.com`, verified | `adaptivesportsnearme` repo (Faisal) |
| Adapt Body Shop | `Adapt Body Shop <hello@mail.adaptbodyshop.com>` | `hello@adaptbodyshop.com` | `mail.adaptbodyshop.com`, **to add** | `adapt-to-life` repo (`src/shop_contact.js`) and the storefront |

All three `hello@` addresses reach the one hello@adapttolife.org mailbox (the other two are aliases).

Why a `mail.` subdomain and not the root:

- The root domains stay Google's. Resend's DNS records (DKIM, return path) sit only on the
  subdomain, so Workspace changes and Resend changes never touch each other.
- A bug or a spam complaint on automated mail hurts the subdomain's reputation, not the address
  people write to.
- The From line shows the brand name, which is what people read. Replies still go to `hello@`.

## Two kinds of email

**Transactional: someone just did something.** A receipt, the signed waiver, a donor thank you, a
sign-in link, the staff notice about a new submission. It always goes out, needs no unsubscribe
link, and carries nothing that reads as marketing. (The grant receipt's optional "share the fund"
line stays, because it is explicitly severed from the application.)

**Marketing: the list.** The welcome and every newsletter. It goes only to people who signed up,
and every one carries:

- an unsubscribe link in the footer and the one click `List-Unsubscribe` headers (Gmail and Yahoo
  require them);
- the brand's postal address (CAN-SPAM requires one; see Decisions);
- why they are getting it ("You signed up at adapttolife.org").

## One confirmation for every action

| Someone… | Gets | From | Today (Nov 23) |
|---|---|---|---|
| applies for a Hustle & Heart grant | "Your application reached us": what we have, the honest picture, no promise | ATL | Written; failing since Nov 23 (Gmail) |
| sends the contact form | "We got your message", with what they sent | ATL | Written; failing since Nov 23 |
| offers to volunteer | "Thanks for offering to help", with the roles they picked | ATL | Written; failing since Nov 23 |
| signs a waiver (ATL or ASNM) | The signed PDF for their records | ATL | Never delivered: waiver outage, then a code bug (fixed in #433), then Gmail |
| gives through Givebutter | Thank you, where the money goes | ATL | Written; failing since Nov 23 |
| joins the ATL newsletter | "You're on the list", with an unsubscribe link up top | ATL | Working (Resend); copy to tighten |
| joins the ASNM list | "You're on the list" | ASNM | Nothing is sent: the welcome is written but never called, and there is no unsubscribe link, header or page, though the site promises one |
| submits a program, organization, event or listing fix (ASNM) | "We received your submission" | ASNM | Written; failing since Nov 23; failures only reach the log |
| updates their ASNM profile | "Your profile was updated" | ASNM | Failing since Nov 23; sends on every save, even with no change |
| is invited to the ASNM beta | The invitation | ASNM | Failing since Nov 23 |
| joins the Body Shop list | "You're on the list" | Body Shop | Nothing is sent; the address is only saved in D1 |
| sends the Body Shop contact form | "We got your message" | Body Shop | Failing since Nov 23 (Gmail) |
| asks for a sign-in link (ATL admin; ASNM admin, beta, organization, profile) | The link | ATL / ASNM | Failing since Nov 23: nobody can sign in |
| submits anything | Staff notice to hello@ | each | Failing since Nov 23 |

Copy lives with the code that sends it (`src/receipts.js`, `src/newsletter-series.js`,
`src/waiver.js`, `src/givebutter_webhook.js`, `src/shop_contact.js`), in the house shells in
`src/email.js`. Follow the brand voice skills; a new email gets Alec's read before it ships.

## Contacts, lists and unsubscribing

One Resend team holds every contact, and **Resend's `unsubscribed` flag is team wide**: it stops
every Broadcast from every brand. Today `/unsubscribe` on adapttolife.org sets that flag, so leaving
the ATL list also silently removes someone from Adaptive Sports Near Me. The target:

- **Each brand has a Segment and a Topic.** The Segment says where they signed up. The Topic is
  their permission for that brand's mail: `Adapt To Life news`, `Adaptive Sports Near Me news`,
  `Adapt Body Shop news`. Signing up subscribes them to their brand's Topic.
- **Unsubscribing from a brand opts them out of that Topic only.** The site's own `/unsubscribe`
  link (signed, one click, no login) does this, and so does the one click header.
- **Every Broadcast picks its brand's Topic** and includes Resend's unsubscribe placeholder, so
  Resend's preference page works too. The team wide flag is set only when someone asks to stop
  everything.
- Resend suppresses hard bounces and complaints by itself. We never re-add a suppressed address.
- **Brand Topics are created with `default_subscription: opt_out`**, Resend's "only people who
  joined" setting, which cannot be changed later. Everyone already in a brand's Segment who has not
  unsubscribed is added to that Topic once, at cutover (Nov 24: ATL 4, ASNM 19, Body Shop 1).
- **Every list email checks the brand Topic first,** including the welcome, which goes through
  `/emails` and not a Broadcast, so Resend would not filter it for us. Today the welcome checks only
  the team wide flag, and the first one checks nothing.
- **Unsubscribe links are signed with their own secret** (`NEWSLETTER_LINK_SECRET`), never the
  Resend key. Today they fall back to the Resend key, so rotating the key would break every link
  already sent. Set the secret first; keep accepting the old signature until the last old link is a
  year old.
- **Joining is recorded before Resend is called,** and a sweep finishes any signup whose contact,
  Topic or welcome step did not complete. Today a signup that fails after the contact is made
  answers "already on the list" for ever and never gets a welcome.
- Beta tester groups (ASNM) stay Topics, as they are now.
- A setting a person changes on the site (the ASNM profile's newsletter switch) is written to
  Resend too, not only to D1. Today it never reaches Resend.

## How a site sends

Each site has one mail module (`src/mail-transport.js`, kept the same in both repos) with a
`resend` transport. Every send:

- **Has a stable Idempotency-Key and a frozen body.** The key is, for example,
  `apply-receipt:<submission id>`. Resend returns the first result for a repeat of the same key
  and body for 24 hours, so a retry after a timeout cannot email someone twice. The outbox stores
  the rendered email (subject, body, recipients) on the first attempt and resends exactly that,
  because a changed body under the same key is refused (the grant receipt reads the live fund
  total, which can move between attempts). The outbox retries by itself for 23 hours; after that
  an unconfirmed send goes to `review` and is checked against Resend's log by its tag before
  anyone resends it.
- **Is tagged** `brand`, `kind` (for example `receipt-apply`, `waiver`, `welcome`) and `env`, so
  Resend's log and the delivery events say exactly what each message was.
- **Is refused before the network** if the From is not on that brand's `mail.` domain, or a header
  carries a line break.
- Sends attachments as bytes; the transport encodes them.
- **Is limited per recipient** for sign-in links (today only per IP), and sent only when something
  changed (the ASNM profile notice).
- **Belongs to the environment that created it.** Staging and production share the same D1
  databases, so a row staging wrote could be sent later by production's cron. Every outbox row
  records `env`; each Worker sends only its own rows, and staging and preview send only to an
  allow list of team addresses (`MAIL_ALLOW`). Anything else is logged and dropped, so a test can
  never email a real applicant or donor.

A receipt still never fails a submission: the record is saved first, and the outbox owns the send.
**Every** automated email goes through the outbox, including the ones that today send once and
forget: the waiver email (`src/waiver.js`), the Body Shop auto reply and notice
(`src/shop_contact.js`) and the contact form's original-message copy to hello@
(`src/form-records.js`).

Out of scope: agent mail (`agents.adapttolife.org`, `src/agent_mail.js`) is the bots' own mailbox,
not site mail, and keeps its own path.

## Knowing it worked

Sending is half of it. On Nov 23 the failures were written to `send_failures` and the intake meter
turned red, and nobody was told: the agent-mail probe that used to read `send_failures` was retired
in October, and the meter only writes to its own log.

- **Delivery events.** One Resend webhook per site posts `email.delivered`, `bounced`,
  `complained`, `failed` and `delivery_delayed` to `/api/resend-events`. The site checks the Svix
  signature on the raw body, keeps only events tagged with a brand and environment it sends for
  (the ATL Worker sends for Adapt To Life and Adapt Body Shop), ignores an event id it has already
  stored (Resend retries and replays deliveries), records the outcome against the message, and
  writes bounces, complaints and failures to `send_failures` once.
- **One alert that reaches a person the same day.** Any new `send_failures` row, or the intake
  meter going red, pages through the fleet alert path that reaches Alec. A failure nobody hears
  about counts as an outage.
- **DMARC.** All three roots are `p=none` with reports to dmarc@amelioration.is. After 30 days of
  clean reports, move each to `p=quarantine`.

## Keys and where they live

- One Resend API key per Worker, named `<site> <env> <yyyy-mm-dd>`, for example
  `adapttolife.org production 2026-11-24`. A Worker that only sends gets a sending-only key limited
  to its brand's domain; a Worker that also manages contacts gets full access.
- Every key, and every webhook signing secret, is saved in the 1Password Engineering vault in an
  item named after the Worker, then set as a Worker secret. Never in the repo, a PR or chat.
- Rotate by making the new key, setting it, checking one send, then deleting the old key.
- Delete keys nobody uses. As of Nov 24 the team has eight; `v1` and `atl-worker-send` were last
  used in June.
- Once every send is on Resend, remove `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and
  `GMAIL_REFRESH_TOKEN` from every Worker and delete the OAuth client.

## Testing before it counts

A change to mail is done when a real message arrives, not when tests pass. For each row in the
confirmation table: submit it once from a phone on production, using a team inbox, and on staging
where staging serves that form (it blocks the newsletter, waiver and donation routes today), then
check the inbox (not spam), the From, Reply-To, the unsubscribe link and the
Resend delivery event. Record the Resend message id in the PR.

## Order of work

1. **Restore.** New Gmail token on the ATL and ASNM Workers (it carries mail until step 2 ships),
   the waiver PDF fix (#433), the new waivers Shared Drive folder. Then settle what Gmail owes:
   for each receipt, notice and donor thank you parked in `review` or `failed` since Nov 23, look
   it up in hello@'s Sent mail. Mark it done if it went; otherwise, for a real person (not a team
   test), send it once on purpose. Never bulk reset them, because Resend cannot know what Gmail
   already sent.
2. **adapttolife.org PR:** the `resend` transport and idempotent retries, staging allow list,
   `/api/resend-events`, Topic based unsubscribe, the tightened welcome, Body Shop signups into
   Resend with their own welcome, `mail.adaptbodyshop.com`.
3. **adaptivesportsnearme PR (Faisal's repo, Faisal merges):** the same transport file; actually
   send the welcome; `/unsubscribe`, the headers and the Topic; the profile switch reaches Resend;
   staging and preview allow list; a ledger for swallowed confirmations; `/api/resend-events`.
4. **Resend team:** Topics, webhooks, one named key per Worker in 1Password, old keys deleted.
5. **Prove it** with the test list above, then retire the Gmail token.

## Decisions (Alec)

1. Send from `hello@mail.<brand>` (recommended above) or from the root `hello@<brand>`.
2. The postal address for newsletter footers. The law requires a real one; a PO box works.
3. Move alectranel.com (Alec's personal newsletter) out of the nonprofit's Resend team into its
   own, so the nonprofit's contacts, reputation and keys are only the nonprofit's.
