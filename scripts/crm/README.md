# Karen tab filer

`karen_sync.py` is the background feed behind the Karen tab in the Adapt To Life CRM
(sheet `1ahXuu11mV3bJVtyqXrhVz4lFCSSWpl7jX52SqlcJFLE`). Karen types one row per person or
business she meets. This script files each row into People, Organizations and Timeline and
writes the result back to the hidden house columns, so Karen never needs another tab.

Stdlib Python 3.9+. It shells out to `gog`.

## Run it

```sh
# AgentOS (gog runs on the Grok box through gogbox)
python3 scripts/crm/karen_sync.py            # dry run: prints the plan, writes nothing
python3 scripts/crm/karen_sync.py --apply    # writes the plan

# On the Grok box itself
GOG=gog python3 scripts/crm/karen_sync.py --apply

# Re-plan rows parked as "Needs review" after someone fixed People
python3 scripts/crm/karen_sync.py --apply --retry-review
```

Environment: `GOG` (default `gogbox`), `GOG_ACCOUNT` (default `alec@alecability.com`),
`ATL_CRM_SHEET_ID` (default is the live CRM; point it at a copy to test).

A run holds an exclusive lock for the whole read, plan, and apply, so a manual run and
the scheduled run on this machine cannot hand out the same IDs or rows. The lock file is
`KAREN_SYNC_LOCK` (default `<temp dir>/adapt-to-life-karen-sync.lock`, which is
`/tmp/adapt-to-life-karen-sync.lock` when `TMPDIR` is unset). The agentos timer sets
`KAREN_SYNC_LOCK=/srv/hetzner-jobs/workspace/locks/karen-sync.lock`. A manual or local
dry run that shares that timer sets the same path (see Schedule). The second run waits
until the first process exits. The lock releases on exit, including a crash. Do not
delete the lock file. To verify: `test_run_lock_excludes_a_second_acquire` takes the
lock and checks that another non-blocking acquire fails until the first one releases.

Tests (no network): `python3 -m unittest scripts/crm/test_karen_sync.py`

## What it reads

`Karen!A2:N1000`, `People!A1:AD` (plus the Quality flags formulas), `Organizations!A1:Z`,
`Timeline!A1:M`. Headers are checked by name. It exits 2 and writes nothing when a header
moved, a Contact ID or Organization ID is duplicated or malformed, an Interaction ID is
duplicated, or a target grid is full.

## What it writes

Karen columns (A to K are Karen's; L to N are house only):

| Col | Header | Who writes |
| --- | --- | --- |
| A to J | Email, Full name, What kind, Organization, Beta invite, Phone, How we know them, Added by, Date added, Notes | Karen |
| K | In the CRM | sheet formula (status in plain words) |
| L | Contact ID | this script |
| M | Organization ID | this script |
| N | House note | this script (`Needs review: ...`) |

Per Karen row (A or B present = person, only D present = organization):

1. **Already filed** (L set): add any missing Type and Brands tokens to that People row, and
   for beta rows mirror the invite into People Status (`ASNM beta: Invited`) when Status is
   blank or already an `ASNM beta:` value. Karen's E stays the source of truth. Before
   trusting L, the Karen email must still match the People email on that Contact ID (both
   blank also matches; a real address on either side must be the same address). On a
   mismatch the house note becomes `Needs review: Contact ID email does not match` and
   People is left unchanged. When the addresses match again, that note is cleared. Rows
   with only M set are left alone.
2. **Email matches one People row** (trimmed, case-insensitive, and the cell contains `@`):
   link it (write L), add Type and Brands tokens, mirror the beta invite. No other People
   field is touched. A People cell with no `@` is not a link.
3. **Email on several People rows**, **same email twice on the Karen tab**, **no email and
   the exact name already exists in People**, or **a Karen email cell with no `@`**
   (a placeholder such as `n/a`): write a `Needs review` note in N and create
   nothing. Those rows are skipped on later runs unless `--retry-review`.
4. **Otherwise** append a People row at the next empty row after the last Contact ID.
   Emptiness is checked again for every allocated row (People, Organizations, and
   Timeline). A filled row below a gap is skipped, not overwritten. If the next empty
   row would sit past the grid, the run exits 2 and writes nothing. The new People row gets
   Name (Full name, or the email when no name was given so the duplicate checks still have
   something to compare), mapped Type, Email, Phone, Organization, Consent
   (`Not recorded; relationship only, not marketing consent`, or for beta rows
   `Not recorded; ASNM beta access only, not newsletter consent`), Status for beta rows,
   Notes, next `ATL-P-######`, Relationship owner (Added by, default Karen), Brands,
   Relationship stage `Needs review`, Origin, Organization ID, Source `Karen tab row N`.
   The Quality flags formula already present in every People grid row is kept; it is only
   written if that cell is empty.
5. **Organization**: exact case-insensitive match on Organizations A gives M (and People Z on
   new rows). With no match, a new Organizations row (next `ATL-O-######`, Stage
   `Needs review`) is created only for Business or partner, Sponsor, or organization only
   rows. Otherwise the name stays as People K text.
6. **Timeline**: when G or J has words, append `ATL-I-######` dated Date added (or today),
   channel `Karen tab`, direction `Note`, recorded by `Karen tab filer (added by H)`.

Type mapping: Beta tester, Athlete, Parent or caregiver to Parent/Caregiver, Donor,
Volunteer, Business or partner to Partner prospect, Sponsor to Sponsor prospect, Supporter /
Other / blank / unknown to Supporter. Several kinds split on `;` or `,`.
Brands: any beta kind adds Adaptive Sports Near Me; any non beta kind adds Adapt To Life.

Order of writes: People, Organizations and Timeline first, Karen L to N last. A failure in the
middle leaves Karen rows unfiled so the next run plans them again; check the new rows before
rerunning (see rollback).

It never writes marketing consent (Resend owns newsletter consent), never sorts, renumbers or
deletes, and never touches the feed tabs or the refresh owned tabs.

## Schedule hourly

The hourly job is the Hetzner systemd timer on agentos. `hetzner-karen-sync.timer`
fires `OnCalendar=*-*-* *:47:00 UTC`, offset from the :17 source refresh.
`hetzner-karen-sync.service` runs as user `agentos` from the checkout
`/srv/hetzner-jobs/workspace/repos/adapt-to-life-karen`, with the fixed lock:

```sh
KAREN_SYNC_LOCK=/srv/hetzner-jobs/workspace/locks/karen-sync.lock \
  /usr/bin/python3 scripts/crm/karen_sync.py --apply
```

`GOG` stays the default `gogbox`. The Grok box crontab does not run this job.
`/home/box/adapt-to-life` is not the checkout. The lock file sits outside the
checkout so a manual run on agentos waits on the same file as the timer.

A dry run on that checkout, sharing the timer's lock:

```sh
KAREN_SYNC_LOCK=/srv/hetzner-jobs/workspace/locks/karen-sync.lock \
  python3 scripts/crm/karen_sync.py
```

The dry run prints the plan and writes nothing. Do not delete the lock file.

## Rollback

Every run prints exactly what it wrote (row numbers and IDs). To undo one run:

1. People: clear A:AC on the new rows (leave the AD formula); for updated cells, restore the
   `old` value printed in the plan.
2. Organizations: clear the new rows. Timeline: clear the new rows.
3. Karen: clear L:N on those rows. They read `New, house will file` again.

Do not delete rows or renumber IDs. Cleared rows after the last remaining ID are reused on the next run.
