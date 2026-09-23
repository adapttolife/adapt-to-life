// One Workers Builds command for production and branch builds.
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const branch = process.env.WORKERS_CI_BRANCH;
if (!branch) throw new Error('deploy:ci requires WORKERS_CI_BRANCH from Cloudflare Builds. Use preview or deploy:prod locally.');

if (branch !== 'main') {
  const { uploadPreview } = await import('./branch-preview.mjs');
  uploadPreview();
} else {
  if (process.argv.length > 2) throw new Error('deploy:ci accepts no production arguments.');
  // Preserve the existing dashboard check, including support for detached HEAD.
  git('fetch', 'origin', 'main:refs/remotes/origin/main');
  if (git('rev-parse', 'HEAD') !== git('rev-parse', 'origin/main')) {
    throw new Error('Production deploy refused: HEAD is not the current origin/main commit.');
  }
  git('checkout', '-B', 'main');
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    'deploy', '--env=',
  ], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
