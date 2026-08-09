import { test } from "node:test";
import assert from "node:assert/strict";
import { donorMarkerId, mergeSnapshot, syncDonorRelationships } from "../src/donor_clickup.js";

const donor = {
  donor_key: "jordan@example.com", clickup_task_id: null,
  donor_name: "Jordan Rivers", email: "jordan@example.com",
  gift_count: 2, total_donated: 80, first_gift_at: "2026-07-01T12:00:00Z",
  latest_gift_at: "2026-08-08T22:00:00Z", recurring: 1,
  communication_opt_in: 1,
  source_watermark: 41,
  last_synced_at: null,
};
const marker = `<!-- donor:key:${await donorMarkerId(donor.donor_key)} -->`;
const markerCount = (text) => text.split(marker).length - 1;

function setup(rows = [donor], options = {}) {
  const writes = [];
  const calls = [];
  const queue = [];
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async all() { return { results: rows }; },
            async run() {
              writes.push({ sql, args });
              if (options.failureLedgerThrows && sql.includes("SET sync_error")) {
                throw new Error("D1 failure ledger unavailable");
              }
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
    const response = queue.shift();
    if (response instanceof Error) throw response;
    const status = response?.status || 200;
    const body = response?.body ?? response ?? {};
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  return {
    env: {
      WAIVERS_DB: db, CLICKUP_TOKEN: "test-token",
      CLICKUP_RELATIONSHIPS_LIST_ID: "list-relationships", CLICKUP_FETCH: clickupFetch,
    },
    calls, writes, queue,
  };
}

test("a new donor becomes one relationship task with an automation snapshot", async () => {
  const s = setup();
  s.queue.push({ tasks: [], last_page: true });
  s.queue.push({ id: "task-1", url: "https://app.clickup.com/t/task-1" });
  const result = await syncDonorRelationships(s.env);

  assert.deepEqual(result, { ok: true, created: 1, updated: 0, failed: 0, skipped: 0 });
  assert.equal(s.calls.length, 2);
  assert.match(s.calls[0].url, /list\/list-relationships\/task\?.*include_closed=true/);
  assert.match(s.calls[0].url, /include_markdown_description=true/);
  assert.match(s.calls[1].url, /list\/list-relationships\/task$/);
  assert.equal(s.calls[1].init.method, "POST");
  assert.equal(s.calls[1].body.name, "Jordan Rivers — donor");
  assert.deepEqual(s.calls[1].body.tags, ["type-donor", "stage-new"]);
  assert.match(s.calls[1].body.markdown_description, /Gift count \| \*\*2\*\*/);
  assert.match(s.calls[1].body.markdown_description, /Lifetime gifts \| \*\*\$80\*\*/);
  assert.match(s.calls[1].body.markdown_description, /Communication opt-in \| Yes/);
  assert.match(s.calls[1].body.markdown_description, /## Relationship work/);
  assert.ok(s.calls[1].body.markdown_description.includes(`<!-- donor:begin -->\n${marker}`));
  assert.ok(s.writes.some((write) => write.args.includes("task-1")), "projection stores the ClickUp task id");
  assert.ok(s.writes.some((write) => write.args.includes(donor.source_watermark)), "commit stores the rendered source watermark");
});

test("an existing donor snapshot updates without touching human notes, tags, owner, or due date", async () => {
  const existing = { ...donor, clickup_task_id: "task-7" };
  const s = setup([existing]);
  const old = `Human note before.\n\n<!-- donor:begin -->\nold machine block\n<!-- donor:end -->\n\nHuman note after.`;
  s.queue.push({ id: "task-7", description: old, tags: [{ name: "stage-stewardship" }], assignees: [{ id: 42 }], due_date: "1780000000000" });
  s.queue.push({ id: "task-7" });

  const result = await syncDonorRelationships(s.env);
  assert.equal(result.updated, 1);
  assert.equal(s.calls.length, 2);
  assert.equal(s.calls[0].init.method, "GET");
  assert.match(s.calls[0].url, /include_markdown_description=true/);
  assert.equal(s.calls[1].init.method, "PUT");
  assert.equal(s.calls[1].body.tags, undefined);
  assert.equal(s.calls[1].body.assignees, undefined);
  assert.equal(s.calls[1].body.due_date, undefined);
  assert.match(s.calls[1].body.markdown_description, /Human note before\./);
  assert.match(s.calls[1].body.markdown_description, /Human note after\.$/);
  assert.doesNotMatch(s.calls[1].body.markdown_description, /old machine block/);
});

test("task discovery closes the ClickUp-created/D1-write-failed duplicate gap", async () => {
  const s = setup();
  const description = `${marker}\nHuman stewardship note.`;
  s.queue.push({ tasks: [{ id: "already-created", description }], last_page: true });
  s.queue.push({ id: "already-created", description });
  s.queue.push({ id: "already-created" });

  const result = await syncDonorRelationships(s.env);
  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 0);
  assert.ok(s.writes.some((write) => write.args.includes("already-created")));
});

test("legacy raw-email discovery resolves to the hashed donor without duplication", async () => {
  const s = setup();
  const description = "<!-- donor:key:jordan@example.com -->\nHuman stewardship note.";
  s.queue.push({ tasks: [{ id: "legacy-created", description }], last_page: true });
  s.queue.push({ id: "legacy-created", description });
  s.queue.push({ id: "legacy-created" });

  const result = await syncDonorRelationships(s.env);
  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 0);
  assert.ok(s.writes.some((write) => write.args.includes("legacy-created")));
});

test("a ClickUp outage is recorded and remains retryable", async () => {
  const s = setup();
  s.queue.push({ tasks: [], last_page: true });
  s.queue.push({ status: 503, body: { err: "unavailable" } });
  const first = await syncDonorRelationships(s.env);
  assert.equal(first.failed, 1);
  assert.equal(first.ok, false);
  assert.ok(s.writes.some((write) => write.args.some((arg) => String(arg).includes("503"))));

  s.queue.push({ tasks: [], last_page: true });
  s.queue.push({ id: "task-retry", url: "https://app.clickup.com/t/task-retry" });
  const second = await syncDonorRelationships(s.env);
  assert.equal(second.created, 1);
  assert.equal(second.failed, 0);
});

test("a deleted stored task is rediscovered or recreated instead of failing forever", async () => {
  const s = setup([{ ...donor, clickup_task_id: "deleted-task" }]);
  s.queue.push({ status: 404, body: { err: "Task not found" } });
  s.queue.push({ tasks: [], last_page: true });
  s.queue.push({ id: "replacement-task" });

  const result = await syncDonorRelationships(s.env);
  assert.deepEqual(result, { ok: true, created: 1, updated: 0, failed: 0, skipped: 0 });
  assert.ok(s.writes.some((write) => write.args.includes("replacement-task")));
});

test("a deleted stored id adopts a rediscovered hashed task instead of duplicating", async () => {
  const s = setup([{ ...donor, clickup_task_id: "deleted-task" }]);
  const description = `${marker}\nHuman stewardship note.`;
  s.queue.push({ status: 404, body: { err: "Task not found" } });
  s.queue.push({ tasks: [{ id: "rediscovered-task", description }], last_page: true });
  s.queue.push({ id: "rediscovered-task" });

  const result = await syncDonorRelationships(s.env);
  assert.equal(result.created, 0);
  assert.equal(result.updated, 1);
  assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 0);
  assert.ok(s.writes.some((write) => write.args.includes("rediscovered-task")));
});

test("an active D1 lease prevents overlapping cron runs from creating duplicates", async () => {
  const s = setup([donor], { claimDenied: true });
  const result = await syncDonorRelationships(s.env);

  assert.deepEqual(result, { ok: true, created: 0, updated: 0, failed: 0, skipped: 1 });
  assert.equal(s.calls.length, 0);
});

test("a failed error-ledger write does not prevent the next donor from syncing", async () => {
  const second = { ...donor, donor_key: "casey@example.com", email: "casey@example.com", donor_name: "Casey" };
  const s = setup([donor, second], { failureLedgerThrows: true });
  s.queue.push({ tasks: [], last_page: true });
  s.queue.push({ status: 503, body: { err: "unavailable" } });
  s.queue.push({ id: "casey-task" });

  const result = await syncDonorRelationships(s.env);
  assert.equal(result.failed, 1);
  assert.equal(result.created, 1);
  assert.equal(s.calls.filter((call) => call.init.method === "POST").length, 2);
});

test("missing bindings fail loud without making network calls", async () => {
  const s = setup();
  delete s.env.CLICKUP_TOKEN;
  const result = await syncDonorRelationships(s.env);
  assert.equal(result.ok, false);
  assert.match(result.error, /CLICKUP_TOKEN/);
  assert.equal(s.calls.length, 0);
});

test("legacy raw-email marker migrates into the hashed block exactly once", async () => {
  const existing = `<!-- donor:key:jordan@example.com -->\nHuman before.\n<!-- donor:begin -->\nold\n<!-- donor:end -->\nHuman after.`;
  const merged = await mergeSnapshot(existing, donor);
  assert.equal(markerCount(merged), 1);
  assert.equal(merged.includes("<!-- donor:key:jordan@example.com -->"), false);
  assert.match(merged, /Human before\./);
  assert.match(merged, /Human after\.$/);
  assert.ok(merged.includes(`<!-- donor:begin -->\n${marker}`));
});

test("the uniquely marked block is replaced while another valid block is preserved", async () => {
  const other = `<!-- donor:begin -->\nother machine block\n<!-- donor:end -->`;
  const ours = `<!-- donor:begin -->\n${marker}\nold donor block\n<!-- donor:end -->`;
  const merged = await mergeSnapshot(`${other}\nHuman middle.\n${ours}`, donor);
  assert.match(merged, /other machine block/);
  assert.match(merged, /Human middle\./);
  assert.doesNotMatch(merged, /old donor block/);
  assert.equal(markerCount(merged), 1);
});

test("malformed delimiters preserve content and append one safe block", async () => {
  const malformed = `Human note.\n${marker}\n<!-- donor:begin -->\nbroken  \n`;
  const merged = await mergeSnapshot(malformed, donor);
  assert.ok(merged.startsWith("Human note.\n\n<!-- donor:begin -->\nbroken  \n\n\n"));
  assert.equal(markerCount(merged), 1);
  assert.ok(merged.includes(`<!-- donor:begin -->\n${marker}`));
});

test("donor marker id is stable normalized SHA-256", async () => {
  assert.equal(await donorMarkerId(" Jordan@Example.com "), await donorMarkerId("jordan@example.com"));
  assert.equal(await donorMarkerId("hello"), "2cf24dba5fb0a30e26e83b2ac5b9e29e");
  assert.match(await donorMarkerId(donor.donor_key), /^[0-9a-f]{32}$/);
  assert.equal(marker.includes("@"), false);
});
