// The D1 drift check (scripts/lib/d1-schema.mjs): every database's schema
// files build, and diffSchema catches every kind of drift that can break or
// silently change a write. Offline: no live database is read here
// (scripts/check-d1-schema.mjs does that).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  D1_SCHEMAS,
  OWNED_ELSEWHERE,
  buildExpected,
  describeLocal,
  diffSchema,
} from "../scripts/lib/d1-schema.mjs";

const read = (sql) => {
  const db = new DatabaseSync(":memory:");
  db.exec(sql);
  return describeLocal(db);
};
const BASE = `CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT NOT NULL, b INTEGER DEFAULT 0);
CREATE INDEX t_a ON t(a);`;
const diff = (live, expected = BASE, opts) =>
  diffSchema(read(expected), read(live), opts);

for (const name of Object.keys(D1_SCHEMAS)) {
  test(`${name}: its schema files build a database`, () => {
    assert.ok(buildExpected(name).columns.length > 0);
  });
}

test("the same shape passes, whatever the column order, quoting or spacing", () => {
  const live = `CREATE TABLE "t" (b INTEGER DEFAULT (0), id TEXT PRIMARY KEY,  a TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS t_a ON t (a);`;
  assert.deepEqual(diff(live), { problems: [], notes: [] });
});

test("a live-only NOT NULL column (the r2_key outage) fails", () => {
  const live = BASE.replace("DEFAULT 0", "DEFAULT 0, r2_key TEXT NOT NULL");
  assert.deepEqual(diff(live).problems, [
    "t.r2_key: live only (text not null), not in the schema files",
  ]);
});

test("missing columns, tables and indexes, and changed constraints fail", () => {
  const expected = BASE + "\nCREATE TABLE u (x TEXT);";
  const live = `CREATE TABLE t (id TEXT PRIMARY KEY, a TEXT, b INTEGER DEFAULT 1);`;
  assert.deepEqual(diff(live, expected).problems.sort(), [
    "t index t_a: in the schema files, missing live",
    "t.a: NOT NULL is 0 live, 1 in the schema files",
    't.a: definition is "text" live, "text not null" in the schema files',
    't.b: default is "1" live, "0" in the schema files',
    't.b: definition is "integer default 1" live, "integer default 0" in the schema files',
    "table u: defined in the schema files but missing live",
  ]);
});

test("a live-only UNIQUE index fails (it can reject a second signing); a plain one is a note", () => {
  const unique = diff(BASE + "\nCREATE UNIQUE INDEX t_once ON t(a);");
  assert.deepEqual(unique.problems, [
    "t unique index t_once: live only, can reject writes",
  ]);
  const plain = diff(BASE + "\nCREATE INDEX t_b ON t(b);");
  assert.deepEqual(plain, { problems: [], notes: ["t index t_b: live only"] });
});

test("an inline UNIQUE constraint the schema files lack fails", () => {
  const live = BASE.replace("a TEXT NOT NULL", "a TEXT NOT NULL UNIQUE");
  assert.deepEqual(diff(live).problems, [
    "t unique index unique(a asc binary): live only, can reject writes",
    't.a: definition is "text not null unique" live, "text not null" in the schema files',
  ]);
});

test("an index with the right name on the wrong columns, or a different WHERE, fails", () => {
  const cols = diff(BASE.replace("ON t(a)", "ON t(b)"));
  assert.deepEqual(cols.problems, [
    't index t_a: columns is "b asc binary" live, "a asc binary" in the schema files',
  ]);
  const partial = diff(BASE.replace("ON t(a)", "ON t(a) WHERE b > 0"));
  assert.equal(partial.problems.length, 1);
  assert.match(partial.problems[0], /partial WHERE/);
});

test("CHECK, REFERENCES, STRICT and generated columns are compared", () => {
  assert.match(
    diff(BASE.replace("DEFAULT 0", "DEFAULT 0 CHECK (b >= 0)")).problems.join(),
    /t\.b: definition/,
  );
  const withFk = `CREATE TABLE p (id TEXT PRIMARY KEY);
CREATE TABLE c (id TEXT PRIMARY KEY, p TEXT REFERENCES p(id));`;
  assert.match(
    diff(withFk.replace(" REFERENCES p(id)", ""), withFk).problems.join(),
    /c\.p: definition/,
  );
  assert.match(
    diff(BASE.replace(");\nCREATE", ") STRICT;\nCREATE")).problems.join(),
    /STRICT/,
  );
  const gen = BASE.replace(
    "DEFAULT 0",
    "DEFAULT 0, g TEXT GENERATED ALWAYS AS (a) VIRTUAL",
  );
  assert.match(diff(gen).problems.join(), /t\.g: live only/);
});

test("triggers and views must match by definition", () => {
  const trig = `\nCREATE TRIGGER t_no_delete BEFORE DELETE ON t BEGIN SELECT RAISE(ABORT, 'no'); END;`;
  assert.deepEqual(diff(BASE + trig).problems, [
    "trigger t_no_delete: live only, not in the schema files",
  ]);
  assert.deepEqual(diff(BASE, BASE + trig).problems, [
    "trigger t_no_delete: in the schema files, missing live",
  ]);
  assert.deepEqual(diff(BASE + trig.replace("'no'", "'nope'"), BASE + trig).problems, [
    "trigger t_no_delete: definition differs from the schema files",
  ]);
  assert.deepEqual(diff(BASE + trig, BASE + trig), { problems: [], notes: [] });
});

test("an unknown live table fails; an allowlisted one is a note", () => {
  const live = BASE + "\nCREATE TABLE intake (id TEXT); CREATE TABLE stray (id TEXT);";
  const out = diff(live, BASE, {
    ownedElsewhere: { intake: "another worker's table" },
  });
  assert.deepEqual(out.problems, ["table stray: live only, no schema file defines it"]);
  assert.deepEqual(out.notes, ["table intake: live, another worker's table"]);
});

test("atl-intake: the ASNM mail ledger (0028_mail_ledger.sql) is a note, not a failure", () => {
  // The exact tables the adaptivesportsnearme repo adds to atl-intake.
  const asnm = `CREATE TABLE IF NOT EXISTS send_failures (
    id TEXT PRIMARY KEY, ts INTEGER NOT NULL, route TEXT NOT NULL, to_addr TEXT, error TEXT);
  CREATE INDEX IF NOT EXISTS idx_send_failures_ts ON send_failures(ts);
  CREATE TABLE IF NOT EXISTS resend_events (svix_id TEXT PRIMARY KEY, received_at TEXT NOT NULL,
    type TEXT NOT NULL, email_id TEXT, kind TEXT, env TEXT);
  CREATE INDEX IF NOT EXISTS idx_resend_events_email ON resend_events(email_id);`;
  const live = new DatabaseSync(":memory:");
  live.exec(
    readFileSync(new URL("../src/schema_intake_delivery.sql", import.meta.url), "utf8"),
  );
  live.exec(
    "CREATE TABLE intake (id TEXT PRIMARY KEY); CREATE TABLE newsletter_delivery_claims (id TEXT); CREATE TABLE newsletter_send_receipts (id TEXT);",
  );
  live.exec(asnm);
  const out = diffSchema(buildExpected("atl-intake"), describeLocal(live), {
    ownedElsewhere: OWNED_ELSEWHERE["atl-intake"],
  });
  assert.deepEqual(out.problems, []);
  assert.ok(
    out.notes.some((n) =>
      n.startsWith("table send_failures: live, the adaptivesportsnearme repo"),
    ),
  );
  assert.ok(
    out.notes.some((n) =>
      n.startsWith("table resend_events: live, the adaptivesportsnearme repo"),
    ),
  );
  // Without the allowlist entry the release gate would stop on it.
  assert.ok(
    diffSchema(buildExpected("atl-intake"), describeLocal(live)).problems.some((p) =>
      p.startsWith("table send_failures: live only"),
    ),
  );
});

test("string literals keep their case and content; comments outside them do not count", () => {
  const exp = `CREATE TABLE t (id TEXT PRIMARY KEY, s TEXT DEFAULT 'ABC', u TEXT DEFAULT 'a--b');`;
  assert.deepEqual(diff(exp.replace("'ABC'", "'abc'"), exp).problems, [
    `t.s: default is "'abc'" live, "'ABC'" in the schema files`,
    `t.s: definition is "text default 'abc'" live, "text default 'ABC'" in the schema files`,
  ]);
  assert.match(
    diff(exp.replace("'a--b'", "'a'"), exp).problems.join(),
    /t\.u: default/,
  );
  const dq = (v) => `CREATE TABLE t (id TEXT PRIMARY KEY, s TEXT DEFAULT "${v}");`;
  assert.match(
    diff(dq("abc"), dq("ABC")).problems.join(),
    /t\.s: (default|definition)/,
  );
  const commented = exp.replace("PRIMARY KEY,", "PRIMARY KEY, -- the id\n");
  assert.deepEqual(diff(commented, exp), { problems: [], notes: [] });
  const trig = (msg) =>
    `${exp}\nCREATE TRIGGER t_no BEFORE DELETE ON t BEGIN SELECT RAISE(ABORT, '${msg}'); END;`;
  assert.deepEqual(diff(trig("No"), trig("no")).problems, [
    "trigger t_no: definition differs from the schema files",
  ]);
});

test("foreign keys are compared to the end of the clause", () => {
  const P = "CREATE TABLE p (id TEXT PRIMARY KEY);\n";
  const fk = (ref) => `${P}CREATE TABLE c (id TEXT PRIMARY KEY, p TEXT ${ref});`;
  const cases = [
    ["REFERENCES p", "REFERENCES p(id)"],
    ["REFERENCES p(id)", "REFERENCES p(id) ON DELETE CASCADE"],
    ["REFERENCES p(id)", "REFERENCES p(id) DEFERRABLE INITIALLY DEFERRED"],
    ["REFERENCES p(id)", "REFERENCES p(id) MATCH SIMPLE"],
  ];
  for (const [a, b] of cases)
    assert.match(
      diff(fk(b), fk(a)).problems.join(),
      /c\.p: definition/,
      `${a} vs ${b}`,
    );
  assert.deepEqual(diff(fk("REFERENCES p (id)"), fk("references p(id)")), {
    problems: [],
    notes: [],
  });
});

test("a foreign key, generated expression or ON CONFLICT policy on a different column or with a different value fails", () => {
  const P = "CREATE TABLE p (id TEXT PRIMARY KEY);\n";
  const moved = diff(
    `${P}CREATE TABLE c (a TEXT, b TEXT REFERENCES p(id));`,
    `${P}CREATE TABLE c (a TEXT REFERENCES p(id), b TEXT);`,
  ).problems.join();
  assert.match(moved, /c\.a: definition/);
  assert.match(moved, /c\.b: definition/);
  const gen = (x) =>
    `CREATE TABLE g (a INTEGER, b INTEGER, s INTEGER GENERATED ALWAYS AS (${x}) STORED);`;
  assert.match(diff(gen("b"), gen("a")).problems.join(), /g\.s: definition/);
  const oc = (x) => `CREATE TABLE o (a TEXT NOT NULL ON CONFLICT ${x});`;
  assert.match(diff(oc("IGNORE"), oc("ABORT")).problems.join(), /o\.a: definition/);
});

test("fails closed on odd names and live-only expression indexes", () => {
  const exprIdx = diff(
    "CREATE TABLE t (n INTEGER);\nCREATE INDEX t_abs ON t(abs(n));",
    "CREATE TABLE t (n INTEGER);",
  );
  assert.deepEqual(exprIdx.problems, [
    "t expression index t_abs: live only, can reject writes",
  ]);
  const quoted = (g) =>
    `CREATE TABLE q ("null" TEXT, g TEXT GENERATED ALWAYS AS (${g}) STORED);`;
  assert.match(
    diff(quoted("NULL"), quoted('"null"')).problems.join(),
    /q\.g: definition/,
  );
  const proto = (n) =>
    `CREATE TABLE p ("__proto__" TEXT CHECK(length("__proto__") <= ${n}));`;
  assert.match(diff(proto(50), proto(5)).problems.join(), /p\.__proto__: definition/);
  const comma = diff(
    "CREATE TABLE c ([a,b] TEXT CHECK(length([a,b]) <= 50));",
    'CREATE TABLE c ("a,b" TEXT CHECK(length("a,b") <= 5));',
  );
  assert.match(comma.problems.join(), /c\.a,b: definition/);
});
