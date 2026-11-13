// The release record (scripts/lib/release-state.mjs): a release outlives the
// turn that starts it, and whoever follows it gets an exit code that says
// what to do next. Hermetic: temp dirs and local node processes only, because
// this runs inside the Cloudflare build too.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as rs from "./lib/release-state.mjs";

const tmp = () => rs.paths(fs.mkdtempSync(path.join(os.tmpdir(), "atl-release-")));
const sink = () => {
  let text = "";
  return {
    write: (b) => (text += String(b)),
    get text() {
      return text;
    },
  };
};
const deadPid = () => spawnSync(process.execPath, ["-e", ""]).pid; // exited by the time we use it

test("state lives in the shared inflight directory, overridable for tests", () => {
  assert.equal(rs.stateDir({ ATL_RELEASE_STATE_DIR: "/x" }), "/x");
  assert.equal(rs.stateDir({ XDG_STATE_HOME: "/s", HOME: "/h" }), "/s/inflight");
  assert.equal(rs.stateDir({ HOME: "/h" }), "/h/.local/state/inflight");
  assert.equal(rs.paths("/d").state, "/d/adapt-to-life-release.json");
});

test("writeState merges, replace starts clean, and no temp file is left behind", () => {
  const p = tmp();
  rs.writeState(p.state, { a: 1, b: 1 });
  assert.deepEqual(
    { ...rs.readState(p.state), updated_at: 0 },
    { a: 1, b: 1, updated_at: 0 },
  );
  rs.writeState(p.state, { b: 2 });
  assert.equal(rs.readState(p.state).a, 1);
  rs.writeState(p.state, { c: 3 }, { replace: true });
  assert.equal(rs.readState(p.state).a, undefined);
  assert.deepEqual(fs.readdirSync(p.dir), ["adapt-to-life-release.json"]);
});

test("one release at a time: a live holder keeps the lock, a dead one loses it", () => {
  const p = tmp();
  assert.deepEqual(rs.acquireLock(p.lock), { ok: true });
  assert.deepEqual(rs.acquireLock(p.lock), { ok: false, pid: process.pid });
  rs.setLockPid(p.lock, deadPid());
  assert.deepEqual(rs.acquireLock(p.lock), { ok: true });
  rs.releaseLock(p.lock, 1); // not the holder: kept
  assert.ok(fs.existsSync(p.lock));
  rs.releaseLock(p.lock);
  assert.ok(!fs.existsSync(p.lock));
});

test("only GitHub hiccups are retried; real answers stop the release", () => {
  for (const t of [
    "HTTP 502: Bad Gateway",
    "gh: HTTP 503",
    "Post ...: i/o timeout",
    "read ECONNRESET",
  ])
    assert.ok(rs.isTransient(t), t);
  for (const t of [
    'a pull request for branch "staging" into branch "main" already exists',
    "Head branch was modified. Review and try the merge again.",
    "GraphQL: Pull Request is not mergeable",
    "",
  ])
    assert.ok(!rs.isTransient(t), t);
});

test("follow returns the result's exit code and prints the log", async () => {
  for (const [status, code] of [
    ["live", 0],
    ["ok", 0],
    ["nothing", 0],
    ["stopped", 1],
    ["lost", 1],
  ]) {
    const p = tmp();
    fs.writeFileSync(p.log, `the log for ${status}\n`);
    rs.writeState(p.state, {
      status,
      pid: process.pid,
      started_at: new Date().toISOString(),
    });
    const out = sink();
    assert.equal(await rs.follow(p, { windowMs: 1000, out, every: 5 }), code, status);
    assert.match(out.text, new RegExp(`the log for ${status}`));
  }
});

test("follow hands back with 75 and the wait command when the window closes", async () => {
  const p = tmp();
  rs.writeState(p.state, {
    status: "running",
    step: "waiting for the staging build",
    pid: process.pid,
    started_at: new Date().toISOString(),
  });
  const out = sink();
  assert.equal(await rs.follow(p, { windowMs: 30, out, every: 5 }), rs.STILL_RUNNING);
  assert.match(out.text, /STILL RUNNING: step "waiting for the staging build"/);
  assert.ok(out.text.includes(rs.WAIT_CMD));
});

test("a release whose process died without a result is marked lost, never live", async () => {
  const p = tmp();
  const started = new Date(Date.now() - 60000).toISOString();
  rs.writeState(p.state, {
    status: "running",
    step: "merging release PR #9",
    pid: deadPid(),
    started_at: started,
  });
  const out = sink();
  assert.equal(await rs.follow(p, { windowMs: 1000, out, every: 5 }), 1);
  assert.equal(rs.readState(p.state).status, "lost");
  assert.match(out.text, /STOPPED: .*merging release PR #9/);
  const row = JSON.parse(fs.readFileSync(p.history, "utf8").trim());
  assert.equal(row.status, "lost");
});

test("follow with no record says so and does not claim success", async () => {
  const out = sink();
  assert.equal(await rs.follow(tmp(), { windowMs: 50, out, every: 5 }), 1);
  assert.match(out.text, /No release is running or recorded/);
});

test("a detached release keeps its own record and a second start follows it", async () => {
  const p = tmp();
  const worker = path.join(p.dir, "worker.mjs");
  // Stands in for `release.mjs --run`: writes progress, then a result.
  fs.writeFileSync(
    worker,
    `import * as rs from ${JSON.stringify(new URL("./lib/release-state.mjs", import.meta.url).href)};
     const p = rs.paths(${JSON.stringify(p.dir)});
     rs.writeState(p.state, { pid: process.pid, step: "working" });
     console.log("worker says hello", process.argv.slice(2).join(" "));
     setTimeout(() => { console.log("LIVE: test"); rs.writeState(p.state, { status: "live" }); rs.releaseLock(p.lock); }, 300);`,
  );
  const env = {
    ...process.env,
    CLAUDE_CODE_SESSION_ID: "sess-1",
    T3CODE_THREAD_ID: "thread-1",
  };
  const first = rs.startDetached(p, {
    script: worker,
    args: ["--dry-run"],
    env,
    initial: { mode: "dry-run" },
  });
  assert.equal(first.started, true);
  const s = rs.readState(p.state);
  assert.equal(s.status, "running");
  assert.equal(s.session_id, "sess-1");
  assert.equal(s.thread_id, "thread-1");
  assert.equal(s.wait, rs.WAIT_CMD);
  assert.equal(s.mode, "dry-run");
  const second = rs.startDetached(p, { script: worker, env });
  assert.deepEqual(second, { started: false, pid: first.pid });
  const out = sink();
  assert.equal(await rs.follow(p, { windowMs: 5000, out, every: 20 }), 0);
  assert.match(out.text, /worker says hello --run --dry-run/);
  assert.match(out.text, /LIVE: test/);
  assert.ok(!fs.existsSync(p.lock));
});
