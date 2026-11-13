#!/usr/bin/env node
// scripts/release.mjs: one command from staging to live, and it only says
// done once production is verified.
//
//   cfrun npm run release                 # release what staging has that main lacks
//   npm run release -- --dry-run          # every gate up to the merge, then stop
//   npm run release -- --verify-live      # check that production is main and healthy
//
// The steps, each a gate that stops the release when it fails:
//   1. Name what ships: the pull requests merged into staging since main.
//   2. Staging is good: its build passed (a failed build is retried once,
//      as production's is), the staging preview serves exactly
//      that commit with no -dirty, and scripts/check-layout.mjs passes there
//      (Chrome and Safari engines, phone and desktop).
//   3. Open (or reuse) the staging -> main release PR and merge it, pinned to
//      the commit that was checked (--match-head-commit).
//   4. Production is that commit: adapttolife.org/build.txt shows the merge
//      commit, no -dirty, and the same file digest staging had. If Cloudflare's
//      build fails (its asset upload failed once on 2026-10-02 with error
//      10013), the build is retriggered once through the Cloudflare API; that
//      needs CLOUDFLARE_API_TOKEN, which `cfrun` provides.
//   5. Production passes check-layout.
//   6. Search engines hear which pages changed (IndexNow, scripts/lib/
//      indexnow.mjs). This one never stops a release.
// Only then does it print LIVE. Any failure exits 1 and says where it stopped.
//
// Merging to main is a production deploy. Run this when the release is
// approved; --dry-run is always safe.
//
// Run it in the foreground. It is bounded at 9 minutes, so one call always
// ends with LIVE or STOPPED (the Bash tool stops at 10). Backgrounded, its
// result can be lost: T3 can drop the notice that wakes the session.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { checkLayout, chromiumPath } from "./check-layout.mjs";
import { changedUrls, ping } from "./lib/indexnow.mjs";

const REPO = "adapttolife/adapt-to-life";
const STAGING = "https://staging-adapt-to-life.adapt-to-life.workers.dev";
const LIVE = "https://adapttolife.org";
const CHECK = "Workers Builds: adapt-to-life";

const argv = process.argv.slice(2);
// An unknown option used to be ignored and a real release ran.
const unknown = argv.filter((a) => !/^--(dry-run|verify-live|skip-checks)$/.test(a));
if (unknown.length) {
  console.error(`Unknown option(s): ${unknown.join(" ")}. Nothing was started.`);
  process.exit(2);
}
const args = new Set(argv);
const DRY = args.has("--dry-run"),
  VERIFY_ONLY = args.has("--verify-live"),
  SKIP_CHECKS = args.has("--skip-checks");

const sh = (cmd, a) =>
  execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gh = (a) => JSON.parse(sh("gh", a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s) => s.slice(0, 7);
const t0 = Date.now();
const DEADLINE = t0 + 9 * 60e3;
let merged = false;
const log = (m) =>
  console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${m}`);
function fail(m) {
  console.error(`\nSTOPPED: ${m}`);
  process.exit(1);
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

async function waitFor(label, fn, { every = 10e3 } = {}) {
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() + every > DEADLINE)
      fail(
        `still waiting for ${label} after 9 minutes` +
          (merged
            ? ". The merge is done and Cloudflare may still deploy it: check with `npm run release -- --verify-live`"
            : ""),
      );
    await sleep(every);
  }
}

// Cloudflare Workers Builds: retrigger the same commit once.
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

// Playwright deletes a browser build once no install it knows about uses it,
// and worktrees come and go: WebKit vanished from the box, check-layout could
// not run Safari's engine, and releases ran with --skip-checks for weeks.
async function ensureBrowsers() {
  const { chromium, webkit } = await import("playwright");
  const missing = [];
  if (!fs.existsSync(chromium.executablePath()) && !chromiumPath())
    missing.push("chromium");
  if (!fs.existsSync(webkit.executablePath())) missing.push("webkit");
  if (!missing.length) return;
  log(`installing ${missing.join(" and ")} for the page checks`);
  sh("npx", ["playwright", "install", ...missing]);
}

const checked = (where) =>
  SKIP_CHECKS
    ? `page checks skipped on ${where} (--skip-checks)`
    : `passes check-layout on ${where} (Chrome and Safari, phone and desktop)`;

async function verifyLive(sha, stagingDigest) {
  log(`waiting for ${LIVE} to serve ${short(sha)}`);
  let retried = false;
  // Judge the files on the same response that showed the commit: during
  // Cloudflare's rollout a second fetch can land on the old version (release
  // #312 stopped on exactly that, 2026-11-13).
  const live = await waitFor(
    `production to serve ${short(sha)}`,
    async () => {
      const s = await stamp(LIVE);
      if (s && s.sha === sha) return s;
      if (!retried) {
        const run = checkRun(sha);
        if (run && run.status === "completed" && run.conclusion !== "success") {
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
    { every: 15e3 },
  );
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
    log("checking production pages (Chrome and Safari, phone and desktop)");
    const f = await checkLayout(LIVE, { log: (m) => console.log(`         ${m}`) });
    if (f.length)
      fail(
        `production is live but ${f.length} page check(s) failed (above): fix forward`,
      );
  }
}

async function main() {
  sh("git", ["fetch", "--quiet", "origin", "main", "staging"]);
  const mainSha = sh("git", ["rev-parse", "origin/main"]);
  if (!SKIP_CHECKS) await ensureBrowsers();

  if (VERIFY_ONLY) {
    await verifyLive(mainSha, null);
    console.log(
      `\nLIVE: adapttolife.org is main ${short(mainSha)} and ${checked("production")}.`,
    );
    return;
  }

  const stagingSha = sh("git", ["rev-parse", "origin/staging"]);
  const ahead = +sh("git", ["rev-list", "--count", "origin/main..origin/staging"]);
  if (!ahead) {
    // Nothing new: confirm production anyway, so re-running after any
    // interruption (a lost session, an API outage) still ends verified.
    log("nothing new on staging; confirming production");
    await verifyLive(mainSha, null);
    console.log(
      `\nLIVE: nothing new to release; adapttolife.org is main ${short(mainSha)} and ${checked("production")}.`,
    );
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

  // 2. Staging is good.
  log("waiting for the staging build to pass");
  const run = await waitFor("the staging build", () => {
    const r = checkRun(stagingSha);
    return r && r.status === "completed" ? r : null;
  });
  let failedRun = null;
  if (run.conclusion !== "success") {
    log(
      `the staging build ${run.conclusion}; retrying the same commit once through Cloudflare`,
    );
    if (!(await retrigger(run.details_url, stagingSha, "staging")))
      fail(
        `the staging build ${run.conclusion} and could not be retried here (needs cfrun): ${run.details_url}`,
      );
    failedRun = run.id;
  }
  log(`waiting for ${STAGING} to serve ${short(stagingSha)}`);
  await waitFor(`staging to serve ${short(stagingSha)}`, async () => {
    const s = await stamp(STAGING);
    if (s && s.sha === stagingSha) return true;
    const r = failedRun && checkRun(stagingSha);
    if (
      r &&
      r.id !== failedRun &&
      r.status === "completed" &&
      r.conclusion !== "success"
    )
      fail(`the retried staging build ${r.conclusion} too: ${r.details_url}`);
    return false;
  });
  const st = await stamp(STAGING);
  if (st.dirty) fail("staging build.txt says -dirty");
  log(`staging serves ${short(stagingSha)}, no -dirty`);
  if (!SKIP_CHECKS) {
    log("checking staging pages (Chrome and Safari, phone and desktop)");
    const f = await checkLayout(STAGING, { log: (m) => console.log(`         ${m}`) });
    if (f.length)
      fail(`staging fails ${f.length} page check(s) (above); not releasing`);
  }
  if (DRY) {
    console.log(
      `\nDRY RUN OK: staging ${short(stagingSha)} passed its build, serves with no -dirty, and ${checked("staging")}. Run without --dry-run to release.`,
    );
    return;
  }

  // 3. Release PR, merged at exactly the checked commit.
  let pr = gh([
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
  if (!pr) {
    const title =
      `Release: ${titles.map((t) => t.replace(/^#\d+ /, "")).join("; ")}`.slice(0, 120);
    const body = `Released with scripts/release.mjs.\n\n${titles.map((t) => `- ${t}`).join("\n")}\n\nStaging ${short(stagingSha)} passed its build, served with no -dirty, and ${checked("staging")}.`;
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
    pr = gh([
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
  log(`merging release PR #${pr.number}`);
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
  merged = true;
  const mergeSha = gh([
    "pr",
    "view",
    String(pr.number),
    "-R",
    REPO,
    "--json",
    "mergeCommit",
  ]).mergeCommit.oid;

  // 4 and 5. Production is that commit, and it passes.
  await verifyLive(mergeSha, st.digest);

  // 6. Tell search engines which pages changed. Never stops the release.
  try {
    sh("git", ["fetch", "--quiet", "origin", "main"]);
    const r = await ping(changedUrls(mainSha, mergeSha));
    log(`IndexNow: ${r.sent} changed page(s) sent (${r.status})`);
  } catch (e) {
    log(`IndexNow skipped: ${e.message}`);
  }
  console.log(
    `\nLIVE: #${pr.number} is on adapttolife.org as ${short(mergeSha)}, the same files staging passed, and ${checked("production")}.`,
  );
}

main().catch((e) => fail(e.stderr ? String(e.stderr).trim() : e.message));
