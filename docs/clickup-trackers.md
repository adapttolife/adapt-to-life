# The ClickUp trackers

Everything the public sends Adapt To Life lands in ClickUp. Nothing lands in Airtable — that was the prototype, and the line was cut on 2026-07-30.

All five relationship-facing lists live in **Team Space → Adapt To Life**. Each list's operating instructions live in its own `content` field in ClickUp, so they are visible to whoever is standing in the list rather than only in this repo. This file is the map; the lists are the authority.

## The relationship tracking map

| List | ID | What one task is | Fed by |
|---|---|---|---|
| **Hustle & Heart — Applications** | `901418622126` | one grant application | `POST /api/apply` (the `/apply` page) |
| **Hustle & Heart — Awards** | `901418622127` | one grant actually awarded | a human, at Approved |
| **Contacts** | `901418639884` | one person who used the contact form | `POST /api/contact` (the `/contact` page) |
| **Volunteers** | `901419920230` | one person who offered to help | `POST /api/volunteer` (the `/volunteer` page) |
| **Relationships & Opportunities** | `901418931939` | one relationship parent; each donation is its own gift subtask | Givebutter/D1 for donors and gifts; humans for every other type |

ClickUp is the human action layer, not ATL's CRM/CLM. Source systems and
Cloudflare/D1 own history, consent, totals, delivery state, and automation.
ClickUp owns the relationship assignee, next action/due date, native status,
lightweight type/stage tags, and human notes.

An athlete applying for an ATL grant stays in **Applications**. A grant ATL
awards stays in **Awards**. A grant ATL itself is pursuing belongs in
**Relationships & Opportunities** with `type-grant-opportunity`; those are
different relationships and must not be collapsed into one workflow.

### Relationships & Opportunities

Donors and gifts are automatic. The ten-minute Worker schedule projects one
parent task per normalized donor email and one subtask per Givebutter transaction.
The parent owns the long-running relationship; each gift owns its own thank-you,
impact follow-up, and allocation question. Repeat donors therefore accumulate
distinct gift tasks under one relationship instead of losing transaction history
inside an aggregate. The projector never modifies assignees, due dates, status,
tags, comments, or human text outside its marked blocks. A ClickUp outage is
recorded in D1 and retried independently, so it cannot reject a Givebutter
webhook or suppress a donor email.

Gift subtasks use `type-gift` plus `stage-follow-up`. The gift's assignee and due
date are the human follow-up owner and next action date. Allocation facts are
read only from the append-only `gift_allocation_events` D1 ledger. Corrections are
negative reversal events, not edits. ClickUp may hold the story and work notes,
but it may not assert that a specific gift funded a specific expense until a
verified allocation event and evidence link exist underneath it.

Crash deduplication uses a deterministic 128-bit SHA-256 digest of the normalized
donor key inside the automation block. The digest is pseudonymous, not secret;
the authorized task already displays the donor email. Raw email is never used as
hidden marker syntax because ClickUp strips comments containing email addresses.

The projector intentionally uses ClickUp's live-proven `markdown_description`
write field and requests `include_markdown_description=true` on every read.
Do not replace this contract from an SDK guess; rerun a disposable live
create/read/update/delete probe if ClickUp changes its reference schema.

The one-time historical seed is `scripts/import-givebutter-donor-baseline.mjs`.
It derives a strict cutoff from the one enabled production webhook and imports
only successful transactions before that instant. It creates both donor
baselines and exact historical gift projection rows, but never transactional
email state. The generated SQL contains donor PII: write it only to a mode-600
scratch path, apply it to `atl-waivers`, and delete it immediately. Transactions
at or after the cutoff stay exclusively in `donor_gifts`; this prevents
baseline/live double-counting. The seed never calls the webhook or email path.

The importer requires `BASELINE_PII_SCRATCH_DIR` and refuses destinations
outside that directory or anywhere inside the repository. The output file must
not already exist; it is created atomically at mode `0600`.

Vendors, organizations, sponsors, partners, and outbound grant opportunities
are human-created. Use exactly one `type-*` tag, optionally one `stage-*` tag,
the assignee as owner, and the due date as the next action date. Do not copy
mailbox history or automation state into the task.

### Applicant tracker — Applications

Automatic. Task name is `Name — Sport`; the description holds every answer verbatim; fields carry Stage (`New`), Applied, Email, Phone, Sport, Location and Amount requested. The rubric behind the four score fields is [`grant-review-rubric.md`](grant-review-rubric.md).

**Amount requested is only filled from an unambiguous figure** — a `$` amount, or an answer that is nothing but a number. `"racing chair 2024 model"` must not become $2,024 sitting in a currency field looking verified. A blank makes a human open the application, which is the right outcome.

### Grant tracker — Awards

Deliberately **not** automated. An award is a decision about money, so it is opened by hand when an application reaches Approved, and the application's task URL is pasted into the `Application` field. Nothing in this repo writes to this list.

That link is the join between the two trackers: Applications answers "who asked", Awards answers "who we funded, for what, and out of which pot". `Funded from` keeps Send 6 gifts separable from general fund gifts, which is what a 990 or an audit will ask for.

### Contacts

Automatic. Task name is `Name — Reason`; the message is the description; fields carry Stage (`New`), Received, Email, Phone, Reason and Source.

A reason that is not one of the form's five options is dropped rather than guessed — a wrong Reason routes someone to the wrong person, which is worse than an empty one. **A contact is not an application.** Someone asking about funding here gets pointed at `/apply`; a grant only becomes real once it is a task in Applications.

### Volunteers

Automatic. Task name is `Name — first role +N`; the description holds every answer verbatim; fields carry Stage (`New`), Received, Email, Phone, Roles, Time offered, Based in, Links and Source.

**Roles is a comma-joined text field, not a dropdown**, so "show me everyone who ticked CPA" is a *contains* filter and adding a role to the page never requires touching a ClickUp schema. The closed list of valid roles lives in `VOLUNTEER_ROLES` in `src/index.js` and is pinned against the page by `test/volunteer_clickup.test.js` — a role added to `/volunteer` without being added there would be silently dropped, and the test fails the build instead.

**A volunteer is not a contact.** They are separated because the workflows are: a contact gets an answer, a volunteer gets a scope and an owner. Collapsing them is how a CPA offering to do the first Form 990 ends up two hundred rows below someone asking about a t-shirt.

**When a volunteer becomes a standing relationship** (a board member, a pro bono CPA, a recurring event partner), a human opens a parent task in **Relationships & Opportunities** and links back. This list is the front door, not the CRM.

Two stray empty fields sit on this list, a `short_text` **Phone** and a `short_text` **Source**, left over from creating them with the wrong type. ClickUp's v2 API has no delete-field endpoint (405), so they need one pass in the UI. Nothing reads or writes them.

## Last contacted

`Email`, `Phone`, `Received` and `Last contacted` are space-level fields in ClickUp — the same field id on every list — so `Last contacted` means one thing wherever you are standing.

**How a new list gets them is not obvious and cost time.** A freshly created list inherits nothing: `GET /list/{id}/field` returns `[]`, and writing a known space-level field id onto a task there fails with `FIELD_115 Custom field does not exist in the task location hierarchy`. The v2 API has no "attach existing field" call. What works is to *create* the field on the new list with the **exact same name and type** — ClickUp dedupes it and hands back the existing space-level id rather than minting a new one. Get the type wrong (`short_text` where the original is `text`) and you get a genuine second field with a new id, no warning, and no way to delete it through the API.

It is the field that protects the promise. All three receipt emails tell the sender they will hear back, and `/volunteer` says "you hear back either way" in as many words. Anything sitting in `New` with a stale `Last contacted` is a broken promise, not a backlog.

## What is deliberately not in ClickUp

**Signed waivers.** The compliance record is D1 (`atl-waivers`, the index) + R2 (`atl-waivers`, the PDFs) + the Google Shared Drive archive filed by the 10-minute cron. Three copies, one of them browsable by a human. A signed release is a record to retrieve, not a task to work — so it is a row in the **Adapt To Life CRM**, not a ClickUp task.

The same cron files each PDF into `Adapt To Life` (Shared Drive) → **Signed Waivers** under a readable name, then appends a row to the CRM spreadsheet's **Waivers** tab: who signed, for whom, contact details, program, source site, release version, and a link to the PDF. The CRM stores the *link*, never a copy. `src/waiver_crm.js`; `ATL_CRM_SHEET_ID` in `wrangler.jsonc`. The CRM lives in Alec's Drive rather than the Shared Drive, so it must be shared with the `GOOGLE_SA_JSON` service account as an **Editor**; without that the Drive half still runs and the CRM half retries every ten minutes, recording why in the row's `crm_error`.

**Agent mail.** D1 (`agent-mail`) is the record, read through the API and the reports viewer. One thread per task would bury the lists it shares a space with.

## Working on this

Field IDs are a schema contract and live in `src/clickup.js`, not in `wrangler.jsonc`. Re-derive them with:

```sh
curl -s "https://api.clickup.com/api/v2/list/<LIST_ID>/field" -H "Authorization: $CLICKUP_TOKEN"
```

If someone deletes and recreates a field in the ClickUp UI its ID changes and the create is rejected. That case is handled: the Worker retries with no custom fields at all, so the task still lands with the full submission in its description and a loud log line. A task that needs its Stage set by hand beats a member of the public who wrote to a nonprofit and vanished.

Custom **statuses** are not writable through the ClickUp API — `PUT /space/{id}` accepts a `statuses` array, returns 200 and ignores it. That is why every list tracks state in a `Stage` dropdown rather than in native statuses.
