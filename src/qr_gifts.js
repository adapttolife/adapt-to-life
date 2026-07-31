// Spec 116 P6 — scan → gift. The point of the whole build.
//
// Every vendor can tell you a code was scanned forty times. None can tell you
// those scans produced $600, because they hand the visitor off at the redirect
// and never see the donation. We own both ends, so this closes the loop:
//
//   /q/chair  →  /send-6?utm_campaign=qr-chair&gba_source=qr-chair
//             →  /donate carrying the same params (public/js/attribution.js)
//             →  Givebutter's widget forwards them into its iframe
//             →  the transaction comes back carrying them
//             →  this file writes the gift into qr_gifts, joined by slug
//
// The widget's forwarding was the one unknown in that chain and is now
// verified: scripts/probe-givebutter-utm.mjs watched the live widget carry
// utm_* and gba_source through, and drop everything outside that allowlist.
//
// Givebutter stays the system of record for money. qr_gifts is a local mirror
// of only the attributed gifts, keyed by Givebutter's own transaction id, so
// the sync is idempotent and re-running it can never double-count.

const API = "https://api.givebutter.com/v1/transactions";
const WATERMARK = "givebutter_synced_through";
// Re-read a day back on every run. A gift can settle, or be refunded, after we
// first saw it, and a sync that only ever looks forward would freeze the first
// version of every record it ever read.
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_PAGES = 10;

// A marker is what the redirect stamped on the URL: qr-<slug>. Givebutter
// returns utm_parameters as an object and attribution_data as an array, and we
// have no live example of the latter's inner shape yet — the first real
// attributed gift will be the one that shows it. So rather than guess at keys,
// walk both structures and pull any qr- marker out of the values. Anything
// that does not resolve to a slug we actually minted is ignored, which keeps a
// stray utm_campaign someone types by hand out of the ledger.
export function markerFrom(transaction) {
  const found = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === "string") {
      const m = v.match(/\bqr-([a-z0-9][a-z0-9-]*)\b/i);
      if (m) found.push(m[1].toLowerCase());
      return;
    }
    if (Array.isArray(v)) { for (const x of v) walk(x); return; }
    if (typeof v === "object") { for (const x of Object.values(v)) walk(x); }
  };
  walk(transaction.utm_parameters);
  walk(transaction.attribution_data);
  return found[0] || null;
}

async function knownSlugs(env) {
  const { results } = await env.WAIVERS_DB.prepare(`SELECT slug FROM qr_codes`).all();
  return new Set((results || []).map((r) => r.slug));
}

async function readWatermark(env) {
  try {
    const row = await env.WAIVERS_DB.prepare(
      `SELECT value FROM qr_sync_state WHERE key = ?`
    ).bind(WATERMARK).first();
    return row && row.value ? row.value : null;
  } catch { return null; }
}

async function writeWatermark(env, iso) {
  await env.WAIVERS_DB.prepare(
    `INSERT INTO qr_sync_state (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(WATERMARK, iso, new Date().toISOString()).run();
}

// Returns a summary rather than throwing, so the caller (a cron that also does
// other work) can log it and carry on. Silence is the failure mode that costs
// most here: nobody notices missing attribution the way they notice a 500.
export async function syncGifts(env, opts = {}) {
  const out = { ok: false, scanned: 0, attributed: 0, written: 0, pages: 0, error: null };
  if (!env.WAIVERS_DB) { out.error = "no D1 binding"; return out; }
  if (!env.GIVEBUTTER_API_KEY) { out.error = "no GIVEBUTTER_API_KEY"; return out; }

  try {
    const slugs = await knownSlugs(env);
    const mark = opts.since || await readWatermark(env);
    const floor = mark ? new Date(new Date(mark).getTime() - LOOKBACK_MS) : null;
    let newest = mark ? new Date(mark) : null;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(`${API}?per_page=100&page=${page}`, {
        headers: {
          Authorization: `Bearer ${env.GIVEBUTTER_API_KEY}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) { out.error = `givebutter ${res.status}`; break; }
      const body = await res.json();
      const rows = body.data || [];
      out.pages = page;
      if (!rows.length) break;

      let reachedFloor = false;
      for (const t of rows) {
        out.scanned++;
        const at = new Date(t.transacted_at);
        if (newest === null || at > newest) newest = at;
        if (floor && at < floor) { reachedFloor = true; continue; }

        const slug = markerFrom(t);
        if (!slug || !slugs.has(slug)) continue;
        out.attributed++;

        await env.WAIVERS_DB.prepare(
          `INSERT INTO qr_gifts (transaction_id, slug, amount, donated, status, transacted_at, attribution, synced_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(transaction_id) DO UPDATE SET
             slug = excluded.slug, amount = excluded.amount, donated = excluded.donated,
             status = excluded.status, attribution = excluded.attribution, synced_at = excluded.synced_at`
        ).bind(
          String(t.id),
          slug,
          Number(t.amount) || 0,
          Number(t.donated) || 0,
          t.status || "unknown",
          t.transacted_at,
          JSON.stringify({ utm: t.utm_parameters ?? null, attribution: t.attribution_data ?? null }),
          new Date().toISOString()
        ).run();
        out.written++;
      }

      // Transactions come back newest first, so once a whole page sits below
      // the floor there is nothing older worth reading.
      if (reachedFloor && rows.every((t) => new Date(t.transacted_at) < floor)) break;
      if (rows.length < 100) break;
    }

    if (newest) await writeWatermark(env, newest.toISOString());
    out.ok = !out.error;
    return out;
  } catch (err) {
    out.error = String((err && err.message) || err);
    return out;
  }
}

// Per-code money, for the admin dashboard. Refunded and failed gifts are
// excluded from the total but still counted, because "we raised $600 and gave
// $100 back" is a different sentence from "we raised $500".
export async function giftsBySlug(env) {
  const { results } = await env.WAIVERS_DB.prepare(
    `SELECT slug,
            COUNT(*)                                                  AS gifts,
            COALESCE(SUM(CASE WHEN status = 'succeeded' THEN donated END), 0) AS dollars,
            MAX(transacted_at)                                        AS last_gift
       FROM qr_gifts
      GROUP BY slug`
  ).all();
  return results || [];
}
