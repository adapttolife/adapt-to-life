# Email across Adapt To Life, Adaptive Sports Near Me and Adapt Body Shop

The one page for how our sites send email. It covers all three brands, because all three belong to
Adapt To Life NFP, share one Google Workspace and one Resend team. Read it before you add, change or
debug any email. It replaces `docs/gmail-site-mail.md` (the September 2026 Gmail setup).

Status, **Nov 25 2026**: adapttolife.org and adaptbodyshop.com send through Resend in production.
adaptivesportsnearme.com is built and waits on its production cutover. The design was agreed Nov 24
(decisions at the end). Anything marked *today* describes what runs now; the rest is the target.
Change this page in the same PR as any code that changes the picture.

## Where each site stands (Nov 25)

- **adapttolife.org: live on Resend.** PR A ([#437](https://github.com/adapttolife/adapt-to-life/pull/437)),
  the intake notice retries ([#449](https://github.com/adapttolife/adapt-to-life/pull/449)) and PR B
  ([#450](https://github.com/adapttolife/adapt-to-life/pull/450), released in
  [#453](https://github.com/adapttolife/adapt-to-life/pull/453), live at `6a3ee8f`) are all in
  production: grant, contact and volunteer receipts, signed waivers, Givebutter thank yous, admin
  sign-in links, staff notices, the newsletter signup ledger and welcome, signed `/unsubscribe` per
  brand, and `/api/resend-events`. `NEWSLETTER_LINK_SECRET` is set. The Gmail secrets are gone from
  the `adapt-to-life` Worker.
- **adaptbodyshop.com: live on Resend,** through adapttolife.org's `/api/shop-contact`. Storefront
  PR [#17](https://github.com/adapttolife/adapt-body-shop-storefront/pull/17) is deployed to
  `adapt-body-shop`: the footer form posts to `/newsletter`, which records the signup in
  `shop_subscribers`, adds it to the Body Shop Segment and Topic, and sends the Body Shop welcome.
  Its unsubscribe links land on adapttolife.org's signed `/unsubscribe`.
- **adaptivesportsnearme.com: built, not live.** `mail.adaptivesportsnearme.com` is verified and all
  19 subscribers are on the `Adaptive Sports Near Me news` Topic. The Resend code
  ([#155](https://github.com/adapttolife/adaptivesportsnearme/pull/155),
  [#156](https://github.com/adapttolife/adaptivesportsnearme/pull/156),
  [#157](https://github.com/adapttolife/adaptivesportsnearme/pull/157)) is merged to ASNM's
  `staging`. Production waits on Faisal
  ([#158](https://github.com/adapttolife/adaptivesportsnearme/issues/158)) and on moving ASNM's
  staging to Cloudflare Workers Previews (`npx wrangler preview`, PR
  [#159](https://github.com/adapttolife/adaptivesportsnearme/pull/159)). Until then, mail that ASNM's own
  Worker sends still fails, as it has since Nov 23.

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
| Adapt Body Shop | `Adapt Body Shop <hello@mail.adaptbodyshop.com>` | `hello@adaptbodyshop.com` | `mail.adaptbodyshop.com`, verified | `adapt-to-life` repo (`src/shop_contact.js`) and the storefront |

All three `hello@` addresses reach the one hello@adapttolife.org mailbox (the other two are aliases).

Two of Alec's own sites share the Resend team. The nonprofit's code never reads or writes their
contacts, Segments or Topics, but Resend's team wide `unsubscribed` flag covers them too (see
Contacts below).

- **alectranel.com:** `mail.alectranel.com` verified, with a private `AlecTranel.com` Segment and
  Topic. Its newsletter, `/api/contact` notices and sender confirmations are live on Resend (its PRs
  #11 to #14).
- **amazingplacetorent.com:** `mail.amazingplacetorent.com` verified, with its own sending-only key
  (`amazingplacetorent.com 2026-11-25`). Tenant intake notices, confirmations and alarms are live on
  Resend (its PRs #18 and #19, live at `9ef1220`).

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

| Someone… | Gets | From | Today (Nov 25) |
|---|---|---|---|
| applies for a Hustle & Heart grant | "Your application reached us": what we have, the honest picture, no promise | ATL | Live (Resend, outbox) |
| sends the contact form | "We got your message", with what they sent | ATL | Live (Resend, outbox) |
| offers to volunteer | "Thanks for offering to help", with the roles they picked | ATL | Live (Resend, outbox) |
| signs a waiver (ATL or ASNM) | The signed PDF for their records | ATL | Live (Resend): its own outbox (`waiver_emails`) with the 23 hour retry (PR B). Before that it never arrived: the waiver outage, a code bug (fixed in #434), then Gmail |
| gives through Givebutter | Thank you, where the money goes | ATL | Live (Resend), retried for 23 hours |
| joins the ATL newsletter | "You're on the list", with an unsubscribe link up top | ATL | Live (Resend): recorded first, Topic, the tightened welcome, keyed retry, signed unsubscribe |
| joins the ASNM list | "You're on the list" | ASNM | Not live. Production sends nothing and has no unsubscribe link, header or page, though the site promises one. #155 fixes all of it at cutover |
| submits a program, organization, event or listing fix (ASNM) | "We received your submission" | ASNM | Failing since Nov 23 until ASNM's cutover; failures only reach the log until then |
| updates their ASNM profile | "Your profile was updated" | ASNM | Failing since Nov 23 until cutover; after it, sent only when a save changed something |
| is invited to the ASNM beta | The invitation | ATL / ASNM | Live when sent from the ATL Worker's admin (Resend, sent once); ASNM's own invite fails until cutover |
| joins the Body Shop list | "You're on the list" | Body Shop | Live: storefront `/newsletter` (#17) into `shop_subscribers`, the Segment and Topic, and the Body Shop welcome (PR B) |
| sends the Body Shop contact form | "We got your message" | Body Shop | Live (Resend), sent once |
| asks for a sign-in link (ATL admin; ASNM admin, beta, organization, profile) | The link | ATL / ASNM | ATL admin: live (Resend). ASNM's links fail until cutover |
| submits anything | Staff notice to hello@ | each | ATL: live, retried (#449). Body Shop: live, sent once. ASNM: failing until cutover |

Copy lives with the code that sends it (`src/receipts.js`, `src/newsletter-series.js` (both
welcomes, the unsubscribe page), `src/waiver.js`, `src/givebutter_webhook.js`, `src/shop_contact.js`),
in the house shells in `src/email.js`. Follow the brand voice skills; a new email gets Alec's read before it ships.

## Contacts, lists and unsubscribing

One Resend team holds every contact, and **Resend's `unsubscribed` flag is team wide**: it stops
every Broadcast from every brand. Before PR B went live (Nov 25), `/unsubscribe` on adapttolife.org
set that flag, so leaving the ATL list also silently removed someone from Adaptive Sports Near Me.
On adapttolife.org the brands, their Segment and Topic vars, From and footer live in `src/newsletter-brands.js`;
the join and its steps in `src/newsletter.js` (`newsletter_signups`, agent-mail D1); links, the
welcomes and the unsubscribe page in `src/newsletter-series.js`. The rules:

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
  unsubscribed is added to that Topic once. Done for all three: ATL 4, Body Shop 1, ASNM 19.
- **Every list email checks the brand Topic first,** including the welcome, which goes through
  `/emails` and not a Broadcast. The site checks it itself (`brandStatus`: the team wide flag, then
  the Topic) before every send. Resend's `/emails` also takes a `topic_id` that makes Resend skip an
  opted out contact; the shared transport does not pass it yet (a change to both repos' copy).
- **Unsubscribe links are signed with their own secret** (`NEWSLETTER_LINK_SECRET`), never the
  Resend key. Links sent before PR B have no brand and were signed with the Resend key (the secret
  was never set); they still verify, as ATL news, until the last one is a year old (Nov 2027), and
  only while the Worker holds the key that signed them. The secret is set on production. A Worker
  without it can make no new link, so welcomes wait (the sweep retries them) and send_failures says
  why.
- **Joining is recorded before Resend is called,** and a sweep finishes any signup whose contact,
  Topic or welcome step did not complete. Only a signup whose contact and Topic steps are done
  answers "already on the list", and even then its Topic is opted in again (they may have left
  through Resend's own preference page, which the site never hears about); signing up again
  finishes a half done one. Unsubscribing stops any step still owed, so nobody is opted back in.
  Rows are keyed by env as well as brand and address, so a staging test never shadows a real
  signup. Contact and Topic steps
  are safe to repeat (backoff, up to ten tries, then `review`); the welcome is frozen and keyed like
  any outbox send. Someone on the ATL list before the ledger who joins again gets the Topic, not a
  second welcome.
- Beta tester groups (ASNM) stay Topics, as they are now. **The beta admin code only lists and
  changes Topics whose name starts `ASNM Beta`** (`src/resend_topics.js`, since #437). Before that
  it listed every Topic in the team as a beta group and, on save, opted the tester out of every
  Topic not ticked.
- **Someone already in the team who joins another brand** (Resend answers 409, contact exists)
  still gets that brand's Topic and that brand's welcome. If they had unsubscribed from everything
  and now join a brand, the team wide flag is cleared; that is safe because every brand Topic is
  `opt_out`, so it only re-opens mail they have each said yes to.
- **The unsubscribe link carries the brand** in its signed token
  (`/unsubscribe?e=<email>&b=<atl|bodyshop>&t=<token>`), and **a GET only shows a page with one
  button**; the change happens on POST (the button, or the one click header per RFC 8058, which
  gets an empty 200). Mail scanners that open links must not unsubscribe people. Body Shop links
  land on adapttolife.org too (the shop's storefront has no Worker routes), on a Body Shop page.
- Brand Topics are `public`, so Resend's own preference page shows the three nonprofit lists; beta
  groups and `AlecTranel.com` are `private` and stay hidden.
- A setting a person changes on the site (the ASNM profile's newsletter switch) is written to
  Resend too, not only to D1. On ASNM's live site today it never reaches Resend.

## How a site sends

Each site has one mail module (`src/mail-transport.js`, kept the same in both repos) with a
`resend` transport. Every send:

- **Has a stable Idempotency-Key and a frozen body, both written before the first call.** The key is, for example,
  `apply-receipt:<submission id>`. Resend returns the first result for a repeat of the same key
  and body for 24 hours, so a retry after a timeout cannot email someone twice. The outbox stores
  the rendered email (subject, body, recipients) on the first attempt and resends exactly that,
  because a changed body under the same key is refused (the grant receipt reads the live fund
  total, which can move between attempts). The 23 hour window counts from an immutable `first_attempted_at` (a retry never resets it). The
  outbox retries by itself, with backoff, for those 23 hours; after that
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

### The send contract (both repos)

`src/mail-transport.js` is the same file in `adapt-to-life` and `adaptivesportsnearme`. Its
`resend` transport:

- **Selected by** `MAIL_TRANSPORT=resend`. Config: `RESEND_API_KEY` (secret), `MAIL_FROM_DOMAINS`
  (comma list, for example `mail.adapttolife.org,mail.adaptbodyshop.com`), `ENV_NAME`, and on any
  environment that is not `production`, `MAIL_ALLOW` (comma list of full addresses or `@domain`).
- **`sendMail(env, message)`** takes `{ from, to, cc?, bcc?, replyTo?, subject, text, html?,
  headers?, attachments?, idempotencyKey, tags: { brand, kind } }`. `idempotencyKey` and both tags
  are required; a send without them throws before the network.
- **Checks before the network:** From's domain is in `MAIL_FROM_DOMAINS`; no header value carries
  CR or LF; custom headers are limited to `List-Unsubscribe`, `List-Unsubscribe-Post`,
  `In-Reply-To`, `References`, `Auto-Submitted` and `X-*`; tag values match `[A-Za-z0-9_-]{1,256}`.
- **Outside production,** every to, cc and bcc must match `MAIL_ALLOW`. If one does not, nothing is
  sent and it returns `{ dropped: true, reason: "not-allowed" }`, which the caller records as done
  and not sent.
- **Calls** `POST https://api.resend.com/emails` with the `Idempotency-Key` header, the env tag added
  (`env: <ENV_NAME>`), and attachments as `{ filename, content: <base64>, content_type,
  content_id? }` built from bytes (a Uint8Array or ArrayBuffer; a string is refused).
- **Returns** `{ id, messageId: id, provider: "resend", accepted: true }`.
- **Errors carry `retryable`.** 429, 5xx, a network timeout and 409 `concurrent_idempotent_requests`
  (the same key still in flight) are `retryable: true`. 409 `invalid_idempotent_request` (the same
  key with a different body) and every other 4xx are `retryable: false`. Tell the two 409s apart
  by the error `name` in the body. It never falls back to another provider.
- **Wire shapes:** keys are 1 to 256 characters; Resend wants `reply_to`, `tags: [{ name, value }]`
  and attachments `{ filename, content, content_type, content_id }`. Callers keep the module's own
  names (`replyTo`, `type`, `contentId`); the transport maps them.
- **Sign-in links are not retried.** A link that expires in 15 minutes is sent once; on failure the
  person is told to ask again. Only receipts, notices and thank yous use the outbox.
- Gmail and Cloudflare stay as transports. Agent mail (`/api/agent-mail/*`) and the staging
  `/preview/receipt` page pick the Cloudflare transport explicitly. No adapttolife.org Worker
  selects Gmail any more (its secrets are gone); the Gmail code is deleted once ASNM's production
  is off it too.
- **Nothing sends around this module.** The welcome series (`sendSeriesEmail`) goes through
  `sendMail` too, so it gets the allow list, tags and checks.

`/api/resend-events` verifies Svix signatures with WebCrypto: the key is the base64 decoding of
`RESEND_WEBHOOK_SECRET` after its `whsec_` prefix (decoded to bytes, never UTF-8 encoded); the
signed content is `svix-id.svix-timestamp.<raw body>` (timestamp in Unix seconds) with HMAC-SHA256;
`svix-signature` holds space separated `v1,<base64>` entries and any one matching, compared in
constant time, passes. It refuses timestamps more than 5 minutes off and stores each `svix-id` once.
Broadcast events carry no custom tags, so a Broadcast event is matched to its brand by the From
domain instead.

A receipt still never fails a submission: the record is saved first, and the outbox owns the send.
Helpers return the transport's error (with `retryable`) to the outbox instead of swallowing it
into `false`, so a passing timeout is retried and not parked for a person. **Every** automated
email goes through the outbox. The waiver email has its own since PR B (`waiver_emails`, written
in the same batch as the release, swept by the cron), and the contact form's original-message copy
to hello@ (`src/form-records.js`) retries inside the same 23 hour window. The donor thank you
retries for 23 hours under its key too, but `donor_gifts` has no `review` state, so an unconfirmed
one is closed as `failed` with a "Review" note. Still sent once and forgotten: the Body Shop auto
reply and notice (`src/shop_contact.js`), and the ASNM beta invitation the ATL Worker sends
(`src/index.js`, deliberately: each request is its own send). The signed waiver PDF is not copied into the frozen body (D1 rows top out at 2 MB);
the outbox reads it from `waiver_documents`, and the 30 day purge skips a document whose email is
not done.

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
  writes bounces, complaints and failures to `send_failures` once. *Today* adapttolife.org's is
  live; ASNM's comes with its cutover.
- **One alert that reaches a person the same day.** Any new `send_failures` row, or the intake
  meter going red, pages through the fleet alert path that reaches Alec. A failure nobody hears
  about counts as an outage.
- **DMARC.** All three roots are `p=none` with reports to dmarc@amelioration.is. A root policy
  also covers its subdomains (`agents.adapttolife.org`, Shopify's mail for adaptbodyshop.com), so
  before moving any root to `p=quarantine`, confirm in the reports that every sender on it passes,
  or set `sp=` for subdomains separately.
- **Reputation.** Receipts and the newsletter share `mail.<brand>` for now (low volume). If
  complaints or Promotions placement start to hurt receipts, move list mail to `news.<brand>`.

## Keys and where they live

- One Resend API key per Worker, named `<site> <env> <yyyy-mm-dd>`, for example
  `adapttolife.org production 2026-11-24`. Both site Workers manage contacts and Topics, which
  needs `full_access` (Resend's sending-only keys cover one domain or all, and no contacts), so
  each key is full access. A Worker that only sends gets a sending-only key on its one domain, as
  amazingplacetorent.com does.
- Every key, and every webhook signing secret, is saved in the 1Password Engineering vault in an
  item named after the Worker, then set as a Worker secret. Never in the repo, a PR or chat.
- Rotate by making the new key, setting it, checking one send, then deleting the old key.
- Delete keys nobody uses. On Nov 25 four unused keys (`v1`, `atl-worker-send`, `asnm`, `atl`) were
  deleted; seven active keys remain.
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET` and `GMAIL_REFRESH_TOKEN` are removed from the
  `adapt-to-life` Worker. Remove them from the ASNM Worker at its cutover, then delete the OAuth
  client.

## Testing before it counts

A change to mail is done when a real message arrives, not when tests pass. For each row in the
confirmation table: submit it once from a phone on production, using a team inbox, and on staging
where staging serves that form (it blocks the newsletter, waiver and donation routes today), then
check the inbox (not spam), the From, Reply-To, the unsubscribe link and the Resend delivery event. Record the Resend message id in the PR.

Staging (`adapt-to-life-staging`) has no Resend key, so it sends nothing, and since PR A it refuses
`/unsubscribe`, `/api/subscribe`, `/api/waiver`, `/api/givebutter-webhook`, `/api/shop-contact` and
the contact, apply and volunteer forms (`src/staging.js`), because they would write to production
Resend, the shared tables and the CRM. Test those on production with a team inbox until a later PR
reopens them.

## Order of work

1. **Restore. Done:** the waiver PDF fix (#434) and the Signed Waivers Shared Drive (#452); Resend
   replaced the Gmail token on adapttolife.org. Before calling it closed, settle what Gmail owes:
   for each
   receipt, notice and donor thank you parked in `review` or `failed` since Nov 23, look it up in
   hello@'s Sent mail. Mark it done if it went; otherwise, for a real person (not a team test),
   send it once on purpose. Never bulk reset them, because Resend cannot know what Gmail already
   sent.
2. **adapttolife.org PRs. Done, live Nov 25:** PR A (#437): the `resend` transport and idempotent
   retries, the staging allow list, `/api/resend-events`, `mail.adaptbodyshop.com`. The intake
   notice retries (#449). PR B (#450, released in #453): brand Topics on signup, Topic based
   unsubscribe, the tightened welcome, the signup ledger and sweep, Body Shop signups into Resend
   with their own welcome, the waiver email outbox; `NEWSLETTER_LINK_SECRET` set and both
   migrations applied. The storefront's footer form (#17) is deployed.
3. **adaptivesportsnearme (Faisal's repo, Faisal merges). Merged to staging, not live:** #155,
   #156 and #157 bring the same transport file, a welcome that really sends, `/unsubscribe` with
   the headers and the Topic, the profile newsletter switch writing to Resend, the staging and
   preview allow list, a ledger for swallowed confirmations and `/api/resend-events`. Next:
   Faisal's cutover (#158), with the Worker secrets #155 lists, and ASNM staging on Workers
   Previews (#159).
4. **Resend team. Done:** Topics, the adapttolife.org webhook, unused keys deleted (seven active
   remain).
5. **Prove it** with the test list above, then retire the Gmail token and the OAuth client.

## Decisions (Alec, Nov 24 2026)

1. **Send from `hello@mail.<brand>`**, with the brand name in the From and Reply-To `hello@<brand>`.
2. **Postal address in every list email footer:** Adapt To Life NFP, 1509 N Milwaukee Ave,
   Libertyville, IL 60048 (the same address Givebutter has). Body Shop and ASNM footers name Adapt
   To Life NFP at that address.
3. **alectranel.com stays in the same Resend team.** Its own Topic (`AlecTranel.com`) and Segment
   keep it apart; the nonprofit's code never reads or writes that Topic or Segment.
4. **The ASNM side is built as one PR into Faisal's repo**, and Faisal reviews and merges it.
