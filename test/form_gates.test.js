// The gates as the Worker applies them, through worker.fetch: a form POST
// without a Turnstile token is refused, and the rate limiter answers 429 on
// every /api form route before any handler runs (honeypot bodies prove that —
// they have no side effects).
import { test } from "node:test";
import assert from "node:assert/strict";

async function worker() {
  return (await import("../src/index.js")).default;
}

const FORM_ROUTES = [
  "/api/contact",
  "/api/apply",
  "/api/shop-contact",
  "/api/volunteer",
  "/api/subscribe",
  "/api/waiver",
];

function post(path, fields, ip = "7.7.7.7") {
  return new Request("https://adapttolife.org" + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "CF-Connecting-IP": ip,
      "X-Shop-Key": "k",
    },
    body: new URLSearchParams(fields),
  });
}

function baseEnv(over = {}) {
  return {
    TURNSTILE_SECRET_KEY: "sek",
    SHOP_CONTACT_KEY: "k",
    FORM_LIMITER: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("asset") },
    ...over,
  };
}

test("contact: no Turnstile token -> 403, nothing downstream is touched", async (t) => {
  const real = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => {
    outbound++;
    return new Response("{}");
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  const w = await worker();
  const res = await w.fetch(
    post("/api/contact", { fn: "A", ln: "B", em: "person@example.com", msg: "hi" }),
    baseEnv(),
    { waitUntil() {} },
  );
  assert.equal(res.status, 403);
  assert.equal(outbound, 0, "no siteverify, no ClickUp, no mail");
});

test("contact: a lane with no secret refuses too (no more fail-open)", async () => {
  const w = await worker();
  const res = await w.fetch(
    post("/api/contact", {
      fn: "A",
      ln: "B",
      em: "person@example.com",
      cf_token: "tok",
    }),
    baseEnv({ TURNSTILE_SECRET_KEY: undefined }),
    { waitUntil() {} },
  );
  assert.equal(res.status, 403);
});

test("rate limit: 429 on every form route, before the handler", async () => {
  const w = await worker();
  let calls = 0;
  const env = baseEnv({
    FORM_LIMITER: {
      limit: async () => {
        calls++;
        return { success: calls <= 1 };
      },
    },
  });
  const honeypot = { em: "bot@example.com", company: "filled" };
  for (const path of FORM_ROUTES) {
    calls = 0;
    const ok = await w.fetch(post(path, honeypot), env, { waitUntil() {} });
    assert.notEqual(ok.status, 429, `${path}: first call passes the limiter`);
    const limited = await w.fetch(post(path, honeypot), env, { waitUntil() {} });
    assert.equal(limited.status, 429, `${path}: second call is refused`);
    assert.match((await limited.json()).error, /Too many submissions/);
  }
});

test("rate limit: GET traffic is never counted", async () => {
  const w = await worker();
  let calls = 0;
  const env = baseEnv({
    FORM_LIMITER: {
      limit: async () => {
        calls++;
        return { success: false };
      },
    },
  });
  const res = await w.fetch(new Request("https://adapttolife.org/api/raised"), env, {
    waitUntil() {},
  });
  assert.notEqual(res.status, 429);
  assert.equal(calls, 0);
});

// A D1 stub that fails the test if anything tries to write.
function untouchableDb() {
  const boom = (what) => () => {
    throw new Error(`form_submissions must not be touched: ${what}`);
  };
  return { prepare: boom("prepare"), batch: boom("batch"), exec: boom("exec") };
}

function applyJson(body) {
  return new Request("https://adapttolife.org/api/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "7.7.7.7" },
    body: JSON.stringify(body),
  });
}

const APPLICANT = { fn: "Test", ln: "Applicant", em: "person@example.com", sport: "Pickleball" };

test("apply: missing or empty token -> 403 and zero D1 writes", async (t) => {
  const real = globalThis.fetch;
  let outbound = 0;
  globalThis.fetch = async () => {
    outbound++;
    return new Response("{}");
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  const w = await worker();
  for (const body of [APPLICANT, { ...APPLICANT, cf_token: "" }]) {
    const res = await w.fetch(
      applyJson(body),
      baseEnv({ WAIVERS_DB: untouchableDb(), INTAKE: untouchableDb() }),
      { waitUntil() {} },
    );
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /Verification failed/);
  }
  assert.equal(outbound, 0, "no siteverify call without a token");
});

test("apply: a token siteverify accepts gets past the gate and is stored", async (t) => {
  const real = globalThis.fetch;
  const verified = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("/turnstile/v0/siteverify")) {
      verified.push(JSON.parse(init.body).response);
      return new Response(JSON.stringify({ success: true, "error-codes": [] }));
    }
    throw new Error("unexpected outbound fetch: " + url);
  };
  t.after(() => {
    globalThis.fetch = real;
  });
  const writes = [];
  let stored = null;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            sql,
            args,
            async first() {
              return stored;
            },
          };
        },
      };
    },
    async batch(stmts) {
      for (const s of stmts) {
        writes.push(s.sql);
        if (/INTO form_submissions/.test(s.sql))
          stored = { kind: s.args[1], payload: s.args[2] };
      }
    },
  };
  const w = await worker();
  const res = await w.fetch(
    applyJson({ ...APPLICANT, cf_token: "good-token" }),
    baseEnv({ WAIVERS_DB: db, INTAKE: {} }),
    { waitUntil() {} }, // dispatch (receipt, intake) is not exercised here
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.deepEqual(verified, ["good-token"]);
  assert.ok(writes.some((sql) => /INTO form_submissions/.test(sql)));
  assert.equal(stored.kind, "apply");
});
