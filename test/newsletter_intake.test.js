// Every newsletter signup reaches the CRM through an intake row (2026-11-07).
// Resend holds the list, so a signup whose intake row is never written is on
// the list but invisible to the CRM, and the sweep cron cannot recover a row
// that does not exist. The row is written before the response, and a failure
// is logged by name instead of vanishing inside waitUntil.
import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function signupDb() {
  const claims = new Set();
  return {
    prepare(sql) {
      return {
        bind: (...values) => ({
          async first() {
            if (sql.startsWith("INSERT OR IGNORE INTO newsletter_delivery_claims")) {
              if (claims.has(values[0])) return null;
              claims.add(values[0]);
              return { claim_key: values[0] };
            }
            return null;
          },
          async run() { return {}; },
          async all() { return { results: [] }; },
        }),
      };
    },
  };
}

function intakeDb({ fail = false } = {}) {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return { sql, bind: (...values) => ({ sql, values, async first() { return null; }, async run() { return {}; } }) };
    },
    async batch(statements) {
      // A real D1 write takes time. Without this delay a deferred write would
      // also finish before the response, and the test could not tell them apart.
      await new Promise((resolve) => setTimeout(resolve, 25));
      if (fail) throw new Error("D1_ERROR: database is locked");
      for (const s of statements) if (/INSERT INTO intake\s*\(/.test(s.sql)) rows.push(s.values);
      return [];
    },
  };
}

function env(INTAKE) {
  return {
    AGENT_MAIL_DB: signupDb(),
    INTAKE,
    RESEND_API_KEY: "re_test",
    RESEND_SEGMENT_ID: "seg",
    TURNSTILE_MODE: "off",
    WELCOME_SERIES: "off",
    FORM_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("asset") },
  };
}

async function signup(e, ctx, email = "new@example.com") {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url) === "https://api.resend.com/contacts") return Response.json({ object: "contact", id: "c-new" });
    return new Response("{}", { status: 200 });
  };
  try {
    return await worker.fetch(
      new Request("https://adapttolife.org/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "9.9.9.9" },
        body: JSON.stringify({ em: email, source: "footer" }),
      }),
      e,
      ctx,
    );
  } finally {
    globalThis.fetch = original;
  }
}

test("a newsletter signup writes its intake row before the response, without waiting on waitUntil", async () => {
  const INTAKE = intakeDb();
  const deferred = [];
  const response = await signup(env(INTAKE), { waitUntil: (p) => deferred.push(p) });
  assert.equal(response.status, 200);
  // Nothing deferred has run yet, and the row is already there.
  assert.equal(INTAKE.rows.length, 1, "intake row written on the response path");
  const [, , site, kind, , email, , , , source] = INTAKE.rows[0];
  assert.deepEqual({ site, kind, email, source }, { site: "adapttolife.org", kind: "newsletter", email: "new@example.com", source: "footer" });
  await Promise.allSettled(deferred);
});

test("a failed intake write is logged by name and does not fail the signup", async () => {
  const INTAKE = intakeDb({ fail: true });
  const logged = [];
  const original = console.error;
  console.error = (...args) => logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  try {
    const response = await signup(env(INTAKE), { waitUntil() {} });
    assert.equal(response.status, 200, "the person is on the Resend list; their signup still succeeds");
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    console.error = original;
  }
  assert.ok(
    logged.some((line) => line.includes("intake row was NOT recorded")),
    `expected a named failure, got: ${logged.join(" | ")}`,
  );
});
