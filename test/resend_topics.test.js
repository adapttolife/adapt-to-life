import assert from "node:assert/strict";
import test from "node:test";

import {
  betaTesterTopicGroups,
  ResendTopicsError,
  setContactTopics,
} from "../src/resend_topics.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("beta tester groups include each Resend Topic and its beta tester emails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    if (path === "/topics") {
      return response({
        data: [
          { id: "topic-athletes", name: "Athletes" },
          { id: "topic-coaches", name: "Coaches" },
        ],
      });
    }
    if (path === "/contacts/athlete%40example.test/topics") {
      return response({ data: [{ id: "topic-athletes", subscription: "opt_in" }] });
    }
    if (path === "/contacts/coach%40example.test/topics") {
      return response({ data: [{ id: "topic-coaches", subscription: "opt_in" }] });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  try {
    const result = await betaTesterTopicGroups({ RESEND_API_KEY: "test" }, [
      { email: "athlete@example.test" },
      { email: "coach@example.test" },
    ]);
    assert.deepEqual(result.groups, [
      { id: "topic-athletes", name: "Athletes", emails: ["athlete@example.test"] },
      { id: "topic-coaches", name: "Coaches", emails: ["coach@example.test"] },
    ]);
    assert.deepEqual(result.idsByEmail, {
      "athlete@example.test": ["topic-athletes"],
      "coach@example.test": ["topic-coaches"],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("moving a beta tester updates every affected Resend Topic membership", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, options });
    if (options.method === "PATCH") return response({ data: [] });
    if (path === "/contacts/tester%40example.test/topics") {
      return response({ data: [{ id: "topic-old", subscription: "opt_in" }] });
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  try {
    await setContactTopics({ RESEND_API_KEY: "test" }, "tester@example.test", [
      "topic-new",
    ]);
    const patch = calls.find((call) => call.options.method === "PATCH");
    assert.equal(patch.options.headers["User-Agent"], "Adapt-To-Life-ASNM-Admin/1.0");
    assert.deepEqual(JSON.parse(String(patch.options.body)), [
      { id: "topic-old", subscription: "opt_out" },
      { id: "topic-new", subscription: "opt_in" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a new beta tester is created with their requested Topic memberships", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(String(url)).pathname;
    calls.push({ path, options });
    if (path === "/contacts/tester%40example.test/topics") {
      return response({ error: "Contact not found" }, 404);
    }
    if (path === "/contacts" && options.method === "POST") {
      return response({ id: "contact-1" }, 201);
    }
    throw new Error(`Unexpected request: ${path}`);
  };

  try {
    await setContactTopics({ RESEND_API_KEY: "test" }, "tester@example.test", [
      "topic-athletes",
      "topic-coaches",
    ]);
    const create = calls.find((call) => call.options.method === "POST");
    assert.deepEqual(JSON.parse(String(create.options.body)), {
      email: "tester@example.test",
      unsubscribed: false,
      topics: [
        { id: "topic-athletes", subscription: "opt_in" },
        { id: "topic-coaches", subscription: "opt_in" },
      ],
    });
    assert.equal(calls.filter((call) => call.options.method === "PATCH").length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Topic update errors retain Resend's validation message", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === "PATCH") {
      return response({ message: "Unknown Topic ID." }, 422);
    }
    if (new URL(String(url)).pathname === "/contacts/tester%40example.test/topics") {
      return response({ data: [{ id: "topic-current", subscription: "opt_in" }] });
    }
    throw new Error("Unexpected request");
  };

  try {
    await assert.rejects(
      () => setContactTopics({ RESEND_API_KEY: "test" }, "tester@example.test", []),
      (error) => {
        assert.ok(error instanceof ResendTopicsError);
        assert.equal(error.status, 422);
        assert.match(error.message, /Unknown Topic ID/);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("beta tester groups stay under Resend's rate limit and retry a 429", async () => {
  const originalFetch = globalThis.fetch;
  const testers = Array.from({ length: 28 }, (_, index) => ({
    email: `tester${index}@example.test`,
  }));
  let inFlight = 0;
  let maxInFlight = 0;
  let paced = 0;
  let throttledOnce = false;
  const sleeps = [];
  globalThis.fetch = async (url) => {
    const path = new URL(String(url)).pathname;
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setImmediate(resolve));
    inFlight -= 1;
    if (path === "/topics") {
      return response({ data: [{ id: "topic-one", name: "Group 1" }] });
    }
    if (path === "/contacts/tester5%40example.test/topics" && !throttledOnce) {
      throttledOnce = true;
      return new Response(JSON.stringify({ message: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "retry-after": "1" },
      });
    }
    if (path === "/contacts/tester3%40example.test/topics") {
      return response({ data: [{ id: "topic-one", subscription: "opt_in" }] });
    }
    return response({ error: "Contact not found" }, 404);
  };

  try {
    const result = await betaTesterTopicGroups({ RESEND_API_KEY: "test" }, testers, {
      pace: async () => {
        paced += 1;
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    assert.ok(
      maxInFlight <= 4,
      `at most 4 Resend requests in flight, saw ${maxInFlight}`,
    );
    assert.equal(
      paced,
      1 + testers.length + 1,
      "every request, including the retry, is paced",
    );
    assert.deepEqual(sleeps, [1000], "the 429 waits for Resend's retry-after");
    assert.deepEqual(result.groups, [
      { id: "topic-one", name: "Group 1", emails: ["tester3@example.test"] },
    ]);
    assert.equal(Object.keys(result.idsByEmail).length, testers.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a persistent 429 still surfaces after bounded retries", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const sleeps = [];
  globalThis.fetch = async (url) => {
    calls += 1;
    if (new URL(String(url)).pathname === "/topics") {
      return response({ data: [{ id: "topic-one", name: "Group 1" }] });
    }
    return new Response(JSON.stringify({ message: "Too many requests" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await assert.rejects(
      () =>
        betaTesterTopicGroups(
          { RESEND_API_KEY: "test" },
          [{ email: "tester@example.test" }],
          {
            pace: async () => {},
            sleep: async (ms) => {
              sleeps.push(ms);
            },
          },
        ),
      (error) => {
        assert.ok(error instanceof ResendTopicsError);
        assert.equal(error.status, 429);
        return true;
      },
    );
    assert.equal(calls, 1 + 4, "one Topics call plus the first try and three retries");
    assert.deepEqual(
      sleeps,
      [500, 1000, 2000],
      "no retry header falls back to backoff",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no Topics means no membership lookups", async () => {
  const originalFetch = globalThis.fetch;
  const paths = [];
  globalThis.fetch = async (url) => {
    paths.push(new URL(String(url)).pathname);
    return response({ data: [] });
  };
  try {
    const result = await betaTesterTopicGroups(
      { RESEND_API_KEY: "test" },
      [{ email: "a@example.test" }, { email: "b@example.test" }],
      { pace: async () => {}, sleep: async () => {} },
    );
    assert.deepEqual(paths, ["/topics"]);
    assert.deepEqual(result.groups, []);
    assert.deepEqual(result.idsByEmail, { "a@example.test": [], "b@example.test": [] });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
