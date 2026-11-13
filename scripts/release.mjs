#!/usr/bin/env node
// scripts/release.mjs: one command from staging to live, and it only says
// done once production is verified.
//
//   cfrun npm run release                 # release what staging has that main lacks
//   npm run release -- --wait             # follow the release that is already running
//   npm run release -- --status           # where the current or last release is, at once
//   npm run release -- --dry-run          # every gate up to the merge, then stop
//   npm run release -- --verify-live      # check that production is main and healthy
//   --skip-checks                         # skip check-layout (the receipt says so)
//   --follow-for=<seconds>                # how long to follow before handing back (540)
//
// The release runs as its own systemd user unit, outside the chat session's
// cgroup and process tree (a setsid child where there is no systemd user
// manager), keeps a record (scripts/lib/release-state.mjs), and the command
// that started it follows it in the foreground. Closing the chat, a tool
// timeout, TaskStop or Ctrl-C stops only the following, never the release. Why: in one week of "push live" (2026-11-07 to
// 11-12) four releases stalled the same way. The agent ran the release in the
// background, ended its turn on "I'll confirm when it's live", and T3 dropped
// the completion notice that should have woken it, so Alec had to ask. Now the
// command itself says what to do next, by exit code:
//   0   LIVE (or the dry run or verify passed, or there was nothing to release)
//   1   STOPPED: a gate failed, and the message says where
//   75  STILL RUNNING when the follow window closed: run `npm run release --
//       --wait` in the foreground again. Do not end a turn on a promise while
//       it runs; the agentos Stop guard holds the turn open until it has a result.
//
// The steps, each a gate that stops the release when it fails:
//   1. Name what ships: the pull requests merged into staging since main.
//   2. Staging is good: its build passed (a failed build is retried once
//      through the Cloudflare API, as production is), the staging preview
//      serves exactly that commit with no -dirty, and scripts/check-layout.mjs
//      passes there (Chrome and Safari engines, phone and desktop).
//   3. Open (or reuse) the staging -> main release PR and merge it, pinned to
//      the commit that was checked (--match-head-commit). GitHub 5xx answers
//      are retried; a real answer (a moved head, a conflict) stops the release.
//   4. Production is that commit: adapttolife.org/build.txt shows the merge
//      commit, no -dirty, and the same file digest staging had. If Cloudflare's
//      build fails (its asset upload failed with error 10013 on 2026-10-02 and
//      2026-11-12), the build is retriggered once through the Cloudflare API;
//      that needs CLOUDFLARE_API_TOKEN, which `cfrun` provides.
//   5. Production passes check-layout.
//   6. Search engines hear which pages changed (IndexNow, scripts/lib/
//      indexnow.mjs). This one never stops a release.
// Only then does it print LIVE. Any failure exits 1 and says where it stopped.
//
// Merging to main is a production deploy. Run this when the release is
// approved; --dry-run is always safe.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { checkLayout, chromiumPath } from "./check-layout.mjs";
import { changedUrls, ping } from "./lib/indexnow.mjs";
import * as rs from "./lib/release-state.mjs";

const REPO = "adapttolife/adapt-to-life";
const STAGING = "https://staging-adapt-to-life.adapt-to-life.workers.dev";
const LIVE = "https://adapttolife.org";
const CHECK = "Workers Builds: adapt-to-life";

const argv = process.argv.slice(2);
const args = new Set(argv);
const RUN = args.has("--run"), // internal: the detached process doing the work
  WAIT = args.has("--wait"),
  STATUS = args.has("--status"),
  DRY = args.has("--dry-run"),
  VERIFY_ONLY = args.has("--verify-live"),
  SKIP_CHECKS = args.has("--skip-checks");
const followArg = argv.find((a) => a.startsWith("--follow-for="));
const FOLLOW_MS = (followArg ? Number(followArg.split("=")[1]) || 540 : 540) * 1000;
const P = rs.paths();

const sh = (cmd, a) =>
  execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const errText = (e) => String((e && (e.stderr || e.message)) || e).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sleepSync = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const short = (s) => s.slice(0, 7);
const t0 = Date.now();
const log = (m) =>
  console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${m}`);

// gh with up to three tries on a transient GitHub answer (a 502 stopped the
// 2026-11-12 release at "create the release PR").
function ghText(a, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return sh("gh", a);
    } catch (e) {
      if (i >= tries || !rs.isTransient(errText(e))) throw e;
      log(`GitHub hiccup (${errText(e).split("\n")[0]}); retrying in ${5 * i}s`);
      sleepSync(5000 * i);
    }
  }
}
const gh = (a) => JSON.parse(ghText(a));

function setState(patch) {
  if (RUN) rs.writeState(P.state, patch);
}
function step(s) {
  setState({ step: s });
}
// The one place a result is recorded. Never claims success: an exit without
// a result is recorded as stopped by the exit handler below.
function finish(status, message, extra = {}) {
  if (!RUN) return;
  const s = rs.writeState(P.state, {
    status,
    message,
    finished_at: new Date().toISOString(),
    ...extra,
  });
  try {
    rs.appendHistory(P.history, s);
  } catch {}
  rs.releaseLock(P.lock);
}
function fail(m) {
  console.error(`\nSTOPPED: ${m}`);
  finish("stopped", m);
  process.exit(1);
}
function done(status, line, extra = {}) {
  console.log(`\n${line}`);
  finish(status, line, extra);
}

async function stamp(base) {
  try {
    const r = await fetch(`${base}/build.txt?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const [first, digest] = (await r.text()).trim().split(/\s+/);
    return {
      sha: first.replace(/-dirty$/, ""),
      dirty: first.endsWith("-dirty"),
      digest,
    };
  } catch {
    return null;
  }
}

function checkRun(sha) {
  const runs = gh(["api", `repos/${REPO}/commits/${sha}/check-runs`]).check_runs || [];
  return (
    runs
      .filter((r) => r.name === CHECK)
      .sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""))[0] || null
  );
}

async function waitFor(label, fn, { timeout = 15 * 60e3, every = 10e3 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end)
      fail(`timed out after ${Math.round(timeout / 60e3)} min waiting for ${label}`);
    await sleep(every);
  }
}

// Cloudflare Workers Builds: retrigger the same commit once, on the trigger
// that built it (production for main, the non-production one for staging).
async function retrigger(detailsUrl, sha, branch) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const m = (detailsUrl || "").match(
    /dash\.cloudflare\.com\/([0-9a-f]{32})\/.*\/builds\/([0-9a-f-]{36})/,
  );
  if (!token || !m) return false;
  const [, account, build] = m;
  const api = (path, init) =>
    fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/builds/${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    }).then((r) => r.json());
  const info = await api(`builds/${build}`);
  const trigger =
    info && info.result && info.result.trigger && info.result.trigger.trigger_uuid;
  if (!trigger) return false;
  const run = await api(`triggers/${trigger}/builds`, {
    method: "POST",
    body: JSON.stringify({ branch, commit_hash: sha }),
  });
  return !!(run && run.success);
}

// Page checks need Chrome's and Safari's engines for this Playwright version.
// Playwright deletes a browser build from ~/.cache/ms-playwright once no
// install it knows about still uses it, and worktrees come and go: WebKit
// vanished from the box after 2026-10-02, every check-layout run then stopped
// at "Executable doesn't exist", and releases ran with --skip-checks for
// weeks. Install whatever is missing before the first gate needs it.
async function ensureBrowsers() {
  const { chromium, webkit } = await import("playwright");
  const missing = [];
  // check-layout falls back to any cached Chromium; WebKit must match the pin.
  if (!fs.existsSync(chromium.executablePath()) && !chromiumPath())
    missing.push("chromium");
  if (!fs.existsSync(webkit.executablePath())) missing.push("webkit");
  if (!missing.length) return;
  step(`installing ${missing.join(" and ")} for the page checks`);
  log(
    `installing missing Playwright browser(s) for the page checks: ${missing.join(", ")}`,
  );
  try {
    sh("npx", ["playwright", "install", ...missing]);
  } catch (e) {
    fail(
      `page checks need ${missing.join(" and ")} and installing failed (${errText(e).split("\n")[0]}). Run \`npx playwright install ${missing.join(" ")}\`, then release again`,
    );
  }
}

const checked = (where) =>
  SKIP_CHECKS
    ? `page checks skipped on ${where} (--skip-checks)`
    : `passes check-layout on ${where} (Chrome and Safari, phone and desktop)`;

async function verifyLive(sha, stagingDigest) {
  step(`waiting for production to serve ${short(sha)}`);
  log(`waiting for ${LIVE} to serve ${short(sha)}`);
  let retried = false;
  await waitFor(
    `production to serve ${short(sha)}`,
    async () => {
      const s = await stamp(LIVE);
      if (s && s.sha === sha) return true;
      if (!retried) {
        const run = checkRun(sha);
        if (run && run.status === "completed" && run.conclusion !== "success") {
          step("retrying the production build");
          log(
            `production build ${run.conclusion}; retrying the same commit once through Cloudflare`,
          );
          retried = await retrigger(run.details_url, sha, "main");
          if (!retried)
            fail(
              `production build ${run.conclusion} and could not be retried here (needs cfrun for CLOUDFLARE_API_TOKEN). Logs: ${run.details_url}`,
            );
        }
      }
      return false;
    },
    { timeout: 25 * 60e3, every: 15e3 },
  ); // room for one failed build plus a retry
  const live = await stamp(LIVE);
  if (live.dirty)
    fail(
      `production build.txt says -dirty: the build changed a tracked file (usually refreshed directory stats; commit them via staging)`,
    );
  if (stagingDigest && live.digest !== stagingDigest)
    fail(
      `production files (digest ${live.digest}) differ from what was checked on staging (${stagingDigest})`,
    );
  log(
    `production serves ${short(sha)}, no -dirty${stagingDigest ? ", same files as staging" : ""}`,
  );
  if (!SKIP_CHECKS) {
    step("checking production pages");
    log("checking production pages (Chrome and Safari, phone and desktop)");
    const f = await checkLayout(LIVE, { log: (m) => console.log(`         ${m}`) });
    if (f.length)
      fail(
        `production is live but ${f.length} page check(s) failed (above): fix forward`,
      );
  }
}

function findReleasePr() {
  return gh([
    "pr",
    "list",
    "-R",
    REPO,
    "--base",
    "main",
    "--head",
    "staging",
    "--state",
    "open",
    "--json",
    "number",
  ])[0];
}

async function main() {
  setState({ pid: process.pid, step: "fetching main and staging" });
  sh("git", ["fetch", "--quiet", "origin", "main", "staging"]);
  const mainSha = sh("git", ["rev-parse", "origin/main"]);
  if (!SKIP_CHECKS) await ensureBrowsers();

  if (VERIFY_ONLY) {
    await verifyLive(mainSha, null);
    done(
      "live",
      `LIVE: adapttolife.org is main ${short(mainSha)}, no -dirty, and ${checked("production")}.`,
      { merge_sha: mainSha },
    );
    return;
  }

  const stagingSha = sh("git", ["rev-parse", "origin/staging"]);
  const ahead = +sh("git", ["rev-list", "--count", "origin/main..origin/staging"]);
  if (!ahead) {
    done("nothing", "Nothing to release: main already has everything on staging.");
    return;
  }

  // 1. What ships.
  const prs = [
    ...sh("git", [
      "log",
      "--first-parent",
      "--merges",
      "--format=%s",
      "origin/main..origin/staging",
    ]).matchAll(/#(\d+)/g),
  ].map((m) => +m[1]);
  const titles = prs.reverse().map((n) => {
    try {
      return `#${n} ${gh(["pr", "view", String(n), "-R", REPO, "--json", "title"]).title}`;
    } catch {
      return `#${n}`;
    }
  });
  log(`releasing staging ${short(stagingSha)}:`);
  for (const t of titles.length ? titles : [`${ahead} commit(s) with no merged PR`])
    console.log(`         ${t}`);
  setState({ staging_sha: stagingSha, ships: titles });

  // 2. Staging is good.
  step("waiting for the staging build");
  log("waiting for the staging build to pass");
  const run = await waitFor("the staging build", () => {
    const r = checkRun(stagingSha);
    return r && r.status === "completed" ? r : null;
  });
  let failedRunId = null;
  if (run.conclusion !== "success") {
    step("retrying the staging build");
    log(
      `the staging build ${run.conclusion}; retrying the same commit once through Cloudflare`,
    );
    if (!(await retrigger(run.details_url, stagingSha, "staging")))
      fail(
        `the staging build ${run.conclusion} and could not be retried here (needs cfrun for CLOUDFLARE_API_TOKEN): ${run.details_url}`,
      );
    failedRunId = run.id;
  }
  step(`waiting for staging to serve ${short(stagingSha)}`);
  log(`waiting for ${STAGING} to serve ${short(stagingSha)}`);
  await waitFor(`staging to serve ${short(stagingSha)}`, async () => {
    const s = await stamp(STAGING);
    if (s && s.sha === stagingSha) return true;
    if (failedRunId) {
      const r = checkRun(stagingSha);
      if (
        r &&
        r.id !== failedRunId &&
        r.status === "completed" &&
        r.conclusion !== "success"
      )
        fail(`the retried staging build ${r.conclusion} too: ${r.details_url}`);
    }
    return false;
  });
  const st = await stamp(STAGING);
  if (st.dirty) fail("staging build.txt says -dirty");
  log(`staging serves ${short(stagingSha)}, no -dirty`);
  if (!SKIP_CHECKS) {
    step("checking staging pages");
    log("checking staging pages (Chrome and Safari, phone and desktop)");
    const f = await checkLayout(STAGING, { log: (m) => console.log(`         ${m}`) });
    if (f.length)
      fail(`staging fails ${f.length} page check(s) (above); not releasing`);
  }
  if (DRY) {
    done(
      "ok",
      `DRY RUN OK: staging ${short(stagingSha)} passed its build, serves with no -dirty, and ${checked("staging")}. Run without --dry-run to release.`,
    );
    return;
  }

  // 3. Release PR, merged at exactly the checked commit.
  step("opening the release PR");
  let pr = findReleasePr();
  for (let i = 1; !pr && i <= 3; i++) {
    const title =
      `Release: ${titles.map((t) => t.replace(/^#\d+ /, "")).join("; ")}`.slice(0, 120);
    const body = `Released with scripts/release.mjs.\n\n${titles.map((t) => `- ${t}`).join("\n")}\n\nStaging ${short(stagingSha)} passed its build, served with no -dirty, and ${checked("staging")}.`;
    try {
      sh("gh", [
        "pr",
        "create",
        "-R",
        REPO,
        "--base",
        "main",
        "--head",
        "staging",
        "--title",
        title,
        "--body",
        body,
      ]);
    } catch (e) {
      // A 5xx can still have created it: look before trying again.
      if (!rs.isTransient(errText(e))) throw e;
      log(
        `creating the release PR hit a GitHub error (${errText(e).split("\n")[0]}); checking`,
      );
      sleepSync(5000 * i);
    }
    pr = findReleasePr();
  }
  if (!pr) fail("could not open the staging -> main release PR after 3 tries");
  setState({ pr: pr.number });

  step(`merging release PR #${pr.number}`);
  log(`merging release PR #${pr.number}`);
  for (let i = 1; ; i++) {
    try {
      sh("gh", [
        "pr",
        "merge",
        String(pr.number),
        "-R",
        REPO,
        "--merge",
        "--match-head-commit",
        stagingSha,
      ]);
      break;
    } catch (e) {
      // GitHub can merge and still answer 5xx: the PR's state is the truth.
      const now = gh(["pr", "view", String(pr.number), "-R", REPO, "--json", "state"]);
      if (now.state === "MERGED") break;
      if (i >= 3 || !rs.isTransient(errText(e))) throw e;
      log(
        `merging hit a GitHub error (${errText(e).split("\n")[0]}); retrying in ${5 * i}s`,
      );
      sleepSync(5000 * i);
    }
  }
  const mergeSha = gh([
    "pr",
    "view",
    String(pr.number),
    "-R",
    REPO,
    "--json",
    "mergeCommit",
  ]).mergeCommit.oid;
  setState({ merge_sha: mergeSha });

  // 4 and 5. Production is that commit, and it passes.
  await verifyLive(mergeSha, st.digest);

  // 6. Tell search engines which pages changed. Never stops the release.
  step("telling search engines (IndexNow)");
  try {
    sh("git", ["fetch", "--quiet", "origin", "main"]);
    const r = await ping(changedUrls(mainSha, mergeSha));
    log(`IndexNow: ${r.sent} changed page(s) sent (${r.status})`);
  } catch (e) {
    log(`IndexNow skipped: ${e.message}`);
  }
  done(
    "live",
    `LIVE: #${pr.number} is on adapttolife.org as ${short(mergeSha)}, the same files staging passed, and ${checked("production")}.`,
    { pr: pr.number, merge_sha: mergeSha },
  );
}

function status() {
  const s = rs.readState(P.state);
  if (!s) {
    console.log("No release recorded on this machine.");
    return 0;
  }
  const running = s.status === "running";
  const gone = running && !rs.alive(s.pid);
  const mins = (a, b) =>
    Math.round(((b ? Date.parse(b) : Date.now()) - Date.parse(a)) / 60000);
  console.log(
    gone
      ? `LOST: the release (pid ${s.pid}) is no longer running and recorded no result. Run ${rs.WAIT_CMD} to mark it, then check the release PR and production.`
      : running
        ? `RUNNING: step "${s.step}", ${mins(s.started_at)} min so far. Follow it with: ${rs.WAIT_CMD}`
        : `${/^[A-Z][A-Z ]*:/.test(s.message || "") ? s.message : `${s.status.toUpperCase()}: ${s.message || ""}`} (${s.mode}, ${mins(s.started_at, s.finished_at)} min, finished ${s.finished_at})`,
  );
  if (s.pr) console.log(`Release PR: https://github.com/${REPO}/pull/${s.pr}`);
  console.log(
    `Started ${s.started_at}${s.thread_id ? ` from T3 thread ${s.thread_id}` : ""}. Log: ${s.log}`,
  );
  if (gone) return 1;
  if (running) return rs.STILL_RUNNING;
  return s.status in rs.TERMINAL ? rs.TERMINAL[s.status] : 1;
}

async function startAndFollow() {
  const mode = DRY ? "dry-run" : VERIFY_ONLY ? "verify-live" : "release";
  const passArgs = argv.filter((a) => !a.startsWith("--follow-for") && a !== "--run");
  const r = rs.startDetached(P, {
    script: fileURLToPath(import.meta.url),
    args: passArgs,
    initial: { mode, skip_checks: SKIP_CHECKS },
  });
  if (!r.started) {
    // Never adopt another run's result: it may be a dry run, or a release of
    // an older staging commit than the one this start was asked to ship.
    const s = rs.readState(P.state);
    console.log(
      `Not started: a ${(s && s.mode) || "release"} is already running (pid ${r.pid}${s ? `, started ${s.started_at}, step "${s.step}"` : ""}).\n` +
        `Follow it with: ${rs.WAIT_CMD}\n` +
        'When it has finished, run `cfrun npm run release` again; it says "Nothing to release" if everything on staging is already live.',
    );
    return 1;
  }
  console.log(
    r.how === "systemd"
      ? `Started the ${mode} as systemd user unit ${r.unit} (pid ${r.pid}). It keeps going if this command or the chat session ends.\nLog: ${P.log}\n`
      : `Started the ${mode} as a detached process (pid ${r.pid}).${r.why ? ` WARNING: ${r.why}, so closing this chat session can still stop it: follow it to the end.` : ""}\nLog: ${P.log}\n`,
  );
  return rs.follow(P, { windowMs: FOLLOW_MS });
}

if (RUN) {
  // Under systemd the lock still holds the starter's pid: take it over.
  rs.setLockPid(P.lock, process.pid);
  rs.writeState(P.state, { pid: process.pid });
  // Backstop: an exit with no recorded result is recorded as stopped.
  process.on("exit", (code) => {
    const s = rs.readState(P.state);
    if (s && s.status === "running" && s.pid === process.pid) {
      const st = rs.writeState(P.state, {
        status: "stopped",
        finished_at: new Date().toISOString(),
        message: `the release process exited (code ${code}) at step "${s.step}" without a result`,
      });
      try {
        rs.appendHistory(P.history, st);
      } catch {}
    }
    rs.releaseLock(P.lock);
  });
  process.on("SIGTERM", () => fail("the release process was sent SIGTERM"));
  process.on("SIGHUP", () => {}); // a closed terminal or chat is not a reason to stop
  main().catch((e) => fail(e.stderr ? String(e.stderr).trim() : e.message));
} else if (STATUS) {
  process.exit(status());
} else if (WAIT) {
  rs.follow(P, { windowMs: FOLLOW_MS }).then((c) => process.exit(c));
} else {
  startAndFollow().then((c) => process.exit(c));
}
