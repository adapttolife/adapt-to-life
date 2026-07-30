# The ClickUp trackers

Everything the public sends Adapt To Life lands in ClickUp. Nothing lands in Airtable — that was the prototype, and the line was cut on 2026-07-30.

All three lists live in **Team Space → Adapt To Life**. Each list's operating instructions live in its own `content` field in ClickUp, so they are visible to whoever is standing in the list rather than only in this repo. This file is the map; the lists are the authority.

## The three lists

| List | ID | What one task is | Fed by |
|---|---|---|---|
| **Hustle & Heart — Applications** | `901418622126` | one grant application | `POST /api/apply` (the `/apply` page) |
| **Hustle & Heart — Awards** | `901418622127` | one grant actually awarded | a human, at Approved |
| **Contacts** | `901418639884` | one person who used the contact form | `POST /api/contact` (the `/contact` page) |

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
