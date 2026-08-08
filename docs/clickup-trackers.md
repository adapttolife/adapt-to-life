# The ClickUp trackers

Everything the public sends Adapt To Life lands in ClickUp. Nothing lands in Airtable — that was the prototype, and the line was cut on 2026-07-30.

All four relationship-facing lists live in **Team Space → Adapt To Life**. Each list's operating instructions live in its own `content` field in ClickUp, so they are visible to whoever is standing in the list rather than only in this repo. This file is the map; the lists are the authority.

## The relationship tracking map

| List | ID | What one task is | Fed by |
|---|---|---|---|
| **Hustle & Heart — Applications** | `901418622126` | one grant application | `POST /api/apply` (the `/apply` page) |
| **Hustle & Heart — Awards** | `901418622127` | one grant actually awarded | a human, at Approved |
| **Contacts** | `901418639884` | one person who used the contact form | `POST /api/contact` (the `/contact` page) |
| **Relationships & Opportunities** | `901418931939` | one donor, vendor, organization, sponsor, partner, or grant ATL is pursuing | Givebutter/D1 for donors; humans for every other type |

ClickUp is the human action layer, not ATL's CRM/CLM. Source systems and
Cloudflare/D1 own history, consent, totals, delivery state, and automation.
ClickUp owns the relationship assignee, next action/due date, native status,
lightweight type/stage tags, and human notes.

An athlete applying for an ATL grant stays in **Applications**. A grant ATL
awards stays in **Awards**. A grant ATL itself is pursuing belongs in
**Relationships & Opportunities** with `type-grant-opportunity`; those are
different relationships and must not be collapsed into one workflow.

### Relationships & Opportunities

Donors are automatic: the ten-minute Worker schedule projects one task per
normalized donor email. Repeat gifts update the same automation-owned snapshot;
the projector never modifies assignees, due dates, status, tags, comments, or
human text outside its marked block. A ClickUp outage is recorded in D1 and
retried independently, so it cannot reject a Givebutter webhook or suppress a
donor email.

The projector intentionally uses ClickUp's live-proven `markdown_description`
write field and requests `include_markdown_description=true` on every read.
Do not replace this contract from an SDK guess; rerun a disposable live
create/read/update/delete probe if ClickUp changes its reference schema.

The one-time historical seed is `scripts/import-givebutter-donor-baseline.mjs`.
It derives a strict cutoff from the one enabled production webhook and imports
only successful transactions before that instant. The generated SQL contains
donor PII: write it only to a mode-600 scratch path, apply it to `atl-waivers`,
and delete it immediately. Transactions at or after the cutoff stay exclusively
in `donor_gifts`; this is what prevents baseline/live double-counting. The seed
never calls the webhook or email path.

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

## Last contacted

`Email`, `Phone` and `Last contacted` are space-level fields in ClickUp — the same field id on every list — so `Last contacted` means one thing wherever you are standing.

It is the field that protects the promise. Both receipt emails tell the sender they will hear back. Anything sitting in `New` with a stale `Last contacted` is a broken promise, not a backlog.

## What is deliberately not in ClickUp

**Signed waivers.** The compliance record is D1 (`atl-waivers`, the index) + R2 (`atl-waivers`, the PDFs) + the Google Shared Drive archive filed by the 10-minute cron. Three copies, one of them browsable by a human. A signed release is a record to retrieve, not a task to work.

**Agent mail.** D1 (`agent-mail`) is the record, read through the API and the reports viewer. One thread per task would bury the lists it shares a space with.

## Working on this

Field IDs are a schema contract and live in `src/clickup.js`, not in `wrangler.jsonc`. Re-derive them with:

```sh
curl -s "https://api.clickup.com/api/v2/list/<LIST_ID>/field" -H "Authorization: $CLICKUP_TOKEN"
```

If someone deletes and recreates a field in the ClickUp UI its ID changes and the create is rejected. That case is handled: the Worker retries with no custom fields at all, so the task still lands with the full submission in its description and a loud log line. A task that needs its Stage set by hand beats a member of the public who wrote to a nonprofit and vanished.

Custom **statuses** are not writable through the ClickUp API — `PUT /space/{id}` accepts a `statuses` array, returns 200 and ignores it. That is why every list tracks state in a `Stage` dropdown rather than in native statuses.
