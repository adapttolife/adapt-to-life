import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DONOR_PROJECTION_QUERY } from "../src/donor_clickup.js";
import { renderSql } from "../scripts/import-givebutter-donor-baseline.mjs";

const root = new URL("../", import.meta.url);

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("schema/donor_gifts.sql", root), "utf8"));
  db.exec(readFileSync(new URL("schema/migrations/2026-08-08-donor-clickup-projection.sql", root), "utf8"));
  // The deployable schema and migration must remain byte-compatible/idempotent.
  db.exec(readFileSync(new URL("schema/donor_clickup_projection.sql", root), "utf8"));
  return db;
}

function gift(db, { id, email, contactId = null, amount, transactedAt, createdAt, optIn = 0 }) {
  db.prepare(`INSERT INTO donor_gifts
    (transaction_id, contact_id, email, amount, donated, communication_opt_in, recurring,
     transacted_at, email_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'sent', ?, ?)`)
    .run(id, contactId, email, amount, amount, optIn, transactedAt, createdAt, createdAt);
}

test("no-email gifts group by Givebutter contact, then fall back to transaction", () => {
  const db = database();
  gift(db, { id: "contact-1", contactId: "gb-7", email: null, amount: 10,
    transactedAt: "2026-08-08T20:00:00Z", createdAt: "2026-08-08T20:01:00Z" });
  gift(db, { id: "contact-2", contactId: "gb-7", email: null, amount: 20,
    transactedAt: "2026-08-08T21:00:00Z", createdAt: "2026-08-08T21:01:00Z" });
  gift(db, { id: "anonymous", email: null, amount: 5,
    transactedAt: "2026-08-08T22:00:00Z", createdAt: "2026-08-08T22:01:00Z" });
  const rows = db.prepare(DONOR_PROJECTION_QUERY).all();
  assert.deepEqual(rows.map((row) => [row.donor_key, row.gift_count, row.total_donated]), [
    ["transaction:anonymous", 1, 5],
    ["contact:gb-7", 2, 30],
  ]);
});

test("baseline importer emits one D1-compatible multi-row statement", () => {
  const db = database();
  const row = (key, amount) => ({
    donorKey: key, name: key, email: key, giftCount: 1, total: amount,
    firstGiftAt: "2026-08-01T00:00:00Z", latestGiftAt: "2026-08-01T00:00:00Z",
    cutoff: "2026-08-08T22:00:00Z", recurring: 0, optIn: 0,
  });
  const sql = renderSql([row("one@example.org", 10), row("two@example.org", 20)]);
  assert.doesNotMatch(sql, /BEGIN|COMMIT/);
  assert.equal((sql.match(/INSERT INTO/g) || []).length, 1);
  db.exec(sql);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM donor_clickup_projection").get().count, 2);
});

test("a gift inserted after snapshot read remains pending after the older watermark commits", () => {
  const db = database();
  gift(db, {
    id: "z-larger-id", email: "donor@example.org", amount: 10,
    transactedAt: "2026-08-08T20:00:00.000Z", createdAt: "2026-08-08T20:01:00.000Z",
  });
  const rendered = db.prepare(DONOR_PROJECTION_QUERY).all()[0];
  assert.equal(rendered.gift_count, 1);
  assert.equal(rendered.source_watermark, 1);

  // This arrives after the projector read but before the ClickUp commit.
  gift(db, {
    id: "a-smaller-id", email: "donor@example.org", amount: 20,
    transactedAt: "2026-08-08T20:02:00.000Z", createdAt: "2026-08-08T20:03:00.000Z",
  });
  db.prepare(`INSERT INTO donor_clickup_projection
    (donor_key, clickup_task_id, source_watermark, last_synced_at, created_at, updated_at)
    VALUES (?, 'task-1', ?, '2026-08-08T20:05:00.000Z', '2026-08-08T20:01:00.000Z', '2026-08-08T20:05:00.000Z')`)
    .run("donor@example.org", rendered.source_watermark);

  const pending = db.prepare(DONOR_PROJECTION_QUERY).all();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].gift_count, 2);
  assert.equal(pending[0].total_donated, 30);
  assert.equal(pending[0].source_watermark, 2);
});

test("a delayed concurrent gift with an older timestamp and smaller id remains pending", () => {
  const db = database();
  gift(db, {
    id: "z", email: "delayed@example.org", amount: 10,
    transactedAt: "2026-08-08T20:00:00.000Z", createdAt: "2026-08-08T20:01:00.000Z",
  });
  const rendered = db.prepare(DONOR_PROJECTION_QUERY).all()[0];
  gift(db, {
    id: "a", email: "delayed@example.org", amount: 20,
    transactedAt: "2026-08-08T19:00:00.000Z", createdAt: "2026-08-08T19:01:00.000Z",
  });
  db.prepare(`INSERT INTO donor_clickup_projection
    (donor_key, clickup_task_id, source_watermark, last_synced_at, created_at, updated_at)
    VALUES (?, 'task-2', ?, '2026-08-08T20:05:00.000Z', '2026-08-08T20:01:00.000Z', '2026-08-08T20:05:00.000Z')`)
    .run("delayed@example.org", rendered.source_watermark);

  const pending = db.prepare(DONOR_PROJECTION_QUERY).all();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].gift_count, 2);
  assert.equal(pending[0].total_donated, 30);
  assert.equal(pending[0].source_watermark, 2);
});

test("baseline cutoff excludes pre-webhook rows and includes the exact boundary", () => {
  const db = database();
  db.prepare(`INSERT INTO donor_clickup_projection
    (donor_key, baseline_email, baseline_gift_count, baseline_total,
     baseline_first_gift_at, baseline_latest_gift_at, baseline_cutoff_at,
     created_at, updated_at)
    VALUES (?, ?, 1, 5, ?, ?, ?, ?, ?)`)
    .run(
      "baseline@example.org", "baseline@example.org",
      "2026-08-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z",
      "2026-08-08T22:00:00.000Z", "2026-08-08T22:00:00.000Z", "2026-08-08T22:00:00.000Z",
    );
  gift(db, {
    id: "old", email: "baseline@example.org", amount: 5,
    transactedAt: "2026-08-08T21:59:59.999Z", createdAt: "2026-08-08T22:01:00.000Z",
  });
  gift(db, {
    id: "boundary", email: "baseline@example.org", amount: 7,
    transactedAt: "2026-08-08T22:00:00.000Z", createdAt: "2026-08-08T22:02:00.000Z",
  });
  const row = db.prepare(DONOR_PROJECTION_QUERY).all()[0];
  assert.equal(row.gift_count, 2);
  assert.equal(row.total_donated, 12);
});

test("a synced baseline donor becomes pending on their first live gift", () => {
  const db = database();
  db.prepare(`INSERT INTO donor_clickup_projection
    (donor_key, clickup_task_id, baseline_email, baseline_gift_count,
     baseline_total, baseline_cutoff_at, source_watermark, last_synced_at,
     created_at, updated_at)
    VALUES (?, 'baseline-task', ?, 1, 10, ?, NULL, ?, ?, ?)`)
    .run(
      "first-live@example.org", "first-live@example.org",
      "2026-08-08T22:00:00.000Z", "2026-08-08T23:00:00.000Z",
      "2026-08-08T22:00:00.000Z", "2026-08-08T23:00:00.000Z",
    );
  gift(db, {
    id: "first-live", email: "first-live@example.org", amount: 15,
    transactedAt: "2026-08-08T22:01:00.000Z", createdAt: "2026-08-08T22:02:00.000Z",
  });

  const pending = db.prepare(DONOR_PROJECTION_QUERY).all();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].gift_count, 2);
  assert.equal(pending[0].total_donated, 25);
  assert.equal(pending[0].source_watermark, 1);
});
