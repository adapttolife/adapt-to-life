import { recordGift, recoverDonorEmails } from "./givebutter_webhook.js";
import { syncDonorRelationships } from "./donor_clickup.js";
import { syncGiftRelationships } from "./gift_clickup.js";

const TRANSACTIONS_API = "https://api.givebutter.com/v1/transactions";
const MAX_STABILIZATION_PASSES = 3;

// The webhook is a latency optimization. This scheduled reconciliation is the
// completion owner: every successful Givebutter transaction at or after ATL's
// explicit activation boundary must exist in donor_gifts, regardless of webhook
// delivery. The transaction id is the idempotency key shared by both paths.
export async function reconcileGivebutterTransactions(env, opts = {}) {
  const out = { ok: false, passes: 0, pages: 0, scanned: 0, eligible: 0, written: 0, error: null };
  if (!env.WAIVERS_DB) { out.error = "no D1 binding"; return out; }
  if (!env.GIVEBUTTER_API_KEY) { out.error = "no GIVEBUTTER_API_KEY"; return out; }
  if (!env.GIVEBUTTER_DONOR_CUTOFF) { out.error = "no GIVEBUTTER_DONOR_CUTOFF"; return out; }

  const cutoff = new Date(env.GIVEBUTTER_DONOR_CUTOFF);
  const before = new Date(opts.before || Date.now());
  if (!Number.isFinite(cutoff.getTime())) { out.error = "invalid GIVEBUTTER_DONOR_CUTOFF"; return out; }
  if (!Number.isFinite(before.getTime())) { out.error = "invalid reconciliation upper bound"; return out; }

  const fetcher = opts.fetch || fetch;
  const providerAfter = new Date(cutoff.getTime() - 1).toISOString();
  const providerBefore = before.toISOString();
  const ensured = new Set();
  let priorSignature = null;

  try {
    for (let pass = 1; pass <= MAX_STABILIZATION_PASSES; pass++) {
      out.passes = pass;
      const ids = await scanStableRange({
        env, fetcher, cutoff, before, providerAfter, providerBefore, ensured, out,
      });
      const signature = [...ids].sort().join("\n");
      if (signature === priorSignature) {
        out.ok = true;
        return out;
      }
      priorSignature = signature;
    }
    out.error = "givebutter collection did not stabilize";
    return out;
  } catch (err) {
    out.error = String(err?.message || err);
    return out;
  }
}

async function scanStableRange({ env, fetcher, cutoff, before, providerAfter, providerBefore, ensured, out }) {
  const ids = new Set();
  for (let page = 1; ; page++) {
    const url = new URL(TRANSACTIONS_API);
    url.searchParams.set("per_page", "100");
    url.searchParams.set("page", String(page));
    url.searchParams.set("transactedAfter", providerAfter);
    url.searchParams.set("transactedBefore", providerBefore);
    url.searchParams.set("sortByDesc", "transacted_at");
    const response = await fetcher(url, {
      headers: {
        Authorization: `Bearer ${env.GIVEBUTTER_API_KEY}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) throw new Error(`givebutter ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body.data)
      || !Number.isInteger(body.meta?.current_page)
      || !Number.isInteger(body.meta?.last_page)
      || body.meta.current_page !== page
      || body.meta.last_page < page) {
      throw new Error("invalid givebutter pagination");
    }
    out.pages++;

    for (const transaction of body.data) {
      out.scanned++;
      if (transaction?.status !== "succeeded") continue;
      const transactedAt = new Date(transaction.transacted_at);
      if (!Number.isFinite(transactedAt.getTime())) throw new Error("invalid transaction timestamp");
      if (transactedAt < cutoff || transactedAt >= before) continue;
      const id = String(transaction.id ?? "").trim();
      if (!id) throw new Error("missing transaction id");
      ids.add(id);
      if (ensured.has(id)) continue;
      out.eligible++;
      const gift = await recordGift(env, transaction);
      ensured.add(id);
      if (gift.inserted) out.written++;
    }

    if (page >= body.meta.last_page) return ids;
  }
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
    ok: reconciliation.ok === true && email.ok === true && donors.ok === true && gifts.ok === true,
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
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
     WHERE qr_sync_state.updated_at IS NULL OR excluded.updated_at >= qr_sync_state.updated_at`
  ).bind("givebutter_donor_journey_last_receipt", JSON.stringify(receipt), receipt.completedAt).run();
  return { ok: true, completedAt: receipt.completedAt };
}

function receiptPayload(result) {
  return {
    version: 1,
    ok: result.ok,
    completedAt: result.completedAt,
    reconciliation: pick(result.reconciliation, ["ok", "passes", "pages", "scanned", "eligible", "written", "error"]),
    email: pick(result.email, ["ok", "scanned", "sent", "queued", "failed", "error"]),
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
