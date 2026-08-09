import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");
const NEW_VIEWBOX = 'viewBox="0 0 500.000000 457.000000"';
const OLD_VIEWBOX = 'viewBox="217.61900000000003 211.68400000000003 1485.031 1351.756"';

async function brandedPages() {
  const names = (await readdir(PUBLIC)).filter((name) => name.endsWith(".html"));
  const pages = [];
  for (const name of names) {
    const html = await readFile(join(PUBLIC, name), "utf8");
    if (html.includes('<header class="nav')) pages.push({ name, html });
  }
  return pages;
}

async function htmlPages(dir = PUBLIC) {
  const pages = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) pages.push(...await htmlPages(path));
    if (entry.isFile() && entry.name.endsWith(".html")) {
      pages.push({ name: path.slice(PUBLIC.length + 1), html: await readFile(path, "utf8") });
    }
  }
  return pages;
}

test("every site header and footer uses the 2026 ATL monogram", async () => {
  const pages = await brandedPages();
  assert.ok(pages.length > 0, "expected branded public pages");

  for (const { name, html } of pages) {
    const marks = html.match(/<svg[^>]*class="brand-logo"[\s\S]*?<\/svg>/g) ?? [];
    assert.equal(marks.length, 2, `${name} should have one header and one footer mark`);
    for (const mark of marks) {
      assert.ok(mark.includes(NEW_VIEWBOX), `${name} should use the 2026 monogram geometry`);
      assert.ok(mark.includes('fill="currentColor"'), `${name} mark should inherit light/dark context`);
      assert.ok(!mark.includes(OLD_VIEWBOX), `${name} must not retain the legacy mark`);
      assert.ok(!mark.includes("#E85D04"), `${name} must not retain the legacy orange path`);
    }
  }
});

test("favicon assets use the optimized 2026 monogram", async () => {
  const pages = await htmlPages();
  pages.push({ name: "admin-app/index.html", html: await readFile(join(ROOT, "admin-app", "index.html"), "utf8") });
  for (const { name, html } of pages) {
    if (!html.includes('rel="icon"')) continue;
    assert.ok(html.includes('href="/images/favicon-2026.svg"'), `${name} should request the versioned 2026 SVG favicon`);
    assert.ok(!html.includes('href="/images/atl-logo.svg"'), `${name} must not request the cache-stale SVG favicon`);
    if (html.includes('type="image/png"')) {
      assert.ok(html.includes('href="/images/favicon-2026-32.png"'), `${name} should request the versioned 2026 PNG favicon`);
    }
    if (html.includes('rel="apple-touch-icon"')) {
      assert.ok(html.includes('href="/images/apple-touch-icon-2026.png"'), `${name} should request the versioned 2026 Apple icon`);
    }
  }

  for (const name of ["favicon-2026.svg"]) {
    const svg = await readFile(join(PUBLIC, "images", name), "utf8");
    assert.ok(svg.includes(NEW_VIEWBOX), `${name} should use the 2026 geometry`);
    assert.ok(svg.includes("prefers-color-scheme: dark"), `${name} should stay visible in dark browser chrome`);
    assert.ok(svg.includes("fill: #1a1a1a"), `${name} should use the dark mark in light mode`);
    assert.ok(svg.includes("fill: #f7f3eb"), `${name} should use the cream mark in dark mode`);
    assert.ok(!svg.includes(OLD_VIEWBOX), `${name} must not retain the legacy mark`);
  }

  const rasterAssets = new Map([
    ["favicon-2026-32.png", { hash: "ada4f43a926d18b6c91e069fe94a4a0b73c9d38a2d6814646b66da0f29c33e50", width: 32, height: 32 }],
    ["apple-touch-icon-2026.png", { hash: "fbc0476196671aad6db13e56eef50064a858e89a9c7c3a51f73eb6a73bb6e5ce", width: 180, height: 180 }],
  ]);
  for (const [name, expected] of rasterAssets) {
    const png = await readFile(join(PUBLIC, "images", name));
    assert.equal(png.subarray(1, 4).toString(), "PNG", `${name} should remain a PNG`);
    assert.equal(png.readUInt32BE(16), expected.width, `${name} width drifted`);
    assert.equal(png.readUInt32BE(20), expected.height, `${name} height drifted`);
    assert.equal(createHash("sha256").update(png).digest("hex"), expected.hash, `${name} must be the approved 2026 rendering`);
  }
});

test("social cards use the 2026 monogram on cache-busting URLs", async () => {
  const generator = await readFile(join(ROOT, "scripts", "make-og.mjs"), "utf8");
  const writer = await readFile(join(ROOT, "scripts", "wire-og.mjs"), "utf8");
  assert.ok(generator.includes('brand/atl-logo-2026-ui.svg'), "OG generator should use the approved 2026 source");
  assert.ok(!generator.includes('public/images/atl-logo.svg'), "OG generator must not use the legacy source");
  assert.ok(writer.includes('${name}-2026.jpg'), "OG writer should version image URLs");

  const legacyHashes = new Map([
    ["images/atl-logo.svg", "421057c39131ad5431f255733d00af1a289844cfdb151e8ed0b8917ae069d4b2"],
    ["images/favicon.svg", "9123a9d8b7c00aa31f743f1ef0e9d2c0d1c19bc4921597489450703391a0696d"],
    ["images/favicon-32.png", "26daf6ac19470c5f76d91ba1c4c841320e2b66fb88755348c211883d510cba78"],
    ["images/apple-touch-icon.png", "75a95b1739b0d832de86526a4dc688aafe55e3d09fe434a0ac685f7dee1ec83f"],
    ["images/og/home.jpg", "3b5f971c34c5cf12045381a444d548a11875b5848e91206703430e00e9a7d3e2"],
    ["images/og/donate.jpg", "17ddcfb7aeabe74d4d4abd6954f0a5c25c8cd259b0a9522be331503c1affd172"],
    ["images/og/send-6.jpg", "710fc1287b8965456a4b3f65810cc2c6c34b96aa949df167ea28e4e0720edd3f"],
    ["images/og/popcorn.jpg", "9f0dccedfde53994d89527ec146cc9955f084950d50347e6f06727df35bd467e"],
    ["images/og/hustle-and-heart.jpg", "7a24e7cf87c691f801303e1e593c45d7e5b28f5fcb549f82af565ed63a9cb456"],
    ["images/og/ways-to-give.jpg", "052ac3ba2ddd139929841716584802b7c165af0967db04f4a3a3a0c0e7105099"],
  ]);
  const approvedCardHashes = new Map([
    ["images/og/home-2026.jpg", "00a4a08fac83723da29cf6fd3aae7724177711d343029d14a49d3e654488abcc"],
    ["images/og/donate-2026.jpg", "c7e78ca3122b7c39a9e781d1c60a35f19f8cb3f31636ce04121b08a2f69a3271"],
    ["images/og/send-6-2026.jpg", "597c643dc245592e08c9546abdd1bba6f52326a5f83b2486d87ee8a398a980bc"],
    ["images/og/popcorn-2026.jpg", "984894be80d76199c05d4a81b54c0b959a85cd83bba9b4a7457f11c8329ea772"],
    ["images/og/hustle-and-heart-2026.jpg", "ee4597876c0af7da7bee7a6dc5d02c9fd41d533991cb38dd6762377b1243f79f"],
    ["images/og/ways-to-give-2026.jpg", "2f7eecfc12d8c358bc3a721a16a3cf4c486d85b928ef461021064f9a0145ac6c"],
  ]);
  for (const [relative, expected] of [...legacyHashes, ...approvedCardHashes]) {
    const bytes = await readFile(join(PUBLIC, relative));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected, `${relative} hash drifted`);
  }

  for (const { name, html } of await htmlPages()) {
    const images = [...html.matchAll(/<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content="([^"]+)"/g)]
      .map((match) => match[1]);
    for (const image of images) {
      assert.match(image, /\/images\/og\/[a-z0-9-]+-2026\.jpg$/, `${name} should request a versioned 2026 social card`);
    }
  }
});
