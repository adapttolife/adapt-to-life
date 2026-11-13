// Upload a staging version using live services; never promote it to production traffic.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function previewAlias(branch) {
  if (!branch || branch === "HEAD") {
    throw new Error(
      "Cannot determine the preview branch. Set WORKERS_CI_BRANCH to the branch name.",
    );
  }
  // Leave room for "-adapt-to-life" in the 63-character DNS label.
  // Hash transformed names so feature/a and feature-a have different URLs.
  const maxAliasLength = 63 - "-adapt-to-life".length;
  if (
    /^[a-z][a-z0-9-]*$/.test(branch) &&
    !branch.endsWith("-") &&
    branch.length <= maxAliasLength
  )
    return branch;
  const hash = createHash("sha256").update(branch).digest("hex").slice(0, 8);
  let slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!/^[a-z]/.test(slug)) slug = `branch-${slug}`;
  return `${slug.slice(0, maxAliasLength - hash.length - 1).replace(/-+$/g, "")}-${hash}`;
}

// Only `staging` uploads: scripts/release.mjs follows its preview alias.
// Every other branch is built and tested here and its pull request still gets
// the "Workers Builds: adapt-to-life" check, but nothing is uploaded, because
// previews go through the playground (Spec 206, three worlds). Until
// 2026-11-13 the Cloudflare trigger was named "Validate non-production
// branches (no upload/deploy)" yet uploaded every branch, with production
// bindings, onto the production Worker under its own alias.
export const UPLOADING_BRANCHES = new Set(["staging"]);

export function wranglerArgs(branch, extra = []) {
  const upload = UPLOADING_BRANCHES.has(branch) && !extra.includes("--dry-run");
  return [
    "versions",
    "upload",
    "--env",
    "staging",
    "--preview-alias",
    previewAlias(branch),
    ...(upload ? [] : ["--dry-run"]),
  ];
}

export function uploadPreview() {
  const branch =
    process.env.WORKERS_CI_BRANCH ||
    execFileSync("git", ["branch", "--show-current"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  // Allow local verification, but never allow callers to override the Worker,
  // environment or alias selected here.
  const extra = process.argv.slice(2);
  if (extra.some((arg) => arg !== "--dry-run"))
    throw new Error("Only --dry-run is supported.");
  const args = wranglerArgs(branch, extra);
  console.log(
    args.includes("--dry-run")
      ? `Validating branch ${branch}: build and tests only, nothing uploaded (previews go through the playground)`
      : `Uploading the ${branch} version (preview alias: ${previewAlias(branch)})`,
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
  uploadPreview();
}
