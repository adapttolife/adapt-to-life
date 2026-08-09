import { test } from "node:test";
import assert from "node:assert/strict";
import { giftMarkerId, mergeGiftSnapshot, syncGiftRelationships } from "../src/gift_clickup.js";

const gift = {
  transaction_id: "tx-100",
  donor_key: "jordan@example.com",
  parent_task_id: "donor-parent",
  clickup_task_id: null,
  donor_name: "Jordan Rivers",
  amount: 100,
  campaign_title: "Hustle & Heart Fund",
  transacted_at: "2026-08-08T22:00:00Z",
  recurring: 0,
  communication_opt_in: 1,
  email_status: "sent",
  historical: 0,
  source_watermark: 41,
  allocation_watermark: null,
  allocated_total: 0,
  allocation_count: 0,
  allocation_json: "[]",
};
const marker = `<!-- gift:key:${await giftMarkerId(gift.transaction_id)} -->`;

function setup(rows = [gift], options = {}) {
  const writes = [];
  const calls = [];
  const events = [];
  const queue = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() { return { results: rows }; },
            async run() {
              writes.push({ sql, args });
              events.push({ type: "db", sql, args });
              const changes = options.claimDenied && sql.includes("SET claim_token") ? 0 : 1;
              return { meta: { changes } };
            },
          };
        },
        async all() { return { results: rows }; },
      };
    },
  };
  const clickupFetch = async (url, init = {}) => {
    calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
    events.push({ type: "fetch", url, method: init.method || "GET" });
    const response = queue.shift();
    const status = response?.status || 200;
    const body = response?.body ?? response ?? {};
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return {
    env: {
      WAIVERS_DB: db,
      CLICKUP_TOKEN: "test-token",
      CLICKUP_RELATIONSHIPS_LIST_ID: "relationships-list",
      CLICKUP_FETCH: clickupFetch,
    },
    writes, calls, events, queue,
  };
}

test("one gift becomes one subtask under the donor relationship", async () => {
  const s = setup();
  s.queue.push({ tasks: [], last_page: true });
  s.queue.push({ id: "gift-task-1" });
  const result = await syncGiftRelationships(s.env);

  assert.deepEqual(result, { ok: true, created: 1, updated: 0, failed: 0, skipped: 0 });
  const create = s.calls.find((call) => call.init.method === "POST");
  assert.equal(create.body.parent, "donor-parent");
  assert.deepEqual(create.body.tags, ["type-gift", "stage-follow-up"]);
  assert.match(create.body.name, /^\$100 gift — 2026-08-08$/);
  assert.ok(create.body.markdown_description.includes(marker));
  assert.match(create.body.markdown_description, /Allocation status \| Unallocated/);
  assert.match(create.body.markdown_description, /ATL thank-you \| Sent/);
  assert.match(create.body.markdown_description, /## Stewardship work/);
  assert.ok(s.writes.some((write) => write.args.includes("gift-task-1")));
});

test("repeat giving creates one distinct task per transaction under the same donor", async () => {
  const second = { ...gift, transaction_id: "tx-101", amount: 50, source_watermark: 42 };
  const s = setup([gift, second]);
  s.queue.push({ tasks: [], last_page: true });
  s.queue.push({ id: "gift-task-1" });
  s.queue.push({ id: "gift-task-2" });

  const result = await syncGiftRelationships(s.env);
  const creates = s.calls.filter((call) => call.init.method === "POST");
  assert.equal(result.created, 2);
  assert.equal(creates.length, 2);
  assert.deepEqual(creates.map((call) => call.body.parent), ["donor-parent", "donor-parent"]);
  assert.notEqual(
    creates[0].body.markdown_description.match(/<!-- gift:key:([^ ]+)/)[1],
    creates[1].body.markdown_description.match(/<!-- gift:key:([^ ]+)/)[1]
  );
  const firstCreate = s.events.findIndex((event) => event.type === "fetch" && event.method === "POST");
  const secondClaim = s.events.findIndex((event) => event.type === "db"
    && event.sql.includes("INSERT INTO donor_gift_clickup_projection") && event.args[0] === "tx-101");
  assert.ok(secondClaim > firstCreate, "the second gift must not be leased while the first is still queued");
});

test("existing gift updates only its machine block and keeps stewardship state", async () => {
  const existing = { ...gift, clickup_task_id: "gift-task-7" };
  const s = setup([existing]);
  const old = `Human before.\n<!-- gift:begin -->\nold\n<!-- gift:end -->\nHuman after.`;
  s.queue.push({ id: "gift-task-7", description: old, parent: "donor-parent", tags: [{ name: "stage-active" }], due_date: "1780000000000" });
  s.queue.push({ id: "gift-task-7" });

  const result = await syncGiftRelationships(s.env);
  const update = s.calls.at(-1);
  assert.equal(result.updated, 1);
  assert.equal(update.init.method, "PUT");
  assert.equal(update.body.tags, undefined);
  assert.equal(update.body.due_date, undefined);
  assert.equal(s.calls[1].body.parent, "donor-parent");
  assert.match(update.body.markdown_description, /Human before\./);
  assert.match(update.body.markdown_description, /Human after\.$/);
  assert.doesNotMatch(update.body.markdown_description, /old/);
});

test("partial allocation is evidence-backed and shows the remaining amount", async () => {
  const allocated = {
    ...gift,
    allocated_total: 60,
    allocation_count: 1,
    allocation_watermark: 9,
    allocation_json: JSON.stringify([{ source: "QuickBooks", id: "expense-7", url: "https://example.org/evidence", amount: 60, note: "Travel support" }]),
  };
  const merged = await mergeGiftSnapshot("Human note.", allocated);
  assert.match(merged, /Allocation status \| Partially allocated/);
  assert.match(merged, /Remaining \| \*\*\$40\*\*/);
  assert.match(merged, /\[QuickBooks: expense-7\]\(https:\/\/example\.org\/evidence\) — \$60/);
  assert.match(merged, /Travel support/);
});

test("adversarial source text cannot break gift blocks or inject Markdown links", async () => {
  const hostile = {
    ...gift,
    donor_name: "Name\n<!-- gift:end --> [link](https://evil.example)",
    campaign_title: "Fund\r\n<!-- gift:begin -->",
    allocated_total: 10,
    allocation_json: JSON.stringify([{
      source: "Bad [source]", id: "id)\n<!-- gift:end -->",
      url: "https://user:password@example.org/evidence\nnext", amount: 10,
      note: "note\n<!-- gift:begin --> [x](https://evil.example)",
    }]),
  };
  const merged = await mergeGiftSnapshot("Human note", hostile);
  assert.equal((merged.match(/<!-- gift:begin -->/g) || []).length, 1);
  assert.equal((merged.match(/<!-- gift:end -->/g) || []).length, 1);
  assert.doesNotMatch(merged, /\]\(https:\/\/evil\.example\)/);
  assert.doesNotMatch(merged, /https:\/\/user:password/);
  assert.ok(merged.includes("&lt;\\!-- gift:end --&gt;"));
  assert.ok(merged.startsWith("Human note"));
});

test("historical gifts are explicit and never claim a retroactive ATL email", async () => {
  const historical = { ...gift, historical: 1, email_status: "historical" };
  const merged = await mergeGiftSnapshot("", historical);
  assert.match(merged, /ATL thank-you \| Historical import — not sent retroactively/);
});

test("discovery adopts an already-created gift task instead of duplicating it", async () => {
  const s = setup();
  const description = `${marker}\nHuman note.`;
  s.queue.push({ tasks: [{ id: "already-created", description }], last_page: true });
  s.queue.push({ id: "already-created", description });
  s.queue.push({ id: "already-created" });

  const result = await syncGiftRelationships(s.env);
  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 0);
});

test("an active lease prevents duplicate gift subtasks", async () => {
  const s = setup([gift], { claimDenied: true });
  const result = await syncGiftRelationships(s.env);
  assert.deepEqual(result, { ok: true, created: 0, updated: 0, failed: 0, skipped: 1 });
  assert.equal(s.calls.length, 0);
});
