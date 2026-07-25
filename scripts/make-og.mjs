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
//
// Usage:
//   node scripts/make-og.mjs                 # render every card in CARDS
//   node scripts/make-og.mjs home popcorn    # render named cards only
//   node scripts/make-og.mjs --out /tmp/x    # write somewhere else (candidates)
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 1200, H = 630;
const MIN_HEADLINE_PX = 62;      // 62/4 ~= 15px in a chat thread — readable
const BUDGET_BYTES = 300 * 1024; // WhatsApp-class preview ceiling
const MIN_SEAM_CLEAR = 24;       // gap the type must leave before the photo

// Photos are the site's own, of real athletes. `pos` is the CSS
// background-position that keeps the subject in frame after the 1.91:1 crop.
const PHOTOS = {
  karen:    { file: "public/images/karen-waterskiing.jpg", pos: "52% 40%" },
  alec:     { file: "public/images/alec-waterskiing.jpg",  pos: "50% 36%" },
  coaching: { file: "public/images/coaching.webp",         pos: "34% 44%" },
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
const SPLIT_DEFAULTS = { variant: "split", zoom: "auto 168%" };
const CARDS = {
  // the default: adapttolife.org/ and any page without its own card
  home: {
    ...SPLIT_DEFAULTS,
    out: "public/images/og-image.jpg", page: "index.html",
    photo: "karen", pos: "56% 34%",
    headline: "Your place in <em>adaptive sports</em>.",
    size: 74, measure: "12ch",
  },
  donate: {
    ...SPLIT_DEFAULTS,
    out: "public/images/og/donate.jpg", page: "donate.html",
    photo: "coaching", pos: "42% 40%", zoom: "auto 150%",
    headline: "Put an athlete <em>in the game</em>.",
    size: 72, measure: "12ch",
  },
  // the US Open is an adaptive water-ski event, so the water shot belongs here
  "send-6": {
    ...SPLIT_DEFAULTS,
    out: "public/images/og/send-6.jpg", page: "send-6.html",
    photo: "alec", pos: "46% 26%", zoom: "auto 138%",
    headline: "Send 6 to the <em>US Open</em>.",
    size: 74, measure: "12ch",
  },
  // No photo: the only popcorn imagery we own is the vendor's branded bag, and
  // a partner's logo does not belong on Adapt To Life's share card.
  popcorn: {
    out: "public/images/og/popcorn.jpg", page: "popcorn.html",
    variant: "light",
    headline: "Half of every bag <em>puts an athlete in the game</em>.",
    size: 66, measure: "17ch",
  },
  "hustle-and-heart": {
    ...SPLIT_DEFAULTS,
    out: "public/images/og/hustle-and-heart.jpg", page: "hustle-and-heart.html",
    photo: "coaching", pos: "38% 42%", zoom: "auto 150%",
    headline: "Every dollar goes to <em>an athlete</em>.",
    size: 72, measure: "15ch",
  },
  "ways-to-give": {
    ...SPLIT_DEFAULTS,
    out: "public/images/og/ways-to-give.jpg", page: "ways-to-give.html",
    photo: "karen", pos: "56% 34%",
    headline: "Every road here ends <em>on a court</em>.",
    size: 72, measure: "17ch",
  },
};

// ---- candidate sets: same content, three treatments, for a design review ----
const LINE = "Your place in <em>adaptive sports</em>.";
// The photo panel in a split card is ~150px wide in a chat thread, so the
// subject is zoomed until she holds it at that size.
const SPLIT = { variant: "split", photo: "karen", headline: LINE, size: 74,
                measure: "12ch", zoom: "auto 168%", pos: "56% 34%" };
const CANDIDATES = {
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
const logoSrc = readFileSync(join(ROOT, "public/images/atl-logo.svg"), "utf8");
function mark(variant) {
  const body = (variant || "").includes("light") ? "#1C1A15" : "#F7F4EE";
  return logoSrc
    .replace(/fill="#1A1A1A"/g, `fill="${body}"`)
    .replace(/fill="#E85D04"/g, 'fill="#E8572A"');
}

function dataUri(rel) {
  const buf = readFileSync(join(ROOT, rel));
  const mime = rel.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
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
    return { size, lines: Math.round(h1.getBoundingClientRect().height / (size * 1.02)), over, clear };
  }, { W, H });

  const out = outDir ? join(outDir, card.out) : join(ROOT, card.out);
  mkdirSync(dirname(out), { recursive: true });
  // Render at 2x (2400x1260) and supersample down to 1200x630: serif type at
  // 90px has thin strokes that alias badly when rasterised once at 1x.
  const tmp = `/tmp/og-2x-${name}.png`;
  writeFileSync(tmp, await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } }));
  execFileSync("convert", [tmp, "-filter", "Lanczos", "-resize", `${W}x${H}`,
    "-strip", "-interlace", "Plane", "-sampling-factor", "4:2:0",
    "-quality", "86", out]);

  const kb = Math.round(statSync(out).size / 1024);
  const okSize = probe.size >= MIN_HEADLINE_PX;
  const okFrame = probe.over.length === 0;
  const okWeight = statSync(out).size <= BUDGET_BYTES;
  const okSeam = probe.clear === null || probe.clear >= MIN_SEAM_CLEAR;
  const ok = okSize && okFrame && okWeight && okSeam;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name.padEnd(18)} ${String(kb).padStart(3)}KB  ` +
    `headline ${Math.round(probe.size)}px/${probe.lines} lines` +
    (probe.clear === null ? "" : `  seam clear ${probe.clear}px`) + `  ${out}` +
    (okSize ? "" : `  [headline < ${MIN_HEADLINE_PX}px: unreadable in a chat thread]`) +
    (okFrame ? "" : `  [outside frame: ${probe.over.join("; ")}]`) +
    (okSeam ? "" : `  [type within ${MIN_SEAM_CLEAR}px of the photo seam]`) +
    (okWeight ? "" : `  [over ${BUDGET_BYTES / 1024}KB preview budget]`)
  );
}

await browser.close();
process.exit(failed ? 1 : 0);
