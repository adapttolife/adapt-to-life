# Durable forms foundation

## Contract

A successful sponsor/contact/application/volunteer response means the normalized
submission and its delivery work have committed together in existing Cloudflare
D1. It does not claim an email has reached a recipient or a grant has been approved.

The existing `WAIVERS_DB` holds raw operational forms; full application stories,
financial need and volunteered personal detail are not exported into the shared
CRM. The shared `INTAKE` projection carries identity, form type, sponsor tier,
source, tracking ID and the resulting ClickUp link. No form is auto-subscribed to
Beehiiv merely because it supplied an email address.

## Owners and routing

| Entry point | Durable primary | Follow-up owner | Context destination |
| --- | --- | --- | --- |
| Sponsorship conversation, general contact, Karen contact | `form_submissions` + `form_deliveries` in existing WAIVERS_DB | ClickUp Contacts; separate submitter receipt and hello@ notification | Existing CRM `Form Submissions`, sponsor tier/source + ClickUp link |
| Grant application | Same operational D1, full private snapshot | Existing ClickUp Applications; applicant receipt; identity-only internal intake notification | Shared CRM identity/tracking only, not the application narrative |
| Volunteer board and role pages | Same operational D1 | Existing ClickUp Volunteers and submitter receipt | Shared CRM role list/tracking link, not the personal narrative |
| Newsletter signup | Beehiiv plus existing suppression/welcome claim | Beehiiv owns ATL welcome; existing opt-outs are preserved | Publication audience, with explicit newsletter intent |
| Adapt Body Shop contact | Existing `shop_messages` D1 | Existing shop receipt + hello@ notification | Existing Shop Messages mirror; no duplicate shared-intake notification |
| Waiver | Existing signing record/R2 | Existing signing receipt and Drive backlog | Restricted signed-document Drive path; no new signature or fake waiver test |
| Donation | Givebutter and existing donation D1 ledger | Existing signed-webhook/poll reconciliation | Existing donor/gift ClickUp context; no invented payment test |
| Personal Alec correspondence | Existing personal intake contract | Julia exercises contextual judgment | Obsidian only when personally meaningful; no automatic ATL-to-personal-vault feed |

This is a routing inventory, not a claim that a real grant, signature, payment,
or newsletter subscriber was created during this repair.

## Email-backed contact record

Contact/sponsor acknowledgments retain a BCC to the existing house inbox. This
is the actual customer-facing acknowledgment, with the original note, sponsor
interest (explicitly not payment/commitment), and the durable intake reference.
The separate internal notification remains the actionable intake notice; its
Reply-To points to the customer. The acknowledgment copy is correspondence
history, not another inbound request. Staff/agents must not blindly reply to
its house Reply-To as though it came from the customer.

The form dispatcher attempts the receipt before calling ClickUp, so a hanging
CRM API cannot hold that correspondence step behind it. It retains the actual
Cloudflare `messageId`, acceptance state and intended recipient/BCC in the
existing delivery receipt field. Missing provider IDs are review cases, never
invented success IDs. Case references are present in body and an X-header;
automated acknowledgments are marked Auto-Submitted. No custom Message-ID is
invented: Cloudflare generates that platform-controlled header.

The provider ID, RFC Message-ID, mailbox message/thread IDs and delivered/read
states are different evidence. A real received acknowledgment and subsequent
reply must still be inspected to certify native threading and mailbox delivery.
This change does not build a universal inbound/outbound archive, wire bounce
webhooks, add filters, send staff replies, subscribe anyone, or widen the grant
and volunteer receipt audiences. Existing historical receipt strings lacking a
provider identifier must not be relabeled as identified or delivered.

Cloudflare API contract: https://developers.cloudflare.com/email-service/api/send-emails/workers-api/
Header allowlist: https://developers.cloudflare.com/email-service/reference/headers/

## Recovery and ambiguity

`adapt-to-life` owns form-delivery recovery on its existing ten-minute schedule.
Each channel is separately claimed with a conditional D1 update. Definite missing
configuration or explicit API rejection remains retryable. A network failure
around a non-idempotent task/email send, or a worker interrupted after provider
acceptance, is marked `review`, not blindly resent. An operator must recover the
actual task/provider receipt before marking that step done or reauthorizing it.

`adapt-to-life-intake` is now defined by `wrangler.intake.jsonc` and
`src/intake-worker.js`: a notification-recovery worker, not a second complete
website with parallel gift, Drive and CRM jobs. No routes, assets, workers.dev or
preview ingress. Its source is in this same repository. Each modern intake row
and notification claim are committed atomically. Retired canaries never send.
An old row with no trustworthy claim may have sent before losing its stamp; it
is not automatically replayed. The health meter must report any real debt.

The existing host `intake-sheet-sync.py` remains the only shared CRM writer.
Intake ID is the key: read existing rows, update in place or append missing IDs,
read back exact cells, then stamp D1. A lost append response or crash before the
stamp does not authorize another blind append. Context changes clear the stamp
and update that same row; duplicate IDs or drifted headers stop the writer.

## Release and acceptance

Apply `src/schema_forms.sql` to the already-bound WAIVERS_DB and
`src/schema_intake_delivery.sql` to INTAKE before promoting this code. Migrations
are additive; do not delete existing records or replace credentials.

Production comes from clean, pushed main through the existing Workers Builds
path. The main-site build keeps the latest sponsor UI, spam gates and prior
newsletter/shop-inbox fixes. The dedicated intake worker is deployed separately
from that same source. Verify exact live versions, binding identities, schedules,
public build/source fingerprints, the host sheet-sync service and debt meter.

Before release: full `npm test`, `npm run typecheck`, the real isolated browser
script `scripts/verify-sponsor-browser.mjs` at phone/desktop sizes, and the host
sync/monitor tests. Browser simulation deliberately drops an accepted response,
then resubmits the unchanged form and proves one record/task/receipt. It checks
all sponsor tiers and preset checkout links without paying. Isolated tests use
in-memory SQLite and mock transport, never public fake grant/waiver/payment data.

A live deployment, a local test, a provider acceptance and a delivered email are
distinct receipts. The private deployment report records the strongest observed
state and exact versions; this source guide must not be used to imply more.
