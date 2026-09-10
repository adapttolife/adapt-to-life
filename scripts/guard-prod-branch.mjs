// scripts/guard-prod-branch.mjs — production ships from main, and only from main.
//
// Why this exists: on 2026-09-10 the live site's build stamp resolved to
// `fix/tim-mobile-framing`, a branch named after a one-off photo crop, while
// `main` sat 272 files behind and did not even contain the homepage hero. Every
// deploy after that had to start by working out what production actually WAS.
// Nothing was broken and nothing was lost — main was a strict ancestor — but the
// next person to branch from main would have built against a site that does not
// exist, and the next person to deploy `main` would have reverted the site.
//
// It lives in the wrangler `build` command rather than in the `deploy:prod` npm
// script for the same reason the stamp does: a bare `npx wrangler deploy` must
// hit it too. A control a human has to remember to invoke is not a control.
//
// Staging is deliberately unguarded. Staging exists to look at a branch.
import { execFileSync } from "node:child_process";

// WRANGLER CANNOT TELL US THE TARGET. Measured 2026-09-10 by dry-running both:
// the build command receives CLOUDFLARE_ACCOUNT_ID / _API_TOKEN / _ZONE_ID and
// WRANGLER_COMMAND=deploy, and those are byte-identical for production and for
// `--env staging`. There is no CLOUDFLARE_ENV. Do not reach for argv either —
// the build command is not handed the deploy flags.
//
// So STAGING opts out, and everything else is production. `npm run
// deploy:staging` and `npm run preview` export ATL_TARGET=staging; a bare
// `wrangler deploy --env staging` gets refused, which is the correct direction
// to be wrong in — the message below says how to proceed, and the case that
// must never slip through cannot, because it needs no flag at all.
if (process.env.ATL_TARGET === "staging") {
  console.log("guard: staging — unguarded on purpose");
  process.exit(0);
}

const git = (...a) => execFileSync("git", a, { encoding: "utf8" }).trim();
const die = (why, fix) => {
  console.error(`\n  PRODUCTION DEPLOY REFUSED\n  ${why}\n  ${fix}\n`);
  process.exit(1);
};

if (process.env.ATL_ALLOW_UNSAFE_DEPLOY) {
  // Deliberately noisy and deliberately present: a guard with no way past it
  // gets deleted the first time it blocks a real emergency.
  console.warn(`\n  !! guard bypassed: ATL_ALLOW_UNSAFE_DEPLOY=${process.env.ATL_ALLOW_UNSAFE_DEPLOY}\n`);
  process.exit(0);
}

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
if (branch !== "main") {
  die(`on branch '${branch}', not main.`,
      "For staging use `npm run deploy:staging`. For production, merge to main and deploy from there (or ATL_ALLOW_UNSAFE_DEPLOY=<reason>).");
}

if (git("status", "--porcelain")) {
  die("the working tree has uncommitted changes.",
      "Production must be a commit anyone can check out. Commit or stash first.");
}

git("fetch", "origin", "main", "--quiet");
const [local, remote] = [git("rev-parse", "main"), git("rev-parse", "origin/main")];
if (local !== remote) {
  const ahead = git("rev-list", "--count", `origin/main..main`);
  die(`local main and origin/main differ (${ahead} commit(s) unpushed).`,
      "Push main first — what is live has to be readable from GitHub.");
}

console.log(`guard: production from main @ ${local.slice(0, 7)} — clean and pushed`);
