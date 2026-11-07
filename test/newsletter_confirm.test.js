import test from "node:test";
import assert from "node:assert/strict";
import { safeNewsletterSubscribe } from "../src/newsletter.js";

function environment() {
  const writes = [];
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.startsWith("INSERT OR IGNORE")) return { claim_key: "claim" };
              return null;
            },
            async run() {
              writes.push({ sql, values });
              return {};
            },
          };
        },
      };
    },
  };
  return {
    env: {
      AGENT_MAIL_DB: db,
      RESEND_API_KEY: "re_test",
      RESEND_SEGMENT_ID: "segment-test",
    },
    writes,
  };
}

async function withFetch(fetch, callback) {
  const original = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    await callback();
  } finally {
    globalThis.fetch = original;
  }
}

test("adds a new newsletter signup to the configured Resend segment", async () => {
  const { env, writes } = environment();
  const requests = [];
  await withFetch(
    async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({ object: "contact", id: "contact-test" });
    },
    async () => {
      assert.deepEqual(
        await safeNewsletterSubscribe(env, " Person@example.com ", "footer", {
          name: "Taylor",
        }),
        { ok: true, contactId: "contact-test" },
      );
    },
  );
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.resend.com/contacts");
  assert.equal(requests[0].init.headers.Authorization, "Bearer re_test");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    email: "person@example.com",
    first_name: "Taylor",
    unsubscribed: false,
    segments: [{ id: "segment-test" }],
  });
  assert.ok(writes.some(({ sql }) => sql.includes("state='resend-subscribed'")));
});

test("adds an existing Resend contact to the configured segment", async () => {
  const { env } = environment();
  const requests = [];
  await withFetch(
    async (url) => {
      requests.push(String(url));
      return requests.length === 1
        ? new Response("", { status: 409 })
        : Response.json({ id: "segment-test" });
    },
    async () => {
      assert.deepEqual(
        await safeNewsletterSubscribe(env, "person@example.com", "footer"),
        { ok: true, existing: true },
      );
    },
  );
  assert.equal(
    requests[1],
    "https://api.resend.com/contacts/person%40example.com/segments/segment-test",
  );
});

test("requires the Resend API key and segment ID", async () => {
  assert.equal(
    (
      await safeNewsletterSubscribe(
        { AGENT_MAIL_DB: {} },
        "person@example.com",
        "footer",
      )
    ).status,
    503,
  );
});

test("a signup that failed part way is retried, not reported as already on the list", async () => {
  // Nov 7 2026: a claim left at needs-review used to return existing for ever.
  const writes = [];
  let claimTaken = false;
  const db = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.startsWith("INSERT OR IGNORE")) return null; // claim exists
              if (
                sql.includes(
                  "state='creating' WHERE claim_key=? AND state='needs-review'",
                )
              ) {
                claimTaken = true;
                return { claim_key: "claim" };
              }
              return null;
            },
            async run() {
              writes.push({ sql, values });
              return {};
            },
          };
        },
      };
    },
  };
  const env = {
    AGENT_MAIL_DB: db,
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "segment-test",
  };
  let posted = 0;
  await withFetch(
    async () => {
      posted++;
      return Response.json({ object: "contact", id: "contact-retry" });
    },
    async () => {
      assert.deepEqual(
        await safeNewsletterSubscribe(env, "again@example.com", "footer"),
        {
          ok: true,
          contactId: "contact-retry",
        },
      );
    },
  );
  assert.ok(claimTaken, "the needs-review claim was taken back");
  assert.equal(posted, 1, "Resend was asked again");
  assert.ok(writes.some(({ sql }) => sql.includes("state='resend-subscribed'")));
});
