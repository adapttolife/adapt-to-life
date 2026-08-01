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
//
// WHY THE DESCRIPTION AND NOT CUSTOM FIELDS. The first cut wrote five custom
// fields and ClickUp refused: {"err":"Custom field usages exceeded for your
// plan","ECODE":"FIELD_033"}. ATL is on the free tier and the quota was gone.
// Descriptions have no quota, render better, and work on every plan — so the
// numbers live in a delimited block the sync owns end-to-end. Anything a human
// writes outside that block is preserved untouched, which matters: this is
// their task list, not our output surface.

const BEGIN = "<!-- live:begin -->";
const END = "<!-- live:end -->";

function block(slug, scans, dollars, lastScan, syncedAt) {
  const last = lastScan ? new Date(lastScan).toISOString().slice(0, 10) : "never";
  const cold = scans === 0
    ? "\n\n> No scans recorded yet. If this is marked printed, that is worth checking — "
      + "it usually means the batch never got applied, or it is somewhere nobody walks."
    : "";
  return `${BEGIN}
**Live numbers** — read from the dashboard, do not edit here.

| | |
|---|---|
| Scans | **${scans}** |
| Raised | **$${Math.round(dollars).toLocaleString("en-US")}** |
| Last scan | ${last} |

Where it points, and everything that moves by the minute, lives at
[the QR dashboard](${DASHBOARD}) — deliberately not copied here, because a
second copy of a control surface goes stale and then gets acted on.

_Synced ${syncedAt}._${cold}
${END}`;
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

    const { tasks } = await cu(env, `list/${LIST_ID}/task?include_closed=true`);
    const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";

    for (const t of tasks || []) {
      const slugField = (t.custom_fields || []).find((f) => f.name === "Slug");
      const slug = slugField && slugField.value;
      if (!slug) { out.skipped++; continue; }

      const sc = byScan.get(slug) || { n: 0, last_scan: null };
      const gf = byGift.get(slug) || { dollars: 0 };
      const fresh = block(slug, sc.n, gf.dollars || 0, sc.last_scan, stamp);

      // Replace only OUR block. Everything a human wrote around it survives.
      const existing = t.description || "";
      const i = existing.indexOf(BEGIN), j = existing.indexOf(END);
      const next = (i !== -1 && j !== -1)
        ? existing.slice(0, i) + fresh + existing.slice(j + END.length)
        : (existing ? existing.trimEnd() + "\n\n" : "") + fresh;

      if (next.trim() !== existing.trim()) {
        await cu(env, `task/${t.id}`, { method: "PUT", body: { markdown_description: next } });
        out.updated++;
      } else {
        out.skipped++;
      }
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
