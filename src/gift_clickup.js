// One ClickUp subtask per Givebutter transaction. D1 owns gift facts and
// allocation evidence; ClickUp owns only human stewardship workflow.

const BEGIN = "<!-- gift:begin -->";
const END = "<!-- gift:end -->";
const KEY_PREFIX = "<!-- gift:key:";
const KEY_SUFFIX = " -->";
const LEASE_MS = 15 * 60 * 1000;

export async function syncGiftRelationships(env) {
  const out = { ok: false, created: 0, updated: 0, failed: 0, skipped: 0 };
  if (!env.WAIVERS_DB) return { ...out, error: "WAIVERS_DB is not configured" };
  if (!env.CLICKUP_TOKEN) return { ...out, error: "CLICKUP_TOKEN is not configured" };
  if (!env.CLICKUP_RELATIONSHIPS_LIST_ID) return { ...out, error: "CLICKUP_RELATIONSHIPS_LIST_ID is not configured" };

  let gifts;
  try {
    const result = await env.WAIVERS_DB.prepare(GIFT_PROJECTION_QUERY).all();
    gifts = result?.results || [];
  } catch (err) {
    return { ...out, error: safeError(err) };
  }
  if (!gifts.length) return { ...out, ok: true };

  let discovered = null;
  for (const gift of gifts) {
    if (!gift.parent_task_id) {
      out.skipped++;
      continue;
    }
    const leaseToken = crypto.randomUUID();
    try {
      if (!await claimGift(env, gift, leaseToken)) {
        out.skipped++;
        continue;
      }
    } catch (err) {
      out.failed++;
      console.error("gift ClickUp claim failed:", safeError(err));
      continue;
    }

    try {
      const markerId = await giftMarkerId(gift.transaction_id);
      if (!discovered && !gift.clickup_task_id) discovered = await tasksByGiftKey(env);
      let taskId = gift.clickup_task_id || discovered?.get(markerId)?.id || null;
      let task = null;
      if (taskId) {
        try {
          task = await getTask(env, taskId);
        } catch (err) {
          if (err?.status !== 404) throw err;
          discovered = await tasksByGiftKey(env);
          task = discovered.get(markerId) || null;
          taskId = task?.id || null;
        }
      }

      await renewClaim(env, gift.transaction_id, leaseToken);
      if (taskId && task) {
        const existing = task.markdown_description ?? task.description ?? "";
        await clickup(env, `task/${taskId}`, {
          method: "PUT",
          body: {
            name: giftTaskName(gift),
            markdown_description: await mergeGiftSnapshot(existing, gift),
            parent: String(gift.parent_task_id),
          },
        });
        await recordSuccess(env, gift, leaseToken, taskId);
        out.updated++;
      } else {
        const created = await clickup(env, `list/${env.CLICKUP_RELATIONSHIPS_LIST_ID}/task`, {
          method: "POST",
          body: {
            name: giftTaskName(gift),
            markdown_description: await newGiftDescription(gift),
            parent: String(gift.parent_task_id),
            tags: ["type-gift", "stage-follow-up"],
          },
        });
        if (!created?.id) throw new Error("ClickUp gift create returned no task id");
        await recordSuccess(env, gift, leaseToken, created.id);
        out.created++;
      }
    } catch (err) {
      await safeRecordFailure(env, gift, leaseToken, safeError(err));
      out.failed++;
    }
  }

  out.ok = out.failed === 0;
  return out;
}

async function tasksByGiftKey(env) {
  const found = new Map();
  for (let page = 0; ; page++) {
    const result = await clickup(env,
      `list/${env.CLICKUP_RELATIONSHIPS_LIST_ID}/task?include_closed=true&subtasks=true&include_markdown_description=true&page=${page}`);
    const tasks = result?.tasks || [];
    for (const task of tasks) {
      const description = task.markdown_description ?? task.description ?? "";
      const key = markerFromDescription(description);
      if (/^[0-9a-f]{32}$/.test(key || "")) found.set(key, task);
    }
    if (result?.last_page === true || tasks.length < 100) break;
  }
  return found;
}

async function getTask(env, taskId) {
  return clickup(env, `task/${taskId}?include_markdown_description=true`);
}

export async function mergeGiftSnapshot(existing, gift) {
  const marker = await giftMarker(gift.transaction_id);
  const original = blocks(existing);
  const marked = original.blocks
    .map((block, index) => existing.slice(block.start, block.end).includes(marker) ? index : -1)
    .filter((index) => index !== -1);
  const cleaned = existing.split(marker).join("");
  const parsed = blocks(cleaned);
  if (!original.malformed && !parsed.malformed) {
    const target = marked.length === 1 ? marked[0] : (marked.length === 0 && parsed.blocks.length === 1 ? 0 : -1);
    if (target >= 0 && parsed.blocks[target]) {
      const block = parsed.blocks[target];
      return cleaned.slice(0, block.start) + await giftSnapshot(gift) + cleaned.slice(block.end);
    }
  }
  return `${cleaned}\n\n${await giftSnapshot(gift)}`;
}

async function newGiftDescription(gift) {
  return `${await giftSnapshot(gift)}

## Stewardship work

Use the **assignee** for the owner and **due date** for the next follow-up. Record the human story, message, and next action here. Do not state that this exact gift funded an expense until a verified allocation appears in the snapshot above.`;
}

async function giftSnapshot(gift) {
  const amount = Number(gift.amount) || 0;
  const allocated = Math.max(0, Number(gift.allocated_total) || 0);
  const remaining = Math.max(0, amount - allocated);
  const allocationStatus = allocated <= 0
    ? "Unallocated"
    : (allocated > amount + 0.000001 ? "Over-allocated — review"
      : (allocated + 0.000001 < amount ? "Partially allocated" : "Fully allocated"));
  const allocations = parseAllocations(gift.allocation_json);
  const evidence = allocations.length
    ? `\n### Verified allocation evidence\n\n${allocations.map(allocationLine).join("\n")}`
    : "\nNo verified expense allocation is recorded yet.";
  const synced = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  return `${BEGIN}
${await giftMarker(gift.transaction_id)}
**Gift snapshot** — mirrored from Givebutter and Cloudflare; do not edit here.

| | |
|---|---|
| Transaction | ${escapeMarkdown(gift.transaction_id)} |
| Donor | ${escapeMarkdown(gift.donor_name)} |
| Amount | **$${money(amount)}** |
| Gift date | ${dateOnly(gift.transacted_at)} |
| Campaign | ${escapeMarkdown(gift.campaign_title || "Unspecified")} |
| Recurring | ${truthy(gift.recurring) ? "Yes" : "No"} |
| Communication opt-in at gift | ${truthy(gift.communication_opt_in) ? "Yes" : "No"} |
| ATL thank-you | ${emailLabel(gift)} |
| Allocation status | ${allocationStatus} |
| Verified allocated | **$${money(allocated)}** |
| Remaining | **$${money(remaining)}** |
${evidence}

Givebutter owns the transaction. Cloudflare owns allocation evidence. ClickUp owns the follow-up work.

_Synced ${synced}._
${END}`;
}

function allocationLine(row) {
  const label = `${escapeMarkdown(row.source || "Expense")}: ${escapeMarkdown(row.id || "record")}`;
  const url = safeEvidenceUrl(row.url);
  const linked = url ? `[${label}](${url})` : label;
  const note = row.note ? ` — ${escapeMarkdown(row.note)}` : "";
  return `- ${linked} — $${money(row.amount)}${note}`;
}

function parseAllocations(value) {
  try {
    const rows = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function emailLabel(gift) {
  if (truthy(gift.historical) || gift.email_status === "historical") return "Historical import — not sent retroactively";
  return ({ sent: "Sent", no_email: "No deliverable email", failed: "Failed — recovery required", retry: "Retry pending", pending: "Pending", sending: "Sending" })[gift.email_status] || "Unknown";
}

function blocks(description) {
  const token = /<!-- gift:(begin|end) -->/g;
  const result = [];
  let open = null;
  let malformed = false;
  for (let match = token.exec(description); match; match = token.exec(description)) {
    if (match[1] === "begin") {
      if (open !== null) malformed = true;
      open = match.index;
    } else if (open === null) malformed = true;
    else {
      result.push({ start: open, end: match.index + match[0].length });
      open = null;
    }
  }
  if (open !== null) malformed = true;
  return { blocks: result, malformed };
}

function markerFromDescription(description) {
  const start = description.indexOf(KEY_PREFIX);
  if (start === -1) return null;
  const valueStart = start + KEY_PREFIX.length;
  const end = description.indexOf(KEY_SUFFIX, valueStart);
  return end === -1 ? null : description.slice(valueStart, end).trim().toLowerCase();
}

async function giftMarker(key) { return `${KEY_PREFIX}${await giftMarkerId(key)}${KEY_SUFFIX}`; }
export async function giftMarkerId(key) {
  const bytes = new TextEncoder().encode(String(key || "").trim());
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function giftTaskName(gift) { return `$${money(gift.amount)} gift — ${escapeMarkdown(dateOnly(gift.transacted_at))}`; }
function dateOnly(value) { return value ? String(value).slice(0, 10) : "unknown"; }
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
function safeEvidenceUrl(value) {
  const raw = String(value || "");
  if (!raw || /[\u0000-\u001f\u007f]/.test(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return "";
    return parsed.href.replace(/[()]/g, (character) => encodeURIComponent(character));
  } catch {
    return "";
  }
}
function safeError(err) { return String(err?.message || err || "unknown error").slice(0, 500); }

class ClickUpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function clickup(env, path, options = {}) {
  const request = env.CLICKUP_FETCH || fetch;
  const response = await request(`https://api.clickup.com/api/v2/${path}`, {
    method: options.method || "GET",
    headers: { Authorization: env.CLICKUP_TOKEN, ...(options.body ? { "Content-Type": "application/json" } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 200) }; }
  if (!response.ok) throw new ClickUpError(response.status, `ClickUp ${response.status}: ${body.err || body.message || "request failed"}`);
  return body;
}

async function claimGift(env, gift, leaseToken) {
  const now = new Date();
  const nowIso = now.toISOString();
  const staleIso = new Date(now.getTime() - LEASE_MS).toISOString();
  await env.WAIVERS_DB.prepare(
    `INSERT INTO donor_gift_clickup_projection
       (transaction_id, donor_key, parent_task_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(transaction_id) DO NOTHING`
  ).bind(gift.transaction_id, gift.donor_key, String(gift.parent_task_id), nowIso, nowIso).run();
  const result = await env.WAIVERS_DB.prepare(
    `UPDATE donor_gift_clickup_projection
        SET claim_token = ?, claimed_at = ?, updated_at = ?
      WHERE transaction_id = ?
        AND (claim_token IS NULL OR claimed_at IS NULL OR claimed_at < ?)`
  ).bind(leaseToken, nowIso, nowIso, gift.transaction_id, staleIso).run();
  return Number(result?.meta?.changes ?? 1) === 1;
}

async function renewClaim(env, transactionId, leaseToken) {
  const now = new Date().toISOString();
  const result = await env.WAIVERS_DB.prepare(
    `UPDATE donor_gift_clickup_projection SET claimed_at = ?, updated_at = ?
      WHERE transaction_id = ? AND claim_token = ?`
  ).bind(now, now, transactionId, leaseToken).run();
  if (Number(result?.meta?.changes ?? 1) !== 1) throw new Error("gift ClickUp claim was lost");
}

async function recordSuccess(env, gift, leaseToken, taskId) {
  const now = new Date().toISOString();
  const result = await env.WAIVERS_DB.prepare(
    `UPDATE donor_gift_clickup_projection
        SET clickup_task_id = ?, parent_task_id = ?, source_watermark = ?, allocation_watermark = ?,
            last_synced_at = ?, sync_error = NULL, claim_token = NULL, claimed_at = NULL, updated_at = ?
      WHERE transaction_id = ? AND claim_token = ?`
  ).bind(String(taskId), String(gift.parent_task_id), gift.source_watermark ?? null,
    gift.allocation_watermark ?? null, now, now, gift.transaction_id, leaseToken).run();
  if (Number(result?.meta?.changes ?? 1) !== 1) throw new Error("gift ClickUp claim was lost before commit");
}

async function safeRecordFailure(env, gift, leaseToken, error) {
  try {
    const now = new Date().toISOString();
    await env.WAIVERS_DB.prepare(
      `UPDATE donor_gift_clickup_projection
          SET sync_error = ?, claim_token = NULL, claimed_at = NULL, updated_at = ?
        WHERE transaction_id = ? AND claim_token = ?`
    ).bind(error, now, gift.transaction_id, leaseToken).run();
  } catch (err) {
    console.error("gift ClickUp failure ledger write failed:", safeError(err));
  }
}

export const GIFT_PROJECTION_QUERY = `
WITH live AS (
  SELECT transaction_id,
         CASE
           WHEN email IS NOT NULL AND trim(email) <> '' THEN lower(trim(email))
           WHEN contact_id IS NOT NULL AND trim(contact_id) <> '' THEN 'contact:' || trim(contact_id)
           ELSE 'transaction:' || transaction_id
         END AS donor_key,
         trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')) AS donor_name,
         email, amount, campaign_id, campaign_title, recurring, communication_opt_in,
         transacted_at, email_status
    FROM donor_gifts
),
changes AS (
  SELECT transaction_id, MAX(id) AS source_watermark
    FROM gift_projection_changes
   GROUP BY transaction_id
),
alloc AS (
  SELECT transaction_id, COUNT(*) AS allocation_count, SUM(amount) AS allocated_total,
         MAX(id) AS allocation_watermark,
         json_group_array(json_object('source', expense_source, 'id', expense_id,
           'url', evidence_url, 'amount', amount, 'note', note)) AS allocation_json
    FROM gift_allocation_events
   GROUP BY transaction_id
),
keys AS (
  SELECT transaction_id FROM live
  UNION
  SELECT transaction_id FROM donor_gift_clickup_projection
)
SELECT k.transaction_id,
       COALESCE(l.donor_key, p.donor_key) AS donor_key,
       d.clickup_task_id AS parent_task_id,
       p.parent_task_id AS stored_parent_task_id,
       p.clickup_task_id,
       COALESCE(NULLIF(l.donor_name, ''), p.baseline_name, l.email, p.baseline_email, 'Anonymous donor') AS donor_name,
       COALESCE(l.amount, p.baseline_amount, 0) AS amount,
       COALESCE(l.campaign_title, p.baseline_campaign_title) AS campaign_title,
       COALESCE(l.transacted_at, p.baseline_transacted_at) AS transacted_at,
       COALESCE(l.recurring, p.baseline_recurring, 0) AS recurring,
       COALESCE(l.communication_opt_in, p.baseline_opt_in, 0) AS communication_opt_in,
       CASE WHEN p.historical = 1 AND l.transaction_id IS NULL THEN 'historical' ELSE l.email_status END AS email_status,
       CASE WHEN p.historical = 1 AND l.transaction_id IS NULL THEN 1 ELSE 0 END AS historical,
       c.source_watermark,
       a.allocation_watermark,
       COALESCE(a.allocated_total, 0) AS allocated_total,
       COALESCE(a.allocation_count, 0) AS allocation_count,
       COALESCE(a.allocation_json, '[]') AS allocation_json
  FROM keys k
  LEFT JOIN live l ON l.transaction_id = k.transaction_id
  LEFT JOIN donor_gift_clickup_projection p ON p.transaction_id = k.transaction_id
  LEFT JOIN donor_clickup_projection d ON d.donor_key = COALESCE(l.donor_key, p.donor_key)
  LEFT JOIN changes c ON c.transaction_id = k.transaction_id
  LEFT JOIN alloc a ON a.transaction_id = k.transaction_id
 WHERE d.clickup_task_id IS NOT NULL
   AND (p.last_synced_at IS NULL
     OR p.sync_error IS NOT NULL
     OR p.clickup_task_id IS NULL
     OR p.parent_task_id IS NULL
     OR p.parent_task_id <> d.clickup_task_id
     OR (c.source_watermark IS NOT NULL AND c.source_watermark > COALESCE(p.source_watermark, 0))
     OR (a.allocation_watermark IS NOT NULL AND a.allocation_watermark > COALESCE(p.allocation_watermark, 0)))
 ORDER BY transacted_at DESC
 LIMIT 100`;
