// scripts/shoot-asnm.mjs — photograph the directory so the page can SHOW it.
//
// Alec, 2026-09-09: "a picture is worth a thousand words, and it's just easier
// to show people what it is."
//
// NOT part of the deploy build, deliberately. Pulling the live counts costs one
// fetch and runs on every deploy; launching a browser to re-photograph another
// website does not belong in the critical path of shipping this one. Run it by
// hand when the directory's design changes:  npm run asnm:shot
//
// Captured at 2x and downscaled, because the frame is rendered ~880px wide on a
// laptop and a 1:1 capture is visibly soft on a retina screen.
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { statSync, writeFileSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TMP = "/tmp/asnm-shot.png";
// 1000 sliced straight through the second row of cards, which reads as a
// broken image rather than as "there is more below". 925 lands just under the
// "Recently verified" subtitle: a clean seam, and the cropped first row still
// implies the page continues.
const W = 1440, H = 925;

// TWO CAPTURES, art-directed, the same wide/tall split this site already uses
// for its band imagery. A 1440px desktop screenshot rendered 350px wide on a
// phone is not a demonstration of anything: the search box, the sport row and
// the programme names are all illegible, so it says "a website exists" and
// stops there. The phone gets the directory as a phone sees it.
const SHOTS = [
  // `out` sizes are chosen against how large the frame is actually DRAWN, not
  // against the capture. The wide shot renders ~1060 CSS px on a laptop, so
  // 1440 gives it about 1.4x for a retina screen; shipping the full 2x capture
  // was 203KB for detail nobody resolves. The tall shot renders ~350 CSS px on
  // a phone, so 828 is a genuine 2.4x.
  { key: "wide", w: 1440, h: 925, dpr: 2, ow: 1440, oh: 925,
    out: join(ROOT, "public", "images", "asnm-directory.webp") },
  { key: "tall", w: 414,  h: 760, dpr: 3, ow: 828,  oh: 1520,
    out: join(ROOT, "public", "images", "asnm-directory-tall.webp") },
];
const b = await chromium.launch();
const dims = {};
for (const s of SHOTS) {
  const p = await b.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: s.dpr, reducedMotion: "reduce" });
  await p.goto("https://adaptivesportsnearme.com/", { waitUntil: "load", timeout: 90000 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(4000);
  await p.screenshot({ path: TMP, clip: { x: 0, y: 0, width: s.w, height: s.h } });
  await p.close();
  execFileSync("/home/agentos/.venvs/vectorize/bin/python", ["-c", `
from PIL import Image
im = Image.open("${TMP}").convert("RGB")
im = im.resize((${s.ow}, ${s.oh}), Image.LANCZOS)
im.save("${s.out}", "WEBP", quality=${s.key === "tall" ? 74 : 78}, method=6)
`]);
  dims[s.key] = { w: s.ow, h: s.oh };
  console.log(`  asnm ${s.key} ${s.w}x${s.h} @${s.dpr}x -> ${(statSync(s.out).size / 1024).toFixed(1)} KB`);
}
await b.close();
writeFileSync(join(ROOT, "data", "asnm-shot.json"), JSON.stringify(dims, null, 1) + "\n");
console.log("  (dimensions recorded in data/asnm-shot.json for build-asnm.mjs)");
