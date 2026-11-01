#!/usr/bin/env python3
"""Unit tests for the pure planner in karen_sync.py. No network.

Run: python3 -m unittest scripts/crm/test_karen_sync.py
"""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import karen_sync as ks  # noqa: E402

TODAY = dt.date(2026, 11, 1)
QF = ('=IF(A2="","",TEXTJOIN("; ",TRUE,IF(COUNTIF($A$2:$A,A2)>1,"Possible duplicate name",""),'
      'IF(AND(E2<>"",COUNTIF($E$2:$E,E2)>1),"Repeated email: review identity","")))')


def person(name, email="", pid="", type_="Supporter", brands="Adapt To Life", status="", org_id=""):
    row = {h: "" for h in ks.PEOPLE_HEADERS}
    row.update({"Name": name, "Email": email, "Contact ID": pid, "Type": type_, "Brands": brands,
                "Status": status, "Organization ID": org_id})
    return [row[h] for h in ks.PEOPLE_HEADERS]


ORG_HEADER = ["Organization", "Category", "State", "Website", "General Email", "Contact 1", "Title",
              "Email", "Phone", "Contact 2", "Title 2", "Email 2", "Phone 2", "Contact 3", "Title 3",
              "Email 3", "Phone 3", "Programs Offered", "Events to Invite To", "Notes",
              "Organization ID", "Relationship owner", "Stage", "Source", "Verified on", "Context"]


def org(name, oid):
    row = [""] * len(ORG_HEADER)
    row[0] = name
    row[ORG_HEADER.index("Organization ID")] = oid
    return row


def tables():
    people_rows = [
        person("Brett", "", "ATL-P-000001", "Donor; Athlete"),
        person("Pat Shared", "shared@example.org", "ATL-P-000002"),
        person("Pat Shared Two", "shared@example.org", "ATL-P-000003"),
        person("Jordan Known", "Jordan@Example.org", "ATL-P-000004", "Athlete"),
        person("Casey Name", "casey@example.org", "ATL-P-000005"),
    ]
    people_rows[0][ks.PEOPLE_HEADERS.index("Quality flags")] = QF
    # Empty grid rows below the data, each with its own Quality flags formula (like the live sheet).
    for r in range(7, 12):
        blank = [""] * len(ks.PEOPLE_HEADERS)
        blank[-1] = ks.shift_formula(QF, r)
        people_rows.append(blank)
    people = ks.Table("People", list(ks.PEOPLE_HEADERS), people_rows, 1000)
    orgs = ks.Table("Organizations", ORG_HEADER, [org("Lakeshore Foundation", "ATL-O-000001"),
                                                   org("ACE Des Plaines", "ATL-O-000002")], 1000)
    tl_row = ["ATL-I-000007", 46283, "ATL-P-000001", "Brett", "", "In person", "Mutual", "Met", "", "", "", "Julia", ""]
    timeline = ks.Table("Timeline", list(ks.TIMELINE_HEADERS), [tl_row], 2003)
    return people, orgs, timeline


def karen(email="", name="", kind="", org_="", invite="", phone="", how="", added="Karen", date=46327,
          notes="", L="", M="", N=""):
    return [email, name, kind, org_, invite, phone, how, added, date, notes, "", L, M, N]


class PlanTests(unittest.TestCase):
    def plan(self, rows, **kw):
        people, orgs, timeline = tables()
        return ks.plan_sync(rows, people, orgs, timeline, TODAY, **kw), (people, orgs, timeline)

    def test_empty_karen_is_noop(self):
        plan, _ = self.plan([[""] * 14, [""] * 14])
        self.assertTrue(plan.empty())

    def test_new_person(self):
        plan, _ = self.plan([karen("new@example.org", "Nia New", "Athlete", how="Vets Get Going",
                                   notes="Wants sled hockey", phone="847 555 0100")])
        self.assertEqual(len(plan.people_new), 1)
        p = plan.people_new[0]
        v = p["values"]
        self.assertEqual(p["row"], 7)  # first empty row after the last Contact ID
        self.assertEqual(v["Contact ID"], "ATL-P-000006")
        self.assertEqual(v["Type"], "Athlete")
        self.assertEqual(v["Brands"], "Adapt To Life")
        self.assertEqual(v["Consent"], ks.CONSENT_RELATIONSHIP)
        self.assertEqual(v["Status"], "")
        self.assertEqual(v["Relationship owner"], "Karen")
        self.assertEqual(v["Relationship stage"], "Needs review")
        self.assertEqual(v["Origin"], "Karen tab, added by Karen on Nov 1, 2026; not marketing consent")
        self.assertEqual(v["Source"], "Karen tab row 3")
        self.assertEqual(v["Notes"], "How we know them: Vets Get Going. Wants sled hockey")
        self.assertIn("A7", p["quality_formula"])
        self.assertIn("$A$2:$A", p["quality_formula"])
        self.assertEqual(plan.karen_writes, [{"row": 3, "L": "ATL-P-000006", "M": "", "N": ""}])
        self.assertEqual(len(plan.timeline_new), 1)
        t = plan.timeline_new[0]
        self.assertEqual(t["row"], 3)
        self.assertEqual(t["values"]["Interaction ID"], "ATL-I-000008")
        self.assertEqual(t["values"]["Date"], 46327)
        self.assertEqual(t["values"]["Summary"], "Added on the Karen tab as Athlete, Vets Get Going")
        self.assertIn("MATCH(C3,People!R:R,0)", t["contact_formula"])

    def test_existing_email_links_without_creating(self):
        plan, _ = self.plan([karen("  jordan@example.ORG ", "Jordan", "Donor")])
        self.assertEqual(plan.people_new, [])
        self.assertEqual(plan.karen_writes[0]["L"], "ATL-P-000004")
        ups = {(u["row"], u["header"]): u["new"] for u in plan.people_updates}
        self.assertEqual(ups[(5, "Type")], "Athlete; Donor")
        self.assertNotIn((5, "Brands"), ups)  # Adapt To Life already present
        self.assertNotIn((5, "Status"), ups)  # not a beta row

    def test_duplicate_email_needs_review(self):
        plan, _ = self.plan([karen("shared@example.org", "Pat", "Volunteer", how="event")])
        self.assertEqual(plan.people_new, [])
        self.assertEqual(plan.people_updates, [])
        self.assertEqual(plan.timeline_new, [])
        self.assertEqual(plan.karen_writes[0]["N"], ks.REVIEW_MULTI_EMAIL)

    def test_name_only_collision_needs_review(self):
        plan, _ = self.plan([karen("", "casey  NAME", "Donor")])
        self.assertEqual(plan.people_new, [])
        self.assertEqual(plan.karen_writes[0]["N"], ks.REVIEW_SAME_NAME)

    def test_review_rows_skipped_unless_retry(self):
        row = karen("", "Casey Name", "Donor", N=ks.REVIEW_SAME_NAME)
        plan, _ = self.plan([row])
        self.assertTrue(plan.empty())
        self.assertEqual(len(plan.skipped), 1)
        plan, _ = self.plan([row], retry_review=True)
        self.assertEqual(plan.karen_writes[0]["N"], ks.REVIEW_SAME_NAME)

    def test_org_only_row_creates_org(self):
        plan, _ = self.plan([karen(org_="Windy City Wheelers", kind="Business or partner",
                                   how="Chicago Classic", notes="Lend sleds")])
        self.assertEqual(plan.people_new, [])
        self.assertEqual(len(plan.orgs_new), 1)
        o = plan.orgs_new[0]["values"]
        self.assertEqual(o["Organization ID"], "ATL-O-000003")
        self.assertEqual(o["Stage"], "Needs review")
        self.assertEqual(o["Context"], "Added on the Karen tab by Karen; how we know them: Chicago Classic")
        self.assertEqual(plan.orgs_new[0]["row"], 4)
        self.assertEqual(plan.karen_writes[0], {"row": 3, "L": "", "M": "ATL-O-000003", "N": ""})
        self.assertEqual(plan.timeline_new[0]["values"]["Organization ID"], "ATL-O-000003")
        self.assertEqual(plan.timeline_new[0]["contact_formula"], "")

    def test_org_only_row_matches_existing_org(self):
        plan, _ = self.plan([karen(org_="ace des plaines")])
        self.assertEqual(plan.orgs_new, [])
        self.assertEqual(plan.karen_writes[0]["M"], "ATL-O-000002")

    def test_person_with_known_org_gets_org_id(self):
        plan, _ = self.plan([karen("coach@example.org", "Coach", "Volunteer", org_="Lakeshore Foundation")])
        self.assertEqual(plan.orgs_new, [])
        self.assertEqual(plan.people_new[0]["values"]["Organization ID"], "ATL-O-000001")
        self.assertEqual(plan.karen_writes[0]["M"], "ATL-O-000001")

    def test_person_unknown_org_not_business_keeps_text_only(self):
        plan, _ = self.plan([karen("dad@example.org", "Dad", "Parent or caregiver", org_="Some Club")])
        self.assertEqual(plan.orgs_new, [])
        v = plan.people_new[0]["values"]
        self.assertEqual(v["Organization"], "Some Club")
        self.assertEqual(v["Organization ID"], "")
        self.assertEqual(v["Type"], "Parent/Caregiver")

    def test_beta_plus_athlete_multi_kind(self):
        plan, _ = self.plan([karen("both@example.org", "Bo Both", "Athlete; Beta tester")])
        v = plan.people_new[0]["values"]
        self.assertEqual(v["Type"], "Athlete; Beta tester")
        self.assertEqual(v["Brands"], "Adaptive Sports Near Me; Adapt To Life")
        self.assertEqual(v["Consent"], ks.CONSENT_BETA)
        self.assertEqual(v["Status"], "ASNM beta: Not invited")

    def test_beta_only(self):
        plan, _ = self.plan([karen("beta@example.org", "", "Beta tester", invite="Invited")])
        v = plan.people_new[0]["values"]
        self.assertEqual(v["Name"], "beta@example.org")
        self.assertEqual(v["Brands"], "Adaptive Sports Near Me")
        self.assertEqual(v["Status"], "ASNM beta: Invited")

    def test_same_email_twice_on_karen(self):
        plan, _ = self.plan([karen("twice@example.org", "One"), karen("TWICE@example.org", "Two")])
        self.assertEqual(len(plan.people_new), 1)
        self.assertEqual(plan.karen_writes[1]["N"], ks.REVIEW_KAREN_TWICE)

    def test_rerun_is_noop(self):
        rows = [karen("new@example.org", "Nia New", "Athlete; Beta tester", how="VGG"),
                karen(org_="Windy City Wheelers", kind="Business or partner")]
        people, orgs, timeline = tables()
        first = ks.plan_sync(rows, people, orgs, timeline, TODAY)
        # Simulate apply: People / Organizations rows and Karen write-backs land.
        for p in first.people_new:
            people.rows[p["row"] - 2] = [p["values"].get(h, "") for h in ks.PEOPLE_HEADERS[:-1]] + [p["quality_formula"]]
        for o in first.orgs_new:
            r = [""] * len(ORG_HEADER)
            for h, v in o["values"].items():
                r[ORG_HEADER.index(h)] = v
            orgs.rows.append(r)
        for t in first.timeline_new:
            timeline.rows.append([t["values"].get(h, "") for h in ks.TIMELINE_HEADERS])
        for w in first.karen_writes:
            row = rows[w["row"] - 3]
            row[11], row[12], row[13] = w["L"], w["M"], w["N"]
        second = ks.plan_sync(rows, people, orgs, timeline, TODAY)
        self.assertTrue(second.empty(), second)

    def test_invite_mirror_on_linked_row(self):
        people, orgs, timeline = tables()
        rows = [karen("jordan@example.org", "Jordan", "Beta tester", invite="Accepted", L="ATL-P-000004")]
        plan = ks.plan_sync(rows, people, orgs, timeline, TODAY)
        ups = {(u["row"], u["header"]): u["new"] for u in plan.people_updates}
        self.assertEqual(ups[(5, "Status")], "ASNM beta: Accepted")
        self.assertEqual(ups[(5, "Type")], "Athlete; Beta tester")
        self.assertEqual(ups[(5, "Brands")], "Adapt To Life; Adaptive Sports Near Me")
        self.assertEqual(plan.karen_writes, [])  # Karen is never written for already filed rows

    def test_invite_mirror_leaves_other_status_alone(self):
        people, orgs, timeline = tables()
        people.rows[3][ks.PEOPLE_HEADERS.index("Status")] = "Active donor"
        rows = [karen("jordan@example.org", "Jordan", "Beta tester", invite="Accepted", L="ATL-P-000004")]
        plan = ks.plan_sync(rows, people, orgs, timeline, TODAY)
        self.assertNotIn("Status", [u["header"] for u in plan.people_updates])

    def test_duplicate_contact_ids_abort(self):
        people, orgs, timeline = tables()
        people.rows[1][ks.PEOPLE_HEADERS.index("Contact ID")] = "ATL-P-000001"
        with self.assertRaises(ks.ReadError):
            ks.plan_sync([], people, orgs, timeline, TODAY)

    def test_header_mismatch_aborts(self):
        people, orgs, timeline = tables()
        people.header[4], people.header[5] = people.header[5], people.header[4]
        with self.assertRaises(ks.ReadError):
            ks.plan_sync([], people, orgs, timeline, TODAY)

    def test_kind_mapping(self):
        self.assertEqual(ks.map_kinds("Business or partner, Sponsor"), ["Partner prospect", "Sponsor prospect"])
        self.assertEqual(ks.map_kinds(""), ["Supporter"])
        self.assertEqual(ks.map_kinds("Other; Mystery"), ["Supporter"])
        self.assertEqual(ks.map_kinds("ASNM beta"), ["Beta tester"])

    def test_written_strings_have_no_dashes(self):
        plan, _ = self.plan([karen("new@example.org", "Nia", "Athlete; Beta tester", org_="New Club Org",
                                   how="Event", notes="Hi")])
        import re
        bad = re.compile("[-‐-―]")
        for p in plan.people_new:
            for h, v in p["values"].items():
                if h in ("Contact ID", "Organization ID", "Email"):
                    continue
                self.assertFalse(bad.search(str(v)), (h, v))
        for t in plan.timeline_new:
            for h, v in t["values"].items():
                if h in ("Interaction ID", "Contact ID", "Organization ID"):
                    continue
                self.assertFalse(bad.search(str(v)), (h, v))
        for msg in (ks.REVIEW_MULTI_EMAIL, ks.REVIEW_SAME_NAME, ks.REVIEW_KAREN_TWICE,
                    ks.REVIEW_NOT_EMAIL, ks.REVIEW_STALE_CONTACT,
                    ks.CONSENT_BETA, ks.CONSENT_RELATIONSHIP):
            self.assertFalse(bad.search(msg), msg)

    def test_two_new_people_use_consecutive_empty_rows(self):
        plan, _ = self.plan([karen("one@example.org", "One New"),
                             karen("two@example.org", "Two New")])
        self.assertEqual([p["row"] for p in plan.people_new], [7, 8])

    def test_filled_row_below_gap_is_not_allocated(self):
        # Last Contact ID is on row 6, row 7 is empty, row 8 has human data and no ID.
        # Blind +1 would plan [7, 8] and overwrite row 8.
        people, orgs, timeline = tables()
        name_i = ks.PEOPLE_HEADERS.index("Name")
        email_i = ks.PEOPLE_HEADERS.index("Email")
        people.rows[6][name_i] = "Hand typed neighbor"
        people.rows[6][email_i] = "hand@example.org"
        plan = ks.plan_sync(
            [karen("one@example.org", "One New", "Athlete"),
             karen("two@example.org", "Two New", "Donor")],
            people, orgs, timeline, TODAY)
        self.assertEqual([p["row"] for p in plan.people_new], [7, 9])
        self.assertNotIn(8, [p["row"] for p in plan.people_new])
        self.assertEqual(people.rows[6][name_i], "Hand typed neighbor")
        self.assertEqual(people.rows[6][email_i], "hand@example.org")
        self.assertNotIn("hand@example.org", [p["values"]["Email"] for p in plan.people_new])

    def test_grid_full_after_gap_aborts(self):
        people, orgs, timeline = tables()
        people.grid_rows = 8
        people.rows[6][ks.PEOPLE_HEADERS.index("Name")] = "Hand typed neighbor"
        with self.assertRaises(ks.ReadError) as cm:
            ks.plan_sync(
                [karen("one@example.org", "One New"), karen("two@example.org", "Two New")],
                people, orgs, timeline, TODAY)
        self.assertIn("People", str(cm.exception))
        self.assertIn("grid is full", str(cm.exception))
        self.assertEqual(people.rows[6][ks.PEOPLE_HEADERS.index("Name")], "Hand typed neighbor")

    def test_last_grid_row_can_still_be_allocated(self):
        people, orgs, timeline = tables()
        people.grid_rows = 7
        plan = ks.plan_sync([karen("one@example.org", "One New", how="event")],
                            people, orgs, timeline, TODAY)
        self.assertEqual(plan.people_new[0]["row"], 7)
        self.assertEqual(plan.timeline_new[0]["row"], 3)

    def test_org_gap_is_not_overwritten(self):
        people, orgs, timeline = tables()
        blank = [""] * len(ORG_HEADER)
        named = [""] * len(ORG_HEADER)
        named[0] = "Hand typed org"
        orgs.rows = [org("Lakeshore Foundation", "ATL-O-000001"), blank, named]
        plan = ks.plan_sync(
            [karen(org_="One Org", kind="Business"), karen(org_="Two Org", kind="Sponsor")],
            people, orgs, timeline, TODAY)
        self.assertEqual([o["row"] for o in plan.orgs_new], [3, 5])
        self.assertNotIn(4, [o["row"] for o in plan.orgs_new])

    def test_timeline_gap_is_not_overwritten(self):
        people, orgs, timeline = tables()
        filled = [""] * len(ks.TIMELINE_HEADERS)
        filled[ks.TIMELINE_HEADERS.index("Summary")] = "hand typed note"
        timeline.rows = [timeline.rows[0], [""] * len(ks.TIMELINE_HEADERS), filled]
        plan = ks.plan_sync(
            [karen("a@example.org", "A Person", how="one"),
             karen("b@example.org", "B Person", how="two")],
            people, orgs, timeline, TODAY)
        self.assertEqual([t["row"] for t in plan.timeline_new], [3, 5])
        self.assertEqual(timeline.rows[2][ks.TIMELINE_HEADERS.index("Summary")], "hand typed note")

    def test_placeholder_email_is_not_a_link(self):
        people, orgs, timeline = tables()
        people.rows.append(person("Alex Placeholder", "n/a", "ATL-P-000006"))
        plan = ks.plan_sync([karen("n/a", "Sam Other", "Donor"),
                             karen(" N/A ", "Alex Placeholder", "Athlete"),
                             karen("none", "Pat None", "Volunteer")],
                            people, orgs, timeline, TODAY)
        self.assertEqual(plan.people_new, [])
        self.assertEqual(plan.people_updates, [])
        self.assertEqual(plan.timeline_new, [])
        self.assertEqual([w["L"] for w in plan.karen_writes], ["", "", ""])
        self.assertEqual([w["N"] for w in plan.karen_writes], [ks.REVIEW_NOT_EMAIL] * 3)
        self.assertNotIn("ATL-P-000006", [w["L"] for w in plan.karen_writes])

    def test_placeholder_does_not_merge_across_runs(self):
        people, orgs, timeline = tables()
        people.rows.append(person("Alex Placeholder", "n/a", "ATL-P-000006"))
        first = ks.plan_sync([karen("n/a", "Sam Other", "Donor")], people, orgs, timeline, TODAY)
        self.assertEqual(first.people_new, [])
        self.assertEqual(first.karen_writes[0]["N"], ks.REVIEW_NOT_EMAIL)
        # The note lands; a later run still must not attach Sam to Alex.
        row = karen("n/a", "Sam Other", "Donor", N=first.karen_writes[0]["N"])
        second = ks.plan_sync([row], people, orgs, timeline, TODAY)
        self.assertTrue(second.empty(), second)
        self.assertNotIn("ATL-P-000006", [w.get("L", "") for w in second.karen_writes])

    def test_people_placeholder_is_not_an_email_key(self):
        self.assertEqual(ks.norm_email("n/a"), "")
        self.assertEqual(ks.norm_email(" N/A "), "")
        self.assertEqual(ks.norm_email("none"), "")
        self.assertEqual(ks.norm_email("Jordan@Example.org"), "jordan@example.org")
        self.assertFalse(ks.is_email("n/a"))
        self.assertTrue(ks.is_email("a@b.c"))
        people, orgs, timeline = tables()
        people.rows[0][ks.PEOPLE_HEADERS.index("Email")] = "n/a"
        plan = ks.plan_sync([karen("n/a", "Brand New", "Athlete")], people, orgs, timeline, TODAY)
        self.assertEqual(plan.people_new, [])
        self.assertNotEqual(plan.karen_writes[0]["L"], "ATL-P-000001")
        self.assertEqual(plan.karen_writes[0]["N"], ks.REVIEW_NOT_EMAIL)

    def test_stale_contact_id_does_not_update_people(self):
        plan, _ = self.plan([karen("stranger@example.org", "Jordan", "Donor; Beta tester",
                                   invite="Accepted", L="ATL-P-000004")])
        self.assertEqual(plan.people_updates, [])
        self.assertEqual(plan.people_new, [])
        self.assertEqual(plan.timeline_new, [])
        self.assertEqual(plan.karen_writes, [{
            "row": 3, "L": "ATL-P-000004", "M": "", "N": ks.REVIEW_STALE_CONTACT,
        }])

    def test_stale_contact_id_note_is_not_rewritten(self):
        plan, _ = self.plan([karen("stranger@example.org", "Jordan", "Donor",
                                   L="ATL-P-000004", N=ks.REVIEW_STALE_CONTACT)])
        self.assertEqual(plan.karen_writes, [])
        self.assertEqual(plan.people_updates, [])
        self.assertTrue(plan.skipped)

    def test_matching_contact_id_clears_stale_note(self):
        plan, _ = self.plan([karen("jordan@example.org", "Jordan", "Donor",
                                   L="ATL-P-000004", N=ks.REVIEW_STALE_CONTACT)])
        self.assertEqual(plan.karen_writes, [{"row": 3, "L": "ATL-P-000004", "M": "", "N": ""}])
        ups = {(u["row"], u["header"]): u["new"] for u in plan.people_updates}
        self.assertEqual(ups[(5, "Type")], "Athlete; Donor")

    def test_filed_blank_emails_still_update(self):
        people, orgs, timeline = tables()
        people.rows[5] = person("Nia New", "", "ATL-P-000006", "Athlete")
        plan = ks.plan_sync([karen("", "Nia New", "Athlete; Donor", L="ATL-P-000006")],
                            people, orgs, timeline, TODAY)
        self.assertEqual(plan.karen_writes, [])
        ups = {(u["row"], u["header"]): u["new"] for u in plan.people_updates}
        self.assertEqual(ups[(7, "Type")], "Athlete; Donor")
        self.assertTrue(ks.contact_emails_agree("", ""))
        self.assertTrue(ks.contact_emails_agree("n/a", "none"))
        self.assertFalse(ks.contact_emails_agree("a@b.c", "n/a"))
        self.assertFalse(ks.contact_emails_agree("", "a@b.c"))
        self.assertTrue(ks.contact_emails_agree("A@B.C", "a@b.c"))

    def test_run_lock_excludes_a_second_acquire(self):
        import tempfile
        self.assertTrue(os.path.isabs(ks.DEFAULT_LOCK_PATH))
        self.assertTrue(ks.DEFAULT_LOCK_PATH.endswith("adapt-to-life-karen-sync.lock"))
        with tempfile.TemporaryDirectory() as d:
            path = os.path.join(d, "karen.lock")
            with ks.run_lock(path) as held:
                self.assertEqual(held, path)
                with self.assertRaises(ks.LockError):
                    with ks.run_lock(path, blocking=False):
                        self.fail("second acquire took the lock")
            with ks.run_lock(path, blocking=False) as held_again:
                self.assertEqual(held_again, path)


if __name__ == "__main__":
    unittest.main()
