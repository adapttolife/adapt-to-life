// Staging is a version of the production Worker and shares the production
// donor database and Worker secrets. These pin the two boundaries that keep a
// staging preview from touching donors or sending mail of its own.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import worker from "../src/staging.js";
import { mailConfigured, sendMail } from "../src/mail-transport.js";

function parseJsonc(text) {
  let out = "";
  let inString = false,
    inLine = false,
    inBlock = false,
    escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i],
      next = text[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && next === "/") {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === "/" && next === "/") {
      inLine = true;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlock = true;
      i += 1;
      continue;
    }
    if (c === '"') inString = true;
    out += c;
  }
  return JSON.parse(out);
}
const atl = parseJsonc(
  readFileSync(fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)), "utf8"),
);
const staging = atl.env.staging;

// Worker secrets are shared by every version, so staging sees the same mail
// credentials as production. Model that with placeholder values.
const SHARED_SECRETS = {
  GMAIL_CLIENT_ID: "test-client",
  GMAIL_CLIENT_SECRET: "test-secret",
  GMAIL_REFRESH_TOKEN: "test-refresh",
  RESEND_API_KEY: "test-resend",
  GIVEBUTTER_WEBHOOK_SECRET: "test-webhook-secret",
};

function recordingDb(calls) {
  const stmt = (sql) => ({
    bind: (...args) => ({
      run: async () => {
        calls.push(sql);
        return { meta: { changes: 1 } };
      },
      first: async () => {
        calls.push(sql);
        return null;
      },
      all: async () => {
        calls.push(sql);
        return { results: [] };
      },
    }),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (stmts) => {
      calls.push(`batch(${stmts.length})`);
      return stmts.map(() => ({ meta: { changes: 1 } }));
    },
  };
}

test("staging returns 404 for the Givebutter webhook and never touches the donor database", async () => {
  const dbCalls = [];
  const mailCalls = [];
  const env = {
    ...staging.vars,
    ...SHARED_SECRETS,
    WAIVERS_DB: recordingDb(dbCalls),
    SEND_EMAIL: {
      send: async (m) => {
        mailCalls.push(m);
        return {};
      },
    },
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const body = JSON.stringify({
    event: "transaction.succeeded",
    data: {
      id: "tx-staging-test",
      status: "succeeded",
      transacted_at: "2099-01-01T00:00:00Z",
      email: "donor@example.test",
      amount: 5,
    },
  });
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  for (const path of ["/api/givebutter-webhook", "/api/givebutter-webhook/"]) {
    const response = await worker.fetch(
      new Request("https://staging.example" + path, {
        method: "POST",
        headers: {
          Signature: SHARED_SECRETS.GIVEBUTTER_WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body,
      }),
      env,
      ctx,
    );
    assert.equal(response.status, 404, path);
  }
  await Promise.allSettled(waits);
  assert.deepEqual(dbCalls, []);
  assert.deepEqual(mailCalls, []);
});

test("staging supports the passwordless admin mail transport", async () => {
  assert.equal(staging.vars.MAIL_TRANSPORT, "resend");
  assert.deepEqual(staging.send_email, [{ name: "SEND_EMAIL" }]);
  assert.equal(atl.vars.MAIL_TRANSPORT, "resend");
  assert.equal(staging.vars.MAIL_FROM_DOMAINS, atl.vars.MAIL_FROM_DOMAINS);
});

test("staging mail uses the configured Resend transport", async () => {
  const env = { ...staging.vars, ...SHARED_SECRETS };
  assert.equal(mailConfigured(env), true);
});

test("staging mails only the team allow list; production has none", async () => {
  assert.equal(staging.vars.ENV_NAME, "staging");
  assert.equal(atl.vars.ENV_NAME, "production");
  assert.equal(atl.vars.MAIL_ALLOW, undefined);
  const allow = staging.vars.MAIL_ALLOW.split(",");
  for (const entry of [
    "hello@adapttolife.org",
    "@adapttolife.org",
    "@adaptivesportsnearme.com",
    "@faisaln.com",
    "alec@alecability.com",
  ])
    assert.ok(allow.includes(entry), entry);
  // Every admin sign-in domain is on the list, so staging admin links still go.
  const calls = [];
  const old = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push([String(url), init]);
    return Response.json({ id: "staging-accepted" });
  };
  try {
    const env = { ...staging.vars, ...SHARED_SECRETS };
    const base = {
      from: "Adapt To Life <hello@mail.adapttolife.org>",
      subject: "s",
      text: "t",
      idempotencyKey: "k-1",
      tags: { brand: "adapttolife", kind: "test" },
    };
    const dropped = await sendMail(env, { ...base, to: "applicant@example.com" });
    assert.equal(dropped.dropped, true);
    assert.equal(dropped.reason, "not-allowed");
    assert.equal(calls.length, 0, "a non-team address never reaches Resend");
    const ok = await sendMail(env, { ...base, to: "someone@faisaln.com" });
    assert.equal(ok.id, "staging-accepted");
    const tags = JSON.parse(calls[0][1].body).tags;
    assert.deepEqual(
      tags.find((t) => t.name === "env"),
      { name: "env", value: "staging" },
    );
  } finally {
    globalThis.fetch = old;
  }
});

test("staging receipt preview renders from the capturing stub and never reaches a mail provider", async () => {
  const fetchCalls = [];
  const env = {
    ...staging.vars,
    ...SHARED_SECRETS,
    ASSETS: { fetch: async () => new Response("asset") },
  };
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return new Response("{}", { status: 503 });
  };
  try {
    for (const type of ["apply", "contact", "volunteer"]) {
      const response = await worker.fetch(
        new Request("https://staging.example/preview/receipt?type=" + type),
        env,
        { waitUntil() {} },
      );
      assert.equal(response.status, 200, type);
      assert.match(await response.text(), /Staging preview of the real send/, type);
    }
  } finally {
    globalThis.fetch = old;
  }
  const mailHosts = fetchCalls.filter((u) =>
    /googleapis\.com|gmail|resend\.com/.test(u),
  );
  assert.deepEqual(mailHosts, []);
});

// Routes that reach Resend or another outside system straight from the request.
// Staging must answer 404 before the app runs, so neither the shared databases
// nor any outside service is touched. Bodies are valid for the real handlers, so
// without the staging gate each request gets past validation and reaches its
// database write and outside call. Side effects are asserted before status, so a
// missing gate fails on the database or outside-call check, not only on status.
const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const VALID_BODIES = {
  // handleSubscribe (src/index.js): em, Turnstile token.
  "/api/subscribe": {
    em: "subscriber@example.test",
    source: "staging-test",
    cf_token: "test",
  },
  // handleWaiver (src/waiver.js): name, em, agree, PNG signature data URL, Turnstile token.
  "/api/waiver": {
    org: "atl",
    name: "Test Signer",
    em: "signer@example.test",
    agree: "true",
    signature: PNG_1X1,
    signature_type: "drawn",
    program: "staging-test",
    cf_token: "test",
  },
  // handleUnsubscribe (src/index.js): the one click POST from the mail header.
  "/unsubscribe": { e: "subscriber@example.test" },
  // handleShopContact (src/shop_contact.js): a storefront message.
  "/api/shop-contact": {
    name: "Shop Tester",
    email: "buyer@example.test",
    topic: "Sizing help",
    message: "Which size?",
  },
};

function gatedEnv(dbCalls) {
  return {
    ...staging.vars,
    ...SHARED_SECRETS,
    RESEND_API_KEY: "test-resend-key",
    RESEND_SEGMENT_ID: "test-segment",
    GOOGLE_SA_JSON: "{}",
    WAIVERS_DB: recordingDb(dbCalls),
    AGENT_MAIL_DB: recordingDb(dbCalls),
    INTAKE: recordingDb(dbCalls),
    FORM_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("asset") },
  };
}

async function probe(path, methods, body) {
  const dbCalls = [];
  const fetchCalls = [];
  const statuses = [];
  const env = gatedEnv(dbCalls);
  const waits = [];
  const ctx = { waitUntil: (p) => waits.push(p) };
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    return Response.json({ success: true, data: {} });
  };
  try {
    for (const method of methods) {
      const init = {
        method,
        headers: {
          "Content-Type": "application/json",
          "CF-Connecting-IP": "203.0.113.9",
        },
      };
      if (method === "POST") init.body = JSON.stringify(body);
      const response = await worker.fetch(
        new Request("https://staging.example" + path, init),
        env,
        ctx,
      );
      statuses.push([`${method} ${path}`, response.status]);
    }
    await Promise.allSettled(waits);
  } finally {
    globalThis.fetch = old;
  }
  return { dbCalls, fetchCalls, statuses };
}

for (const route of [
  "/api/subscribe",
  "/api/waiver",
  "/unsubscribe",
  "/api/shop-contact",
]) {
  test(`staging returns 404 for ${route} and never calls an outside service`, async () => {
    const { dbCalls, fetchCalls, statuses } = await probe(
      route,
      ["POST", "GET"],
      VALID_BODIES[route],
    );
    assert.deepEqual(dbCalls, [], "no shared database call");
    assert.deepEqual(
      fetchCalls.filter((u) => u.includes("resend.com")),
      [],
      "no Resend call",
    );
    assert.deepEqual(fetchCalls, [], "no outside call of any kind");
    for (const [label, status] of statuses) assert.equal(status, 404, label);
  });
}

// Regression guard only: at base, /api/subscribe/ never reached the handler
// (src/index.js matches the exact path, so it fell through to static assets).
test("/api/subscribe/ (trailing slash) is 404 on staging with no side effects (never reached the handler at base)", async () => {
  const { dbCalls, fetchCalls, statuses } = await probe(
    "/api/subscribe/",
    ["POST", "GET"],
    VALID_BODIES["/api/subscribe"],
  );
  assert.deepEqual(dbCalls, []);
  assert.deepEqual(fetchCalls, []);
  for (const [label, status] of statuses) assert.equal(status, 404, label);
});

// Regression guard only: /api/waiver/ already returned 404 at base, because
// src/index.js routes it to the download handler with an empty id, which is not
// a UUID. It is not evidence for the staging gate.
test("/api/waiver/ (trailing slash) stays 404 on staging (already 404 at base)", async () => {
  const { dbCalls, fetchCalls, statuses } = await probe(
    "/api/waiver/",
    ["POST", "GET"],
    VALID_BODIES["/api/waiver"],
  );
  assert.deepEqual(fetchCalls, []);
  assert.equal(dbCalls.filter((c) => /INSERT|UPDATE|batch/i.test(c)).length, 0);
  for (const [label, status] of statuses) assert.equal(status, 404, label);
});
