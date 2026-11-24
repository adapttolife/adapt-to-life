// The signing path of /api/waiver: capture first, archive second.
// Offline: in-memory SQLite for D1, a fake Drive behind a mocked fetch, a mock
// mail binding. No real signature, Drive file or email is created.
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync } from "node:crypto";
import worker from "../src/index.js";
import { runDriveBacklog, sendReceiptEmail } from "../src/waiver.js";
import { sqliteD1, formBindings } from "./helpers/form-db.js";
import { readdirSync } from "node:fs";
import { buildExpected, describeLocal, diffSchema } from "../scripts/lib/d1-schema.mjs";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const FOLDER = "folder-test";
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const SA = JSON.stringify({
  client_email: "sa@example.iam.gserviceaccount.com",
  token_uri: "https://oauth2.example/token",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
});

// Fake Drive: files by id; `mode` controls what the next upload does.
let drive;
let gmail; // raw MIME of each message the mocked Gmail API accepted
let originalFetch;
beforeEach(() => {
  drive = {
    files: new Map(),
    uploads: 0,
    lookups: 0,
    downloads: 0,
    jwtClaims: [],
    mode: "ok",
  };
  gmail = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === "https://oauth2.example/token") {
      const assertion = new URLSearchParams(String(init.body || "")).get("assertion");
      if (assertion) {
        const [, payload] = assertion.split(".");
        drive.jwtClaims.push(
          JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
        );
      }
      return Response.json({ access_token: "tok" });
    }
    if (url === "https://oauth2.googleapis.com/token")
      return Response.json({ access_token: "gmail-tok", token_type: "Bearer" });
    if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
      gmail.push(
        Buffer.from(JSON.parse(init.body).raw, "base64url").toString("latin1"),
      );
      return Response.json({ id: "gm-" + gmail.length, threadId: "t" });
    }
    if (url.startsWith("https://www.googleapis.com/upload/drive/v3/files")) {
      drive.uploads++;
      if (drive.mode === "down") return new Response("backend error", { status: 503 });
      if (drive.mode === "notfound")
        return Response.json(
          { error: { code: 404, message: `File not found: ${FOLDER}.` } },
          { status: 404 },
        );
      if (drive.mode === "quota")
        return Response.json(
          {
            error: {
              code: 403,
              message:
                "Service Accounts do not have storage quota. Leverage shared drives, or use OAuth delegation.",
              errors: [{ reason: "storageQuotaExceeded" }],
            },
          },
          { status: 403 },
        );
      const raw = new Uint8Array(init.body);
      const text = new TextDecoder("latin1").decode(raw);
      const name = JSON.parse(text.match(/\r\n\r\n(\{.*?\})\r\n/)[1]).name;
      const pdfMarker = "Content-Type: application/pdf\r\n\r\n";
      const pdfStart = text.indexOf(pdfMarker) + pdfMarker.length;
      const pdfEnd = text.lastIndexOf("\r\n--atlbnd");
      const bytes = raw.slice(pdfStart, pdfEnd);
      const id = `file-${drive.files.size + 1}`;
      drive.files.set(id, { id, name, bytes });
      // "lost": Drive stored the file, but the response never made it back.
      if (drive.mode === "lost")
        return new Response("gateway timeout", { status: 504 });
      return Response.json({ id, webViewLink: `https://drive.example/${id}` });
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files?")) {
      drive.lookups++;
      const q = new URL(url).searchParams.get("q");
      const name = q.match(/name = '([^']+)'/)[1];
      assert.match(q, new RegExp(`'${FOLDER}' in parents`));
      return Response.json({
        files: [...drive.files.values()]
          .filter((f) => f.name === name)
          .map((f) => ({ id: f.id, webViewLink: `https://drive.example/${f.id}` })),
      });
    }
    if (url.startsWith("https://www.googleapis.com/drive/v3/files/")) {
      drive.downloads++;
      const parsed = new URL(url);
      assert.equal(parsed.searchParams.get("alt"), "media");
      assert.equal(
        parsed.searchParams.get("supportsAllDrives"),
        "true",
        "Drive media fetch must pass supportsAllDrives=true",
      );
      if (drive.mode === "down") return new Response("backend error", { status: 503 });
      const fileId = decodeURIComponent(
        parsed.pathname.slice("/drive/v3/files/".length),
      );
      const found = drive.files.get(fileId);
      if (!found) return new Response("not found", { status: 404 });
      return new Response(found.bytes, {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      });
    }
    throw new Error("Offline test forbids live network: " + url);
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function env(extra = {}) {
  const sent = [];
  const e = {
    WAIVERS_DB: sqliteD1(
      readFileSync(new URL("../schema/waivers.sql", import.meta.url), "utf8"),
    ),
    INTAKE: formBindings().INTAKE,
    AGENT_MAIL_DB: sqliteD1(
      "CREATE TABLE send_failures (id TEXT PRIMARY KEY, ts INTEGER, route TEXT, to_addr TEXT, error TEXT);",
    ),
    SEND_EMAIL: {
      send: async (m) => {
        sent.push(m);
        return { messageId: "offline-" + sent.length };
      },
    },
    TURNSTILE_MODE: "off",
    GOOGLE_SA_JSON: SA,
    WAIVERS_DRIVE_ID: FOLDER,
    ...extra,
  };
  e.sent = sent;
  return e;
}
const sign = (e, body = {}) =>
  worker.fetch(
    new Request("https://adapttolife.org/api/waiver", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        org: "atl",
        signer_kind: "adult",
        name: "Offline Signer",
        em: "offline@example.com",
        agree: true,
        signature: PNG,
        signature_type: "drawn",
        ...body,
      }),
    }),
    e,
  );
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
  assert.equal(
    sha(docRow(e).pdf),
    r.pdf_sha256,
    "stored bytes are exactly the hashed PDF",
  );
  assert.equal(drive.uploads, 1);
  assert.equal(
    drive.lookups,
    0,
    "a fresh id cannot exist in Drive yet, so no lookup at signing",
  );
  assert.equal(e.sent.length, 1);
  assert.equal(e.sent[0].attachments.length, 1);
  assert.equal(e.INTAKE.sql.prepare("SELECT count(*) n FROM intake").get().n, 1);
});

test("Drive down at signing: still ok, durable copy held, backlog archives it exactly once", async () => {
  const e = env();
  drive.mode = "down";
  const out = await (await sign(e)).json();
  assert.equal(
    out.ok,
    true,
    "the release is durable in D1, so the signer is told the truth",
  );
  let r = row(e);
  assert.equal(r.drive_status, "pending");
  assert.equal(r.drive_attempts, 1);
  assert.match(r.drive_error, /503/);
  assert.equal(r.drive_file_id, "");
  assert.equal(sha(docRow(e).pdf), r.pdf_sha256);
  assert.equal(e.sent.length, 1, "receipt still goes out with the PDF");

  // The signer's download link works before Drive has the file.
  const dl = await worker.fetch(
    new Request(`https://adapttolife.org${out.download}`),
    e,
  );
  assert.equal(dl.status, 200);
  assert.equal(dl.headers.get("Content-Type"), "application/pdf");
  assert.equal(sha(new Uint8Array(await dl.arrayBuffer())), r.pdf_sha256);
  const vf = await (
    await worker.fetch(new Request(`https://adapttolife.org${out.verify}`), e)
  ).json();
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
  e.WAIVERS_DB.batch = async () => {
    throw new Error("offline D1 failure");
  };
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
  assert.equal(
    drive.files.size,
    1,
    "Drive kept the file even though the response was lost",
  );
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
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE waivers SET drive_status='uploading', drive_file_id='', drive_link='', drive_done_at=NULL, drive_last_attempt_at='2000-01-01T00:00:00Z'",
    )
    .run();
  await runDriveBacklog(e);
  const r = row(e);
  assert.equal(r.drive_status, "done");
  assert.equal(r.drive_file_id, fileId);
  assert.equal(drive.uploads, 1);
});

test("a fresh in-flight claim is left alone by the cron", async () => {
  const e = env();
  assert.equal((await (await sign(e)).json()).ok, true);
  e.WAIVERS_DB.sql
    .prepare(
      `UPDATE waivers SET drive_status='uploading', drive_file_id='', drive_last_attempt_at=?`,
    )
    .run(new Date().toISOString());
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
  assert.equal(
    count(e, "waiver_documents"),
    1,
    "a failed archive never loses the captured PDF",
  );
});

test("retention: the D1 copy is deleted only 30 days after Drive confirmed the file", async () => {
  const e = env();
  await sign(e);
  await runDriveBacklog(e);
  assert.equal(count(e, "waiver_documents"), 1, "kept while recent");
  e.WAIVERS_DB.sql
    .prepare("UPDATE waivers SET drive_done_at = '2000-01-01T00:00:00Z'")
    .run();
  await runDriveBacklog(e);
  assert.equal(count(e, "waiver_documents"), 0);
  // A pending row is never purged however old.
  drive.mode = "down";
  await sign(e, { em: "second@example.com" });
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE waivers SET drive_done_at = '2000-01-01T00:00:00Z', drive_attempts = 5 WHERE drive_status = 'pending'",
    )
    .run();
  await runDriveBacklog(e);
  assert.equal(count(e, "waiver_documents"), 1);
});

test("receipt failure stays best-effort and is recorded", async () => {
  const e = env({
    SEND_EMAIL: {
      send: async () => {
        throw new Error("offline mail failure");
      },
    },
  });
  const out = await (await sign(e)).json();
  assert.equal(out.ok, true);
  const f = e.AGENT_MAIL_DB.sql
    .prepare("SELECT route, to_addr FROM send_failures")
    .all();
  assert.deepEqual(
    f.map((x) => [x.route, x.to_addr]),
    [["receipt:waiver", "offline@example.com"]],
  );
});

const GMAIL = {
  MAIL_TRANSPORT: "gmail",
  GMAIL_FROM: "hello@adapttolife.org",
  GMAIL_CLIENT_ID: "test-client",
  GMAIL_CLIENT_SECRET: "test-secret",
  GMAIL_REFRESH_TOKEN: "test-refresh",
};
const failures = (e) =>
  e.AGENT_MAIL_DB.sql
    .prepare("SELECT route, to_addr, error FROM send_failures")
    .all()
    .map((r) => ({ ...r }));

// Nov 23 2026 incident: every receipt on the Gmail transport threw
// "Attachment must contain bytes" because the PDF went as a base64 string.
test("Gmail transport: the receipt goes out with the signed PDF attached", async () => {
  const e = env(GMAIL);
  const out = await (await sign(e)).json();
  assert.equal(out.ok, true);
  assert.equal(e.sent.length, 0, "Cloudflare binding not used");
  assert.equal(gmail.length, 1);
  assert.deepEqual(failures(e), []);
  const mime = gmail[0];
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /To: offline@example.com/);
  assert.match(mime, /Bcc: hello@adapttolife.org/);
  const m = mime.match(
    /Content-Type: application\/pdf\r\nContent-Disposition: attachment; filename\*=UTF-8''adapt-to-life-release\.pdf\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/,
  );
  assert.ok(m, "PDF part present");
  const pdf = Buffer.from(m[1].replace(/\r\n/g, ""), "base64");
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal(sha(pdf), row(e).pdf_sha256, "the attached PDF is the captured one");
});

test("Cloudflare transport: the receipt PDF goes as bytes, not a base64 string", async () => {
  const e = env();
  await sign(e);
  const att = e.sent[0].attachments[0];
  assert.ok(att.content instanceof ArrayBuffer);
  assert.equal(sha(new Uint8Array(att.content)), row(e).pdf_sha256);
});

test("receipt with empty PDF bytes: sent without the attachment, never throws", async () => {
  const doc = { org: "Adapt To Life", title: "Release" };
  for (const pdfBytes of [new Uint8Array(0), undefined]) {
    const e = env(GMAIL);
    gmail = [];
    await sendReceiptEmail(e, {
      to: "offline@example.com",
      pdfBytes,
      name: "Offline Signer",
      doc,
    });
    assert.equal(gmail.length, 1);
    assert.doesNotMatch(gmail[0], /multipart\/mixed|application\/pdf/);
    const plain = Buffer.from(
      gmail[0]
        .match(
          /text\/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/,
        )[1]
        .replace(/\r\n/g, ""),
      "base64",
    ).toString();
    assert.doesNotMatch(plain, /attached/, "never claims an attachment it lacks");
    assert.match(plain, /on file/);
    assert.deepEqual(failures(e), [
      {
        route: "receipt:waiver",
        to_addr: "offline@example.com",
        error: "sent without the signed PDF: no PDF bytes",
      },
    ]);
    const c = env();
    await sendReceiptEmail(c, {
      to: "offline@example.com",
      pdfBytes,
      name: "Offline Signer",
      doc,
    });
    assert.equal(c.sent.length, 1);
    assert.equal(c.sent[0].attachments, undefined);
  }
});

test("Drive 404 (folder not visible): signing still ok, failure recorded once, no PII", async () => {
  drive.mode = "notfound";
  const e = env(GMAIL);
  const logged = [];
  const origError = console.error;
  console.error = (...a) => logged.push(a.map(String).join(" "));
  let res;
  try {
    res = await sign(e);
  } finally {
    console.error = origError;
  }
  const out = await res.json();
  assert.equal(res.status, 200);
  assert.equal(out.ok, true);
  assert.equal(row(e).drive_status, "pending", "owed to the backlog");
  assert.equal(count(e, "waiver_documents"), 1, "bytes kept");
  assert.equal(gmail.length, 1, "receipt still sent");
  const line = `waiver Drive archive failed: folder not visible to service account (404) id=${out.id} attempt=1`;
  assert.ok(logged.includes(line), logged.join("\n"));
  assert.deepEqual(failures(e), [
    { route: "archive:waiver", to_addr: `waiver:${out.id}`, error: line },
  ]);
  for (const l of logged.filter((l) => l.includes("Drive archive")))
    assert.ok(!/offline|Offline|folder-test/.test(l), l);
  // A backlog retry below the cap does not add another failure row.
  e.WAIVERS_DB.sql
    .prepare("UPDATE waivers SET drive_last_attempt_at = '2000-01-01T00:00:00Z'")
    .run();
  console.error = () => {};
  try {
    await runDriveBacklog(e);
  } finally {
    console.error = origError;
  }
  assert.equal(row(e).drive_attempts, 2);
  assert.equal(failures(e).length, 1);
});

async function quietly(fn) {
  const logged = [];
  const origError = console.error;
  console.error = (...a) => logged.push(a.map(String).join(" "));
  try {
    await fn();
  } finally {
    console.error = origError;
  }
  return logged;
}

test("Drive passing error (503) at signing: logged, not recorded; recorded only at the retry cap", async () => {
  drive.mode = "down";
  const e = env();
  let out;
  const logged = await quietly(async () => (out = await (await sign(e)).json()));
  assert.equal(out.ok, true);
  assert.ok(
    logged.includes(
      `waiver Drive archive failed: Drive returned 503 id=${out.id} attempt=1`,
    ),
    logged.join("\n"),
  );
  assert.deepEqual(failures(e), []);
  e.WAIVERS_DB.sql
    .prepare(
      "UPDATE waivers SET drive_attempts = 19, drive_last_attempt_at = '2000-01-01T00:00:00Z'",
    )
    .run();
  await quietly(() => runDriveBacklog(e));
  assert.equal(row(e).drive_status, "failed");
  assert.deepEqual(
    failures(e).map((f) => f.error),
    [`waiver Drive archive failed: Drive returned 503 id=${out.id} attempt=20`],
  );
});

test("Drive token failure: the reason is named without Google's response body; staging is tagged", async () => {
  const e = env({ STAGING: "1" });
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    String(input) === "https://oauth2.example/token"
      ? Response.json({
          error: "invalid_grant",
          error_description: "secret-ish detail",
        })
      : realFetch(input, init);
  let out;
  const logged = await quietly(async () => (out = await (await sign(e)).json()));
  assert.equal(out.ok, true);
  const line = `waiver Drive archive failed: service account token exchange failed id=${out.id} attempt=1 env=staging`;
  assert.ok(logged.includes(line), logged.join("\n"));
  assert.deepEqual(failures(e), [
    { route: "archive:waiver", to_addr: `waiver:${out.id}`, error: line },
  ]);
  assert.ok(
    !logged.some((l) => l.includes("Drive archive") && l.includes("invalid_grant")),
  );
});

test("Drive unconfigured: capture still succeeds and the row is owed, not lost", async () => {
  const e = env({ GOOGLE_SA_JSON: "", WAIVERS_DRIVE_ID: "" });
  assert.equal((await (await sign(e)).json()).ok, true);
  assert.equal(row(e).drive_status, "pending");
  assert.match(row(e).drive_error, /not configured/);
  assert.equal(count(e, "waiver_documents"), 1);
});

test("WAIVERS_DRIVE_SUBJECT sets JWT sub for Domain-Wide Delegation; omitted leaves sub unset", async () => {
  const withSub = env({ WAIVERS_DRIVE_SUBJECT: "alec@alecability.com" });
  assert.equal((await (await sign(withSub)).json()).ok, true);
  assert.equal(drive.jwtClaims.length, 1);
  assert.equal(drive.jwtClaims[0].sub, "alec@alecability.com");

  drive.jwtClaims = [];
  const noSub = env();
  assert.equal((await (await sign(noSub)).json()).ok, true);
  assert.equal(drive.jwtClaims.length, 1);
  assert.equal("sub" in drive.jwtClaims[0], false);
});

test("Drive 403 storageQuotaExceeded: names My Drive quota issue without leaking Google body", async () => {
  drive.mode = "quota";
  const e = env();
  let out;
  const logged = await quietly(async () => (out = await (await sign(e)).json()));
  assert.equal(out.ok, true);
  const line = `waiver Drive archive failed: service account has no My Drive storage quota; set WAIVERS_DRIVE_SUBJECT or use a Shared Drive (403) id=${out.id} attempt=1`;
  assert.ok(logged.includes(line), logged.join("\n"));
  assert.deepEqual(failures(e), [
    { route: "archive:waiver", to_addr: `waiver:${out.id}`, error: line },
  ]);
  assert.ok(
    !logged.some((l) => l.includes("Drive archive") && l.includes("Leverage shared")),
  );
});

test("waiver download & verify stream PDF bytes (never redirect to private Drive) before and after D1 retention", async () => {
  const e = env({ WAIVERS_DRIVE_SUBJECT: "alec@alecability.com" });
  const out = await (await sign(e)).json();
  assert.equal(out.ok, true);
  const r = row(e);
  assert.equal(r.drive_status, "done");

  // Immediately after signing (while D1 retains waiver_documents): serves PDF bytes
  // directly (not a 302 to drive.google.com) without touching Drive.
  const dl1 = await worker.fetch(
    new Request(`https://adapttolife.org${out.download}`),
    e,
  );
  assert.equal(dl1.status, 200);
  assert.equal(dl1.headers.get("Content-Type"), "application/pdf");
  assert.equal(dl1.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(dl1.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(sha(new Uint8Array(await dl1.arrayBuffer())), r.pdf_sha256);
  assert.equal(drive.downloads, 0, "served from D1 while retained");

  // After the 30-day D1 retention purge: streams directly from Drive using
  // supportsAllDrives=true and WAIVERS_DRIVE_SUBJECT.
  e.WAIVERS_DB.sql.prepare("DELETE FROM waiver_documents").run();
  drive.jwtClaims = [];
  const dl2 = await worker.fetch(
    new Request(`https://adapttolife.org${out.download}`),
    e,
  );
  assert.equal(dl2.status, 200);
  assert.equal(dl2.headers.get("Content-Type"), "application/pdf");
  assert.equal(sha(new Uint8Array(await dl2.arrayBuffer())), r.pdf_sha256);
  assert.equal(drive.downloads, 1);
  assert.equal(drive.jwtClaims[0].sub, "alec@alecability.com");

  // Verify endpoint also reads from Drive with supportsAllDrives=true and matches hash.
  const vf = await (
    await worker.fetch(new Request(`https://adapttolife.org${out.verify}`), e)
  ).json();
  assert.equal(vf.ok, true);
  assert.equal(vf.intact, true);
  assert.equal(drive.downloads, 2);

  // If D1 copy is gone and Drive has a transient 503, download answers 503, not 404.
  drive.mode = "down";
  const dlDown = await quietly(async () =>
    worker.fetch(new Request(`https://adapttolife.org${out.download}`), e),
  );
  assert.ok(dlDown.some((l) => l.includes("waiver drive download failed")));
  const origError = console.error;
  console.error = () => {};
  try {
    const res503 = await worker.fetch(
      new Request(`https://adapttolife.org${out.download}`),
      e,
    );
    assert.equal(res503.status, 503);
  } finally {
    console.error = origError;
  }
});

test("wrangler.jsonc configures WAIVERS_DRIVE_ID and WAIVERS_DRIVE_SUBJECT in prod and staging", () => {
  const raw = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const clean = raw
    .replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m) =>
      m.startsWith('"') ? m : "",
    )
    .replace(/,\s*([}\]])/g, "$1");
  const cfg = JSON.parse(clean);
  assert.equal(cfg.vars.WAIVERS_DRIVE_ID, "1NAW-FAeJKJnGgmMgzgRGS78CxE5WYo-p");
  assert.equal(cfg.vars.WAIVERS_DRIVE_SUBJECT, "alec@alecability.com");
  assert.equal(
    cfg.env.staging.vars.WAIVERS_DRIVE_ID,
    "1NAW-FAeJKJnGgmMgzgRGS78CxE5WYo-p",
  );
  assert.equal(cfg.env.staging.vars.WAIVERS_DRIVE_SUBJECT, "alec@alecability.com");
});

// The live atl-waivers table as it really was (read from sqlite_master on
// 2026-11-23): the June 2026 table, with `r2_key TEXT NOT NULL` and no default,
// plus drive_file_id/drive_link added later. The Sept 14 change dropped r2_key
// from schema/waivers.sql and the INSERT but not from this table, and the suite
// only ever built the file, so every real signing failed while tests passed.
// The tests below replay the live history (this table, then every migration)
// and require it to end exactly where schema/waivers.sql starts.
const LIVE_WAIVERS_BEFORE_2026_10_03 = `CREATE TABLE waivers (
  id TEXT PRIMARY KEY, org TEXT NOT NULL, waiver_version TEXT NOT NULL,
  signer_name TEXT NOT NULL, signer_email TEXT NOT NULL, signed_at TEXT NOT NULL,
  signature_type TEXT, signer_kind TEXT, minor_name TEXT, relationship TEXT,
  program TEXT, consent INTEGER NOT NULL DEFAULT 1, ip TEXT, user_agent TEXT,
  country TEXT, region TEXT, city TEXT, doc_sha256 TEXT, pdf_sha256 TEXT,
  r2_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
ALTER TABLE waivers ADD COLUMN drive_file_id TEXT;
ALTER TABLE waivers ADD COLUMN drive_link TEXT;
CREATE INDEX idx_waivers_email ON waivers(signer_email);
CREATE INDEX idx_waivers_org ON waivers(org, signed_at);`;
const migration = (f) =>
  readFileSync(new URL(`../schema/migrations/${f}`, import.meta.url), "utf8");
// Every migration the live waivers table has had, in order. The inventory test
// below fails when a new migration touches the waiver tables but is not added
// here, so the replay can never silently skip one.
const WAIVER_MIGRATION_FILES = [
  "2026-10-03-waiver-capture-first.sql",
  "2026-11-23-waivers-drop-r2-key.sql",
];
const WAIVER_MIGRATIONS = WAIVER_MIGRATION_FILES.map(migration);
const CAPTURE_FIRST_MIGRATION = WAIVER_MIGRATIONS[0];
function liveWaiversDb() {
  const db = sqliteD1(LIVE_WAIVERS_BEFORE_2026_10_03);
  for (const m of WAIVER_MIGRATIONS) db.sql.exec(m);
  return db;
}

for (const org of ["atl", "asnm"]) {
  test(`signing works on the live table after its migrations (${org})`, async () => {
    const e = env({ WAIVERS_DB: liveWaiversDb() });
    const res = await sign(e, { org });
    const out = await res.json();
    assert.equal(res.status, 200, JSON.stringify(out));
    assert.equal(out.ok, true);
    assert.equal(row(e).org, org);
    assert.equal("r2_key" in row(e), false);
    assert.equal(count(e, "waiver_documents"), 1);
  });
}

test("every migration that touches the waiver tables is replayed, in order", () => {
  const touching = readdirSync(new URL("../schema/migrations/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .filter((f) =>
      /\b(waivers|waiver_documents)\b/.test(migration(f).replace(/--[^\n]*/g, "")),
    )
    .sort();
  assert.deepEqual(touching, WAIVER_MIGRATION_FILES);
});

test("the live table's migrations end exactly at schema/waivers.sql", () => {
  const WAIVER_TABLES = ["waivers", "waiver_documents"];
  const only = (raw) => ({
    columns: raw.columns.filter((r) => WAIVER_TABLES.includes(r.tbl)),
    indexes: raw.indexes.filter((r) => WAIVER_TABLES.includes(r.tbl)),
    objects: raw.objects.filter((r) => WAIVER_TABLES.includes(r.tbl)),
  });
  const out = diffSchema(
    only(buildExpected("atl-waivers")),
    describeLocal(liveWaiversDb().sql),
  );
  assert.deepEqual(out, { problems: [], notes: [] });
});

test("dropping r2_key keeps every legacy release and its values", () => {
  const db = sqliteD1(
    LIVE_WAIVERS_BEFORE_2026_10_03 +
      "\nINSERT INTO waivers (id,org,waiver_version,signer_name,signer_email,signed_at,pdf_sha256,r2_key,drive_file_id,drive_link) VALUES ('a','atl','v1','A','a@x','t1','h1','waivers/atl/t1/a.pdf','f1','https://drive.example/f1');",
  );
  const before = db.sql.prepare("SELECT * FROM waivers").get();
  for (const m of WAIVER_MIGRATIONS) db.sql.exec(m);
  const after = db.sql.prepare("SELECT * FROM waivers").get();
  const { r2_key, ...kept } = { ...before };
  assert.equal(r2_key, "waivers/atl/t1/a.pdf");
  for (const [k, v] of Object.entries(kept)) assert.equal(after[k], v, k);
  assert.equal("r2_key" in after, false);
  assert.equal(after.drive_status, "done");
});

test("the live-database migration upgrades the old schema and marks legacy rows honestly", () => {
  const db = sqliteD1(
    LIVE_WAIVERS_BEFORE_2026_10_03 +
      "\nINSERT INTO waivers (id,org,waiver_version,signer_name,signer_email,signed_at,r2_key,drive_file_id) VALUES ('a','atl','v','A','a@x','t','k','f1'),('b','atl','v','B','b@x','t','k','');",
  );
  db.sql.exec(CAPTURE_FIRST_MIGRATION);
  const rows = db.sql
    .prepare("SELECT id, drive_status FROM waivers ORDER BY id")
    .all()
    .map((r) => [r.id, r.drive_status]);
  assert.deepEqual(rows, [
    ["a", "done"],
    ["b", "unrecoverable"],
  ]);
  assert.equal(db.sql.prepare("SELECT count(*) n FROM waiver_documents").get().n, 0);
});
