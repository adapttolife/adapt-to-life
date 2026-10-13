// The signing path of /api/waiver: capture first, archive second.
// Offline: in-memory SQLite for D1, a fake Drive behind a mocked fetch, a mock
// mail binding. No real signature, Drive file or email is created.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync } from "node:crypto";
import worker from "../src/index.js";
import { runDriveBacklog } from "../src/waiver.js";
import { sqliteD1, formBindings } from "./helpers/form-db.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const FOLDER = "folder-test";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = JSON.stringify({
  client_email: "sa@example.iam.gserviceaccount.com",
  token_uri: "https://oauth2.example/token",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});

// Fake Drive: files by id; `mode` controls what the next upload does.
let drive;
let originalFetch;
beforeEach(() => {
  drive = { files: new Map(), uploads: 0, lookups: 0, mode: "ok" };
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "https://oauth2.example/token") return Response.json({ access_token: "tok" });
    if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      drive.uploads++;
      if (drive.mode === "down") return new Response("backend error", { status: 503 });
      const text = new TextDecoder("latin1").decode(init.body);
      const name = JSON.parse(text.match(/\r\n\r\n(\{.*?\})\r\n/)[1]).name;
      const id = `file-${drive.files.size + 1}`;
      drive.files.set(id, { id, name });
      // "lost": Drive stored the file, but the response never made it back.
      if (drive.mode === "lost") return new Response("gateway timeout", { status: 504 });
      return Response.json({ id, webViewLink: `https://drive.example/${id}` });
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      drive.lookups++;
      const q = new URL(url).searchParams.get("q");
      const name = q.match(/name = '([^']+)'/)[1];
      assert.match(q, new RegExp(`'${FOLDER}' in parents`));
      return Response.json({ files: [...drive.files.values()].filter((f) => f.name === name).map((f) => ({ id: f.id, webViewLink: `https://drive.example/${f.id}` })) });
    }
    throw new Error("Offline test forbids live network: " + url);
  };
});
afterEach(() => { globalThis.fetch = originalFetch; });

function env(extra = {}) {
  const sent = [];
  const e = {
    WAIVERS_DB: sqliteD1(readFileSync(new URL("../schema/waivers.sql", import.meta.url), "utf8")),
    INTAKE: formBindings().INTAKE,
    AGENT_MAIL_DB: sqliteD1("CREATE TABLE send_failures (id TEXT PRIMARY KEY, ts INTEGER, route TEXT, to_addr TEXT, error TEXT);"),
    SEND_EMAIL: { send: async (m) => { sent.push(m); return { messageId: "offline-" + sent.length }; } },
    TURNSTILE_MODE: "off",
    GOOGLE_SA_JSON: SA,
    WAIVERS_DRIVE_ID: FOLDER,
    ...extra,
  };
  e.sent = sent;
  return e;
}
const sign = (e, body = {}) => worker.fetch(new Request("https://adapttolife.org/api/waiver", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ org: "atl", signer_kind: "adult", name: "Offline Signer", em: "offline@example.com", agree: true, signature: PNG, signature_type: "drawn", ...body }),
}), e);
const row = (e) => e.WAIVERS_DB.sql.prepare("SELECT * FROM waivers").get();
const docRow = (e) => e.WAIVERS_DB.sql.prepare("SELECT * FROM waiver_documents").get();
const count = (e, t) => e.WAIVERS_DB.sql.prepare(`SELECT count(*) n FROM ${t}`).get().n;
const sha = (b) => createHash("sha256").update(b).digest("hex");

test("happy path: row and PDF bytes captured, archived to Drive once, receipt sent", async () => {
  const e = env();
  const res = await sign(e);
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.equal(out.ok, true);
  const r = row(e);
  assert.equal(r.id, out.id);
  assert.equal(r.drive_status, "done");
  assert.equal(r.drive_attempts, 1);
  assert.ok(r.drive_file_id && r.drive_link && r.drive_done_at);
  assert.equal(sha(docRow(e).pdf), r.pdf_sha256, "stored bytes are exactly the hashed PDF");
  assert.equal(drive.uploads, 1);
  assert.equal(drive.lookups, 0, "a fresh id cannot exist in Drive yet, so no lookup at signing");
  assert.equal(e.sent.length, 1);
  assert.equal(e.sent[0].attachments.length, 1);
  assert.equal(e.INTAKE.sql.prepare("SELECT count(*) n FROM intake").get().n, 1);
});

test("Drive down at signing: still ok, durable copy held, backlog archives it exactly once", async () => {
  const e = env();
  drive.mode = "down";
  const out = await (await sign(e)).json();
  assert.equal(out.ok, true, "the release is durable in D1, so the signer is told the truth");
  let r = row(e);
  assert.equal(r.drive_status, "pending");
  assert.equal(r.drive_attempts, 1);
  assert.match(r.drive_error, /503/);
  assert.equal(r.drive_file_id, "");
  assert.equal(sha(docRow(e).pdf), r.pdf_sha256);
  assert.equal(e.sent.length, 1, "receipt still goes out with the PDF");

  // The signer's download link works before Drive has the file.
  const dl = await worker.fetch(new Request(`https://adapttolife.org${out.download}`), e);
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("Content-Type"), "application/pdf");
  assert.equal(sha(new Uint8Array(await dl.arrayBuffer())), r.pdf_sha256);
  const vf = await (await worker.fetch(new Request(`https://adapttolife.org${out.verify}`), e)).json();
  assert.equal(vf.intact, true);

  drive.mode = "ok";
  await runDriveBacklog(e);
  r = row(e);
  assert.equal(r.drive_status, "done");
  assert.equal(r.drive_attempts, 2);
  assert.equal(r.drive_error, null);
  assert.equal(drive.files.size, 1);
  assert.equal(drive.uploads, 2, "one failed attempt at signing, one successful retry");

  await runDriveBacklog(e);
  await runDriveBacklog(e);
  assert.equal(drive.uploads, 2, "a done row is never uploaded again");
  assert.equal(drive.files.size, 1);
  assert.equal(row(e).drive_attempts, 2);
});

test("D1 capture fails: honest 503, no receipt, no Drive upload", async () => {
  const e = env();
  e.WAIVERS_DB.batch = async () => { throw new Error("offline D1 failure"); };
  const res = await sign(e);
  const out = await res.json();
  assert.equal(res.status, 503);
  assert.equal(out.ok, false);
  assert.match(out.error, /try again/);
  assert.equal(e.sent.length, 0);
  assert.equal(drive.uploads, 0);
  assert.equal(e.INTAKE.sql.prepare("SELECT count(*) n FROM intake").get().n, 0);
});

test("PDF store missing (migration not applied): 503 and the audit row rolls back", async () => {
  const e = env();
  e.WAIVERS_DB.sql.exec("DROP TABLE waiver_documents");
  const res = await sign(e);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).ok, false);
  assert.equal(count(e, "waivers"), 0, "no row without its PDF");
  assert.equal(e.sent.length, 0);
});

test("lost Drive response: retry finds the file by name and never files a second copy", async () => {
  const e = env();
  drive.mode = "lost";
  assert.equal((await (await sign(e)).json()).ok, true);
  assert.equal(row(e).drive_status, "pending");
  assert.equal(drive.files.size, 1, "Drive kept the file even though the response was lost");
  drive.mode = "ok";
  await Promise.all([runDriveBacklog(e), runDriveBacklog(e)]);
  const r = row(e);
  assert.equal(r.drive_status, "done");
  assert.equal(r.drive_file_id, [...drive.files.keys()][0]);
  assert.equal(drive.uploads, 1, "found, not re-uploaded");
  assert.equal(drive.files.size, 1);
});

test("stamp lost after upload: a stale claim is recovered by lookup, not re-uploaded", async () => {
  const e = env();
  assert.equal((await (await sign(e)).json()).ok, true);
  const fileId = row(e).drive_file_id;
  // Simulate a Worker that uploaded but died before writing the stamp.
  e.WAIVERS_DB.sql.prepare("UPDATE waivers SET drive_status='uploading', drive_file_id='', drive_link='', drive_done_at=NULL, drive_last_attempt_at='2000-01-01T00:00:00Z'").run();
  await runDriveBacklog(e);
  const r = row(e);
  assert.equal(r.drive_status, "done");
  assert.equal(r.drive_file_id, fileId);
  assert.equal(drive.uploads, 1);
});

test("a fresh in-flight claim is left alone by the cron", async () => {
  const e = env();
  assert.equal((await (await sign(e)).json()).ok, true);
  e.WAIVERS_DB.sql.prepare(`UPDATE waivers SET drive_status='uploading', drive_file_id='', drive_last_attempt_at=?`).run(new Date().toISOString());
  await runDriveBacklog(e);
  assert.equal(row(e).drive_status, "uploading");
  assert.equal(drive.lookups, 0);
});

test("attempt cap: the row becomes failed, keeps its bytes, and stops retrying", async () => {
  const e = env();
  drive.mode = "down";
  await sign(e);
  e.WAIVERS_DB.sql.prepare("UPDATE waivers SET drive_attempts = 19").run();
  await runDriveBacklog(e);
  let r = row(e);
  assert.equal(r.drive_status, "failed");
  assert.equal(r.drive_attempts, 20);
  const before = drive.uploads;
  await runDriveBacklog(e);
  assert.equal(drive.uploads, before);
  assert.equal(count(e, "waiver_documents"), 1, "a failed archive never loses the captured PDF");
});

test("retention: the D1 copy is deleted only 30 days after Drive confirmed the file", async () => {
  const e = env();
  await sign(e);
  await runDriveBacklog(e);
  assert.equal(count(e, "waiver_documents"), 1, "kept while recent");
  e.WAIVERS_DB.sql.prepare("UPDATE waivers SET drive_done_at = '2000-01-01T00:00:00Z'").run();
  await runDriveBacklog(e);
  assert.equal(count(e, "waiver_documents"), 0);
  // A pending row is never purged however old.
  drive.mode = "down";
  await sign(e, { em: "second@example.com" });
  e.WAIVERS_DB.sql.prepare("UPDATE waivers SET drive_done_at = '2000-01-01T00:00:00Z', drive_attempts = 5 WHERE drive_status = 'pending'").run();
  await runDriveBacklog(e);
  assert.equal(count(e, "waiver_documents"), 1);
});

test("receipt failure stays best-effort and is recorded", async () => {
  const e = env({ SEND_EMAIL: { send: async () => { throw new Error("offline mail failure"); } } });
  const out = await (await sign(e)).json();
  assert.equal(out.ok, true);
  const f = e.AGENT_MAIL_DB.sql.prepare("SELECT route, to_addr FROM send_failures").all();
  assert.deepEqual(f.map((x) => [x.route, x.to_addr]), [["receipt:waiver", "offline@example.com"]]);
});

test("Drive unconfigured: capture still succeeds and the row is owed, not lost", async () => {
  const e = env({ GOOGLE_SA_JSON: "", WAIVERS_DRIVE_ID: "" });
  assert.equal((await (await sign(e)).json()).ok, true);
  assert.equal(row(e).drive_status, "pending");
  assert.match(row(e).drive_error, /not configured/);
  assert.equal(count(e, "waiver_documents"), 1);
});

test("the live-database migration upgrades the old schema and marks legacy rows honestly", () => {
  const db = sqliteD1(`CREATE TABLE waivers (id TEXT PRIMARY KEY, org TEXT NOT NULL, waiver_version TEXT NOT NULL, signer_name TEXT NOT NULL, signer_email TEXT NOT NULL, signed_at TEXT NOT NULL, signature_type TEXT, signer_kind TEXT, minor_name TEXT, relationship TEXT, program TEXT, consent INTEGER NOT NULL DEFAULT 1, ip TEXT, user_agent TEXT, country TEXT, region TEXT, city TEXT, doc_sha256 TEXT, pdf_sha256 TEXT, drive_file_id TEXT, drive_link TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO waivers (id,org,waiver_version,signer_name,signer_email,signed_at,drive_file_id) VALUES ('a','atl','v','A','a@x','t','f1'),('b','atl','v','B','b@x','t','');`);
  db.sql.exec(readFileSync(new URL("../schema/migrations/2026-10-03-waiver-capture-first.sql", import.meta.url), "utf8"));
  const rows = db.sql.prepare("SELECT id, drive_status FROM waivers ORDER BY id").all().map((r) => [r.id, r.drive_status]);
  assert.deepEqual(rows, [["a", "done"], ["b", "unrecoverable"]]);
  assert.equal(db.sql.prepare("SELECT count(*) n FROM waiver_documents").get().n, 0);
});
