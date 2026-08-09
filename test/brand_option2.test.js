import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");
const CORAL = "#FF5C39";
const INK = "#1A1A1A";

async function filesUnder(dir, extensions = new Set([".html", ".css", ".js", ".mjs", ".svg"])) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path, extensions));
    else if ([...extensions].some((ext) => entry.name.endsWith(ext))) files.push(path);
  }
  return files;
}

test("Option 2 is the canonical public brand palette", async () => {
  const css = await readFile(join(PUBLIC, "css/site.css"), "utf8");
  assert.match(css, /--orange:#FF5C39\b/, "primary accent must match the vector PDF exactly");
  assert.match(css, /--ink:#1A1A1A\b/, "primary ink must match the vector PDF exactly");

  for (const path of await filesUnder(ROOT)) {
    const relative = path.slice(ROOT.length);
    // Historical long-cached assets remain byte-identical by policy. Tests also
    // name the retired values explicitly so regressions can reject them.
    if (relative.startsWith("test/") || relative.startsWith("public/images/") || relative.startsWith("brand/") || relative.startsWith("docs/")) continue;
    const text = await readFile(path, "utf8");
    assert.ok(!text.includes("#E8572A"), `${relative} retains the retired site orange`);
    assert.ok(!text.includes("rgba(232,87,42"), `${relative} retains retired orange RGB channels`);
  }
});

test("every public monogram renders the Option 2 coral gesture", async () => {
  const pages = (await readdir(PUBLIC)).filter((name) => name.endsWith(".html"));
  for (const name of pages) {
    const html = await readFile(join(PUBLIC, name), "utf8");
    if (!html.includes('<header class="nav')) continue;
    const marks = html.match(/<svg[^>]*class="brand-logo"[\s\S]*?<\/svg>/g) ?? [];
    assert.equal(marks.length, 2, `${name} should have a header and footer monogram`);
    for (const mark of marks) {
      assert.ok(mark.includes('fill="currentColor"'), `${name} needs context-aware ink`);
      assert.ok(mark.includes(`fill="${CORAL}"`), `${name} needs the Option 2 coral gesture`);
    }
  }
});

test("browser and social metadata use cache-safe Option 2 asset paths", async () => {
  const pages = await filesUnder(PUBLIC, new Set([".html"]));
  for (const path of pages) {
    const html = await readFile(path, "utf8");
    if (html.includes('rel="icon"')) assert.ok(html.includes('/images/favicon-v2-option2.svg'), `${path.slice(PUBLIC.length)} favicon is stale`);
    for (const image of [...html.matchAll(/<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content="([^"]+)"/g)].map((m) => m[1])) {
      assert.match(image, /\/images\/og\/[a-z0-9-]+-v2-option2\.jpg$/, `${path.slice(PUBLIC.length)} social card is stale`);
    }
  }
});
