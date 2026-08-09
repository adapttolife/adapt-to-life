#!/usr/bin/env node
import { open, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const API = "https://api.givebutter.com/v1";
const WEBHOOK_URL = "https://adapttolife.org/api/givebutter-webhook";

export function transactionDonorKey(tx) {
  const email = String(tx.email || "").trim().toLowerCase();
  if (email) return email;
  const contactId = tx.contact_id ?? tx.contact?.id;
  if (contactId !== null && contactId !== undefined && String(contactId).trim()) {
    return `contact:${String(contactId).trim()}`;
  }
  return tx.id === null || tx.id === undefined ? null : `transaction:${String(tx.id)}`;
}

export function buildBaseline(transactions, cutoff) {
  const byDonor = new Map();
  for (const tx of transactions) {
    const donorKey = transactionDonorKey(tx);
    if (!donorKey || tx.status !== "succeeded" || String(tx.transacted_at || "") >= cutoff) continue;
    const row = byDonor.get(donorKey) || { donorKey, gifts: [], recurring: false };
    row.gifts.push(tx);
    row.recurring ||= Boolean(tx.is_recurring || tx.plan_id);
    byDonor.set(donorKey, row);
  }
  return [...byDonor.values()].map((row) => {
    row.gifts.sort((a, b) => String(a.transacted_at).localeCompare(String(b.transacted_at)) || String(a.id).localeCompare(String(b.id)));
    const latest = row.gifts.at(-1);
    return {
      donorKey: row.donorKey,
      name: `${latest.first_name || ""} ${latest.last_name || ""}`.trim() || latest.email || "Anonymous donor",
      email: String(latest.email || "").trim() || null,
      giftCount: row.gifts.length,
      total: row.gifts.reduce((sum, tx) => sum + Number(tx.amount || 0), 0),
      firstGiftAt: row.gifts[0].transacted_at,
      latestGiftAt: latest.transacted_at,
      cutoff,
      recurring: row.recurring ? 1 : 0,
      optIn: latest.communication_opt_in ? 1 : 0,
    };
  });
}

export function buildHistoricalGifts(transactions, cutoff) {
  return transactions
    .filter((tx) => tx.id !== null && tx.id !== undefined && transactionDonorKey(tx) && tx.status === "succeeded"
      && String(tx.transacted_at || "") < cutoff)
    .map((tx) => ({
      transactionId: String(tx.id),
      donorKey: transactionDonorKey(tx),
      name: `${tx.first_name || ""} ${tx.last_name || ""}`.trim() || tx.email || "Anonymous donor",
      email: String(tx.email || "").trim() || null,
      amount: Number(tx.amount || 0),
      campaignId: tx.campaign_id ?? tx.campaign?.id ?? null,
      campaignTitle: tx.campaign_title ?? tx.campaign?.title ?? null,
      transactedAt: tx.transacted_at,
      recurring: tx.is_recurring || tx.plan_id ? 1 : 0,
      optIn: tx.communication_opt_in ? 1 : 0,
    }));
}

function sqlString(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function renderSql(rows, now = new Date().toISOString(), gifts = []) {
  if (!rows.length && !gifts.length) return "SELECT 1;\n";
  const values = rows.map((row) => `(${sqlString(row.donorKey)}, ${sqlString(row.name)}, ${sqlString(row.email)},
        ${Number(row.giftCount)}, ${Number(row.total)}, ${sqlString(row.firstGiftAt)},
        ${sqlString(row.latestGiftAt)}, ${sqlString(row.cutoff)}, ${Number(row.recurring)},
        ${Number(row.optIn)}, NULL, NULL, ${sqlString(now)}, ${sqlString(now)})`);
  const donorSql = rows.length ? `INSERT INTO donor_clickup_projection
  (donor_key, baseline_name, baseline_email, baseline_gift_count, baseline_total,
   baseline_first_gift_at, baseline_latest_gift_at, baseline_cutoff_at,
   baseline_recurring, baseline_opt_in, last_synced_at, sync_error, created_at, updated_at)
VALUES ${values.join(",\n")}
ON CONFLICT(donor_key) DO UPDATE SET
  baseline_name = excluded.baseline_name,
  baseline_email = excluded.baseline_email,
  baseline_gift_count = excluded.baseline_gift_count,
  baseline_total = excluded.baseline_total,
  baseline_first_gift_at = excluded.baseline_first_gift_at,
  baseline_latest_gift_at = excluded.baseline_latest_gift_at,
  baseline_cutoff_at = excluded.baseline_cutoff_at,
  baseline_recurring = excluded.baseline_recurring,
  baseline_opt_in = excluded.baseline_opt_in,
  last_synced_at = NULL,
  sync_error = NULL,
  updated_at = excluded.updated_at;` : "";
  const giftValues = gifts.map((gift) => `(${sqlString(gift.transactionId)}, ${sqlString(gift.donorKey)}, 1,
        ${sqlString(gift.name)}, ${sqlString(gift.email)}, ${Number(gift.amount)},
        ${sqlString(gift.campaignId)}, ${sqlString(gift.campaignTitle)}, ${sqlString(gift.transactedAt)},
        ${Number(gift.recurring)}, ${Number(gift.optIn)}, NULL, NULL, ${sqlString(now)}, ${sqlString(now)})`);
  const giftSql = gifts.length ? `INSERT INTO donor_gift_clickup_projection
  (transaction_id, donor_key, historical, baseline_name, baseline_email, baseline_amount,
   baseline_campaign_id, baseline_campaign_title, baseline_transacted_at,
   baseline_recurring, baseline_opt_in, last_synced_at, sync_error, created_at, updated_at)
VALUES ${giftValues.join(",\n")}
ON CONFLICT(transaction_id) DO UPDATE SET
  donor_key = excluded.donor_key,
  historical = 1,
  baseline_name = excluded.baseline_name,
  baseline_email = excluded.baseline_email,
  baseline_amount = excluded.baseline_amount,
  baseline_campaign_id = excluded.baseline_campaign_id,
  baseline_campaign_title = excluded.baseline_campaign_title,
  baseline_transacted_at = excluded.baseline_transacted_at,
  baseline_recurring = excluded.baseline_recurring,
  baseline_opt_in = excluded.baseline_opt_in,
  last_synced_at = NULL,
  sync_error = NULL,
  updated_at = excluded.updated_at;` : "";
  return `${donorSql}${donorSql && giftSql ? "\n" : ""}${giftSql}\n`;
}

export function pathIsInside(root, candidate) {
  const rel = relative(root, candidate);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

async function safeOutputPath(output) {
  const configuredRoot = process.env.BASELINE_PII_SCRATCH_DIR;
  if (!configuredRoot) throw new Error("BASELINE_PII_SCRATCH_DIR is required");
  const target = resolve(output);
  const [scratchRoot, parent, repoRoot] = await Promise.all([
    realpath(configuredRoot),
    realpath(dirname(target)),
    realpath(fileURLToPath(new URL("../", import.meta.url))),
  ]);
  const resolvedTarget = join(parent, basename(target));
  if (!pathIsInside(scratchRoot, resolvedTarget)) {
    throw new Error("Baseline output must be inside BASELINE_PII_SCRATCH_DIR");
  }
  if (pathIsInside(repoRoot, resolvedTarget) || resolvedTarget === repoRoot) {
    throw new Error("Baseline output must be outside the repository");
  }
  return resolvedTarget;
}

async function fetchAll(path, token) {
  const rows = [];
  for (let page = 1; ; page++) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(`${API}/${path}${separator}page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Givebutter ${response.status} while reading ${path}`);
    const body = await response.json();
    rows.push(...(body.data || []));
    if (page >= Number(body.meta?.last_page || page)) break;
  }
  return rows;
}

async function main() {
  const token = process.env.GIVEBUTTER_API_TOKEN;
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex === -1 ? null : process.argv[outputIndex + 1];
  if (!token) throw new Error("GIVEBUTTER_API_TOKEN is required");
  if (!output) throw new Error("--output <path> is required; output contains donor PII and must be deleted after D1 import");
  const safeOutput = await safeOutputPath(output);

  const [webhooks, transactions] = await Promise.all([
    fetchAll("webhooks?per_page=100", token),
    fetchAll("transactions?per_page=100", token),
  ]);
  const active = webhooks.filter((hook) => hook.enabled && hook.url === WEBHOOK_URL);
  if (active.length !== 1) throw new Error(`Expected exactly one enabled production webhook, found ${active.length}`);
  const cutoff = active[0].created_at;
  if (!cutoff) throw new Error("Production webhook has no creation timestamp");

  const rows = buildBaseline(transactions, cutoff);
  const gifts = buildHistoricalGifts(transactions, cutoff);
  const file = await open(safeOutput, "wx", 0o600);
  try {
    await file.writeFile(renderSql(rows, new Date().toISOString(), gifts));
  } finally {
    await file.close();
  }
  console.log(JSON.stringify({ donors: rows.length, transactions: gifts.length, cutoff, output: safeOutput }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => { console.error(err.message); process.exitCode = 1; });
}
