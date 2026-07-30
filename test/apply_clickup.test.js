// Grant applications moved off Airtable to the ClickUp "Hustle & Heart —
// Applications" list. Two properties are worth pinning, and neither is "we
// called ClickUp":
//
//   1. The amount parser stays conservative. It fills "Amount requested" only
//      when the applicant gave an unambiguous figure. A model year in a free
//      text answer ("racing chair 2024 model") must not become $2,024 sitting in
//      a currency field looking verified.
//   2. A submission cannot be lost to a custom-field id that drifted. If the
//      create is rejected, the retry drops the fields and keeps the task — the
//      description holds the whole application either way.
//
// Standalone `node --test` with a stubbed global fetch — same no-new-deps
// convention as the other tests here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApplication, parseAmount } from "../src/clickup.js";

const ENV = { CLICKUP_TOKEN: "tok", CLICKUP_APPLICATIONS_LIST_ID: "901418622126" };

const SUBMISSION = {
  name: "Dana Reyes",
  email: "dana@example.org",
  phone: "+1 555 010 0199",
  sport: "Wheelchair basketball",
  location: "Cedar Rapids, IA",
  need: "A sport chair for the league starting in September.",
  cost: "$3,000 for a racing chair",
  about: "Playing pickup for two years.",
};

// Records every create body; `fail` decides which attempts get rejected.
function stubFetch(fail = () => false) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes("api.clickup.com")) throw new Error("unexpected fetch to " + url);
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), auth: init.headers.Authorization, body });
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

test("an unambiguous dollar figure fills Amount requested", () => {
  assert.equal(parseAmount("$3,000 for a racing chair"), 3000);
  assert.equal(parseAmount("$450"), 450);
  assert.equal(parseAmount("2500"), 2500);
  assert.equal(parseAmount("1200.50 USD"), 1200.5);
});

test("a figure we would be guessing at is left blank, not guessed", () => {
  // The one that motivated the parser: a model year is not a price.
  assert.equal(parseAmount("racing chair 2024 model, not sure"), null);
  assert.equal(parseAmount("not sure"), null);
  assert.equal(parseAmount("a few thousand"), null);
  assert.equal(parseAmount("3-5k"), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount(undefined), null);
});

test("the submission maps onto the list's fields and lands as Stage: New", async () => {
  const { calls, restore } = stubFetch();
  try {
    const res = await createApplication(ENV, SUBMISSION, 1785000000000);
    assert.equal(res.ok, true);
    assert.equal(res.id, "86bTEST");
    assert.equal(calls.length, 1);

    const { url, auth, body } = calls[0];
    assert.equal(url, "https://api.clickup.com/api/v2/list/901418622126/task");
    // A "Bearer " prefix 401s against ClickUp personal tokens.
    assert.equal(auth, "tok");
    assert.equal(body.name, "Dana Reyes — Wheelchair basketball");

    assert.equal(valueOf(body, "3d3b96cf-da90-47ed-9133-bd8b3a7109e2"), "11dcc191-244b-4263-b664-402efea16c29");
    assert.equal(valueOf(body, "0a372d6b-9f79-4592-89d4-b1763ac6922e"), 1785000000000);
    assert.equal(valueOf(body, "af25d1b1-5ef1-48f7-ad51-870385e3f6ce"), "dana@example.org");
    assert.equal(valueOf(body, "d78bed64-879b-44fc-9ec7-4c98da38ecfa"), "+1 555 010 0199");
    assert.equal(valueOf(body, "41742801-fb26-46d7-af09-100610486045"), "Wheelchair basketball");
    assert.equal(valueOf(body, "11f7f6a9-a906-41f2-b974-c5317158bccb"), "Cedar Rapids, IA");
    assert.equal(valueOf(body, "60405dbb-d6cf-4360-894c-18e2452031a3"), 3000);
  } finally {
    restore();
  }
});

test("every answer the applicant typed survives in the description", async () => {
  const { calls, restore } = stubFetch();
  try {
    await createApplication(ENV, SUBMISSION);
    const md = calls[0].body.markdown_description;
    for (const written of [
      SUBMISSION.email, SUBMISSION.phone, SUBMISSION.sport, SUBMISSION.location,
      SUBMISSION.need, SUBMISSION.cost, SUBMISSION.about,
    ]) {
      assert.ok(md.includes(written), `description dropped: ${written}`);
    }
  } finally {
    restore();
  }
});

test("a drifted field id costs the fields, never the application", async () => {
  // First attempt (with custom_fields) rejected; the bare retry must succeed and
  // must still carry the full description.
  const { calls, restore } = stubFetch((n) => n === 1);
  try {
    const res = await createApplication(ENV, SUBMISSION);
    assert.equal(res.ok, true, "the submission must still be saved");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].body.custom_fields, undefined);
    assert.ok(calls[1].body.markdown_description.includes(SUBMISSION.need));
  } finally {
    restore();
  }
});

test("if ClickUp is down the caller learns it, so the form can say so", async () => {
  const { restore } = stubFetch(() => true);
  try {
    const res = await createApplication(ENV, SUBMISSION);
    assert.equal(res.ok, false);
  } finally {
    restore();
  }
});

test("missing configuration fails loudly rather than silently dropping", async () => {
  const { calls, restore } = stubFetch();
  try {
    assert.equal((await createApplication({ CLICKUP_TOKEN: "tok" }, SUBMISSION)).ok, false);
    assert.equal((await createApplication({ CLICKUP_APPLICATIONS_LIST_ID: "1" }, SUBMISSION)).ok, false);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
