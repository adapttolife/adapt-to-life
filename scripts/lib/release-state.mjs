// scripts/lib/release-state.mjs: the record a release keeps while it runs, so
// the release can outlive the chat turn (or the shell) that started it.
//
// One release at a time per machine. The files live in
//   ${ATL_RELEASE_STATE_DIR:-${XDG_STATE_HOME:-~/.local/state}/inflight}/
// as adapt-to-life-release.json (state), .log (everything the release printed),
// .lock (pid of the running release) and .history.jsonl (one line per finished
// release: the meter for how long "push live" takes and how often it stops).
//
// The "inflight" directory is a shared convention, not ours alone: the agentos
// Stop guard (scripts/hooks/stop-guard.py in Tranel-Labs/agentos) reads every
// *.json in it and will not let the Claude session that started a running
// release end its turn until that release has a result. Keep the field names
// it reads stable: status, pid, session_id, thread_id, step, started_at, wait.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

export const NAME = "adapt-to-life-release";
// Exit codes. 75 is EX_TEMPFAIL: not a failure, "ask again".
export const TERMINAL = { live: 0, ok: 0, nothing: 0, stopped: 1, lost: 1 };
export const STILL_RUNNING = 75;
export const WAIT_CMD = "npm run release -- --wait";
export const STATUS_CMD = "npm run release -- --status";

export function stateDir(env = process.env) {
  if (env.ATL_RELEASE_STATE_DIR) return env.ATL_RELEASE_STATE_DIR;
  const base =
    env.XDG_STATE_HOME || path.join(env.HOME || os.homedir(), ".local", "state");
  return path.join(base, "inflight");
}

export function paths(dir = stateDir()) {
  const p = (ext) => path.join(dir, `${NAME}${ext}`);
  return {
    dir,
    state: p(".json"),
    log: p(".log"),
    lock: p(".lock"),
    history: p(".history.jsonl"),
  };
}

export function readState(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

// Atomic (write a temp file, rename it over). Merges into the current state
// unless `replace` is set, which a new release uses so no field of the last
// release leaks into it.
export function writeState(file, patch, { replace = false } = {}) {
  const base = replace ? {} : readState(file) || {};
  const next = { ...base, ...patch, updated_at: new Date().toISOString() };
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
  fs.renameSync(tmp, file);
  return next;
}

export function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

// Take the lock or report who holds it. A lock whose process is gone is stale
// and is taken over (once). Returns { ok: true } or { ok: false, pid }.
export function acquireLock(file, pid = process.pid) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(file, "wx");
      fs.writeSync(fd, String(pid));
      fs.closeSync(fd);
      return { ok: true };
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
      let holder = NaN;
      try {
        holder = parseInt(fs.readFileSync(file, "utf8"), 10);
      } catch {}
      if (alive(holder)) return { ok: false, pid: holder };
      fs.rmSync(file, { force: true });
    }
  }
  return { ok: false, pid: null };
}

export function setLockPid(file, pid) {
  fs.writeFileSync(file, String(pid));
}

export function releaseLock(file, pid = process.pid) {
  try {
    if (parseInt(fs.readFileSync(file, "utf8"), 10) === pid)
      fs.rmSync(file, { force: true });
  } catch {}
}

export function appendHistory(file, s) {
  const finished = s.finished_at || new Date().toISOString();
  const row = {
    started_at: s.started_at ?? null,
    finished_at: finished,
    seconds: s.started_at
      ? Math.round((Date.parse(finished) - Date.parse(s.started_at)) / 1000)
      : null,
    status: s.status,
    mode: s.mode ?? null,
    pr: s.pr ?? null,
    merge_sha: s.merge_sha ?? null,
    skip_checks: !!s.skip_checks,
    message: s.message ?? null,
    thread_id: s.thread_id ?? null,
  };
  fs.appendFileSync(file, JSON.stringify(row) + "\n");
}

// GitHub answers that are worth one more try: 5xx, timeouts, dropped
// connections. Anything else (a conflict, "already exists", a moved head) is a
// real answer and must stop the release.
export function isTransient(text) {
  return /HTTP 5\d\d|\b50[234]\b|Bad Gateway|Service Unavailable|Gateway Time-?out|i\/o timeout|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|connection reset|unexpected EOF|TLS handshake timeout/i.test(
    String(text || ""),
  );
}

// Variables the worker needs (tools, auth, state location). The Cloudflare
// token arrives here from `cfrun`; systemd-run copies each one from this
// process's environment by NAME, so no value ever appears on a command line.
const PASS_ENV =
  /^(PATH|HOME|USER|LOGNAME|SHELL|LANG|LC_[A-Z_]+|TZ|TMPDIR|XDG_[A-Z_]+|ATL_[A-Z_]+|CLOUDFLARE_[A-Z_]+|GH_[A-Z_]+|GITHUB_TOKEN|PLAYWRIGHT_[A-Z_]+|NODE_[A-Z_]+|SSH_AUTH_SOCK|GIT_[A-Z_]+)$/;
const sleepSync = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Start `script --run <args>` so that nothing about the chat that started it
// can stop it. On this box each T3 Claude session is a systemd scope stopped
// with KillMode=control-group, which SIGKILLs every process left in it, setsid
// or not (journal, 2026-11-12 03:25 UTC), and Claude Code's TaskStop kills a
// task's descendants. So the worker runs as its own transient user service
// (`systemd-run --user`): outside the session's cgroup, and a child of
// systemd, not of this command. Without a systemd user manager (CI, a laptop)
// it falls back to a setsid child. Its stdout and stderr go to the log.
// Returns { started: true, pid, how } or, when a release is already running,
// { started: false, pid }.
export function startDetached(
  p,
  {
    script,
    args = [],
    env = process.env,
    cwd = process.cwd(),
    initial = {},
    detach = env.ATL_RELEASE_DETACH || "auto",
  },
) {
  fs.mkdirSync(p.dir, { recursive: true });
  const lock = acquireLock(p.lock);
  if (!lock.ok) return { started: false, pid: lock.pid };
  const prev = readState(p.state);
  if (prev && prev.status === "running") {
    // The lock was stale, so that release died without a result.
    const lost = writeState(p.state, {
      status: "lost",
      finished_at: new Date().toISOString(),
      message: `the release process (pid ${prev.pid}) ended at step "${prev.step}" without a result`,
    });
    try {
      appendHistory(p.history, lost);
    } catch {}
  }
  const unit = `atl-release-${Date.now()}-${process.pid}`;
  writeState(
    p.state,
    {
      status: "running",
      step: "starting",
      started_at: new Date().toISOString(),
      pid: null,
      session_id: env.CLAUDE_CODE_SESSION_ID || null,
      thread_id: env.T3CODE_THREAD_ID || null,
      cwd,
      log: p.log,
      wait: WAIT_CMD,
      status_cmd: STATUS_CMD,
      run_id: unit,
      ...initial,
    },
    { replace: true },
  );
  fs.writeFileSync(p.log, "");
  if (detach !== "setsid") {
    const names = Object.keys(env).filter((k) => PASS_ENV.test(k));
    const r = spawnSync(
      "systemd-run",
      [
        "--user",
        "--collect",
        "--quiet",
        `--unit=${unit}`,
        // Type=exec: fail here, not silently, if the process cannot start.
        "-p",
        "Type=exec",
        "-p",
        `WorkingDirectory=${cwd}`,
        "-p",
        `StandardOutput=append:${p.log}`,
        "-p",
        `StandardError=append:${p.log}`,
        ...names.map((k) => `--setenv=${k}`),
        `--setenv=ATL_RELEASE_RUN_ID=${unit}`,
        process.execPath,
        script,
        "--run",
        ...args,
      ],
      { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15000 },
    );
    // A timeout can land after systemd already started the unit: never start
    // a second worker beside it.
    const started =
      r.status === 0 ||
      (r.error &&
        r.error.code === "ETIMEDOUT" &&
        /^(active|activating)/.test(
          spawnSync("systemctl", ["--user", "is-active", `${unit}.service`], {
            encoding: "utf8",
          }).stdout || "",
        ));
    if (started) {
      writeState(p.state, { detach: "systemd", unit });
      // The worker records its own pid (and takes the lock) when it starts.
      for (let i = 0; i < 150 && !(readState(p.state) || {}).pid; i++) sleepSync(100);
      return {
        started: true,
        pid: (readState(p.state) || {}).pid ?? null,
        how: "systemd",
        unit,
      };
    }
    // Say why, so a weaker detach is never silent.
    const why =
      (r.error && r.error.code) ||
      String(r.stderr || "")
        .trim()
        .split("\n")[0] ||
      `exit ${r.status}`;
    writeState(p.state, { detach_error: `systemd-run: ${why}` });
  }
  const logFd = fs.openSync(p.log, "a");
  let child;
  try {
    child = spawn(process.execPath, [script, "--run", ...args], {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env: { ...env, ATL_RELEASE_RUN_ID: unit },
      cwd,
    });
  } finally {
    fs.closeSync(logFd);
  }
  child.unref();
  setLockPid(p.lock, child.pid);
  writeState(p.state, { pid: child.pid, detach: "setsid" });
  return {
    started: true,
    pid: child.pid,
    how: "setsid",
    why: (readState(p.state) || {}).detach_error,
  };
}

// Follow a release: stream its log and return the exit code for its result,
// or STILL_RUNNING when the window closes first. Starts and stops nothing; the
// only write is marking a release "lost" when its process is gone without a
// result.
export async function follow(
  p,
  { windowMs, out = process.stdout, every = 1000, now = Date.now } = {},
) {
  const end = now() + windowMs;
  let offset = 0;
  const drain = () => {
    let fd;
    try {
      fd = fs.openSync(p.log, "r");
    } catch {
      return;
    }
    try {
      const size = fs.fstatSync(fd).size;
      if (size > offset) {
        const buf = Buffer.alloc(size - offset);
        fs.readSync(fd, buf, 0, buf.length, offset);
        offset = size;
        out.write(buf);
      }
    } finally {
      fs.closeSync(fd);
    }
  };
  for (;;) {
    drain();
    const s = readState(p.state);
    if (!s) {
      out.write(
        "No release is running or recorded on this machine. Start one with: cfrun npm run release\n",
      );
      return 1;
    }
    if (s.status in TERMINAL) {
      drain();
      return TERMINAL[s.status];
    }
    const startedMs = Date.parse(s.started_at) || 0;
    // Give a just-spawned process a moment to exist before calling it lost.
    if (!alive(s.pid) && now() - startedMs > 15000) {
      // It may have written its result in the instant before it exited.
      const again = readState(p.state);
      if (again && again.status in TERMINAL) {
        drain();
        return TERMINAL[again.status];
      }
      const lost = writeState(p.state, {
        status: "lost",
        finished_at: new Date().toISOString(),
        message: `the release process (pid ${s.pid}) ended at step "${s.step}" without a result`,
      });
      try {
        appendHistory(p.history, lost);
      } catch {}
      out.write(
        `\nSTOPPED: ${lost.message}. Whether staging reached main is unknown: check ` +
          "`gh pr list -R adapttolife/adapt-to-life --base main --head staging --state all -L 1`, " +
          "then run `cfrun npm run release -- --verify-live`.\n",
      );
      return 1;
    }
    if (now() >= end) {
      const mins = Math.max(0, Math.round((now() - startedMs) / 60000));
      out.write(
        `\nSTILL RUNNING: step "${s.step}", ${mins} min since it started. ` +
          `It keeps going on its own. Follow it in the foreground with: ${WAIT_CMD}\n`,
      );
      return STILL_RUNNING;
    }
    await new Promise((r) => setTimeout(r, every));
  }
}
