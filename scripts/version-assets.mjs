// scripts/version-assets.mjs: every page asks for the exact CSS and JS it
// was released with.
//
// WHY. Page HTML revalidates on every view (max-age=0), but /css/* and /js/*
// are cached for five minutes plus an hour of stale-while-revalidate
// (public/_headers). With a bare URL like /css/site.css, a returning visitor
// inside that hour can get NEW HTML and NEW JavaScript with the OLD
// stylesheet. On 2026-10-02 that is exactly what Alec's phone did: the new
// event cards rendered with no styles at all and their icons blown up to the
// full width of the screen.
//
// THE FIX. Each reference carries ?v=<first 8 hex of the file's sha256>. A new
// release changes the URL of anything that changed, so an old cached copy is
// never even asked for. Workers Assets ignores the query string when it looks
// up the file, so nothing else changes.
//
// The version is hashed from the SOURCE (src/css for stylesheets, which
// scripts/build-css.mjs only strips comments from; public/js for scripts). The
// references are committed, so the production build never rewrites a tracked
// file and build.txt stays clean. test/asset_versions.test.js fails when a
// reference is stale. After editing CSS or JS, run `npm run css` (it calls
// this) or `npm run assets`.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const hash = (buf) => createHash("sha256").update(buf).digest("hex").slice(0, 8);

// "/css/site.css" -> "a1b2c3d4", for every stylesheet and script we ship.
export function assetVersions() {
  const v = new Map();
  for (const f of readdirSync(join(ROOT, "src/css"))) {
    if (f.endsWith(".css")) v.set(`/css/${f}`, hash(readFileSync(join(ROOT, "src/css", f))));
  }
  for (const f of readdirSync(join(ROOT, "public/js"))) {
    if (f.endsWith(".js")) v.set(`/js/${f}`, hash(readFileSync(join(ROOT, "public/js", f))));
  }
  return v;
}

const REF = /(href|src)="(\/(?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[0-9a-f]*)?"/g;

// Rewrite every known /css and /js reference to carry its current version.
export function versionHtml(html, versions = assetVersions()) {
  return html.replace(REF, (m, attr, path) => (versions.has(path) ? `${attr}="${path}?v=${versions.get(path)}"` : m));
}

// Strip versions, for tools that match the bare link text (apply-hero,
// apply-page-headers, build-hero-lab). They unversion on read and version on
// write, so their exact-string logic keeps working.
export function unversionHtml(html) {
  return html.replace(REF, (m, attr, path) => `${attr}="${path}"`);
}

// Every shipped HTML page, excluding the separately built admin app.
export function htmlFiles(dir = join(ROOT, "public")) {
  const out = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (relative(join(ROOT, "public"), p) === "admin") continue;
      out.push(...htmlFiles(p));
    } else if (f.endsWith(".html")) out.push(p);
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const versions = assetVersions();
  let changed = 0;
  for (const p of htmlFiles()) {
    const before = readFileSync(p, "utf8");
    const after = versionHtml(before, versions);
    if (after !== before) { writeFileSync(p, after); changed++; }
  }
  const unknown = new Set();
  for (const p of htmlFiles()) {
    for (const [, , path] of readFileSync(p, "utf8").matchAll(REF)) if (!versions.has(path) && existsSync(join(ROOT, "public", path))) unknown.add(path);
  }
  console.log(`versioned assets in ${changed} page(s)` + (unknown.size ? `; unversioned (no source found): ${[...unknown].join(", ")}` : ""));
}
