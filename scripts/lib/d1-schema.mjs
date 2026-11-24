// Which schema files define which live D1 database, and how to compare them.
//
// The schema files are the source of truth for every table the worker writes.
// The Nov 2026 waiver outage happened because schema/waivers.sql and the live
// atl-waivers table had quietly drifted apart (the live table kept a June
// column the file no longer had), and the tests only ever saw the file. This
// module lets a test build each database from its files, and lets
// scripts/check-d1-schema.mjs compare that build with the live database, so
// drift is caught before a release instead of by signers.
//
// What is compared, per table: every column (incl. hidden/generated) with its
// type, NOT NULL, default and primary key; every index with its uniqueness,
// columns, order, collation and partial WHERE; each column's whole definition
// and the table-level constraints, read from the table's SQL (D1 refuses
// pragma_foreign_key_list), so CHECK, REFERENCES, GENERATED, ON CONFLICT and
// STRICT / WITHOUT ROWID are covered; and every trigger and view. Column ORDER is not
// compared: ALTER TABLE ADD COLUMN appends, and nothing reads by position.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url);

// database_name (wrangler.jsonc) -> the files that define its tables, in apply
// order.
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
    "schema/resend_events.sql",
  ],
  "atl-intake": ["src/schema_intake_delivery.sql"],
};

// Live tables no file here defines, on purpose, with the reason. Any other
// live-only table fails the check: it is either a table this repo writes and
// forgot to define, or debris someone should look at.
export const OWNED_ELSEWHERE = {
  "atl-intake": {
    intake: "the intake worker's own table",
    newsletter_delivery_claims:
      "pre-Nov 2026 newsletter copy, read by agentos intake health",
    newsletter_send_receipts:
      "pre-Nov 2026 newsletter copy, read by agentos intake health",
  },
};

const USER = `m.name NOT LIKE 'sqlite_%' AND m.name NOT LIKE '_cf_%'`;
// Each query returns the same shape on D1 and on node:sqlite.
export const DESCRIBE_SQL = {
  columns: `SELECT m.name AS tbl, p.name AS name, p.type AS type, p."notnull" AS nn,
    p.dflt_value AS dflt, p.pk AS pk, p.hidden AS hidden
    FROM sqlite_master m JOIN pragma_table_xinfo(m.name) p
    WHERE m.type = 'table' AND ${USER}`,
  indexes: `SELECT m.name AS tbl, il.name AS idx, il."unique" AS uq, il.origin AS origin,
    il.partial AS partial, ii.seqno AS seqno, ii.name AS col, ii.cid AS cid,
    ii."desc" AS dsc, ii.coll AS coll
    FROM sqlite_master m JOIN pragma_index_list(m.name) il
    JOIN pragma_index_xinfo(il.name) ii
    WHERE m.type = 'table' AND ${USER} AND ii.key = 1`,
  objects: `SELECT m.type AS type, m.name AS name, m.tbl_name AS tbl, m.sql AS sql
    FROM sqlite_master m WHERE m.sql IS NOT NULL AND ${USER}`,
};

const readLocal = (f) => readFileSync(new URL(f, ROOT), "utf8");

// `read` maps a repo path to its text; the release passes one that reads the
// exact commit being released instead of the working tree.
export function schemaSql(dbName, read = readLocal) {
  const files = D1_SCHEMAS[dbName];
  if (!files) throw new Error(`no schema files listed for D1 database ${dbName}`);
  return files.map((f) => read(f)).join("\n");
}

// Raw rows for an in-memory node:sqlite database.
export function describeLocal(db) {
  const out = {};
  for (const [k, sql] of Object.entries(DESCRIBE_SQL))
    out[k] = db
      .prepare(sql)
      .all()
      .map((r) => ({ ...r }));
  return out;
}

// The database exactly as its schema files build it, in memory.
export function buildExpected(dbName, read = readLocal) {
  const db = new DatabaseSync(":memory:");
  db.exec(schemaSql(dbName, read));
  return describeLocal(db);
}

// SQL text compared in a meaning-preserving normal form: no comments, one
// case, no optional IF NOT EXISTS, no identifier quoting, no whitespace by
// punctuation. Quoted text ('...' and "...") keeps its case and content: it
// is swapped for placeholders first, so case-folding, comment stripping and
// keyword scans never touch it.
function protect(sql) {
  const lits = [];
  let out = "";
  const src = String(sql);
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      // '...' is a string, kept as written. "...", `...` and [...] are
      // identifiers (or, a SQLite quirk, "..." may be a string): all three
      // become "..." with their case kept, so a quoted name never merges with
      // a bare keyword and punctuation inside a name never splits a clause.
      const close = ch === "[" ? "]" : ch;
      let j = i + 1;
      for (; j < src.length; j++)
        if (src[j] === close) {
          if (close !== "]" && src[j + 1] === close) j++;
          else break;
        }
      const body = src.slice(i + 1, j);
      lits.push(
        ch === "'" ? `'${body}'` : `"${ch === '"' ? body : body.replace(/"/g, '""')}"`,
      );
      out += `\u0001${lits.length - 1}\u0001`;
      i = j + 1;
    } else if (ch === "-" && src[i + 1] === "-") {
      const j = src.indexOf("\n", i);
      out += " ";
      i = j === -1 ? src.length : j;
    } else if (ch === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      out += " ";
      i = j === -1 ? src.length : j + 2;
    } else {
      out += ch;
      i++;
    }
  }
  const text = out
    .toLowerCase()
    .replace(/\bif\s+not\s+exists\b/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),;=<>])\s*/g, "$1")
    .trim();
  return { text, restore: (t) => t.replace(/\u0001(\d+)\u0001/g, (_, n) => lits[+n]) };
}
export function normSql(sql) {
  if (sql === null || sql === undefined) return null;
  const p = protect(sql);
  return p.restore(p.text);
}

function balanced(s) {
  let d = 0;
  for (const ch of s) {
    if (ch === "(") d++;
    else if (ch === ")" && --d < 0) return false;
  }
  return d === 0;
}
// '0' and '(0)' are the same default.
function normDefault(v) {
  if (v === null || v === undefined) return null;
  let s = normSql(v);
  while (/^\(.*\)$/.test(s) && balanced(s.slice(1, -1))) s = s.slice(1, -1);
  return s;
}

// A table's SQL split into what each column says and what the table says.
// Each column's whole definition is compared (type, constraints, REFERENCES
// with its actions, GENERATED expression, ON CONFLICT, COLLATE, CHECK), keyed
// by column name, so a column added later by ALTER TABLE still lines up. Two
// definitions that differ only in the order of their constraints count as
// different: a false alarm, never a false pass.
const TABLE_CONSTRAINT = /^(constraint|primary key|unique|check|foreign key)\b/;
function tableClauses(sql) {
  const p = protect(sql || "");
  // DEFAULT (0) and DEFAULT 0 are the same default.
  const s = p.text.replace(/\bdefault\((-?[\w.]+|\u0001\d+\u0001)\)/g, "default $1");
  const open = s.indexOf("(");
  const items = [];
  let d = 0;
  let start = open + 1;
  let end = s.length;
  for (let j = open + 1; j < s.length; j++) {
    if (s[j] === "(") d++;
    else if (s[j] === ")") {
      if (d === 0) {
        end = j;
        break;
      }
      d--;
    } else if (s[j] === "," && d === 0) {
      items.push(s.slice(start, j).trim());
      start = j + 1;
    }
  }
  items.push(s.slice(start, end).trim());
  const columnDefs = new Map();
  const constraints = [];
  for (const it of items.filter(Boolean)) {
    if (TABLE_CONSTRAINT.test(it)) constraints.push(p.restore(it));
    else {
      const sp = it.search(/[\s(]/);
      const name = p
        .restore(sp === -1 ? it : it.slice(0, sp))
        .replace(/^"(.*)"$/, "$1")
        .replace(/""/g, '"')
        .toLowerCase();
      columnDefs.set(name, p.restore(sp === -1 ? "" : it.slice(sp).trim()));
    }
  }
  const tail = s.slice(end + 1);
  return {
    columnDefs,
    constraints: constraints.sort(),
    strict: /\bstrict\b/.test(tail),
    withoutRowid: /\bwithout rowid\b/.test(tail),
  };
}

// Raw rows -> { tables: Map(tbl -> {columns, indexes, clauses}), triggers, views }.
export function model(raw) {
  const tables = new Map();
  const t = (name) => {
    if (!tables.has(name))
      tables.set(name, { columns: new Map(), indexes: new Map(), clauses: null });
    return tables.get(name);
  };
  const triggers = new Map();
  const views = new Map();
  const indexSql = new Map();
  for (const o of raw.objects) {
    if (o.type === "table") t(o.name).clauses = tableClauses(o.sql);
    else if (o.type === "trigger")
      triggers.set(o.name, { tbl: o.tbl, sql: normSql(o.sql) });
    else if (o.type === "view") views.set(o.name, { tbl: null, sql: normSql(o.sql) });
    else if (o.type === "index") indexSql.set(o.name, o.sql);
  }
  for (const c of raw.columns)
    t(c.tbl).columns.set(c.name, {
      type: normSql(c.type),
      nn: Number(c.nn),
      dflt: normDefault(c.dflt),
      pk: Number(c.pk),
      hidden: Number(c.hidden),
    });
  const grouped = new Map();
  for (const r of raw.indexes) {
    const k = `${r.tbl}\u0000${r.idx}`;
    if (!grouped.has(k)) grouped.set(k, { ...r, cols: [] });
    grouped.get(k).cols.push(r);
  }
  for (const g of grouped.values()) {
    const expr = g.cols.some((c) => Number(c.cid) === -2);
    const cols = g.cols
      .sort((a, b) => a.seqno - b.seqno)
      .map(
        (c) =>
          `${Number(c.cid) === -2 ? "<expr>" : c.col} ${Number(c.dsc) ? "desc" : "asc"} ${String(c.coll).toLowerCase()}`,
      )
      .join(",");
    // Auto-indexes (UNIQUE / PRIMARY KEY constraints) are named by position,
    // so they are matched by what they cover; explicit indexes by name.
    const key =
      g.origin === "c"
        ? g.idx
        : `${g.origin === "pk" ? "primary key" : "unique"}(${cols})`;
    const sql = normSql(indexSql.get(g.idx));
    t(g.tbl).indexes.set(key, {
      unique: Number(g.uq),
      cols,
      where: Number(g.partial) && sql ? sql.slice(sql.indexOf(" where ") + 1) : null,
      expr: expr ? sql : null,
    });
  }
  return { tables, triggers, views };
}

const show = (v) => JSON.stringify(v);
function compareFields(where, a, b, fields, problems) {
  for (const [k, label] of fields)
    if (show(a[k]) !== show(b[k]))
      problems.push(
        `${where}: ${label} is ${show(b[k])} live, ${show(a[k])} in the schema files`,
      );
}

// Compare an expected build with a live read (both raw DESCRIBE_SQL rows).
// problems = drift that can break or silently change a write: the check fails.
// notes = harmless differences (a live-only plain index, an allowlisted table).
export function diffSchema(expectedRaw, liveRaw, { ownedElsewhere = {} } = {}) {
  const problems = [];
  const notes = [];
  const exp = model(expectedRaw);
  const got = model(liveRaw);
  for (const [tbl, e] of exp.tables) {
    const l = got.tables.get(tbl);
    if (!l) {
      problems.push(`table ${tbl}: defined in the schema files but missing live`);
      continue;
    }
    for (const [name, c] of e.columns) {
      const lc = l.columns.get(name);
      if (!lc) problems.push(`${tbl}.${name}: in the schema files, missing live`);
      else
        compareFields(
          `${tbl}.${name}`,
          c,
          lc,
          [
            ["type", "type"],
            ["nn", "NOT NULL"],
            ["dflt", "default"],
            ["pk", "primary key"],
            ["hidden", "hidden/generated"],
          ],
          problems,
        );
    }
    for (const [name, lc] of l.columns)
      if (!e.columns.has(name))
        problems.push(
          `${tbl}.${name}: live only (${lc.type}${lc.nn ? " not null" : ""}${
            lc.dflt === null ? "" : " default " + lc.dflt
          }), not in the schema files`,
        );
    for (const [key, ei] of e.indexes) {
      const li = l.indexes.get(key);
      if (!li) problems.push(`${tbl} index ${key}: in the schema files, missing live`);
      else
        compareFields(
          `${tbl} index ${key}`,
          ei,
          li,
          [
            ["unique", "unique"],
            ["cols", "columns"],
            ["where", "partial WHERE"],
            ["expr", "expression"],
          ],
          problems,
        );
    }
    for (const [key, li] of l.indexes)
      if (!e.indexes.has(key)) {
        if (li.unique || li.expr || li.where)
          problems.push(
            `${tbl} ${li.unique ? "unique " : li.expr ? "expression " : "partial "}index ${key}: live only, can reject writes`,
          );
        else notes.push(`${tbl} index ${key}: live only`);
      }
    if (e.clauses && l.clauses) {
      // Fail closed: a column whose definition could not be read on one side
      // is drift, never a silent skip.
      for (const name of new Set([...e.columns.keys(), ...l.columns.keys()]))
        if (e.columns.has(name) && l.columns.has(name)) {
          const k = name.toLowerCase();
          if (!e.clauses.columnDefs.has(k) || !l.clauses.columnDefs.has(k))
            problems.push(
              `${tbl}.${name}: definition could not be read from the table SQL`,
            );
        }
      for (const [name, def] of e.clauses.columnDefs) {
        const ld = l.clauses.columnDefs.get(name);
        if (ld !== undefined && ld !== def)
          problems.push(
            `${tbl}.${name}: definition is ${show(ld)} live, ${show(def)} in the schema files`,
          );
      }
      compareFields(
        tbl,
        e.clauses,
        l.clauses,
        [
          ["constraints", "table constraints"],
          ["strict", "STRICT"],
          ["withoutRowid", "WITHOUT ROWID"],
        ],
        problems,
      );
    }
  }
  for (const tbl of got.tables.keys())
    if (!exp.tables.has(tbl)) {
      if (ownedElsewhere[tbl]) notes.push(`table ${tbl}: live, ${ownedElsewhere[tbl]}`);
      else problems.push(`table ${tbl}: live only, no schema file defines it`);
    }
  for (const [kind, e, l] of [
    ["trigger", exp.triggers, got.triggers],
    ["view", exp.views, got.views],
  ]) {
    for (const [name, o] of e) {
      if (!l.has(name))
        problems.push(`${kind} ${name}: in the schema files, missing live`);
      else if (l.get(name).sql !== o.sql)
        problems.push(`${kind} ${name}: definition differs from the schema files`);
    }
    for (const [name, o] of l)
      if (!e.has(name) && !(o.tbl && ownedElsewhere[o.tbl]))
        problems.push(`${kind} ${name}: live only, not in the schema files`);
  }
  return { problems, notes };
}
