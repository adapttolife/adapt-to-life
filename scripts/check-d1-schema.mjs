#!/usr/bin/env node
// Compare every live D1 database the site writes to with its schema files.
// Read only: it runs two SELECTs per database and changes nothing.
//
//   cfrun node scripts/check-d1-schema.mjs            # all databases
//   cfrun node scripts/check-d1-schema.mjs atl-waivers
//
// Exits 1 when a table, column or index differs in a way that can break a
// write (see diffSchema in scripts/lib/d1-schema.mjs). scripts/release.mjs runs
// it before releasing. The databases live in the "Adapt To Life" Cloudflare
// account, not the account cfrun defaults to, so its id is looked up by name
// (CLOUDFLARE_API_TOKEN, which cfrun provides) and handed to wrangler.
import { execFileSync } from "node:child_process";
import {
  D1_SCHEMAS,
  OWNED_ELSEWHERE,
  COLUMNS_SQL,
  INDEXES_SQL,
  buildExpected,
  diffSchema,
} from "./lib/d1-schema.mjs";

const ACCOUNT_NAME = "Adapt To Life";

export async function atlAccountId() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set (run under cfrun)");
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts?name=${encodeURIComponent(ACCOUNT_NAME)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const body = await res.json().catch(() => ({}));
  const hit = (body.result || []).find((a) => a.name === ACCOUNT_NAME);
  if (!hit)
    throw new Error(
      `Cloudflare account "${ACCOUNT_NAME}" not found (HTTP ${res.status})`,
    );
  return hit.id;
}

function liveQuery(accountId, dbName, sql) {
  const out = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      dbName,
      "--remote",
      "--json",
      "--command",
      sql.replace(/\s+/g, " "),
    ],
    {
      encoding: "utf8",
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId },
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  const parsed = JSON.parse(out.slice(out.indexOf("[")));
  return parsed.flatMap((r) => r.results);
}

export async function checkD1Schema(
  names = Object.keys(D1_SCHEMAS),
  { log = console.log, read } = {},
) {
  const accountId = await atlAccountId();
  let failed = 0;
  for (const name of names) {
    const expected = buildExpected(name, read);
    const live = {
      columns: liveQuery(accountId, name, COLUMNS_SQL),
      indexes: liveQuery(accountId, name, INDEXES_SQL),
    };
    const { problems, notes } = diffSchema(expected, live, {
      ownedElsewhere: OWNED_ELSEWHERE[name] || [],
    });
    log(
      `${problems.length ? "FAIL" : "ok  "} ${name}: ${expected.columns.length} columns checked`,
    );
    for (const p of problems) log(`       ${p}`);
    for (const n of notes) log(`       note: ${n}`);
    if (problems.length) failed++;
  }
  return failed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const names = process.argv.slice(2);
  for (const n of names)
    if (!D1_SCHEMAS[n]) {
      console.error(
        `unknown database ${n}; known: ${Object.keys(D1_SCHEMAS).join(", ")}`,
      );
      process.exit(2);
    }
  checkD1Schema(names.length ? names : undefined).then(
    (failed) => process.exit(failed ? 1 : 0),
    (e) => {
      console.error(`check-d1-schema: ${e.message}`);
      process.exit(2);
    },
  );
}
