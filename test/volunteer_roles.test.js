// The volunteer pages and the Worker agree, and the receipt keeps the page's promise.
//
// Moved verbatim from volunteer_clickup.test.js when ClickUp was retired
// (2026-10-02). The task-creation tests went with that integration; these
// properties never depended on it:
//
//   1. The role pages and the Worker's canonical list are the SAME set. The
//      Worker drops any role it does not recognise, so a role added to a page
//      and not to VOLUNTEER_ROLES would vanish from every submission that picked
//      it, with no error anywhere.
//   2. The receipt never asks a volunteer for money, and promises what the page
//      promises.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const SRC = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ROLE_PAGES = readdirSync(new URL("../public/volunteer/", import.meta.url))
  .filter((f) => f.endsWith(".html"));

// The role a submission carries is now a hidden input on that role's own page,
// not a checkbox on the board. Alec, 2026-09-02: almost everyone applies for one
// role, so the board stopped being a multi-select.
function pageRoles() {
  return ROLE_PAGES.map((f) => {
    const html = readFileSync(new URL(`../public/volunteer/${f}`, import.meta.url), "utf8");
    const m = html.match(/<input type="hidden" name="role" value="([^"]+)"/);
    assert.ok(m, `${f} has no hidden role input, so applying there would post no role`);
    return m[1].replace(/&amp;/g, "&");
  });
}
function workerRoles() {
  const block = SRC.match(/const VOLUNTEER_ROLES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "VOLUNTEER_ROLES not found in src/index.js");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("every role page posts a role the Worker will accept", () => {
  const page = pageRoles();
  const worker = workerRoles();
  assert.ok(page.length > 0);
  const orphaned = page.filter((r) => !worker.includes(r));
  assert.deepEqual(orphaned, [], "these roles are on a page but not in VOLUNTEER_ROLES, so applying would silently drop the role");
  const unreachable = worker.filter((r) => !page.includes(r));
  assert.deepEqual(unreachable, [], "these roles are in VOLUNTEER_ROLES but have no page");
});

test("role values are unique", () => {
  const page = pageRoles();
  assert.equal(new Set(page).size, page.length, "two role pages post the same role");
});

const RECEIPTS = readFileSync(new URL("../src/receipts.js", import.meta.url), "utf8");
const volunteerReceipt = RECEIPTS.slice(RECEIPTS.indexOf("export async function sendVolunteerReceipt"));

test("the volunteer receipt never asks for money", () => {
  // Someone who just offered their time and gets upsold in the confirmation
  // learns what we actually wanted. Deliberate, and pinned so a helpful edit
  // cannot quietly add a donate button.
  assert.doesNotMatch(volunteerReceipt, /\/donate|Donate|donate\b/,
    "the volunteer receipt must not carry a donation ask");
});

test("the receipt makes the same promise the page makes", () => {
  assert.match(volunteerReceipt, /hear back either way/i);
});

