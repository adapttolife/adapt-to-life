// Spec 116 — mirror what the DASHBOARD observes into the ClickUp register.
//
// Alec, 2026-08-01: "ClickUp should be an extension of the dashboard and
// complement it." So the division of labour is deliberate and worth stating,
// because getting it wrong is how a register starts lying:
//
//   THE DASHBOARD owns live truth. Where a code points, and every number that
//   moves by the minute. None of it is copied anywhere, because a copy of a
//   control surface is a second version of the truth that goes stale and then
//   gets acted on.
//
//   CLICKUP owns the physical world. Is it printed, how many, where are they,
//   who is next. Facts only a human knows, that no query can answer.
//
//   THIS FILE moves the small set of OBSERVATIONS across — scans, dollars,
//   last scan — so ClickUp is glanceable without opening the dashboard.
//   Observations are safe to mirror in a way that destinations are not: they
//   are read-only, nobody acts on them by editing them back, and every one
//   lands with a "Data synced" stamp so a stale number announces itself.
//
// The signal worth having in a task list rather than a chart: a code with zero
// scans weeks after it was marked printed. That usually means a sticker batch
// never got applied or a sign got hung somewhere nobody walks — and it is
// invisible on a dashboard, which only ever draws what DID happen.

const LIST_ID = "901418690965";          // Team Space -> Adapt To Life -> QR codes
const DASHBOARD = "https://adapttolife.org/admin/qr";
const SYNC_KEY = "clickup_synced_on";

async function cu(env, path, { method = "GET", body } = {}) {
  const r = await fetch(`https://api.clickup.com/api/v2/${path}`, {
    method,
    headers: { Authorization: env.CLICKUP_TOKEN, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`clickup ${path} -> ${r.status}`);
  return r.json();
}

// Fields are looked up by NAME at run time rather than hardcoded by id. Ids
// change if a field is deleted and remade in the UI, and a sync that silently
// writes nothing because an id rotted is worse than one that fails loudly.
async function fieldMap(env) {
  const { fields } = await cu(env, `list/${LIST_ID}/field`);
  return Object.fromEntries((fields || []).map((f) => [f.name, f.id]));
}

export async function syncClickUp(env, { force = false } = {}) {
  const out = { ok: false, updated: 0, skipped: 0, error: null };
  if (!env.WAIVERS_DB) { out.error = "no D1"; return out; }
  if (!env.CLICKUP_TOKEN) { out.error = "no CLICKUP_TOKEN"; return out; }

  try {
    // Once a day is the right cadence: these are slow-moving facts on a
    // human's task list, and the cron this rides on fires every 10 minutes.
    const today = new Date().toISOString().slice(0, 10);
    if (!force) {
      const last = await env.WAIVERS_DB.prepare(
        `SELECT value FROM qr_sync_state WHERE key = ?`).bind(SYNC_KEY).first();
      if (last && last.value === today) { out.ok = true; out.skipped = -1; return out; }
    }

    const { results: scans } = await env.WAIVERS_DB.prepare(
      `SELECT slug, COUNT(*) n, MAX(scanned_at) last_scan
         FROM qr_scans WHERE kind = 'known' GROUP BY slug`).all();
    const { results: gifts } = await env.WAIVERS_DB.prepare(
      `SELECT slug, COALESCE(SUM(CASE WHEN status='succeeded' THEN donated END),0) dollars
         FROM qr_gifts GROUP BY slug`).all();

    const byScan = new Map((scans || []).map((r) => [r.slug, r]));
    const byGift = new Map((gifts || []).map((r) => [r.slug, r]));

    const F = await fieldMap(env);
    const { tasks } = await cu(env, `list/${LIST_ID}/task?include_closed=true`);
    const now = Date.now();

    for (const t of tasks || []) {
      const slugField = (t.custom_fields || []).find((f) => f.name === "Slug");
      const slug = slugField && slugField.value;
      if (!slug) { out.skipped++; continue; }

      const s = byScan.get(slug) || { n: 0, last_scan: null };
      const g = byGift.get(slug) || { dollars: 0 };
      const sets = [
        [F["Scans (observed)"], s.n],
        [F["Raised (observed)"], Math.round(g.dollars || 0)],
        [F["Data synced"], now],
        [F["Live dashboard"], DASHBOARD],
      ];
      if (s.last_scan) sets.push([F["Last scan"], Date.parse(s.last_scan)]);

      for (const [fid, value] of sets) {
        if (!fid) continue;
        await cu(env, `task/${t.id}/field/${fid}`, { method: "POST", body: { value } });
      }
      out.updated++;
    }

    await env.WAIVERS_DB.prepare(
      `INSERT INTO qr_sync_state (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).bind(SYNC_KEY, today, new Date().toISOString()).run();

    out.ok = true;
    return out;
  } catch (err) {
    out.error = String((err && err.message) || err);
    return out;
  }
}
