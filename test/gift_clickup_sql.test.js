import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { GIFT_PROJECTION_QUERY } from "../src/gift_clickup.js";
import { renderSql } from "../scripts/import-givebutter-donor-baseline.mjs";

const root = new URL("../", import.meta.url);
function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(new URL("schema/donor_gifts.sql", root), "utf8"));
  db.exec(readFileSync(new URL("schema/donor_clickup_projection.sql", root), "utf8"));
  db.exec(readFileSync(new URL("schema/donor_gift_clickup_projection.sql", root), "utf8"));
  db.prepare(`INSERT INTO donor_clickup_projection
    (donor_key, clickup_task_id, created_at, updated_at, last_synced_at)
    VALUES (?, ?, ?, ?, ?)`).run("donor@example.com", "parent-task", "2026-08-09", "2026-08-09", "2026-08-09");
  return db;
}

function insertLiveGift(db, id = "tx-live") {
  db.prepare(`INSERT INTO donor_gifts
    (transaction_id, first_name, last_name, email, amount, donated, campaign_title,
     communication_opt_in, recurring, transacted_at, email_status, created_at, updated_at)
    VALUES (?, 'Live', 'Donor', 'donor@example.com', 100, 100, 'Fund', 1, 0,
      '2026-08-09T00:00:00Z', 'sent', '2026-08-09T00:00:01Z', '2026-08-09T00:00:01Z')`).run(id);
}

test("live gift query yields one child projection under its donor task", () => {
  const db = database();
  insertLiveGift(db);
  const rows = db.prepare(GIFT_PROJECTION_QUERY).all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].transaction_id, "tx-live");
  assert.equal(rows[0].parent_task_id, "parent-task");
  assert.equal(rows[0].amount, 100);
  assert.equal(rows[0].historical, 0);
  assert.equal(rows[0].email_status, "sent");
});

test("no-email live gift still resolves to its contact parent", () => {
  const db = database();
  db.prepare(`INSERT INTO donor_clickup_projection
    (donor_key, clickup_task_id, created_at, updated_at, last_synced_at)
    VALUES ('contact:gb-7', 'contact-parent', '2026-08-09', '2026-08-09', '2026-08-09')`).run();
  db.prepare(`INSERT INTO donor_gifts
    (transaction_id, contact_id, email, amount, donated, communication_opt_in, recurring,
     transacted_at, email_status, created_at, updated_at)
    VALUES ('tx-no-email', 'gb-7', NULL, 40, 40, 0, 0,
      '2026-08-09T00:00:00Z', 'no_email', '2026-08-09T00:00:01Z', '2026-08-09T00:00:01Z')`).run();
  const row = db.prepare(GIFT_PROJECTION_QUERY).get();
  assert.equal(row.transaction_id, "tx-no-email");
  assert.equal(row.donor_key, "contact:gb-7");
  assert.equal(row.parent_task_id, "contact-parent");
  assert.equal(row.email_status, "no_email");
});

test("a later allocation event makes the already-synced gift pending with evidence", () => {
  const db = database();
  insertLiveGift(db);
  const first = db.prepare(GIFT_PROJECTION_QUERY).get();
  db.prepare(`INSERT INTO donor_gift_clickup_projection
    (transaction_id, donor_key, clickup_task_id, parent_task_id, source_watermark,
     last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "tx-live", "donor@example.com", "gift-task", "parent-task", first.source_watermark,
      "2026-08-09T00:05:00Z", "2026-08-09", "2026-08-09"
    );
  assert.equal(db.prepare(GIFT_PROJECTION_QUERY).all().length, 0);

  db.prepare(`INSERT INTO gift_allocation_events
    (transaction_id, expense_source, expense_id, evidence_url, amount, note,
     verified_by, verified_at, created_at)
    VALUES ('tx-live', 'QuickBooks', 'expense-7', 'https://example.org/evidence', 60,
      'Travel support', 'finance@example.org', '2026-08-09T00:06:00Z', '2026-08-09T00:06:00Z')`).run();
  const changed = db.prepare(GIFT_PROJECTION_QUERY).get();
  assert.equal(changed.allocated_total, 60);
  assert.equal(changed.allocation_count, 1);
  assert.ok(changed.allocation_watermark > 0);
  assert.match(changed.allocation_json, /expense-7/);
  assert.throws(() => db.prepare("UPDATE gift_allocation_events SET amount = 10 WHERE id = 1").run(), /append-only/);
  assert.throws(() => db.prepare("DELETE FROM gift_allocation_events WHERE id = 1").run(), /append-only/);

  db.prepare(`UPDATE donor_gift_clickup_projection
    SET allocation_watermark = ?, last_synced_at = '2026-08-09T00:07:00Z'
    WHERE transaction_id = 'tx-live'`).run(changed.allocation_watermark);
  db.prepare(`INSERT INTO gift_allocation_events
    (transaction_id, expense_source, expense_id, evidence_url, amount, note,
     verified_by, verified_at, created_at)
    VALUES ('tx-live', 'QuickBooks', 'expense-7', 'https://example.org/evidence', -60,
      'Reversal', 'finance@example.org', '2026-08-09T00:08:00Z', '2026-08-09T00:08:00Z')`).run();
  const reversed = db.prepare(GIFT_PROJECTION_QUERY).get();
  assert.equal(reversed.allocated_total, 0);
  assert.ok(reversed.allocation_watermark > changed.allocation_watermark);
});

test("email delivery updates advance the source change watermark", () => {
  const db = database();
  insertLiveGift(db);
  const first = db.prepare(GIFT_PROJECTION_QUERY).get();
  db.prepare(`INSERT INTO donor_gift_clickup_projection
    (transaction_id, donor_key, clickup_task_id, parent_task_id, source_watermark,
     last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "tx-live", "donor@example.com", "gift-task", "parent-task", first.source_watermark,
      "2026-08-09T00:05:00Z", "2026-08-09", "2026-08-09"
    );
  assert.equal(db.prepare(GIFT_PROJECTION_QUERY).all().length, 0);

  db.prepare(`UPDATE donor_gifts SET email_status = 'failed', updated_at = '2026-08-09T00:06:00Z'
    WHERE transaction_id = 'tx-live'`).run();
  const changed = db.prepare(GIFT_PROJECTION_QUERY).get();
  assert.equal(changed.email_status, "failed");
  assert.ok(changed.source_watermark > first.source_watermark);
});

test("a recreated donor parent makes its gift pending for reparenting", () => {
  const db = database();
  insertLiveGift(db);
  const first = db.prepare(GIFT_PROJECTION_QUERY).get();
  db.prepare(`INSERT INTO donor_gift_clickup_projection
    (transaction_id, donor_key, clickup_task_id, parent_task_id, source_watermark,
     last_synced_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      "tx-live", "donor@example.com", "gift-task", "old-parent", first.source_watermark,
      "2026-08-09T00:05:00Z", "2026-08-09", "2026-08-09"
    );
  const changed = db.prepare(GIFT_PROJECTION_QUERY).get();
  assert.equal(changed.parent_task_id, "parent-task");
});

test("historical import SQL executes and yields one gift row without donor_gifts email state", () => {
  const db = database();
  const donorRows = [{
    donorKey: "donor@example.com", name: "Historic Donor", email: "donor@example.com",
    giftCount: 1, total: 75, firstGiftAt: "2026-07-01", latestGiftAt: "2026-07-01",
    cutoff: "2026-08-08", recurring: 0, optIn: 0,
  }];
  const gifts = [{
    transactionId: "tx-history", donorKey: "donor@example.com", name: "Historic Donor",
    email: "donor@example.com", amount: 75, campaignId: "fund", campaignTitle: "Fund",
    transactedAt: "2026-07-01", recurring: 0, optIn: 0,
  }];
  db.exec(renderSql(donorRows, "2026-08-09T00:00:00Z", gifts));
  const row = db.prepare(GIFT_PROJECTION_QUERY).get();
  assert.equal(row.transaction_id, "tx-history");
  assert.equal(row.historical, 1);
  assert.equal(row.email_status, "historical");
  assert.equal(row.amount, 75);
});
