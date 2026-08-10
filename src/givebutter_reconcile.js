import { recordGift, recoverDonorEmails } from "./givebutter_webhook.js";
import { syncDonorRelationships } from "./donor_clickup.js";
import { syncGiftRelationships } from "./gift_clickup.js";

const TRANSACTIONS_API = "https://api.givebutter.com/v1/transactions";
const MAX_PAGES = 20;

// The webhook is a latency optimization. This scheduled reconciliation is the
// completion owner: every successful Givebutter transaction at or after ATL's
// explicit activation boundary must exist in donor_gifts, regardless of webhook
// delivery. The transaction id is the idempotency key shared by both paths.
export async function reconcileGivebutterTransactions(env, opts = {}) {
  const out = { ok: false, pages: 0, scanned: 0, eligible: 0, written: 0, error: null };
  if (!env.WAIVERS_DB) { out.error = "no D1 binding"; return out; }
  if (!env.GIVEBUTTER_API_KEY) { out.error = "no GIVEBUTTER_API_KEY"; return out; }
  if (!env.GIVEBUTTER_DONOR_CUTOFF) { out.error = "no GIVEBUTTER_DONOR_CUTOFF"; return out; }

  const cutoff = new Date(env.GIVEBUTTER_DONOR_CUTOFF);
  if (!Number.isFinite(cutoff.getTime())) { out.error = "invalid GIVEBUTTER_DONOR_CUTOFF"; return out; }
  const fetcher = opts.fetch || fetch;

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(TRANSACTIONS_API);
      url.searchParams.set("per_page", "100");
      url.searchParams.set("page", String(page));
      url.searchParams.set("transactedAfter", cutoff.toISOString());
      url.searchParams.set("sortByDesc", "transacted_at");
      const response = await fetcher(url, {
        headers: {
          Authorization: `Bearer ${env.GIVEBUTTER_API_KEY}`,
          Accept: "application/json",
        },
      });
      if (!response.ok) { out.error = `givebutter ${response.status}`; return out; }
      const body = await response.json();
      if (!Array.isArray(body.data)
        || !Number.isInteger(body.meta?.current_page)
        || !Number.isInteger(body.meta?.last_page)
        || body.meta.current_page !== page
        || body.meta.last_page < page) {
        out.error = "invalid givebutter pagination";
        return out;
      }
      const rows = body.data;
      out.pages = page;

      for (const transaction of rows) {
        out.scanned++;
        if (transaction?.status !== "succeeded") continue;
        const transactedAt = new Date(transaction.transacted_at);
        if (!Number.isFinite(transactedAt.getTime()) || transactedAt < cutoff) continue;
        out.eligible++;
        const gift = await recordGift(env, transaction);
        if (gift.inserted) out.written++;
      }

      const lastPage = Number(body.meta?.last_page || page);
      if (page >= lastPage) {
        out.ok = true;
        return out;
      }
      if (page === MAX_PAGES) {
        out.error = `givebutter pagination exceeds ${MAX_PAGES} pages`;
        return out;
      }
    }
  } catch (err) {
    out.error = String(err?.message || err);
    return out;
  }
  return out;
}

// One scheduled owner sequences discovery before closure. A Givebutter outage is
// preserved as a red receipt, but cannot strand transactions already durable in
// D1: email and projection recovery still run. Gift subtasks remain gated on a
// successful parent-donor projection.
export async function reconcileDonorJourney(env, opts = {}) {
  const reconcile = opts.reconcile || reconcileGivebutterTransactions;
  const recoverEmails = opts.recoverEmails || recoverDonorEmails;
  const syncDonors = opts.syncDonors || syncDonorRelationships;
  const syncGifts = opts.syncGifts || syncGiftRelationships;
  const writeReceipt = opts.writeReceipt || persistDonorJourneyReceipt;

  const reconciliation = await outcome(() => reconcile(env));
  const email = await outcome(() => recoverEmails(env));
  const donors = await outcome(() => syncDonors(env));
  const gifts = donors.ok
    ? await outcome(() => syncGifts(env))
    : { ok: false, skipped: true, error: "donor projection failed" };
  const base = {
    ok: reconciliation.ok === true && email.ok !== false && donors.ok === true && gifts.ok === true,
    completedAt: new Date().toISOString(),
    reconciliation,
    email,
    donors,
    gifts,
  };
  const receipt = await outcome(() => writeReceipt(env, receiptPayload(base)));
  return { ...base, ok: base.ok && receipt.ok === true, receipt };
}

export async function persistDonorJourneyReceipt(env, receipt) {
  if (!env.WAIVERS_DB) return { ok: false, error: "no D1 binding" };
  await env.WAIVERS_DB.prepare(
    `INSERT INTO qr_sync_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind("givebutter_donor_journey_last_receipt", JSON.stringify(receipt), receipt.completedAt).run();
  return { ok: true, completedAt: receipt.completedAt };
}

function receiptPayload(result) {
  return {
    version: 1,
    ok: result.ok,
    completedAt: result.completedAt,
    reconciliation: pick(result.reconciliation, ["ok", "pages", "scanned", "eligible", "written", "error"]),
    email: pick(result.email, ["ok", "scanned", "sent", "error"]),
    donors: pick(result.donors, ["ok", "created", "updated", "failed", "error"]),
    gifts: pick(result.gifts, ["ok", "created", "updated", "failed", "skipped", "error"]),
  };
}

function pick(source, keys) {
  return Object.fromEntries(keys.filter((key) => source?.[key] !== undefined).map((key) => [key, source[key]]));
}

async function outcome(fn) {
  try {
    const result = await fn();
    return result && typeof result === "object" ? result : { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}
