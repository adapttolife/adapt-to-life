// Upload a review-only version of the existing Worker; never promote it to live traffic.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function previewAlias(branch) {
  if (!branch || branch === 'HEAD') {
    throw new Error('Cannot determine the preview branch. Set WORKERS_CI_BRANCH to the branch name.');
  }
  // Leave room for "-adapt-to-life" in the 63-character DNS label.
  // Hash transformed names so feature/a and feature-a have different URLs.
  const maxAliasLength = 63 - '-adapt-to-life'.length;
  if (/^[a-z][a-z0-9-]*$/.test(branch) && !branch.endsWith('-') && branch.length <= maxAliasLength) return branch;
  const hash = createHash('sha256').update(branch).digest('hex').slice(0, 8);
  let slug = branch.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z]/.test(slug)) slug = `branch-${slug}`;
  return `${slug.slice(0, maxAliasLength - hash.length - 1).replace(/-+$/g, '')}-${hash}`;
}

export function uploadPreview() {
  const branch = process.env.WORKERS_CI_BRANCH ||
    execFileSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8' }).trim();
  const alias = previewAlias(branch);
  // Allow local verification, but never allow callers to override the Worker,
  // environment or alias selected here.
  const extra = process.argv.slice(2);
  if (extra.some(arg => arg !== '--dry-run')) throw new Error('Only --dry-run is supported.');
  console.log(`Uploading review version for branch ${branch} (preview alias: ${alias})`);
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    'versions', 'upload', '--env', 'staging', '--preview-alias', alias, ...extra,
  ], {
    cwd: root,
    env: { ...process.env, ATL_TARGET: 'staging' },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  uploadPreview();
}
