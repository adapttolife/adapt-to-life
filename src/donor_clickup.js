// Cloudflare/D1 owns donor truth. ClickUp is a human work projection:
// one task per donor, an automation-owned snapshot, and human-owned workflow
// outside that block. No ClickUp edit writes back into Givebutter or D1.

const BEGIN = "<!-- donor:begin -->";
const END = "<!-- donor:end -->";
const KEY_PREFIX = "<!-- donor:key:";
const KEY_SUFFIX = " -->";
const LEASE_MS = 15 * 60 * 1000;

export async function syncDonorRelationships(env) {
  const out = { ok: false, created: 0, updated: 0, failed: 0, skipped: 0 };
  if (!env.WAIVERS_DB) return { ...out, error: "WAIVERS_DB is not configured" };
  if (!env.CLICKUP_TOKEN) return { ...out, error: "CLICKUP_TOKEN is not configured" };
  if (!env.CLICKUP_RELATIONSHIPS_LIST_ID) {
    return { ...out, error: "CLICKUP_RELATIONSHIPS_LIST_ID is not configured" };
  }

  let donors;
  try {
    const result = await env.WAIVERS_DB.prepare(DONOR_PROJECTION_QUERY).all();
    donors = result?.results || [];
  } catch (err) {
    return { ...out, error: safeError(err) };
  }
  if (!donors.length) return { ...out, ok: true };

  const claimed = [];
  for (const donor of donors) {
    try {
      const leaseToken = crypto.randomUUID();
      if (await claimDonor(env, donor, leaseToken)) claimed.push({ donor, leaseToken });
      else out.skipped++;
    } catch (err) {
      out.failed++;
      console.error("donor ClickUp claim failed:", safeError(err));
    }
  }
  if (!claimed.length) {
    out.ok = out.failed === 0;
    return out;
  }

  let discovered = new Map();
  if (claimed.some(({ donor }) => !donor.clickup_task_id)) {
    try {
      discovered = await tasksByDonorKey(env);
    } catch (err) {
      const message = safeError(err);
      for (const item of claimed) {
        await safeRecordFailure(env, item.donor, item.leaseToken, message);
      }
      return { ...out, failed: out.failed + claimed.length, error: message };
    }
  }

  for (const { donor, leaseToken } of claimed) {
    try {
      const markerId = await donorMarkerId(donor.donor_key);
      let taskId = donor.clickup_task_id || discovered.get(markerId)?.id || null;
      let task = null;
      if (taskId) {
        try {
          task = await getTask(env, taskId);
        } catch (err) {
          if (err?.status !== 404) throw err;
          const recovered = await tasksByDonorKey(env);
          task = recovered.get(markerId) || null;
          taskId = task?.id || null;
        }
      }

      await renewClaim(env, donor.donor_key, leaseToken);
      if (taskId && task) {
        const existing = task.markdown_description ?? task.description ?? "";
        const description = await mergeSnapshot(existing, donor);
        await clickup(env, `task/${taskId}`, {
          method: "PUT",
          body: { name: taskName(donor), markdown_description: description },
        });
        await recordSuccess(env, donor, leaseToken, taskId);
        out.updated++;
      } else {
        const created = await clickup(env, `list/${env.CLICKUP_RELATIONSHIPS_LIST_ID}/task`, {
          method: "POST",
          body: {
            name: taskName(donor),
            markdown_description: await newDescription(donor),
            tags: ["type-donor", "stage-new"],
          },
        });
        if (!created?.id) throw new Error("ClickUp create returned no task id");
        await recordSuccess(env, donor, leaseToken, created.id);
        out.created++;
      }
    } catch (err) {
      await safeRecordFailure(env, donor, leaseToken, safeError(err));
      out.failed++;
    }
  }
  out.ok = out.failed === 0;
  return out;
}

async function getTask(env, taskId) {
  return clickup(env, `task/${taskId}?include_markdown_description=true`);
}

async function tasksByDonorKey(env) {
  const found = new Map();
  for (let page = 0; ; page++) {
    const result = await clickup(env,
      `list/${env.CLICKUP_RELATIONSHIPS_LIST_ID}/task?include_closed=true&subtasks=true&include_markdown_description=true&page=${page}`);
    const tasks = result?.tasks || [];
    for (const task of tasks) {
      const description = task.markdown_description ?? task.description ?? "";
      const rawKey = donorKeyFromDescription(description);
      const key = /^[0-9a-f]{32}$/.test(rawKey || "")
        ? rawKey
        : (rawKey?.includes("@") ? await donorMarkerId(rawKey) : null);
      if (key) found.set(key, task);
    }
    if (result?.last_page === true || tasks.length < 100) break;
  }
  return found;
}

async function snapshot(donor) {
  const synced = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const first = dateOnly(donor.first_gift_at);
  const latest = dateOnly(donor.latest_gift_at);
  return `${BEGIN}
${await keyMarker(donor.donor_key)}
**Donor snapshot** — mirrored from Givebutter and Cloudflare; do not edit here.

| | |
|---|---|
| Email | ${donor.email ? escapeMarkdown(donor.email) : "Not provided"} |
| Gift count | **${number(donor.gift_count)}** |
| Lifetime gifts | **$${money(donor.total_donated)}** |
| First gift | ${first} |
| Latest gift | ${latest} |
| Recurring | ${truthy(donor.recurring) ? "Yes" : "No"} |
| Communication opt-in | ${truthy(donor.communication_opt_in) ? "Yes" : "No"} |

Consent is source data, not a relationship stage. Givebutter and D1 remain authoritative.

_Synced ${synced}._
${END}`;
}

async function newDescription(donor) {
  return `${await snapshot(donor)}

## Relationship work

Use the task **assignee** for the owner and the **due date** for the next action. Keep human context, next-action reasoning, and stewardship notes here. Automation will preserve everything outside the donor snapshot.`;
}

export async function mergeSnapshot(existing, donor) {
  const marker = await keyMarker(donor.donor_key);
  const legacyMarker = `${KEY_PREFIX}${String(donor.donor_key || "").trim().toLowerCase()}${KEY_SUFFIX}`;
  const original = donorBlocks(existing);
  const marked = original.blocks
    .map((block, index) => {
      const text = existing.slice(block.start, block.end);
      return text.includes(marker) || text.includes(legacyMarker) ? index : -1;
    })
    .filter((index) => index !== -1);
  const cleaned = existing.split(marker).join("").split(legacyMarker).join("");
  const parsed = donorBlocks(cleaned);

  if (!original.malformed && !parsed.malformed) {
    const target = marked.length === 1
      ? marked[0]
      : (marked.length === 0 && parsed.blocks.length === 1 ? 0 : -1);
    if (target >= 0 && parsed.blocks[target]) {
      const block = parsed.blocks[target];
      return cleaned.slice(0, block.start) + await snapshot(donor) + cleaned.slice(block.end);
    }
  }
  return `${cleaned}\n\n${await snapshot(donor)}`;
}

function donorBlocks(description) {
  const token = /<!-- donor:(begin|end) -->/g;
  const blocks = [];
  let open = null;
  let malformed = false;
  for (let match = token.exec(description); match; match = token.exec(description)) {
    if (match[1] === "begin") {
      if (open !== null) malformed = true;
      open = match.index;
    } else if (open === null) {
      malformed = true;
    } else {
      blocks.push({ start: open, end: match.index + match[0].length });
      open = null;
    }
  }
  if (open !== null) malformed = true;
  return { blocks, malformed };
}

function donorKeyFromDescription(description) {
  const start = description.indexOf(KEY_PREFIX);
  if (start === -1) return null;
  const valueStart = start + KEY_PREFIX.length;
  const end = description.indexOf(KEY_SUFFIX, valueStart);
  return end === -1 ? null : description.slice(valueStart, end).trim().toLowerCase();
}

async function keyMarker(key) { return `${KEY_PREFIX}${await donorMarkerId(key)}${KEY_SUFFIX}`; }
export async function donorMarkerId(key) {
  const bytes = new TextEncoder().encode(String(key || "").trim().toLowerCase());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function taskName(donor) { return `${escapeMarkdown(donor.donor_name || donor.email || "Donor")} — donor`; }
function dateOnly(value) { return value ? String(value).slice(0, 10) : "unknown"; }
function number(value) { return Math.max(0, Number(value) || 0).toLocaleString("en-US"); }
function money(value) { return (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function truthy(value) { return value === true || value === 1 || value === "1" || value === "true"; }
function escapeMarkdown(value) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\|[\]()*_`~#!])/g, "\\$1")
    .trim();
}
function safeError(err) { return String(err?.message || err || "unknown error").slice(0, 500); }

class ClickUpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function clickup(env, path, options = {}) {
  const request = env.CLICKUP_FETCH || fetch;
  const response = await request(`https://api.clickup.com/api/v2/${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: env.CLICKUP_TOKEN,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 200) }; }
  if (!response.ok) {
    throw new ClickUpError(response.status, `ClickUp ${response.status}: ${body.err || body.message || "request failed"}`);
  }
  return body;
}

async function claimDonor(env, donor, leaseToken) {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleIso = new Date(now.getTime() - LEASE_MS).toISOString();
  await env.WAIVERS_DB.prepare(
    `INSERT INTO donor_clickup_projection
       (donor_key, baseline_name, baseline_email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(donor_key) DO NOTHING`
  ).bind(donor.donor_key, donor.donor_name || null, donor.email || null, nowIso, nowIso).run();
  const result = await env.WAIVERS_DB.prepare(
    `UPDATE donor_clickup_projection
        SET claim_token = ?, claimed_at = ?, updated_at = ?
      WHERE donor_key = ?
        AND (claim_token IS NULL OR claimed_at IS NULL OR claimed_at < ?)`
  ).bind(leaseToken, nowIso, nowIso, donor.donor_key, staleIso).run();
  return Number(result?.meta?.changes ?? 1) === 1;
}

async function renewClaim(env, donorKey, leaseToken) {
  const now = new Date().toISOString();
  const result = await env.WAIVERS_DB.prepare(
    `UPDATE donor_clickup_projection
        SET claimed_at = ?, updated_at = ?
      WHERE donor_key = ? AND claim_token = ?`
  ).bind(now, now, donorKey, leaseToken).run();
  if (Number(result?.meta?.changes ?? 1) !== 1) throw new Error("donor ClickUp claim was lost");
}

async function recordSuccess(env, donor, leaseToken, taskId) {
  const now = new Date().toISOString();
  const result = await env.WAIVERS_DB.prepare(
    `UPDATE donor_clickup_projection
        SET clickup_task_id = ?, source_watermark = ?, last_synced_at = ?, sync_error = NULL,
            claim_token = NULL, claimed_at = NULL, updated_at = ?
      WHERE donor_key = ? AND claim_token = ?`
  ).bind(String(taskId), donor.source_watermark ?? null, now, now, donor.donor_key, leaseToken).run();
  if (Number(result?.meta?.changes ?? 1) !== 1) throw new Error("donor ClickUp claim was lost before commit");
}

async function recordFailure(env, donor, leaseToken, error) {
  const now = new Date().toISOString();
  await env.WAIVERS_DB.prepare(
    `UPDATE donor_clickup_projection
        SET sync_error = ?, claim_token = NULL, claimed_at = NULL, updated_at = ?
      WHERE donor_key = ? AND claim_token = ?`
  ).bind(error, now, donor.donor_key, leaseToken).run();
}

async function safeRecordFailure(env, donor, leaseToken, error) {
  try {
    await recordFailure(env, donor, leaseToken, error);
  } catch (recordErr) {
    console.error("donor ClickUp failure ledger write failed:", safeError(recordErr));
  }
}

export const DONOR_PROJECTION_QUERY = `
WITH keyed_gifts AS (
  SELECT g.rowid AS gift_rowid,
         CASE
           WHEN g.email IS NOT NULL AND trim(g.email) <> '' THEN lower(trim(g.email))
           WHEN g.contact_id IS NOT NULL AND trim(g.contact_id) <> '' THEN 'contact:' || trim(g.contact_id)
           ELSE 'transaction:' || g.transaction_id
         END AS donor_key,
         g.*
    FROM donor_gifts g
),
eligible_gifts AS (
  SELECT k.*
    FROM keyed_gifts k
    LEFT JOIN donor_clickup_projection p ON p.donor_key = k.donor_key
   WHERE p.baseline_cutoff_at IS NULL OR k.transacted_at >= p.baseline_cutoff_at
),
live AS (
  SELECT donor_key,
         COUNT(*) AS gift_count,
         SUM(amount) AS total_donated,
         MIN(transacted_at) AS first_gift_at,
         MAX(transacted_at) AS latest_gift_at,
         MAX(created_at) AS latest_recorded_at,
         MAX(gift_rowid) AS source_watermark,
         MAX(recurring) AS recurring
    FROM eligible_gifts
   GROUP BY donor_key
),
latest_ranked AS (
  SELECT donor_key, first_name, last_name, email,
         communication_opt_in,
         ROW_NUMBER() OVER (
           PARTITION BY donor_key
           ORDER BY transacted_at DESC, transaction_id DESC
         ) AS position
    FROM eligible_gifts
),
latest AS (
  SELECT donor_key, first_name, last_name, email, communication_opt_in
    FROM latest_ranked WHERE position = 1
),
keys AS (
  SELECT donor_key FROM live
  UNION
  SELECT donor_key FROM donor_clickup_projection
)
SELECT k.donor_key,
       p.clickup_task_id,
       v.source_watermark,
       COALESCE(NULLIF(trim(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''),
                p.baseline_name, l.email, p.baseline_email, 'Anonymous donor') AS donor_name,
       COALESCE(l.email, p.baseline_email) AS email,
       COALESCE(p.baseline_gift_count, 0) + COALESCE(v.gift_count, 0) AS gift_count,
       COALESCE(p.baseline_total, 0) + COALESCE(v.total_donated, 0) AS total_donated,
       CASE
         WHEN p.baseline_first_gift_at IS NULL THEN v.first_gift_at
         WHEN v.first_gift_at IS NULL THEN p.baseline_first_gift_at
         ELSE MIN(p.baseline_first_gift_at, v.first_gift_at)
       END AS first_gift_at,
       CASE
         WHEN p.baseline_latest_gift_at IS NULL THEN v.latest_gift_at
         WHEN v.latest_gift_at IS NULL THEN p.baseline_latest_gift_at
         ELSE MAX(p.baseline_latest_gift_at, v.latest_gift_at)
       END AS latest_gift_at,
       MAX(COALESCE(p.baseline_recurring, 0), COALESCE(v.recurring, 0)) AS recurring,
       CASE WHEN l.donor_key IS NOT NULL THEN l.communication_opt_in
            ELSE COALESCE(p.baseline_opt_in, 0) END AS communication_opt_in
  FROM keys k
  LEFT JOIN donor_clickup_projection p ON p.donor_key = k.donor_key
  LEFT JOIN live v ON v.donor_key = k.donor_key
  LEFT JOIN latest l ON l.donor_key = k.donor_key
 WHERE p.last_synced_at IS NULL
    OR p.sync_error IS NOT NULL
    OR p.clickup_task_id IS NULL
    OR (v.source_watermark IS NOT NULL AND v.source_watermark > COALESCE(p.source_watermark, 0))
 ORDER BY latest_gift_at DESC
 LIMIT 50`;
