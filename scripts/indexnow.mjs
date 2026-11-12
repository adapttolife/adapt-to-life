#!/usr/bin/env node
// scripts/indexnow.mjs: send the pages that changed between two commits to
// IndexNow (see scripts/lib/indexnow.mjs). scripts/release.mjs does this after
// every release; run it by hand to resend.
//
//   node scripts/indexnow.mjs --since <ref> [--to <ref>] [--dry-run]
import { changedUrls, ping } from "./lib/indexnow.mjs";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const since = arg("--since");
if (!since) {
  console.error("usage: node scripts/indexnow.mjs --since <ref> [--to <ref>] [--dry-run]");
  process.exit(2);
}
const urls = changedUrls(since, arg("--to") || "HEAD");
for (const u of urls) console.log(u);
if (process.argv.includes("--dry-run")) {
  console.log(`dry run: ${urls.length} page(s) would be sent`);
} else {
  const r = await ping(urls);
  console.log(`IndexNow: ${r.sent} page(s), ${r.status}`);
}
