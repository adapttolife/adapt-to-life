// The volunteer board writes to the ClickUp "Volunteers" list.
//
// Three properties are pinned here, and the first is the one that would fail
// silently in production:
//
//   1. The page's roles and the Worker's canonical list are the SAME set. The
//      Worker drops any role it does not recognise, so a role added to
//      public/volunteer.html and not to VOLUNTEER_ROLES would vanish from every
//      submission that picked it, with no error anywhere. It would surface
//      months later as "why does nobody ever tick that one."
//   2. Nobody who offered to help is lost to a field id, the same guarantee the
//      contact and apply paths carry.
//   3. The receipt never asks a volunteer for money.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createVolunteer, volunteerTitle } from "../src/clickup.js";

const ENV = { CLICKUP_TOKEN: "tok", CLICKUP_VOLUNTEERS_LIST_ID: "901419920230" };

const SUBMISSION = {
  name: "Dana Reyes",
  email: "dana@example.org",
  phone: "555-0100",
  based: "Peoria, IL",
  time: "A few hours a month",
  links: "https://example.org/dana",
  bring: "Twenty years preparing returns for small charities. Happy to take the 990.",
  roles: ["CPA or tax preparer", "Bookkeeper"],
  source: "Submitted through the volunteer form on adapttolife.org.",
};

function stubFetch(fail = () => false) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.clickup.com")) throw new Error("unexpected fetch to " + url);
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body });
    if (fail(calls.length, body)) {
      return new Response(JSON.stringify({ err: "Custom field not found" }), { status: 400 });
    }
    return new Response(JSON.stringify({ id: "86bTEST", url: "https://app.clickup.com/t/86bTEST" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  };
  return { calls, restore: () => { globalThis.fetch = realFetch; } };
}

const valueOf = (body, id) => body.custom_fields.find((f) => f.id === id)?.value;
const ROLES_FIELD = "408bfd1b-d9ce-4e69-aa5d-8323cf587440";
const STAGE = "8e74d25f-a4c5-4dd1-bd17-5e02a482346f";
const STAGE_NEW = "56399a33-ee51-43cb-888c-beb2640bf9bb";
const EMAIL = "af25d1b1-5ef1-48f7-ad51-870385e3f6ce";

// ---- 1. the page and the Worker agree on the role list -------------------

const PAGE = readFileSync(new URL("../public/volunteer.html", import.meta.url), "utf8");
const SRC = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

function pageRoles() {
  return [...PAGE.matchAll(/<input class="role-cb"[^>]*name="role" value="([^"]+)"/g)]
    .map((m) => m[1].replace(/&amp;/g, "&"));
}
function workerRoles() {
  const block = SRC.match(/const VOLUNTEER_ROLES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "VOLUNTEER_ROLES not found in src/index.js");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("every role on the page is a role the Worker will accept", () => {
  const page = pageRoles();
  const worker = workerRoles();
  assert.ok(page.length > 0, "the page has no role checkboxes");
  const orphaned = page.filter((r) => !worker.includes(r));
  assert.deepEqual(orphaned, [], "these roles are on the page but not in VOLUNTEER_ROLES, so picking them would be silently dropped");
  const unreachable = worker.filter((r) => !page.includes(r));
  assert.deepEqual(unreachable, [], "these roles are in VOLUNTEER_ROLES but on no card, so nobody can pick them");
});

test("role values are unique", () => {
  const page = pageRoles();
  assert.equal(new Set(page).size, page.length, "two cards share a value");
});

// ---- 2. the submission survives ------------------------------------------

test("a volunteer lands with their roles filterable and their words intact", async () => {
  const { calls, restore } = stubFetch();
  try {
    const res = await createVolunteer(ENV, SUBMISSION, 1756800000000);
    assert.equal(res.ok, true);
    assert.equal(calls.length, 1);
    const body = calls[0].body;
    assert.match(calls[0].url, /list\/901419920230\/task$/);
    assert.equal(body.name, "Dana Reyes — CPA or tax preparer +1");
    assert.equal(valueOf(body, STAGE), STAGE_NEW);
    assert.equal(valueOf(body, EMAIL), "dana@example.org");
    // Comma-joined so the ClickUp "contains" filter works.
    assert.equal(valueOf(body, ROLES_FIELD), "CPA or tax preparer, Bookkeeper");
    // The description is the lossless copy.
    assert.match(body.markdown_description, /CPA or tax preparer/);
    assert.match(body.markdown_description, /Happy to take the 990/);
    assert.match(body.markdown_description, /Peoria, IL/);
  } finally { restore(); }
});

test("a field id that changed does not lose the volunteer", async () => {
  // One rejection on the fielded create, then the bare retry succeeds.
  const { calls, restore } = stubFetch((n) => n === 1);
  try {
    const res = await createVolunteer(ENV, SUBMISSION);
    assert.equal(res.ok, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.custom_fields, undefined);
    // Everything they wrote is still in the task.
    assert.match(calls[1].body.markdown_description, /Happy to take the 990/);
    assert.match(calls[1].body.markdown_description, /CPA or tax preparer/);
  } finally { restore(); }
});

test("a misconfigured list is reported, not swallowed", async () => {
  const { restore } = stubFetch();
  try {
    const res = await createVolunteer({ CLICKUP_TOKEN: "tok" }, SUBMISSION);
    assert.equal(res.ok, false);
    assert.match(res.error, /not configured/);
  } finally { restore(); }
});

test("someone who picked nothing still gets a usable task name", () => {
  assert.equal(volunteerTitle("Dana Reyes", []), "Dana Reyes — volunteer");
  assert.equal(volunteerTitle("Dana Reyes", ["Grant writer"]), "Dana Reyes — Grant writer");
  assert.equal(volunteerTitle("Dana Reyes", ["Grant writer", "Bookkeeper", "Event crew"]),
    "Dana Reyes — Grant writer +2");
});

// ---- 3. the promises on the page are the promises in the code -------------

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
  assert.match(PAGE, /You hear back either way/i);
});

test("the page carries no em-dash", () => {
  // House voice rule, and the one an em-dash slips past review on. HTML
  // comments are stripped first: they are code, and the rest of the site uses
  // dashes freely in them.
  const body = PAGE.slice(PAGE.indexOf("<main>"), PAGE.indexOf("</main>"))
    .replace(/<!--[\s\S]*?-->/g, "");
  assert.doesNotMatch(body, /—|&mdash;/, "em-dash in user-facing copy");
});
