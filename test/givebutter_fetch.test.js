// Givebutter answers 429 when the cron jobs page /v1/transactions too fast
// (Cloudflare issues 46d3cf81 and 33a7c440). The shared helper retries a 429,
// honoring Retry-After, and leaves every other response to the caller.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import {
  givebutterFetch,
  retryDelay,
  GivebutterHttpError,
  MAX_ATTEMPTS,
  MAX_WAIT_MS,
} from "../src/givebutter_fetch.js";
import { reconcileGivebutterTransactions } from "../src/givebutter_reconcile.js";
import { syncGifts } from "../src/qr_gifts.js";

const URL_ = "https://api.givebutter.com/v1/transactions?page=1";

function scripted(responses) {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init });
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra fetch");
    return next();
  };
  return { fetcher, calls };
}

const ok = () => new Response(JSON.stringify({ data: [] }), { status: 200 });
const limited = (headers = {}) => new Response("slow down", { status: 429, headers });

test("a 429 is retried and the later success is returned", async () => {
  const { fetcher, calls } = scripted([limited, limited, ok]);
  const waits = [];
  const res = await givebutterFetch(
    URL_,
    { headers: { Authorization: "Bearer k" } },
    { fetch: fetcher, sleep: async (ms) => waits.push(ms), random: () => 0 },
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 3);
  assert.equal(
    calls[2].init.headers.Authorization,
    "Bearer k",
    "same request each time",
  );
  assert.deepEqual(waits, [1000, 2000], "exponential backoff without Retry-After");
});

test("Retry-After in seconds is honored, with the real timer", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { fetcher, calls } = scripted([() => limited({ "Retry-After": "3" }), ok]);
  const pending = givebutterFetch(URL_, {}, { fetch: fetcher });
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  t.mock.timers.tick(2999);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1, "still waiting before Retry-After elapses");
  t.mock.timers.tick(1);
  const res = await pending;
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
});

test("Retry-After as an HTTP date, and a cap on long waits", () => {
  const now = () => Date.parse("2026-11-13T01:40:00Z");
  assert.equal(
    retryDelay("Fri, 13 Nov 2026 01:40:04 GMT", 1, () => 0, now),
    4000,
  );
  assert.equal(
    retryDelay("Fri, 13 Nov 2026 01:39:00 GMT", 1, () => 0, now),
    0,
  );
  assert.equal(retryDelay("600", 1), MAX_WAIT_MS, "a 10 minute Retry-After is capped");
  assert.equal(
    retryDelay("garbage", 2, () => 0.5),
    2125,
    "bad header falls back to backoff",
  );
});

test("gives up after three attempts and throws givebutter 429", async () => {
  const { fetcher, calls } = scripted([limited, limited, limited]);
  await assert.rejects(
    givebutterFetch(URL_, {}, { fetch: fetcher, sleep: async () => {} }),
    (err) => err instanceof GivebutterHttpError && err.message === "givebutter 429",
  );
  assert.equal(calls.length, MAX_ATTEMPTS);
  assert.equal(MAX_ATTEMPTS, 3);
});

test("a non-429 error is returned at once, not retried", async () => {
  for (const status of [401, 500, 503]) {
    const { fetcher, calls } = scripted([() => new Response("no", { status })]);
    let slept = false;
    const res = await givebutterFetch(
      URL_,
      {},
      {
        fetch: fetcher,
        sleep: async () => (slept = true),
      },
    );
    assert.equal(res.status, status);
    assert.equal(calls.length, 1);
    assert.equal(slept, false);
  }
});

test("reconciliation retries a 429 and still reports givebutter 429 when it persists", async () => {
  const env = {
    WAIVERS_DB: {
      prepare: () => ({
        bind() {
          return this;
        },
        run: async () => ({}),
      }),
    },
    GIVEBUTTER_API_KEY: "k",
    GIVEBUTTER_DONOR_CUTOFF: "2026-10-01T00:00:00Z",
  };
  const page = () =>
    new Response(JSON.stringify({ data: [], meta: { current_page: 1, last_page: 1 } }));
  const recovered = scripted([limited, page, page]);
  const good = await reconcileGivebutterTransactions(env, {
    fetch: recovered.fetcher,
    sleep: async () => {},
  });
  assert.equal(good.ok, true);
  assert.equal(recovered.calls.length, 3);

  const stuck = scripted([limited, limited, limited]);
  const bad = await reconcileGivebutterTransactions(env, {
    fetch: stuck.fetcher,
    sleep: async () => {},
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "givebutter 429");
});

test("QR gift sync retries a 429 and reports givebutter 429 when it persists", async () => {
  const stmt = {
    bind() {
      return this;
    },
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async () => ({ meta: { changes: 0 } }),
  };
  const env = { WAIVERS_DB: { prepare: () => stmt }, GIVEBUTTER_API_KEY: "k" };
  const recovered = scripted([limited, ok]);
  const good = await syncGifts(env, {
    fetch: recovered.fetcher,
    sleep: async () => {},
  });
  assert.equal(good.ok, true);
  assert.equal(recovered.calls.length, 2);

  const stuck = scripted([limited, limited, limited]);
  const bad = await syncGifts(env, { fetch: stuck.fetcher, sleep: async () => {} });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "givebutter 429");
  assert.equal(stuck.calls.length, 3);
});

test("QR gift sync keeps the watermark when a later page fails", async () => {
  const writes = [];
  const stmt = (sql) => ({
    bind(...args) {
      this.args = args;
      return this;
    },
    first: async () => null,
    all: async () => ({ results: [] }),
    run: async function () {
      if (/qr_sync_state/.test(sql)) writes.push(this.args);
      return { meta: { changes: 0 } };
    },
  });
  const env = { WAIVERS_DB: { prepare: stmt }, GIVEBUTTER_API_KEY: "k" };
  const fullPage = () =>
    new Response(
      JSON.stringify({
        data: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          transacted_at: "2026-11-12T12:00:00Z",
        })),
      }),
    );
  const { fetcher } = scripted([fullPage, limited, limited, limited]);
  const out = await syncGifts(env, { fetch: fetcher, sleep: async () => {} });
  assert.equal(out.error, "givebutter 429");
  assert.equal(writes.length, 0, "no watermark after a partial read");
});
