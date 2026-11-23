// Build and test the staging configuration, and deploy it only from `staging`
// onto its own Worker (adapt-to-life-staging). Never the production Worker.
//
//   npm run preview         build + tests + a wrangler dry run; uploads nothing
//   npm run deploy:staging  the same, then deploys env.staging, from staging only
//
// Until 2026-11-23 env.staging carried the production script name, so every
// staging build uploaded a version onto the production Worker. That afternoon a
// dashboard secret edit on production deployed the newest uploaded version,
// which was the staging build, and production ran staging code (fetch only, no
// scheduled or email handler) for eleven minutes. Staging is now its own
// script, and this file refuses to touch it while the names match.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export const STAGING_WORKER = "adapt-to-life-staging";
export const STAGING_URL = `https://${STAGING_WORKER}.adapt-to-life.workers.dev`;

// Only `staging` deploys. Every other branch is built and tested here and its
// pull request still gets a check, but nothing is uploaded, because previews go
// through the playground (Spec 206, three worlds).
export const DEPLOYING_BRANCHES = new Set(["staging"]);

// wrangler.jsonc with its whole-line comments removed (the file has no
// trailing comments; scripts/staging-live.test.mjs reads it through here).
export function readWranglerConfig(text = readFileSync(`${root}wrangler.jsonc`, "utf8")) {
  return JSON.parse(
    text.replace(/^\s*\/\/.*$/gm, "").replace(/,\s*([}\]])/g, "$1"),
  );
}

// Throws unless env.staging names its own Worker. A staging name equal to the
// production name is exactly the 2026-11-23 incident.
export function assertSeparateStagingWorker(config = readWranglerConfig()) {
  const name = config.env?.staging?.name;
  if (!name || name === config.name)
    throw new Error(
      `env.staging must name its own Worker (got "${name ?? ""}", production is "${config.name}"). Refusing to build staging.`,
    );
  if (name !== STAGING_WORKER)
    throw new Error(
      `env.staging is "${name}", but this script and scripts/release.mjs expect "${STAGING_WORKER}".`,
    );
  return name;
}

export function wranglerArgs(branch, { deploy = false, dryRun = false } = {}) {
  if (deploy && !DEPLOYING_BRANCHES.has(branch))
    throw new Error(
      `deploy:staging deploys only the staging branch, not "${branch || "(none)"}". Use npm run preview to build and test.`,
    );
  return ["deploy", "--env", "staging", ...(deploy && !dryRun ? [] : ["--dry-run"])];
}

export function runStaging({ deploy = process.argv.includes("--deploy") } = {}) {
  const branch =
    process.env.WORKERS_CI_BRANCH ||
    execFileSync("git", ["branch", "--show-current"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  // Never allow callers to choose another Worker, environment or command.
  const extra = process.argv.slice(2).filter((a) => a !== "--deploy");
  if (extra.some((arg) => arg !== "--dry-run"))
    throw new Error("Only --deploy and --dry-run are supported.");
  const args = wranglerArgs(branch, { deploy, dryRun: extra.includes("--dry-run") });
  const worker = assertSeparateStagingWorker();
  console.log(
    args.includes("--dry-run")
      ? `Validating branch ${branch}: build and tests only, nothing uploaded (previews go through the playground)`
      : `Deploying ${branch} to the ${worker} Worker (${STAGING_URL})`,
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
      ),
      ...args,
    ],
    {
      cwd: root,
      env: { ...process.env, ATL_TARGET: "staging" },
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runStaging();
}
