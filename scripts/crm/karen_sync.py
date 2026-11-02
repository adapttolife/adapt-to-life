#!/usr/bin/env python3
"""Karen tab filer: files rows from the Karen tab into People, Organizations and Timeline.

Karen types one row per person or business on the Karen tab of the Adapt To Life CRM.
This script is the background feed. It is safe to run hourly:

  * dry run by default (prints the plan, writes nothing); pass --apply to write
  * idempotent: a filed row gets its Contact ID (L) or Organization ID (M) written back,
    and filed rows are never filed again
  * never merges silently: an email that is on several People rows, or a name with no
    email that already exists in People, becomes a "Needs review" house note (N).
    A cell with no @ is not an email, so placeholders such as n/a do not link people
  * a filed Contact ID is kept only while Karen's email still matches that People row
  * never renumbers, sorts or deletes rows; only appends new rows and adds missing
    Type / Brands tokens to a linked People row (plus the ASNM beta invite mirror)
  * never writes marketing consent; Resend owns newsletter consent
  * one run at a time: an exclusive lock covers read, plan, and apply

Stdlib only. Shells out to gog. Default binary is `gogrun` (AgentOS: a Google token minted
on the host from 1Password; `gogbox` needs the Grok box awake and it sleeps); on the Grok box
set GOG=gog. Account comes from GOG_ACCOUNT (default alec@alecability.com).
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
import re
import subprocess
import sys
import tempfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

SHEET_ID = os.environ.get("ATL_CRM_SHEET_ID", "1ahXuu11mV3bJVtyqXrhVz4lFCSSWpl7jX52SqlcJFLE")
GOG = os.environ.get("GOG", "gogrun")
ACCOUNT = os.environ.get("GOG_ACCOUNT", "alec@alecability.com")

KAREN_FIRST_ROW = 3
KAREN_LAST_ROW = 1000

KAREN_HEADERS = ["Email", "Full name", "What kind", "Organization", "Beta invite", "Phone",
                 "How we know them", "Added by", "Date added", "Notes", "In the CRM",
                 "Contact ID", "Organization ID", "House note"]
PEOPLE_HEADERS = ["Name", "Type", "Donor Type", "Volunteer Season", "Email", "Phone", "Address",
                  "City", "State", "Zip", "Organization", "Consent", "Status", "Last Contact",
                  "Last How", "Next Check", "Notes", "Contact ID", "Relationship owner",
                  "Role / title", "Brands", "Relationship stage", "Next action", "Task link",
                  "Origin", "Organization ID", "Verified on", "Follow-up approach", "Source",
                  "Quality flags"]
ORG_HEADERS_REQUIRED = ["Organization", "Notes", "Organization ID", "Relationship owner", "Stage",
                        "Source", "Verified on", "Context"]
# Columns written on a new Organizations row. Emptiness uses this whole list, same as
# People and Timeline check every column they treat as data. A notes-only row is occupied.
ORG_WRITE_HEADERS = ["Organization", "Notes", "Organization ID", "Relationship owner", "Stage",
                     "Source", "Context"]
TIMELINE_HEADERS = ["Interaction ID", "Date", "Contact ID", "Contact", "Organization ID", "Channel",
                    "Direction", "Summary", "Exact words / detailed notes",
                    "Commitment or next step", "Evidence", "Recorded by", "Event ID"]

KIND_MAP = {
    "beta tester": "Beta tester",
    "beta": "Beta tester",
    "athlete": "Athlete",
    "parent or caregiver": "Parent/Caregiver",
    "parent/caregiver": "Parent/Caregiver",
    "parent": "Parent/Caregiver",
    "caregiver": "Parent/Caregiver",
    "donor": "Donor",
    "volunteer": "Volunteer",
    "business or partner": "Partner prospect",
    "business": "Partner prospect",
    "partner": "Partner prospect",
    "sponsor": "Sponsor prospect",
    "supporter": "Supporter",
    "other": "Supporter",
}
ORG_KINDS = {"Partner prospect", "Sponsor prospect"}
BRAND_ATL = "Adapt To Life"
BRAND_ASNM = "Adaptive Sports Near Me"
BETA_STATUS_PREFIX = "ASNM beta: "
INVITE_VALUES = {"not invited": "Not invited", "invited": "Invited", "accepted": "Accepted",
                 "declined": "Declined"}

REVIEW_MULTI_EMAIL = "Needs review: email is on several People rows"
REVIEW_SAME_NAME = "Needs review: same name already in People"
REVIEW_KAREN_TWICE = "Needs review: same email is on the Karen tab twice"
REVIEW_NOT_EMAIL = "Needs review: email is missing @"
REVIEW_STALE_CONTACT = "Needs review: Contact ID email does not match"
CONSENT_RELATIONSHIP = "Not recorded; relationship only, not marketing consent"
CONSENT_BETA = "Not recorded; ASNM beta access only, not newsletter consent"

# Shared by a manual run and cron on this machine. Override with KAREN_SYNC_LOCK.
DEFAULT_LOCK_PATH = os.path.join(tempfile.gettempdir(), "adapt-to-life-karen-sync.lock")

SHEETS_EPOCH = dt.date(1899, 12, 30)


class ReadError(Exception):
    """The live sheet does not look the way this script expects. Nothing is written."""


class LockError(Exception):
    """Another karen_sync process already holds the run lock. Nothing is written."""


# ---------------------------------------------------------------- small helpers

def s(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def is_email(v) -> bool:
    """True when the cell contains @. Placeholders such as n/a are not emails."""
    return "@" in s(v)


def norm_email(v) -> str:
    """Identity key for a real email. Empty when the cell has no @."""
    text = s(v)
    if "@" not in text:
        return ""
    return text.casefold()


def contact_emails_agree(karen_email, people_email) -> bool:
    """True when an already-filed Contact ID still matches on email.

    A real email (has @) on either side must be the same address. If neither side
    has a real email, nothing has diverged and the Contact ID may still be trusted.
    """
    k = norm_email(karen_email)
    p = norm_email(people_email)
    if not k and not p:
        return True
    return bool(k) and k == p


def norm_name(v) -> str:
    return re.sub(r"\s+", " ", s(v)).casefold()


def split_tokens(v) -> list[str]:
    return [t.strip() for t in re.split(r"[;,]", s(v)) if t.strip()]


def merge_tokens(existing: str, add: list[str]) -> str:
    toks = split_tokens(existing)
    seen = {t.casefold() for t in toks}
    for t in add:
        if t.casefold() not in seen:
            toks.append(t)
            seen.add(t.casefold())
    return "; ".join(toks)


def is_beta(kind_text: str) -> bool:
    return re.search(r"beta", kind_text, re.I) is not None


def map_kinds(kind_text: str) -> list[str]:
    out: list[str] = []
    for tok in split_tokens(kind_text):
        mapped = KIND_MAP.get(tok.casefold())
        if mapped is None:
            mapped = "Beta tester" if is_beta(tok) else "Supporter"
        if mapped not in out:
            out.append(mapped)
    return out or ["Supporter"]


def brands_for(types: list[str]) -> list[str]:
    out = []
    if "Beta tester" in types:
        out.append(BRAND_ASNM)
    if any(t != "Beta tester" for t in types):
        out.append(BRAND_ATL)
    return out


def invite_value(v) -> str:
    return INVITE_VALUES.get(s(v).casefold(), s(v) or "Not invited")


def to_serial(v, today: dt.date) -> int:
    """Karen's Date added as a Sheets serial. Falls back to today."""
    if isinstance(v, (int, float)) and v > 0:
        return int(v)
    text = s(v)
    for f in ("%Y-%m-%d", "%m/%d/%Y", "%b %d, %Y", "%B %d, %Y", "%m/%d/%y"):
        try:
            return (dt.datetime.strptime(text, f).date() - SHEETS_EPOCH).days
        except ValueError:
            pass
    return (today - SHEETS_EPOCH).days


def serial_text(serial: int) -> str:
    d = SHEETS_EPOCH + dt.timedelta(days=serial)
    return f"{d.strftime('%b')} {d.day}, {d.year}"


def next_id(existing: list[str], prefix: str) -> callable:
    nums = [int(m.group(1)) for v in existing if (m := re.fullmatch(prefix + r"(\d{6})", v))]
    state = {"n": max(nums, default=0)}

    def take() -> str:
        state["n"] += 1
        return f"{prefix}{state['n']:06d}"
    return take


def col_letter(idx0: int) -> str:
    out = ""
    n = idx0 + 1
    while n:
        n, r = divmod(n - 1, 26)
        out = chr(65 + r) + out
    return out


def shift_formula(template: str, row: int) -> str:
    """Shift relative row-2 refs (A2, E2) in the People Quality flags formula to `row`."""
    return re.sub(r"(?<![$A-Za-z0-9_])([A-Z]{1,2})2(?![0-9])", lambda m: f"{m.group(1)}{row}", template)


# ---------------------------------------------------------------- table model

@dataclass
class Table:
    name: str
    header: list[str]
    rows: list[list]          # data rows, rows[0] is sheet row 2
    grid_rows: int = 1000

    def col(self, h: str) -> int:
        return self.header.index(h)

    def cell(self, i: int, h: str):
        r = self.rows[i]
        c = self.col(h)
        return r[c] if c < len(r) else ""

    def sheet_row(self, i: int) -> int:
        return i + 2


def check_headers(name: str, header: list[str], required: list[str], exact: bool = False):
    header = [s(h) for h in header]
    if exact and header[:len(required)] != required:
        raise ReadError(f"{name} header mismatch: expected {required}, got {header[:len(required)]}")
    missing = [h for h in required if h not in header]
    if missing:
        raise ReadError(f"{name} is missing headers {missing}")
    dups = {h for h in header if h and header.count(h) > 1}
    if dups & set(required):
        raise ReadError(f"{name} has duplicate headers {sorted(dups & set(required))}")


def check_unique_ids(t: Table, id_header: str, pattern: str, strict: bool = True):
    """Every ID unique. strict: every ID must also match pattern (Timeline keeps legacy free-form IDs)."""
    seen: dict[str, int] = {}
    for i in range(len(t.rows)):
        v = s(t.cell(i, id_header))
        if not v:
            continue
        if strict and not re.fullmatch(pattern, v):
            raise ReadError(f"{t.name} row {t.sheet_row(i)}: malformed {id_header} {v!r}")
        if v in seen:
            raise ReadError(f"{t.name}: duplicate {id_header} {v} on rows {seen[v]} and {t.sheet_row(i)}")
        seen[v] = t.sheet_row(i)


def row_is_empty(t: Table, sheet_row: int, data_headers: list[str]) -> bool:
    """True when every data column on this sheet row is blank.

    Rows past the loaded values are unused grid rows and count as empty.
    Quality flags are omitted from People `data_headers`, so a formula-only row is empty.
    """
    i = sheet_row - 2
    if i < 0:
        return False
    if i >= len(t.rows):
        return True
    return not any(s(t.cell(i, h)) for h in data_headers)


def take_free_row(t: Table, start: int, data_headers: list[str]) -> int:
    """First empty sheet row at or after `start`.

    Every candidate is checked, so a filled row below a gap is skipped rather than
    overwritten. Raises ReadError when the next empty row would sit past the grid,
    including when the last grid row itself is full.
    """
    row = start
    while row <= t.grid_rows and not row_is_empty(t, row, data_headers):
        row += 1
    if row > t.grid_rows:
        raise ReadError(
            f"{t.name} grid is full (next free row {row} > {t.grid_rows}); add rows first"
        )
    return row


def first_free_row(t: Table, id_header: str, data_headers: list[str]) -> int:
    """First empty sheet row after the last ID. Filled rows under a gap are not free."""
    last = -1
    for i in range(len(t.rows)):
        if s(t.cell(i, id_header)):
            last = i
    return take_free_row(t, t.sheet_row(last + 1), data_headers)


# ---------------------------------------------------------------- plan

@dataclass
class Plan:
    people_new: list[dict] = field(default_factory=list)       # {"row": n, "values": {header: v}}
    people_updates: list[dict] = field(default_factory=list)   # {"row": n, "header": h, "old": v, "new": v}
    orgs_new: list[dict] = field(default_factory=list)
    timeline_new: list[dict] = field(default_factory=list)
    karen_writes: list[dict] = field(default_factory=list)     # {"row": n, "L": v, "M": v, "N": v}
    skipped: list[str] = field(default_factory=list)
    log: list[str] = field(default_factory=list)

    def empty(self) -> bool:
        return not (self.people_new or self.people_updates or self.orgs_new
                    or self.timeline_new or self.karen_writes)


def plan_sync(karen_rows: list[list], people: Table, orgs: Table, timeline: Table,
              today: dt.date, retry_review: bool = False, karen_first_row: int = KAREN_FIRST_ROW) -> Plan:
    """Pure planner. No network. karen_rows[0] is Karen sheet row `karen_first_row`, columns A:N."""
    check_headers("People", people.header, PEOPLE_HEADERS, exact=True)
    check_headers("Organizations", orgs.header, ORG_HEADERS_REQUIRED)
    check_headers("Timeline", timeline.header, TIMELINE_HEADERS, exact=True)
    check_unique_ids(people, "Contact ID", r"ATL-P-\d{6}")
    check_unique_ids(orgs, "Organization ID", r"ATL-O-\d{6}")
    check_unique_ids(timeline, "Interaction ID", r"ATL-I-\d{6}", strict=False)

    plan = Plan()
    new_pid = next_id([s(people.cell(i, "Contact ID")) for i in range(len(people.rows))], "ATL-P-")
    new_oid = next_id([s(orgs.cell(i, "Organization ID")) for i in range(len(orgs.rows))], "ATL-O-")
    new_iid = next_id([s(timeline.cell(i, "Interaction ID")) for i in range(len(timeline.rows))], "ATL-I-")

    people_data = [h for h in PEOPLE_HEADERS if h != "Quality flags"]
    org_data = ORG_WRITE_HEADERS
    tl_data = TIMELINE_HEADERS
    # Eager check: a full grid fails the run even when this plan appends nothing.
    # Later allocations call take_free_row again so a filled row under a gap is skipped.
    people_row = first_free_row(people, "Contact ID", people_data)
    org_row = first_free_row(orgs, "Organization ID", org_data)
    tl_row = first_free_row(timeline, "Interaction ID", tl_data)

    by_email: dict[str, list[int]] = {}
    by_name: dict[str, list[int]] = {}
    by_pid: dict[str, int] = {}
    for i in range(len(people.rows)):
        e = norm_email(people.cell(i, "Email"))
        if e:
            by_email.setdefault(e, []).append(i)
        n = norm_name(people.cell(i, "Name"))
        if n:
            by_name.setdefault(n, []).append(i)
        pid = s(people.cell(i, "Contact ID"))
        if pid:
            by_pid[pid] = i
    org_by_name: dict[str, str] = {}
    for i in range(len(orgs.rows)):
        n = norm_name(orgs.cell(i, "Organization"))
        oid = s(orgs.cell(i, "Organization ID"))
        # TODO(H5): duplicate Organization names keep the first ID. They should become
        # Needs review instead of a silent first match. Left as a comment on purpose.
        if n and oid and n not in org_by_name:
            org_by_name[n] = oid

    # Values we will set this run on People cells (so token merges stack inside one run).
    pending: dict[tuple[int, str], str] = {}
    new_emails: set[str] = set()
    new_names: set[str] = set()
    qf_template = ""
    for i in range(len(people.rows)):
        f = s(people.cell(i, "Quality flags"))
        if f.startswith("=") and people.sheet_row(i) == 2:
            qf_template = f
            break

    def people_value(i: int, h: str) -> str:
        return pending.get((i, h), s(people.cell(i, h)))

    def set_people(i: int, h: str, new: str):
        old = people_value(i, h)
        if old == new:
            return
        pending[(i, h)] = new
        plan.people_updates.append({"row": people.sheet_row(i), "header": h, "old": s(people.cell(i, h)), "new": new})

    def add_tokens(i: int, types: list[str]):
        set_people(i, "Type", merge_tokens(people_value(i, "Type"), types))
        set_people(i, "Brands", merge_tokens(people_value(i, "Brands"), brands_for(types)))

    def mirror_invite(i: int, invite: str):
        cur = people_value(i, "Status")
        if cur == "" or cur.startswith(BETA_STATUS_PREFIX):
            set_people(i, "Status", BETA_STATUS_PREFIX + invite)

    for k, raw in enumerate(karen_rows):
        row = list(raw) + [""] * (14 - len(raw))
        krow = karen_first_row + k
        email, name, kind, org = s(row[0]), s(row[1]), s(row[2]), s(row[3])
        invite_raw, phone, how, added_by = row[4], s(row[5]), s(row[6]), s(row[7]) or "Karen"
        date_raw, notes = row[8], s(row[9])
        L, M, N = s(row[11]), s(row[12]), s(row[13])
        if not (email or name or org):
            continue
        types = map_kinds(kind)
        beta = "Beta tester" in types
        invite = invite_value(invite_raw)

        # Already filed: keep tags and the beta invite mirror in step, nothing else.
        # Do not trust L forever: the People email behind that ID must still match.
        if L:
            i = by_pid.get(L)
            if i is None:
                plan.skipped.append(f"Karen row {krow}: Contact ID {L} not found in People; left alone")
                continue
            if not contact_emails_agree(email, people.cell(i, "Email")):
                if N != REVIEW_STALE_CONTACT:
                    plan.log.append(f"Karen row {krow}: {REVIEW_STALE_CONTACT}")
                    plan.karen_writes.append({"row": krow, "L": L, "M": M, "N": REVIEW_STALE_CONTACT})
                else:
                    plan.skipped.append(f"Karen row {krow}: {N}")
                continue
            add_tokens(i, types)
            if beta:
                mirror_invite(i, invite)
            if N == REVIEW_STALE_CONTACT:
                plan.log.append(f"Karen row {krow}: Contact ID {L} email matches again")
                plan.karen_writes.append({"row": krow, "L": L, "M": M, "N": ""})
            continue
        if M:
            continue
        if N.startswith("Needs review") and not retry_review:
            plan.skipped.append(f"Karen row {krow}: {N}")
            continue

        serial = to_serial(date_raw, today)
        is_person = bool(email or name)
        out = {"row": krow, "L": "", "M": "", "N": ""}

        # 1. Decide the person outcome first, so a review row never creates anything.
        # A non-empty cell with no @ is not an email: Needs review, and it is not a link key.
        link_i = None
        if s(email) and not is_email(email):
            out["N"] = REVIEW_NOT_EMAIL
        elif is_person:
            key = norm_email(email)
            hits = by_email.get(key, []) if key else []
            if key and key in new_emails:
                out["N"] = REVIEW_KAREN_TWICE
            elif len(hits) > 1:
                out["N"] = REVIEW_MULTI_EMAIL
            elif len(hits) == 1:
                link_i = hits[0]
                if not s(people.cell(link_i, "Contact ID")):
                    out["N"] = "Needs review: matching People row has no Contact ID"
            elif not key and name and (by_name.get(norm_name(name)) or norm_name(name) in new_names):
                out["N"] = REVIEW_SAME_NAME
        if out["N"]:
            plan.log.append(f"Karen row {krow}: {out['N']}")
            plan.karen_writes.append(out)
            continue

        # 2. Organization match or create.
        oid = ""
        if org:
            oid = org_by_name.get(norm_name(org), "")
            wants_org = (not is_person) or bool(set(types) & ORG_KINDS)
            if not oid and wants_org:
                orow = take_free_row(orgs, org_row, org_data)
                org_row = orow + 1
                oid = new_oid()
                org_by_name[norm_name(org)] = oid
                plan.orgs_new.append({"row": orow, "values": {
                    "Organization": org,
                    "Notes": notes,
                    "Organization ID": oid,
                    "Relationship owner": added_by,
                    "Stage": "Needs review",
                    "Source": f"Karen tab row {krow}",
                    "Context": f"Added on the Karen tab by {added_by}; how we know them: {how}" if how
                               else f"Added on the Karen tab by {added_by}",
                }})
        out["M"] = oid

        # 3. Person link or create.
        if link_i is not None:
            pid = s(people.cell(link_i, "Contact ID"))
            out["L"] = pid
            add_tokens(link_i, types)
            if beta:
                mirror_invite(link_i, invite)
            plan.log.append(f"Karen row {krow}: linked to existing {pid} by email")
        elif is_person:
            prow = take_free_row(people, people_row, people_data)
            people_row = prow + 1
            pid = new_pid()
            out["L"] = pid
            note_bits = [f"How we know them: {how}." if how else "", notes]
            values = {
                "Name": name or email,
                "Type": "; ".join(types),
                "Email": email,
                "Phone": phone,
                "Organization": org,
                "Consent": CONSENT_BETA if beta else CONSENT_RELATIONSHIP,
                "Status": BETA_STATUS_PREFIX + invite if beta else "",
                "Notes": " ".join(b for b in note_bits if b),
                "Contact ID": pid,
                "Relationship owner": added_by,
                "Brands": "; ".join(brands_for(types)),
                "Relationship stage": "Needs review",
                "Origin": f"Karen tab, added by {added_by} on {serial_text(serial)}; not marketing consent",
                "Organization ID": oid,
                "Source": f"Karen tab row {krow}",
            }
            plan.people_new.append({"row": prow, "values": values, "quality_formula":
                                    shift_formula(qf_template, prow) if qf_template else ""})
            added_email = norm_email(email)
            if added_email:
                new_emails.add(added_email)
            new_names.add(norm_name(values["Name"]))
            plan.log.append(f"Karen row {krow}: new People row {prow} {pid}")
        else:
            plan.log.append(f"Karen row {krow}: organization {oid}")

        if (how or notes) and (out["L"] or out["M"]):
            summary = f"Added on the Karen tab as {kind or 'Supporter'}" + (f", {how}" if how else "")
            trow = take_free_row(timeline, tl_row, tl_data)
            tl_row = trow + 1
            plan.timeline_new.append({"row": trow, "values": {
                "Interaction ID": new_iid(),
                "Date": serial,
                "Contact ID": out["L"],
                "Contact": "",
                "Organization ID": out["M"],
                "Channel": "Karen tab",
                "Direction": "Note",
                "Summary": summary,
                "Exact words / detailed notes": notes,
                "Recorded by": f"Karen tab filer (added by {added_by})",
            }, "contact_formula": (f'=IFERROR(INDEX(People!A:A,MATCH(C{trow},People!R:R,0)),"CONTACT ID NOT FOUND")'
                                   if out["L"] else "")})
        plan.karen_writes.append(out)
    return plan


# ---------------------------------------------------------------- gog I/O

def gog(*args: str) -> str:
    cmd = [GOG, "-a", ACCOUNT, "sheets", *args]
    r = subprocess.run(cmd, stdin=subprocess.DEVNULL, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(f"{' '.join(cmd[:6])} failed: {r.stderr.strip()[:400]}")
    return r.stdout


def read_range(rng: str) -> list[list]:
    out = json.loads(gog("get", SHEET_ID, rng, "--render", "UNFORMATTED_VALUE", "-j"))
    return out.get("values", []) or []


def read_formula(rng: str) -> list[list]:
    out = json.loads(gog("get", SHEET_ID, rng, "--render", "FORMULA", "-j"))
    return out.get("values", []) or []


def grid_rows(title: str) -> int:
    meta = json.loads(gog("metadata", SHEET_ID, "-j"))
    for sh in meta["sheets"]:
        if sh["properties"]["title"] == title:
            return sh["properties"]["gridProperties"]["rowCount"]
    raise ReadError(f"tab {title} not found")


def load_table(title: str, last_col: str) -> Table:
    vals = read_range(f"'{title}'!A1:{last_col}")
    if not vals:
        raise ReadError(f"{title} is empty")
    header = [s(h) for h in vals[0]]
    width = len(header)
    rows = [list(r) + [""] * (width - len(r)) for r in vals[1:]]
    return Table(title, header, rows, grid_rows(title))


def batch(data: list[dict], input_mode: str):
    if data:
        gog("batch-update", SHEET_ID, "--input", input_mode, "--data-json", json.dumps(data))


def apply_plan(plan: Plan, people: Table, orgs: Table, timeline: Table):
    raw: list[dict] = []
    formulas: list[dict] = []
    last_p = col_letter(len(PEOPLE_HEADERS) - 2)  # through Source (AC); AD holds the formula
    for p in plan.people_new:
        vals = [p["values"].get(h, "") for h in PEOPLE_HEADERS[:-1]]
        raw.append({"range": f"People!A{p['row']}:{last_p}{p['row']}", "values": [vals]})
        qi = p["row"] - 2
        existing_qf = s(people.cell(qi, "Quality flags")) if qi < len(people.rows) else ""
        if p["quality_formula"] and not existing_qf:
            formulas.append({"range": f"People!AD{p['row']}", "values": [[p["quality_formula"]]]})
    for u in plan.people_updates:
        c = col_letter(people.col(u["header"]))
        raw.append({"range": f"People!{c}{u['row']}", "values": [[u["new"]]]})
    for o in plan.orgs_new:
        for h, v in o["values"].items():
            raw.append({"range": f"Organizations!{col_letter(orgs.col(h))}{o['row']}", "values": [[v]]})
    for t in plan.timeline_new:
        vals = [t["values"].get(h, "") for h in TIMELINE_HEADERS]
        raw.append({"range": f"Timeline!A{t['row']}:{col_letter(len(TIMELINE_HEADERS) - 1)}{t['row']}", "values": [vals]})
        if t["contact_formula"]:
            formulas.append({"range": f"Timeline!D{t['row']}", "values": [[t["contact_formula"]]]})
    # People / Organizations / Timeline first, Karen write-back last, so a failure
    # mid-run leaves Karen rows unfiled (they will be re-planned) rather than pointing at nothing.
    batch(raw, "RAW")
    batch(formulas, "USER_ENTERED")
    kw = [{"range": f"Karen!L{w['row']}:N{w['row']}", "values": [[w["L"], w["M"], w["N"]]]}
          for w in plan.karen_writes]
    batch(kw, "RAW")


@contextmanager
def run_lock(path: str | None = None, blocking: bool = True):
    """Exclusive lock around one karen_sync run (manual or cron).

    The success path is `with run_lock():` in main, which holds the lock from the
    sheet read through apply. A second process waits (or, with blocking=False,
    raises LockError). The lock is released when this block exits, including on
    error or crash, because the kernel drops it with the open file. Do not unlink
    the lock file; a new inode would not share the lock.

    Path: argument, else KAREN_SYNC_LOCK, else DEFAULT_LOCK_PATH.
    """
    path = path or os.environ.get("KAREN_SYNC_LOCK") or DEFAULT_LOCK_PATH
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    fh = open(path, "a+")
    flags = fcntl.LOCK_EX
    if not blocking:
        flags |= fcntl.LOCK_NB
    try:
        fcntl.flock(fh.fileno(), flags)
    except BlockingIOError as e:
        fh.close()
        raise LockError(f"another karen_sync holds {path}") from e
    try:
        yield path
    finally:
        fcntl.flock(fh.fileno(), fcntl.LOCK_UN)
        fh.close()


def partial_marker(lock_path: str) -> str:
    """Marker beside the lock: present only while an apply is between its first and last write."""
    return lock_path + ".partial"


def partial_apply_left(lock_path: str) -> str | None:
    """Text of a marker left by an apply that did not finish, or None."""
    try:
        with open(partial_marker(lock_path)) as fh:
            return fh.read().strip() or "(empty marker)"
    except FileNotFoundError:
        return None


def guarded_apply(lock_path: str, plan: Plan, people: Table, orgs: Table, timeline: Table):
    """apply_plan with a marker, so a run after a half-written apply refuses instead of filing twice.

    Writes go out in several requests (People/Organizations/Timeline, then formulas, then the
    Karen write-back). If one commits and a later one fails, the Karen row is still unfiled and
    the next run would plan it again, adding a second People or Timeline row. The marker stays
    on any failure; the next --apply refuses (exit 4, which pages) until a person checks the
    sheet and deletes the marker.
    """
    marker = partial_marker(lock_path)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with open(marker, "w") as fh:
        fh.write(f"started {stamp}: {len(plan.people_new)} People, {len(plan.orgs_new)} Organizations, "
                 f"{len(plan.timeline_new)} Timeline, Karen rows "
                 f"{', '.join(str(w['row']) for w in plan.karen_writes) or 'none'}\n")
    apply_plan(plan, people, orgs, timeline)
    os.remove(marker)


def print_plan(plan: Plan, mode: str):
    print(f"Karen tab filer ({mode})")
    print(f"  new People rows:       {len(plan.people_new)}")
    for p in plan.people_new:
        v = p["values"]
        print(f"    row {p['row']}: {v['Contact ID']} {v['Name']!r} type={v['Type']!r} brands={v['Brands']!r} org={v['Organization ID'] or '-'}")
    print(f"  People cell updates:   {len(plan.people_updates)}")
    for u in plan.people_updates:
        print(f"    People row {u['row']} {u['header']}: {u['old']!r} -> {u['new']!r}")
    print(f"  new Organizations:     {len(plan.orgs_new)}")
    for o in plan.orgs_new:
        print(f"    row {o['row']}: {o['values']['Organization ID']} {o['values']['Organization']!r}")
    print(f"  new Timeline rows:     {len(plan.timeline_new)}")
    for t in plan.timeline_new:
        print(f"    row {t['row']}: {t['values']['Interaction ID']} {t['values']['Summary']!r}")
    print(f"  Karen write-backs:     {len(plan.karen_writes)}")
    for w in plan.karen_writes:
        print(f"    Karen row {w['row']}: L={w['L'] or '-'} M={w['M'] or '-'} N={w['N'] or '-'}")
    for line in plan.skipped:
        print(f"  skipped: {line}")
    if plan.empty():
        print("  nothing to do")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", default=True, help="print the plan (default)")
    mode.add_argument("--apply", action="store_true", help="write the plan to the sheet")
    ap.add_argument("--retry-review", action="store_true", help="re-plan rows whose house note starts with Needs review")
    args = ap.parse_args(argv)
    try:
        # One holder at a time. The second manual or cron run waits, then reads
        # the sheet the first run already updated, so IDs and rows are not shared.
        with run_lock() as lock_path:
            left = partial_apply_left(lock_path)
            if left and args.apply:
                print(f"PARTIAL APPLY LEFT, nothing written: an earlier --apply stopped between writes "
                      f"({left}). Check People, Organizations and Timeline for those Karen rows, remove "
                      f"any duplicates, then delete {partial_marker(lock_path)}", file=sys.stderr)
                return 4
            if left:
                print(f"warning: partial apply marker present ({left})", file=sys.stderr)
            try:
                karen_head = read_range(f"Karen!A2:N2")
                got = [s(h) for h in (karen_head[0] if karen_head else [])]
                if got != KAREN_HEADERS:
                    raise ReadError(f"Karen header mismatch: expected {KAREN_HEADERS}, got {got}")
                karen_rows = read_range(f"Karen!A{KAREN_FIRST_ROW}:N{KAREN_LAST_ROW}")
                people = load_table("People", "AD")
                # Quality flags are formulas; keep the formula text, not the computed flag.
                qcol = people.col("Quality flags")
                qf = read_formula(f"People!{col_letter(qcol)}2:{col_letter(qcol)}")
                for i, row in enumerate(people.rows):
                    row[qcol] = qf[i][0] if i < len(qf) and qf[i] else ""
                orgs = load_table("Organizations", "Z")
                timeline = load_table("Timeline", "M")
                today = dt.datetime.now(ZoneInfo("America/Chicago")).date()
                plan = plan_sync(karen_rows, people, orgs, timeline, today, args.retry_review)
            except ReadError as e:
                print(f"READ CHECK FAILED, nothing written: {e}", file=sys.stderr)
                return 2
            print_plan(plan, "apply" if args.apply else "dry run")
            if args.apply and not plan.empty():
                guarded_apply(lock_path, plan, people, orgs, timeline)
                print("  applied")
            return 0
    except LockError as e:
        print(f"LOCKED, nothing written: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
