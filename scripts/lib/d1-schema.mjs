// Which schema files define which live D1 database, and how to compare them.
//
// The schema files are the source of truth for every table the worker writes.
// The Nov 2026 waiver outage happened because schema/waivers.sql and the live
// atl-waivers table had quietly drifted apart (the live table kept a June
// column the file no longer had), and the tests only ever saw the file. This
// module lets a test build each database from its files, and lets
// scripts/check-d1-schema.mjs compare that build against the live database
// column by column, so drift is caught before a release instead of by signers.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);

// database_name (wrangler.jsonc) -> the files that define its tables, in apply
// order. Tables a database has that no file here defines are reported, not
// failed: some belong to another worker (atl-intake's `intake` table is owned
// by the intake worker) or to Cloudflare (_cf_KV).
export const D1_SCHEMAS = {
  "atl-waivers": [
    "schema/waivers.sql",
    "schema/qr.sql",
    "schema/donor_gifts.sql",
    "schema/donor_clickup_projection.sql",
    "schema/donor_gift_clickup_projection.sql",
    "schema/shop_messages.sql",
    "src/schema_forms.sql",
  ],
  // The welcome-series table is defined only by its (idempotent) migration.
  "agent-mail": [
    "schema/agent_mail.sql",
    "src/schema_newsletter.sql",
    "schema/migrations/2026-11-07-newsletter-welcome.sql",
  ],
  "atl-intake": ["src/schema_intake_delivery.sql"],
};

// Tables a live database may carry that no schema file defines, on purpose.
export const OWNED_ELSEWHERE = {
  "atl-intake": ["intake"],
};

// SQL that returns every column of every user table, the same shape on D1 and
// on node:sqlite.
export const COLUMNS_SQL = `SELECT m.name AS tbl, p.cid AS cid, p.name AS name, p.type AS type,
  p."notnull" AS nn, p.dflt_value AS dflt, p.pk AS pk
  FROM sqlite_master m JOIN pragma_table_info(m.name) p
  WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'
  ORDER BY m.name, p.cid`;

export const INDEXES_SQL = `SELECT name, tbl_name AS tbl FROM sqlite_master
  WHERE type = 'index' AND sql IS NOT NULL ORDER BY name`;

const readLocal = (f) => readFileSync(new URL(f, ROOT), "utf8");

// `read` maps a repo path to its text; the release passes one that reads the
// exact commit being released instead of the working tree.
export function schemaSql(dbName, read = readLocal) {
  const files = D1_SCHEMAS[dbName];
  if (!files) throw new Error(`no schema files listed for D1 database ${dbName}`);
  return files.map((f) => read(f)).join("\n");
}

// The database exactly as its schema files build it, in memory.
export function buildExpected(dbName, read = readLocal) {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaSql(dbName, read));
  return {
    columns: db
      .prepare(COLUMNS_SQL)
      .all()
      .map((r) => ({ ...r })),
    indexes: db
      .prepare(INDEXES_SQL)
      .all()
      .map((r) => ({ ...r })),
  };
}

const norm = (v) => (v === null || v === undefined ? null : String(v).trim());
const byTable = (rows) => {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.tbl)) m.set(r.tbl, new Map());
    m.get(r.tbl).set(r.name, r);
  }
  return m;
};

// Compare an expected build with a live read. Column ORDER is not compared:
// ALTER TABLE ADD COLUMN appends, so a migrated table legitimately orders
// columns differently from a fresh one, and nothing in src/ uses SELECT * by
// position. Everything an INSERT can trip on is compared: presence, declared
// type, NOT NULL, default and primary key.
export function diffSchema(expected, live, { ownedElsewhere = [] } = {}) {
  const problems = [];
  const notes = [];
  const exp = byTable(expected.columns);
  const got = byTable(live.columns);
  for (const [tbl, cols] of exp) {
    const liveCols = got.get(tbl);
    if (!liveCols) {
      problems.push(`table ${tbl}: defined in the schema files but missing live`);
      continue;
    }
    for (const [name, c] of cols) {
      const l = liveCols.get(name);
      if (!l) {
        problems.push(`${tbl}.${name}: in the schema files, missing live`);
        continue;
      }
      for (const [k, label] of [
        ["type", "type"],
        ["nn", "NOT NULL"],
        ["dflt", "default"],
        ["pk", "primary key"],
      ]) {
        if (norm(c[k]) !== norm(l[k]))
          problems.push(
            `${tbl}.${name}: ${label} is ${JSON.stringify(l[k])} live, ${JSON.stringify(c[k])} in the schema files`,
          );
      }
    }
    for (const [name, l] of liveCols) {
      if (!cols.has(name))
        problems.push(
          `${tbl}.${name}: live only (${l.type}${l.nn ? " NOT NULL" : ""}${
            l.dflt === null ? "" : " DEFAULT " + l.dflt
          }), not in the schema files`,
        );
    }
  }
  for (const tbl of got.keys()) {
    if (!exp.has(tbl))
      notes.push(
        ownedElsewhere.includes(tbl)
          ? `table ${tbl}: live, owned by another worker (expected)`
          : `table ${tbl}: live only, no schema file defines it`,
      );
  }
  const liveIdx = new Set(live.indexes.map((i) => i.name));
  for (const i of expected.indexes)
    if (!liveIdx.has(i.name))
      problems.push(`index ${i.name} on ${i.tbl}: missing live`);
  const expIdx = new Set(expected.indexes.map((i) => i.name));
  for (const i of live.indexes)
    if (!expIdx.has(i.name) && exp.has(i.tbl))
      notes.push(`index ${i.name} on ${i.tbl}: live only`);
  return { problems, notes };
}
