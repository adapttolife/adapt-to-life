import { syncGifts as defaultSyncGifts } from "./qr_gifts.js";
import { reconcileDonorJourney as defaultReconcile } from "./givebutter_reconcile.js";

// Both jobs page through Givebutter /v1/transactions with the same key. Run in
// parallel they rate limited each other (429) on the Nov 12 2026 cron tick, so
// the scheduled handler runs them one after the other: QR gift sync first, then
// donor journey reconciliation. Each has its own catch, so one failing never
// skips the other.
export async function runGivebutterJobs(env, opts = {}) {
  const syncGifts = opts.syncGifts || defaultSyncGifts;
  const reconcileDonorJourney = opts.reconcileDonorJourney || defaultReconcile;

  try {
    const r = await syncGifts(env);
    if (!r.ok) console.error("qr gift sync failed:", r.error);
    else if (r.written)
      console.log(`qr gift sync: ${r.written} attributed gift(s) recorded`);
  } catch (err) {
    console.error("qr gift sync crashed:", err);
  }

  // The webhook is only the fast path. This single scheduled owner polls every
  // successful post-activation Givebutter transaction into D1 first, then closes
  // thank-you work. A provider failure remains visible as a red receipt but
  // cannot block recovery of work already durable in D1.
  try {
    const r = await reconcileDonorJourney(env);
    if (!r.ok) {
      console.error("donor journey reconciliation failed:", JSON.stringify(r));
    } else if (r.reconciliation.written || r.email.sent) {
      console.log("donor journey reconciled:", JSON.stringify(r));
    }
  } catch (err) {
    console.error("donor journey reconciliation crashed:", err);
  }
}
