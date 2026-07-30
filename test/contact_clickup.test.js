// The contact form writes to the ClickUp "Contacts" list. Same two properties
// the apply path pins, for the same reason: the Reason dropdown decides who
// answers, and nobody who wrote to a nonprofit may be lost to a field id.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createContact } from "../src/clickup.js";

const ENV = { CLICKUP_TOKEN: "tok", CLICKUP_CONTACTS_LIST_ID: "901418639884" };

const SUBMISSION = {
  name: "Sam Okafor",
  email: "sam@example.org",
  phone: "",
  type: "Giving or sponsoring",
  message: "Our company would like to sponsor a racing chair this year.",
  source: "Submitted through the contact form on adapttolife.org.",
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

const REASON = "0a821fd5-28fa-45d7-b1ab-5c2b48dabb67";
const STAGE = "35554e2e-364b-4816-8d5c-77cdc29fa9d4";
const EMAIL = "af25d1b1-5ef1-48f7-ad51-870385e3f6ce";
const RECEIVED = "dd49ccb4-b7db-4a66-b38d-41ef49615d62";

test("a contact lands in the Contacts list as Stage: New with its reason set", async () => {
  const { calls, restore } = stubFetch();
  try {
    const res = await createContact(ENV, SUBMISSION, 1785000000000);
    assert.equal(res.ok, true);
    const { url, body } = calls[0];
    assert.equal(url, "https://api.clickup.com/api/v2/list/901418639884/task");
    assert.equal(body.name, "Sam Okafor — Giving or sponsoring");
    assert.equal(valueOf(body, STAGE), "d6d3763e-0952-4d73-aaa7-ae3f7a89f154");
    assert.equal(valueOf(body, REASON), "6fbb7a34-624d-422c-9408-2beb1cd2ee16");
    assert.equal(valueOf(body, EMAIL), "sam@example.org");
    assert.equal(valueOf(body, RECEIVED), 1785000000000);
    assert.ok(body.markdown_description.includes(SUBMISSION.message));
  } finally {
    restore();
  }
});

test("a reason we do not recognise is dropped, not guessed", async () => {
  // The message body still says what they want; a wrong Reason routes them to
  // the wrong person, which is worse than an empty one.
  const { calls, restore } = stubFetch();
  try {
    await createContact(ENV, { ...SUBMISSION, type: "Something we removed from the form" });
    assert.equal(valueOf(calls[0].body, REASON), undefined);
    assert.equal(calls[0].body.name, "Sam Okafor — Something we removed from the form");
  } finally {
    restore();
  }
});

test("someone who gave no name still lands, rather than being dropped", async () => {
  const { calls, restore } = stubFetch();
  try {
    const res = await createContact(ENV, { ...SUBMISSION, name: "(no name given)", type: "" });
    assert.equal(res.ok, true);
    assert.equal(calls[0].body.name, "(no name given)");
  } finally {
    restore();
  }
});

test("a drifted field id costs the fields, never the message", async () => {
  const { calls, restore } = stubFetch((n) => n === 1);
  try {
    const res = await createContact(ENV, SUBMISSION);
    assert.equal(res.ok, true, "the message must still be saved");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.custom_fields, undefined);
    assert.ok(calls[1].body.markdown_description.includes(SUBMISSION.message));
  } finally {
    restore();
  }
});

test("missing configuration fails loudly rather than silently dropping", async () => {
  const { calls, restore } = stubFetch();
  try {
    assert.equal((await createContact({ CLICKUP_TOKEN: "tok" }, SUBMISSION)).ok, false);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
