// scripts/make-og.mjs — the share-card generator.
//
// WHY THIS IS CODE AND NOT A DESIGN FILE: an og:image is the one piece of the
// site nobody sees while building it. It is seen in a text thread, at half
// size, months later. A hand-exported JPEG drifts from the site the first time
// the brand moves (the June card still used Arial and the old orange). Cards
// live here so they re-render from the same tokens the site uses, and so every
// page can have its own without opening a design tool.
//
// Two gates run on every card, both taken from how the card is actually seen:
//   1. THUMBNAIL GATE — iMessage/Telegram render the card around 300px wide.
//      The headline must survive a 4x downscale, so its computed size must be
//      >= MIN_HEADLINE_PX and nothing may sit outside the 1200x630 frame.
//   2. SEAM GATE — in a split card the type must clear the photograph. A full
//      stop touching the photo is invisible at 1200px and obvious at 300px.
//   3. WEIGHT GATE — WhatsApp and some crawlers skip previews over ~300KB.
//      Every card ships under BUDGET_BYTES.
//   4. RESOLUTION GATE — the crop must not upscale the photograph. A card zooms
//      into a panel 1200 device pixels wide, so the web-sized copies in public/
//      are not enough source; masters live in assets/photos/.
//
// Usage:
//   node scripts/make-og.mjs                 # render every card in CARDS
//   node scripts/make-og.mjs home popcorn    # render named cards only
//   node scripts/make-og.mjs --out ~/scratch/stingel/og-candidate  # candidates
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 1200, H = 630;
const MIN_HEADLINE_PX = 62;      // 62/4 ~= 15px in a chat thread — readable
const BUDGET_BYTES = 300 * 1024; // WhatsApp-class preview ceiling
const MIN_SEAM_CLEAR = 24;       // gap the type must leave before the photo
const DSF = 2;                   // render scale; the card is supersampled from 2x
const MAX_UPSCALE = 1.0;         // no upscaling, ever: it cannot be undone later

// Photos are the site's own, of real athletes. `pos` is the CSS
// background-position that keeps the subject in frame after the 1.91:1 crop.
//
// SOURCES LIVE IN assets/, NOT public/. A card crops hard into a panel that is
// 1200 device pixels wide, so it needs far more source than the page does. The
// web-sized copies in public/ (1600px) were being UPSCALED by the crop, which is
// invisible at 1200px and mushy on a retina phone. assets/ is outside the
// deployed asset directory, so the masters cost the visitor nothing.
const PHOTOS = {
  karen:    { file: "assets/photos/karen-waterskiing.jpg", pos: "52% 40%" },
  coaching: { file: "assets/photos/coaching.jpg",          pos: "34% 44%" },
  // Adaptive pickleball, because the US Open in Naples is a PICKLEBALL
  // championship. Ruled out a warmer frame from the same set: another
  // organisation's logo was legible on it, and a partner's branding does not
  // belong on our card (the same call as the popcorn vendor's bag).
  pickle:   { file: "assets/photos/pickleball-court.jpg",    pos: "27% 58%" },
  // Brand artwork, not a photograph: the mark rendered as an object. Both files
  // arrived with a Gemini sparkle in the corner and are cropped to exclude it.
  black:    { file: "assets/art/mark-black.jpg",             pos: "50% 42%" },
  fire:     { file: "assets/art/mark-fire.jpg",              pos: "50% 46%" },
  // PARKED, not forgotten: Alec's own water shot exists only as a 1600x1067
  // web copy, which the resolution gate rejects for any crop that fills a panel.
  // Its master (JNC02305.JPG, 6.8MB) is the one file the Drive connector will
  // not return. Give this a >=2200px-tall master and send-6 can use it again.
  alec:     { file: "public/images/alec-waterskiing.jpg",  pos: "50% 36%" },
};

// THE CARDS. `headline` takes one <em> for the italic orange accent.
//
// Every headline is the page's OWN h1, not new copy. A share card is the page's
// first impression, so inventing a line for it would put an unapproved promise
// in front of people before they ever reach the page, and would drift the day
// the page is edited. docs/CONTENT.md owns these words.
//
// Only the pages people actually send to each other get their own card. Every
// other page falls back to the default, which is now worth falling back to.
const MONO = { variant: "mono", size: 74, measure: "13ch" };
const CARDS = {
  // the default: adapttolife.org/ and any page without its own card
  // On its own path, NOT the historical /images/og-image.jpg. Assets ship with
  // a 30-day cache header, so reusing that URL means every platform and thread
  // that already scraped the June card keeps serving it. A new design needs a
  // new URL or the most-shared link is the last one to update.
  home: { ...MONO, out: "public/images/og/home-v2-option2.jpg", page: "index.html",
    headline: "Your place in <em>adaptive sports</em>." },
  donate: { ...MONO, out: "public/images/og/donate-v2-option2.jpg", page: "donate.html",
    headline: "Put an athlete <em>in the game</em>." },
  "send-6": { ...MONO, out: "public/images/og/send-6-v2-option2.jpg", page: "send-6.html",
    headline: "Send 6 to the <em>US Open</em> Spring 2027." },
  popcorn: { ...MONO, out: "public/images/og/popcorn-v2-option2.jpg", page: "popcorn.html",
    headline: "Half of every bag <em>puts an athlete in the game</em>.",
    size: 64, measure: "16ch" },
  "hustle-and-heart": { ...MONO, out: "public/images/og/hustle-and-heart-v2-option2.jpg",
    page: "hustle-and-heart.html",
    headline: "Every dollar goes to <em>an athlete</em>.", measure: "14ch" },
  "ways-to-give": { ...MONO, out: "public/images/og/ways-to-give-v2-option2.jpg",
    page: "ways-to-give.html",
    headline: "Every road here ends <em>on a court</em>.", measure: "14ch" },
  volunteer: { ...MONO, out: "public/images/og/volunteer-v2-option2.jpg",
    page: "volunteer.html",
    headline: "Your place on <em>this team</em>." },
};

// ---- candidate sets: same content, three treatments, for a design review ----
const LINE = "Your place in <em>adaptive sports</em>.";
// The photo panel in a split card is ~150px wide in a chat thread, so the
// subject is zoomed until she holds it at that size.
const SPLIT = { variant: "split", photo: "karen", headline: LINE, size: 74,
                measure: "12ch", zoom: "auto 168%", pos: "56% 34%" };
const CANDIDATES = {
  "m1-home-black":   { out: "m1-home-black.jpg", variant: "mono", photo: "black",
    headline: "Your place in <em>adaptive sports</em>.", size: 76, measure: "13ch" },
  "m2-send6-black":  { out: "m2-send6-black.jpg", variant: "mono", photo: "black",
    headline: "Send 6 to the <em>US Open</em> Spring 2027.", size: 68, measure: "16ch" },
  "m3-donate-black": { out: "m3-donate-black.jpg", variant: "mono", photo: "black",
    headline: "Put an athlete <em>in the game</em>.", size: 76, measure: "13ch" },
  "m4-home-fire":    { out: "m4-home-fire.jpg", variant: "mono", photo: "fire",
    headline: "Your place in <em>adaptive sports</em>.", size: 76, measure: "13ch" },
  "b-paper": { out: "b-paper.jpg", variant: "light", headline: LINE, size: 96, measure: "13ch" },
  "c-split": { ...SPLIT, out: "c-split.jpg" },
  "d-split-light": { ...SPLIT, out: "d-split-light.jpg", variant: "split light" },
};

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
// guard the -1 case: without --out, outIdx+1 is 0 and would eat the first name
const names = args.filter((a, i) => !a.startsWith("--") && !(outIdx >= 0 && i === outIdx + 1));
const set = outDir ? CANDIDATES : CARDS;
const todo = names.length ? names : Object.keys(set);

// The mark is the site's own SVG, recoloured per variant. Inlined so the
// headless render never depends on a file:// image resolving.
const logoSrc = readFileSync(join(ROOT, "brand/atl-logo-v2-option2-ui.svg"), "utf8");
function mark(variant) {
  const body = (variant || "").includes("light") ? "#1C1A15" : "#F7F4EE";
  return logoSrc.replace(/currentColor/g, body);
}

function dataUri(rel) {
  const buf = readFileSync(join(ROOT, rel));
  const mime = rel.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function intrinsic(rel) {
  const [w, h] = execFileSync("identify", ["-format", "%w %h", join(ROOT, rel) + "[0]"],
    { encoding: "utf8" }).trim().split(" ").map(Number);
  return { w, h };
}

// How much the crop stretches the source. The card renders at deviceScaleFactor
// DSF, so the photo element's device-pixel box is its CSS box times DSF; the
// two background-size modes we use resolve as below. >1 means upscaling, which
// reads as mush on a retina screen and cannot be recovered later.
function sourceScale({ box, src, zoom }) {
  let renderedH;
  const m = /auto\s+([\d.]+)%/.exec(zoom || "");
  if (m) renderedH = box.h * (parseFloat(m[1]) / 100);
  else renderedH = box.h * Math.max((box.w / box.h) / (src.w / src.h), 1); // cover
  return (renderedH * DSF) / src.h;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.goto(`file://${join(ROOT, "src/og/card.html")}`);
await page.waitForFunction(() => document.fonts.ready.then(() => true));

let failed = false;
for (const name of todo) {
  const card = set[name];
  if (!card) { console.error(`unknown card: ${name}`); failed = true; continue; }
  const photo = card.photo ? PHOTOS[card.photo] : null;

  // GATE 0 — the headline IS the page's h1. Without this the two drift the
  // first time the page is edited, and the drift is invisible on the site.
  if (card.page) {
    const pageHtml = readFileSync(join(ROOT, "public", card.page), "utf8");
    const h1 = pageHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
      ?.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
    const line = card.headline.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (h1 !== line) {
      failed = true;
      console.log(`FAIL ${name.padEnd(18)} headline does not match ${card.page} h1\n` +
                  `       card: ${line}\n       page: ${h1}`);
      continue;
    }
  }

  await page.evaluate(({ card, markSvg, photoUri, pos, zoom }) => {
    const el = document.getElementById("card");
    el.className = `card${card.variant ? " " + card.variant : ""}`;
    document.getElementById("mark").innerHTML = markSvg;
    document.getElementById("headline").innerHTML = card.headline;
    el.style.setProperty("--size", `${card.size}px`);
    el.style.setProperty("--measure", card.measure);
    const p = document.getElementById("photo");
    const s = document.getElementById("scrim");
    const w = document.getElementById("watermark");
    if (photoUri) {
      p.style.backgroundImage = `url("${photoUri}")`;
      p.style.setProperty("--pos", pos);
      p.style.setProperty("--zoom", zoom || "cover");
      p.hidden = false; s.hidden = false; w.hidden = true; w.innerHTML = "";
    } else {
      p.hidden = true; s.hidden = true;
      w.hidden = false; w.innerHTML = markSvg;
    }
  }, { card, markSvg: mark(card.variant), photoUri: photo ? dataUri(photo.file) : null,
       pos: card.pos || photo?.pos, zoom: card.zoom || photo?.zoom });

  await page.waitForTimeout(160);

  // GATE 1 — thumbnail legibility + nothing outside the frame
  const probe = await page.evaluate(({ W, H }) => {
    const h1 = document.getElementById("headline");
    const size = parseFloat(getComputedStyle(h1).fontSize);
    const over = [];
    document.querySelectorAll(".inner *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > W + 1 || r.left < -1 || r.bottom > H + 1 || r.top < -1)) {
        over.push(`${el.tagName}${el.id ? "#" + el.id : ""} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)}x${Math.round(r.bottom)}`);
      }
    });
    // In a split card the type must clear the photo seam. A full stop landing
    // on the photograph is invisible at 1200px and obvious at 300px.
    const card = document.getElementById("card");
    const photo = document.getElementById("photo");
    const seam = card.classList.contains("split") && !photo.hidden
      ? photo.getBoundingClientRect().left : null;
    let clear = null;
    if (seam !== null) {
      // measure the inked width of each line, not the block's max-width box
      const r = document.createRange();
      let right = 0;
      h1.childNodes.forEach((n) => {
        r.selectNodeContents(n);
        for (const rect of r.getClientRects()) right = Math.max(right, rect.right);
      });
      clear = Math.round(seam - right);
    }
    const pb = photo.hidden ? null : photo.getBoundingClientRect();
    return { size, lines: Math.round(h1.getBoundingClientRect().height / (size * 1.02)),
             over, clear, box: pb ? { w: pb.width, h: pb.height } : null };
  }, { W, H });

  const out = outDir ? join(outDir, card.out) : join(ROOT, card.out);
  mkdirSync(dirname(out), { recursive: true });
  // Render at 2x (2400x1260) and supersample down to 1200x630: serif type at
  // 90px has thin strokes that alias badly when rasterised once at 1x.
  const scratchRoot = join(homedir(), "scratch", "stingel");
  mkdirSync(scratchRoot, { recursive: true });
  const scratch = mkdtempSync(join(scratchRoot, "atl-og-render-"));
  const tmp = join(scratch, `og-2x-${name}.png`);
  try {
    writeFileSync(tmp, await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } }));
    execFileSync("convert", [tmp, "-filter", "Lanczos", "-resize", `${W}x${H}`,
      "-strip", "-interlace", "Plane", "-sampling-factor", "4:2:0",
      "-quality", "86", out]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const kb = Math.round(statSync(out).size / 1024);
  const okSize = probe.size >= MIN_HEADLINE_PX;
  const okFrame = probe.over.length === 0;
  const okWeight = statSync(out).size <= BUDGET_BYTES;
  const okSeam = probe.clear === null || probe.clear >= MIN_SEAM_CLEAR;
  // GATE 4 — the crop must not upscale the photograph past MAX_UPSCALE
  const scale = photo && probe.box
    ? sourceScale({ box: probe.box, src: intrinsic(photo.file), zoom: card.zoom || photo.zoom })
    : null;
  const okScale = scale === null || scale <= MAX_UPSCALE;
  const ok = okSize && okFrame && okWeight && okSeam && okScale;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name.padEnd(18)} ${String(kb).padStart(3)}KB  ` +
    `headline ${Math.round(probe.size)}px/${probe.lines} lines` +
    (probe.clear === null ? "" : `  seam clear ${probe.clear}px`) +
    (scale === null ? "" : `  photo ${scale <= 1 ? "sharp" : scale.toFixed(2) + "x upscaled"}`) +
    `  ${out}` +
    (okSize ? "" : `  [headline < ${MIN_HEADLINE_PX}px: unreadable in a chat thread]`) +
    (okFrame ? "" : `  [outside frame: ${probe.over.join("; ")}]`) +
    (okSeam ? "" : `  [type within ${MIN_SEAM_CLEAR}px of the photo seam]`) +
    (okScale ? "" : `  [source too small: crop upscales ${scale.toFixed(2)}x, needs a ~${Math.ceil(intrinsic(photo.file).h * scale / 100) * 100}px-tall master]`) +
    (okWeight ? "" : `  [over ${BUDGET_BYTES / 1024}KB preview budget]`)
  );
}

await browser.close();
process.exit(failed ? 1 : 0);
