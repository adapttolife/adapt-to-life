import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

// brand/README.md is the door: it says which logo to use for what. On
// 2026-09-29 an agent chose atl-logo.svg (the retired swoosh) for a signed
// grant letter because nothing but its name was there to go on. These
// checks keep the door complete and the print masters on the locked palette.

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BRAND = join(ROOT, "brand");
const LOCKED = new Set(["#3b3b46", "#ff5c39", "#f6be00", "#00b7bd", "#483698", "#f9f7f2", "#efe8dc", "#ffffff", "#fff"]);
const RETIRED_VIEWBOX = 'viewBox="217.61900000000003 211.68400000000003 1485.031 1351.756"';

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await files(path));
    else out.push(relative(BRAND, path));
  }
  return out;
}

test("every brand file is named in brand/README.md", async () => {
  const readme = await readFile(join(BRAND, "README.md"), "utf8");
  for (const file of await files(BRAND)) {
    if (file === "README.md") continue;
    const base = file.replace(/\.(eps|pdf)$/, ".svg");
    // obsolete/atl-logo.{eps,pdf} are listed on the same row as the .svg.
    assert.ok(readme.includes(file) || (file.startsWith("obsolete/") && readme.includes(base)),
      `brand/${file} is not listed in brand/README.md. Say what it is for, or move it to brand/obsolete/.`);
  }
});

test("the retired swoosh lives only in brand/obsolete/", async () => {
  for (const file of await files(BRAND)) {
    if (!file.endsWith(".svg") || file.startsWith("obsolete/")) continue;
    const svg = await readFile(join(BRAND, file), "utf8");
    assert.ok(!svg.includes(RETIRED_VIEWBOX), `brand/${file} is the retired swoosh; move it to brand/obsolete/`);
  }
});

test("print masters use only the locked palette", async () => {
  for (const file of await files(BRAND)) {
    if (!file.startsWith("identity/") || !file.endsWith(".svg")) continue;
    const svg = (await readFile(join(BRAND, file), "utf8")).toLowerCase();
    const colors = svg.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/g) ?? [];
    assert.ok(colors.length > 0, `brand/${file} declares no colors`);
    for (const color of colors) {
      assert.ok(LOCKED.has(color), `brand/${file} uses ${color}, which is not in the locked palette`);
    }
  }
  const primary = await readFile(join(BRAND, "identity", "atl-primary.svg"), "utf8");
  assert.match(primary.toLowerCase(), /#3b3b46/, "the primary lockup must carry the locked black");
});
