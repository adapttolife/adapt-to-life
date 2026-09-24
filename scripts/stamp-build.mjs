// scripts/stamp-build.mjs — write public/build.txt so a deploy can identify itself.
//
// Earned 2026-07-25: staging took eleven deploys in ninety minutes and only
// three were mine. Another branch landed on top of my build, the review link
// served the old card, and Alec found it before I did. check-site.mjs had passed
// twenty minutes earlier, correctly, against MY build; nothing was watching for
// someone else's build replacing it.
//
// The stamp is the commit plus a digest of public/, so it also catches "you
// deployed without rebuilding". It is gitignored: it describes a deploy, not a
// source file, and committing it would mean every deploy dirties the tree.
//
// Run immediately before `wrangler deploy`.
import { writeFileSync, readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");

const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const dirty = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" }).trim();
const branch = process.env.WORKERS_CI_BRANCH ||
  execFileSync("git", ["branch", "--show-current"], { cwd: ROOT, encoding: "utf8" }).trim() || null;

// digest every deployed file, so the stamp changes when the payload does
const h = createHash("sha256");
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { walk(p); continue; }
    if (["build.txt", "build.json"].includes(relative(PUB, p))) continue; // never digest build metadata
    h.update(relative(PUB, p));
    h.update(String(statSync(p).size));
    h.update(readFileSync(p));
  }
}
walk(PUB);

const digest = h.digest("hex").slice(0, 16);
const stamp = `${sha}${dirty ? "-dirty" : ""} ${digest}\n`;
writeFileSync(join(PUB, "build.txt"), stamp);
writeFileSync(join(PUB, "build.json"), JSON.stringify({
  commit: sha,
  branch,
  builtAt: new Date().toISOString(),
  dirty: Boolean(dirty),
  assetDigest: digest,
  commitUrl: `https://github.com/coldcrippy/adapt-to-life/commit/${sha}`,
}, null, 2) + "\n");
console.log(`stamped public/build.txt: ${stamp.trim()}`);
