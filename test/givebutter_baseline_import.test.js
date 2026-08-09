import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBaseline, buildHistoricalGifts, pathIsInside, renderSql, transactionDonorKey } from "../scripts/import-givebutter-donor-baseline.mjs";

const cutoff = "2026-08-08T22:00:00Z";

test("historical baseline is strictly pre-webhook and uses latest consent", () => {
  const rows = buildBaseline([
    { id: "1", status: "succeeded", email: " Donor@Example.com ", first_name: "First", last_name: "Name", amount: 25, transacted_at: "2026-07-01T12:00:00Z", communication_opt_in: false },
    { id: "2", status: "succeeded", email: "donor@example.com", first_name: "Current", last_name: "Name", amount: 50, transacted_at: "2026-08-01T12:00:00Z", communication_opt_in: true, plan_id: "plan-1" },
    { id: "3", status: "succeeded", email: "donor@example.com", amount: 100, transacted_at: cutoff, communication_opt_in: false },
    { id: "4", status: "failed", email: "other@example.com", amount: 500, transacted_at: "2026-07-01T12:00:00Z" },
  ], cutoff);

  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    donorKey: "donor@example.com", name: "Current Name", email: "donor@example.com",
    giftCount: 2, total: 75, firstGiftAt: "2026-07-01T12:00:00Z",
    latestGiftAt: "2026-08-01T12:00:00Z", cutoff, recurring: 1, optIn: 1,
  });
});

test("historical import preserves one exact projection row per gift", () => {
  const gifts = buildHistoricalGifts([
    { id: "tx-1", status: "succeeded", email: " Donor@Example.com ", first_name: "First", last_name: "Name", amount: 25, campaign: { id: 7, title: "Fund" }, transacted_at: "2026-07-01T12:00:00Z", communication_opt_in: false },
    { id: "tx-2", status: "succeeded", email: "donor@example.com", amount: 50, transacted_at: cutoff },
  ], cutoff);
  assert.deepEqual(gifts, [{
    transactionId: "tx-1", donorKey: "donor@example.com", name: "First Name",
    email: "Donor@Example.com", amount: 25, campaignId: 7, campaignTitle: "Fund",
    transactedAt: "2026-07-01T12:00:00Z", recurring: 0, optIn: 0,
  }]);
});

test("historical donor identity falls back from email to contact to transaction", () => {
  assert.equal(transactionDonorKey({ id: "tx", email: " A@Example.org " }), "a@example.org");
  assert.equal(transactionDonorKey({ id: "tx", contact_id: "gb-7" }), "contact:gb-7");
  assert.equal(transactionDonorKey({ id: "tx" }), "transaction:tx");
  const gifts = buildHistoricalGifts([
    { id: "tx", status: "succeeded", contact_id: "gb-7", amount: 10,
      transacted_at: "2026-07-01T12:00:00Z" },
  ], cutoff);
  assert.equal(gifts[0].donorKey, "contact:gb-7");
  assert.equal(gifts[0].email, null);
  assert.equal(gifts[0].name, "Anonymous donor");
});

test("baseline SQL is idempotent and seeds exact gift projection rows", () => {
  const gifts = [{
    transactionId: "tx-1", donorKey: "o'hara@example.com", name: "O'Hara",
    email: "o'hara@example.com", amount: 10, campaignId: "fund-1", campaignTitle: "Fund",
    transactedAt: "2026-07-01", recurring: 0, optIn: 0,
  }];
  const sql = renderSql([{
    donorKey: "o'hara@example.com", name: "O'Hara", email: "o'hara@example.com",
    giftCount: 1, total: 10, firstGiftAt: "2026-07-01", latestGiftAt: "2026-07-01",
    cutoff, recurring: 0, optIn: 0,
  }], "2026-08-08T23:00:00Z", gifts);

  assert.match(sql, /ON CONFLICT\(donor_key\) DO UPDATE/);
  assert.match(sql, /baseline_cutoff_at/);
  assert.match(sql, /last_synced_at = NULL/);
  assert.match(sql, /o''hara@example\.com/);
  assert.match(sql, /^INSERT INTO donor_clickup_projection/);
  assert.match(sql, /INSERT INTO donor_gift_clickup_projection/);
  assert.match(sql, /ON CONFLICT\(transaction_id\) DO UPDATE/);
  assert.match(sql, /'tx-1'/);
  assert.doesNotMatch(sql, /BEGIN|COMMIT/);
});

test("PII output containment rejects siblings and the root itself", () => {
  assert.equal(pathIsInside("/safe/scratch", "/safe/scratch/baseline.sql"), true);
  assert.equal(pathIsInside("/safe/scratch", "/safe/other/baseline.sql"), false);
  assert.equal(pathIsInside("/safe/scratch", "/safe/scratch"), false);
});
