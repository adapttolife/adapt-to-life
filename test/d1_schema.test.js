// The D1 drift check (scripts/lib/d1-schema.mjs): every database's schema
// files build, and diffSchema catches the kinds of drift that break a write.
// Offline: no live database is read here (scripts/check-d1-schema.mjs does that).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  D1_SCHEMAS,
  buildExpected,
  diffSchema,
  COLUMNS_SQL,
  INDEXES_SQL,
} from "../scripts/lib/d1-schema.mjs";

const read = (sql) => {
  const db = new DatabaseSync(":memory:");
  db.exec(sql);
  return {
    columns: db.prepare(COLUMNS_SQL).all(),
    indexes: db.prepare(INDEXES_SQL).all(),
  };
};
const BASE = `CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT NOT NULL, b INTEGER DEFAULT 0);
CREATE INDEX t_a ON t(a);`;

for (const name of Object.keys(D1_SCHEMAS)) {
  test(`${name}: its schema files build a database`, () => {
    const { columns } = buildExpected(name);
    assert.ok(columns.length > 0);
  });
}

test("identical shapes have no problems, and column order is ignored", () => {
  const live =
    read(`CREATE TABLE t (b INTEGER DEFAULT 0, id TEXT PRIMARY KEY, a TEXT NOT NULL);
CREATE INDEX t_a ON t(a);`);
  assert.deepEqual(diffSchema(read(BASE), live).problems, []);
});

test("a live-only NOT NULL column (the r2_key outage) is a problem", () => {
  const live =
    read(`CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT NOT NULL, b INTEGER DEFAULT 0, r2_key TEXT NOT NULL);
CREATE INDEX t_a ON t(a);`);
  assert.deepEqual(diffSchema(read(BASE), live).problems, [
    "t.r2_key: live only (TEXT NOT NULL), not in the schema files",
  ]);
});

test("missing columns, tables and indexes, and changed constraints are problems", () => {
  const expected = read(BASE + "\nCREATE TABLE u (x TEXT);");
  const live = read(
    `CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT, b INTEGER DEFAULT 1);`,
  );
  assert.deepEqual(diffSchema(expected, live).problems.sort(), [
    "index t_a on t: missing live",
    "t.a: NOT NULL is 0 live, 1 in the schema files",
    't.b: default is "1" live, "0" in the schema files',
    "table u: defined in the schema files but missing live",
  ]);
});

test("live tables no schema file defines are notes, not problems", () => {
  const live = read(
    BASE + "\nCREATE TABLE intake (id TEXT); CREATE TABLE stray (id TEXT);",
  );
  const out = diffSchema(read(BASE), live, { ownedElsewhere: ["intake"] });
  assert.deepEqual(out.problems, []);
  assert.deepEqual(out.notes, [
    "table intake: live, owned by another worker (expected)",
    "table stray: live only, no schema file defines it",
  ]);
});
