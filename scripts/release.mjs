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
//   2. Staging is good: its build passed, the staging preview serves exactly
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
// Only then does it print LIVE. Any failure exits 1 and says where it stopped.
//
// Merging to main is a production deploy. Run this when the release is
// approved; --dry-run is always safe.
import { execFileSync } from "node:child_process";
import { checkLayout } from "./check-layout.mjs";

const REPO = "adapttolife/adapt-to-life";
const STAGING = "https://staging-adapt-to-life.adapt-to-life.workers.dev";
const LIVE = "https://adapttolife.org";
const CHECK = "Workers Builds: adapt-to-life";

const args = new Set(process.argv.slice(2));
const DRY = args.has("--dry-run"), VERIFY_ONLY = args.has("--verify-live"), SKIP_CHECKS = args.has("--skip-checks");

const sh = (cmd, a) => execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const gh = (a) => JSON.parse(sh("gh", a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (s) => s.slice(0, 7);
const t0 = Date.now();
const log = (m) => console.log(`[${String(Math.round((Date.now() - t0) / 1000)).padStart(4)}s] ${m}`);
function fail(m) { console.error(`\nSTOPPED: ${m}`); process.exit(1); }

async function stamp(base) {
  try {
    const r = await fetch(`${base}/build.txt?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const [first, digest] = (await r.text()).trim().split(/\s+/);
    return { sha: first.replace(/-dirty$/, ""), dirty: first.endsWith("-dirty"), digest };
  } catch { return null; }
}

function checkRun(sha) {
  const runs = gh(["api", `repos/${REPO}/commits/${sha}/check-runs`]).check_runs || [];
  return runs.filter((r) => r.name === CHECK).sort((a, b) => (b.started_at || "").localeCompare(a.started_at || ""))[0] || null;
}

async function waitFor(label, fn, { timeout = 15 * 60e3, every = 10e3 } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) fail(`timed out after ${Math.round(timeout / 60e3)} min waiting for ${label}`);
    await sleep(every);
  }
}

// Cloudflare Workers Builds: retrigger the same commit once.
async function retrigger(detailsUrl, sha) {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const m = (detailsUrl || "").match(/dash\.cloudflare\.com\/([0-9a-f]{32})\/.*\/builds\/([0-9a-f-]{36})/);
  if (!token || !m) return false;
  const [, account, build] = m;
  const api = (path, init) => fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/builds/${path}`,
    { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }).then((r) => r.json());
  const info = await api(`builds/${build}`);
  const trigger = info && info.result && info.result.trigger && info.result.trigger.trigger_uuid;
  if (!trigger) return false;
  const run = await api(`triggers/${trigger}/builds`, { method: "POST", body: JSON.stringify({ branch: "main", commit_hash: sha }) });
  return !!(run && run.success);
}

async function verifyLive(sha, stagingDigest) {
  log(`waiting for ${LIVE} to serve ${short(sha)}`);
  let retried = false;
  await waitFor(`production to serve ${short(sha)}`, async () => {
    const s = await stamp(LIVE);
    if (s && s.sha === sha) return true;
    if (!retried) {
      const run = checkRun(sha);
      if (run && run.status === "completed" && run.conclusion !== "success") {
        log(`production build ${run.conclusion}; retrying the same commit once through Cloudflare`);
        retried = await retrigger(run.details_url, sha);
        if (!retried) fail(`production build ${run.conclusion} and could not be retried here (needs cfrun for CLOUDFLARE_API_TOKEN). Logs: ${run.details_url}`);
      }
    }
    return false;
  }, { timeout: 25 * 60e3, every: 15e3 }); // room for one failed build plus a retry
  const live = await stamp(LIVE);
  if (live.dirty) fail(`production build.txt says -dirty: the build changed a tracked file (usually refreshed directory stats; commit them via staging)`);
  if (stagingDigest && live.digest !== stagingDigest) fail(`production files (digest ${live.digest}) differ from what was checked on staging (${stagingDigest})`);
  log(`production serves ${short(sha)}, no -dirty${stagingDigest ? ", same files as staging" : ""}`);
  if (!SKIP_CHECKS) {
    log("checking production pages (Chrome and Safari, phone and desktop)");
    const f = await checkLayout(LIVE, { log: (m) => console.log(`         ${m}`) });
    if (f.length) fail(`production is live but ${f.length} page check(s) failed (above): fix forward`);
  }
}

async function main() {
  sh("git", ["fetch", "--quiet", "origin", "main", "staging"]);
  const mainSha = sh("git", ["rev-parse", "origin/main"]);

  if (VERIFY_ONLY) {
    await verifyLive(mainSha, null);
    console.log(`\nLIVE: adapttolife.org is main ${short(mainSha)} and passes every check.`);
    return;
  }

  const stagingSha = sh("git", ["rev-parse", "origin/staging"]);
  const ahead = +sh("git", ["rev-list", "--count", "origin/main..origin/staging"]);
  if (!ahead) { console.log("Nothing to release: main already has everything on staging."); return; }

  // 1. What ships.
  const prs = [...sh("git", ["log", "--first-parent", "--merges", "--format=%s", "origin/main..origin/staging"]).matchAll(/#(\d+)/g)].map((m) => +m[1]);
  const titles = prs.reverse().map((n) => { try { return `#${n} ${gh(["pr", "view", String(n), "-R", REPO, "--json", "title"]).title}`; } catch { return `#${n}`; } });
  log(`releasing staging ${short(stagingSha)}:`);
  for (const t of titles.length ? titles : [`${ahead} commit(s) with no merged PR`]) console.log(`         ${t}`);

  // 2. Staging is good.
  log("waiting for the staging build to pass");
  const run = await waitFor("the staging build", () => { const r = checkRun(stagingSha); return r && r.status === "completed" ? r : null; });
  if (run.conclusion !== "success") fail(`the staging build ${run.conclusion}: ${run.details_url}`);
  log(`waiting for ${STAGING} to serve ${short(stagingSha)}`);
  await waitFor(`staging to serve ${short(stagingSha)}`, async () => { const s = await stamp(STAGING); return s && s.sha === stagingSha; });
  const st = await stamp(STAGING);
  if (st.dirty) fail("staging build.txt says -dirty");
  log(`staging serves ${short(stagingSha)}, no -dirty`);
  if (!SKIP_CHECKS) {
    log("checking staging pages (Chrome and Safari, phone and desktop)");
    const f = await checkLayout(STAGING, { log: (m) => console.log(`         ${m}`) });
    if (f.length) fail(`staging fails ${f.length} page check(s) (above); not releasing`);
  }
  if (DRY) { console.log(`\nDRY RUN OK: staging ${short(stagingSha)} passed every gate. Run without --dry-run to release.`); return; }

  // 3. Release PR, merged at exactly the checked commit.
  let pr = gh(["pr", "list", "-R", REPO, "--base", "main", "--head", "staging", "--state", "open", "--json", "number"])[0];
  if (!pr) {
    const title = `Release: ${titles.map((t) => t.replace(/^#\d+ /, "")).join("; ")}`.slice(0, 120);
    const body = `Released with scripts/release.mjs.\n\n${titles.map((t) => `- ${t}`).join("\n")}\n\nStaging ${short(stagingSha)} passed its build, served with no -dirty, and passed check-layout (Chrome and Safari, phone and desktop).`;
    sh("gh", ["pr", "create", "-R", REPO, "--base", "main", "--head", "staging", "--title", title, "--body", body]);
    pr = gh(["pr", "list", "-R", REPO, "--base", "main", "--head", "staging", "--state", "open", "--json", "number"])[0];
  }
  log(`merging release PR #${pr.number}`);
  sh("gh", ["pr", "merge", String(pr.number), "-R", REPO, "--merge", "--match-head-commit", stagingSha]);
  const mergeSha = gh(["pr", "view", String(pr.number), "-R", REPO, "--json", "mergeCommit"]).mergeCommit.oid;

  // 4 and 5. Production is that commit, and it passes.
  await verifyLive(mergeSha, st.digest);
  console.log(`\nLIVE: #${pr.number} is on adapttolife.org as ${short(mergeSha)}, the same files staging passed, and every check passes.`);
}

main().catch((e) => fail(e.stderr ? String(e.stderr).trim() : e.message));
