// scripts/lib/indexnow.mjs: tell search engines which pages changed, the day
// they change (IndexNow, indexnow.org: Bing, Yandex, Seznam, Naver and others
// share one endpoint).
//
// Alec, Nov 12 2026, "Do 4, 5 and 6" (turn on Crawler Hints). Cloudflare's
// Crawler Hints does this from cache signals, but its switch is dashboard-only
// and this site's HTML is never cached (max-age=0), so scripts/release.mjs
// pings directly once production is verified. The key is public by design:
// public/<KEY>.txt proves the site sent the list.
//
//   node scripts/indexnow.mjs --since <ref> [--to <ref>] [--dry-run]
import { execFileSync } from "node:child_process";

export const KEY = "13ef11b00a57af2f21b0d2371fedd875";
export const HOST = "adapttolife.org";

// public/about.html -> https://adapttolife.org/about; public/index.html -> /.
export function urlFor(file) {
  const path = file.replace(/^public\//, "").replace(/\.html$/, "");
  if (path === "index") return `https://${HOST}/`;
  return `https://${HOST}/${path.replace(/\/index$/, "")}`;
}

// Pages changed between two commits that are in the sitemap at `to` (so
// previews, labs and noindex pages are never sent).
export function changedUrls(from, to = "HEAD", cwd = process.cwd()) {
  const git = (...a) => execFileSync("git", a, { cwd, encoding: "utf8" });
  const listed = new Set([...git("show", `${to}:public/sitemap.xml`).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  const files = git("diff", "--name-only", from, to, "--", "public/").split("\n").filter((f) => f.endsWith(".html"));
  return [...new Set(files.map(urlFor))].filter((u) => listed.has(u));
}

export async function ping(urls) {
  if (!urls.length) return { sent: 0, status: "nothing changed" };
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls.slice(0, 10000) }),
  });
  return { sent: urls.length, status: r.status };
}
