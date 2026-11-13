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
import { chromium } from "playwright";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ROLES } from "../data/volunteer-roles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const W = 1200,
  H = 630;
const MIN_HEADLINE_PX = 62; // 62/4 ~= 15px in a chat thread — readable
const BUDGET_BYTES = 300 * 1024; // WhatsApp-class preview ceiling
const MIN_SEAM_CLEAR = 24; // gap the type must leave before the photo
const DSF = 2; // render scale; the card is supersampled from 2x
const MAX_UPSCALE = 1.0; // no upscaling, ever: it cannot be undone later

// Photos are the site's own, of real athletes. `pos` is the CSS
// background-position that keeps the subject in frame after the 1.91:1 crop.
//
// SOURCES LIVE IN assets/, NOT public/. A card crops hard into a panel that is
// 1200 device pixels wide, so it needs far more source than the page does. The
// web-sized copies in public/ (1600px) were being UPSCALED by the crop, which is
// invisible at 1200px and mushy on a retina phone. assets/ is outside the
// deployed asset directory, so the masters cost the visitor nothing.
const PHOTOS = {
  karen: { file: "assets/photos/karen-waterskiing.jpg", pos: "52% 40%" },
  coaching: { file: "assets/photos/coaching.jpg", pos: "34% 44%" },
  // Adaptive pickleball, because the US Open in Naples is a PICKLEBALL
  // championship. Ruled out a warmer frame from the same set: another
  // organisation's logo was legible on it, and a partner's branding does not
  // belong on our card (the same call as the popcorn vendor's bag).
  pickle: { file: "assets/photos/pickleball-court.jpg", pos: "27% 58%" },
  // ---- the wall, at card size (added 2026-09-09) -------------------------
  // The same 45MP frames the homepage wall is built from, so a share card and
  // the page it opens are visibly the same shoot. `pos` is VERTICAL-ONLY here
  // and that is arithmetic, not preference: these masters are 1.5:1 going into
  // a 1.905:1 card, so `cover` scales by WIDTH and the full width is always
  // shown. There is ~170px of vertical slack to place a head in and no
  // horizontal slack at all — which is why every frame chosen has its subject
  // naturally right of centre, clear of the type. A left-sitting subject cannot
  // be slid out of the way.
  // `zoom` is what makes a small subject usable. At plain `cover` these frames
  // are wide gym shots and the athlete is a speck at 300px. auto-N% scales past
  // cover, which enlarges the subject AND opens horizontal slack so `pos` can
  // place a face clear of the type. The resolution gate has room to spare: even
  // 220% uses about half the master's height, so none of this upscales.
  "paddle-portrait": {
    file: "assets/photos/paddle-portrait.jpg",
    pos: "44% 36%",
    zoom: "auto 150%",
  },
  "chair-drive": {
    file: "assets/photos/chair-drive.jpg",
    pos: "62% 34%",
    zoom: "auto 145%",
  },
  // 190% took her head off. She is framed full-body mid-swing, so the zoom that
  // makes her big enough is also the zoom that crops her, and the answer is a
  // gentler scale with the window pulled UP rather than a tighter one centred.
  "court-swing": {
    file: "assets/photos/court-swing.jpg",
    pos: "36% 16%",
    zoom: "auto 158%",
  },
  "cap-profile": {
    file: "assets/photos/cap-profile.jpg",
    pos: "18% 40%",
    zoom: "auto 165%",
  },
  // Same frame for a split card: the photo panel is only the right half, so the
  // face has to sit in it rather than at the far edge.
  "cap-profile-split": {
    file: "assets/photos/cap-profile.jpg",
    pos: "62% 36%",
    zoom: "auto 118%",
  },
  // The one frame that stays in colour (see .card.athlete.color in card.html).
  // Chosen by Alec off the live card, 2026-09-10. He sits well right of centre
  // and side-on, so the type side stays empty wall at every zoom that keeps him
  // legible, and a gentler 138% is enough because he is already large in frame.
  "paddle-raise": {
    file: "assets/photos/paddle-raise.jpg",
    pos: "58% 40%",
    zoom: "auto 138%",
  },

  // Juan (Spec 191). The master is pre-cropped to card ratio with him RIGHT of
  // centre, because the athlete variant lays its type down the left. The source
  // frame is a 3495x7546 portrait, so a plain `cover` would have shown a
  // full-width sliver of gym and a very small athlete. Cropping the master is
  // the fix, not zooming the card. The crop keeps his shirt legible, which is
  // the only sport context a head-and-shoulders card gets to carry.
  "juan-portrait": { file: "assets/photos/juan-portrait.jpg", pos: "62% 46%" },
  // v2 (2026-10-02): JLA_5947, Juan serving in a plain black shirt. The v1
  // portrait showed another organization's shirt, which the site does not run.
  // Pre-cropped to card ratio with him right of centre, clear of the type.
  "juan-serve": { file: "assets/photos/juan-serve.jpg", pos: "60% 40%" },

  // Brick House (2026-10-02): the /brickhouse hero, from the 4K clip, already
  // graded black and white with the page's own recipe. A 2160px portrait cannot
  // fill a full-bleed card without upscaling, so it runs in the split variant's
  // photo panel, where it is sharp and he stays clear of the type.
  "brickhouse-hero": { file: "assets/photos/brickhouse-hero.jpg", pos: "58% 30%" },

  // /ace (Nov 10 2026, Alec): the fist bump at the net from the page's own
  // side-by-side strip, in colour. JLA_6040, the camera JPEG pulled from the
  // NEF on Drive, saved at 3600px.
  "ace-fistbump": { file: "assets/photos/ace-fistbump.jpg", pos: "46% 0%" },

  // Brand artwork, not a photograph: the mark rendered as an object. Both files
  // arrived with a Gemini sparkle in the corner and are cropped to exclude it.
  black: { file: "assets/art/mark-black.jpg", pos: "50% 42%" },
  fire: { file: "assets/art/mark-fire.jpg", pos: "50% 46%" },
  // PARKED, not forgotten: Alec's own water shot exists only as a 1600x1067
  // web copy, which the resolution gate rejects for any crop that fills a panel.
  // Its master (JNC02305.JPG, 6.8MB) is the one file the Drive connector will
  // not return. Give this a >=2200px-tall master and send-6 can use it again.
  alec: { file: "public/images/alec-waterskiing.jpg", pos: "50% 36%" },
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
// The photo-led default. See the .athlete block in src/og/card.html for why this
// replaced MONO as the house style on 2026-09-09.
const ATHLETE = { variant: "athlete", size: 76, measure: "13ch" };
const CARDS = {
  // NEW FILENAMES, NOT NEW CONTENT AT THE OLD PATHS. Assets ship with a 30-day
  // cache header, so a card that changes design at the same URL keeps serving
  // the old picture to every platform and thread that already scraped it — the
  // most-shared link would be the last one to update. Same rule the v2 cards
  // followed; -v3-athlete is theirs.
  // The home card alone runs the colour treatment, on its own -v4 path for the
  // same cache reason the -v3 rename was made: a card that changes picture at
  // an old URL keeps serving the old picture to every thread that scraped it.
  home: {
    ...ATHLETE,
    variant: "athlete color",
    photo: "paddle-raise",
    out: "public/images/og/home-v4-color.jpg",
    page: "index.html",
    headline: "Your place in <em>adaptive sports</em>.",
  },
  donate: {
    ...ATHLETE,
    photo: "court-swing",
    out: "public/images/og/donate-v3-athlete.jpg",
    page: "donate.html",
    headline: "Put an athlete <em>in the game</em>.",
  },
  road: {
    ...ATHLETE,
    photo: "chair-drive",
    size: 66,
    measure: "15ch",
    out: "public/images/og/road-v5-season.jpg",
    page: "road.html",
    headline: "The Road to the <em>US Open</em>.",
  },
  popcorn: {
    ...ATHLETE,
    photo: "chair-drive",
    size: 62,
    measure: "16ch",
    out: "public/images/og/popcorn-v4-content.jpg",
    page: "popcorn.html",
    headline: "Popcorn that helps <em>athletes play</em>.",
  },
  "hustle-and-heart": {
    ...ATHLETE,
    photo: "paddle-portrait",
    size: 70,
    measure: "14ch",
    out: "public/images/og/hustle-and-heart-v5-check.jpg",
    page: "hustle-and-heart.html",
    headline: "More than <em>a check</em>.",
  },
  // An athlete profile card is the page's h1 and nothing else (GATE 0), and for
  // a profile that is exactly right: the card is a poster with his name on it,
  // sent by him, to people who know him.
  juan: {
    ...ATHLETE,
    photo: "juan-serve",
    size: 104,
    measure: "7ch",
    out: "public/images/og/juan-v2-serve.jpg",
    page: "juan.html",
    headline: "Juan <em>Ortiz</em>",
  },
  // Karen's profile (Nov 8 2026): her name, on the AMP water-skiing frame.
  karen: {
    ...ATHLETE,
    photo: "karen",
    size: 104,
    measure: "8ch",
    out: "public/images/og/karen-v1-water.jpg",
    page: "karen.html",
    headline: "Karen <em>Atkinson</em>",
  },
  // Juan's Bread & Butter page (Nov 8 2026): Juan with his paddle up, so the
  // card is about the paddle without carrying the brand's own art.
  // v2 (Nov 11 2026): the page's h1 became "Help his crew compete." when the
  // road became the crew's season of tournament travel, so the card moves to a
  // new path and threads that scraped v1 fetch the new line.
  "bread-and-butter": {
    ...ATHLETE,
    photo: "paddle-raise",
    size: 64,
    measure: "14ch",
    out: "public/images/og/bread-and-butter-v3-medals.jpg",
    page: "bread-and-butter.html",
    headline: "Two Locos. <em>Three medals.</em>",
  },
  // Guides (scripts/build-guides.mjs): each card is the guide's h1.
  "sport-wheelchair-cost": {
    ...ATHLETE,
    photo: "chair-drive",
    size: 64,
    measure: "13ch",
    out: "public/images/og/guide-sport-wheelchair-cost-v1-card.jpg",
    page: "sport-wheelchair-cost.html",
    headline: "What a sport wheelchair <em>really costs.</em>",
  },
  "sponsor-adaptive-athletes": {
    ...ATHLETE,
    photo: "cap-profile",
    size: 70,
    measure: "12ch",
    out: "public/images/og/guide-sponsor-adaptive-athletes-v1-card.jpg",
    page: "sponsor-adaptive-athletes.html",
    headline: "Sponsor an athlete <em>in Chicago.</em>",
  },
  "corporate-matching": {
    ...ATHLETE,
    photo: "paddle-portrait",
    size: 64,
    measure: "13ch",
    out: "public/images/og/guide-corporate-matching-v1-card.jpg",
    page: "corporate-matching.html",
    headline: "Double your gift with <em>an employer match.</em>",
  },
  // The blog (scripts/build-blog.mjs reads the post card paths from
  // data/blog.mjs): the hub, then one card per post, each its page's h1.
  blog: {
    ...ATHLETE,
    photo: "paddle-portrait",
    size: 66,
    measure: "12ch",
    out: "public/images/og/blog-v1-card.jpg",
    page: "blog.html",
    headline: "Building adaptive sports, <em>in public.</em>",
  },
  // Event stories (scripts/build-event-pages.mjs reads these paths from
  // data/event-stories.mjs). Amanda mid-swing for Monster Smash, where she
  // medaled; Juan serving for the division he asked for.
  "monster-smash-2026": {
    ...ATHLETE,
    photo: "court-swing",
    size: 72,
    measure: "12ch",
    out: "public/images/og/event-monster-smash-2026-v1-card.jpg",
    page: "events/monster-smash-2026.html",
    headline: "Six medals at <em>Monster Smash.</em>",
  },
  "app-vlasic-classic-2026": {
    ...ATHLETE,
    photo: "juan-serve",
    size: 66,
    measure: "13ch",
    out: "public/images/og/event-app-vlasic-classic-2026-v1-card.jpg",
    page: "events/app-vlasic-classic-2026.html",
    headline: "The APP Tour&rsquo;s first <em>wheelchair division.</em>",
  },
  // Brick House card (Open Court wording, Nov 11 2026). Split, not athlete: see "brickhouse-hero" above.
  // Same photograph and split treatment. v2 because the headline changed after
  // the reopening, and an old URL would keep serving the old line.
  brickhouse: {
    variant: "split",
    photo: "brickhouse-hero",
    size: 66,
    measure: "11ch",
    out: "public/images/og/brickhouse-v4-open.jpg",
    page: "brickhouse.html",
    headline: "Brick House keeps <em>the court open.</em>",
  },
  // The Chicago Classic: same split treatment, Juan with his paddle up.
  "chicago-classic": {
    variant: "split",
    photo: "paddle-raise",
    size: 72,
    measure: "9ch",
    out: "public/images/og/chicago-classic-v1-date.jpg",
    page: "chicago-classic.html",
    headline: "The Chicago <em>Classic</em>.",
  },
  // The crew's page: Juan serving, in the split treatment. v5 (2026-11-07)
  // because the crew's title became "Chicago Pickleball: Wheelie Big Dills",
  // and an old URL would keep serving the old name. v4 was drawn outside this
  // script (badge, kicker line, system type); this one is the house card, and
  // gate 0 keeps it equal to the page's h1.
  pickleball: {
    variant: "split",
    photo: "juan-serve",
    size: 66,
    measure: "9ch",
    out: "public/images/og/pickleball-v5-name.jpg",
    page: "pickleball.html",
    headline: "Chicago Pickleball: <em>Wheelie Big Dills</em>",
  },
  // Partner pages: the same split treatment.
  picklr: {
    variant: "split",
    photo: "court-swing",
    size: 72,
    measure: "9ch",
    out: "public/images/og/picklr-v1-partner.jpg",
    page: "picklr.html",
    headline: "Open play, <em>open doors</em>.",
  },
  "chicago-adaptive-sports": {
    variant: "split",
    photo: "juan-portrait",
    size: 76,
    measure: "8ch",
    out: "public/images/og/chicago-adaptive-sports-v1-partner.jpg",
    page: "chicago-adaptive-sports.html",
    headline: "Push. Play. <em>Persist</em>.",
  },
  // AMP Adaptive Sports, partner nonprofit (Nov 6 2026). Karen on the water
  // at Lauderdale Lakes, from the same master the /karen card uses; the line
  // is AMP's own, from their gear.
  amp: {
    variant: "split",
    photo: "karen",
    size: 76,
    measure: "8ch",
    out: "public/images/og/amp-v1-partner.jpg",
    page: "amp.html",
    headline: "Active. Mobile. <em>Proud</em>.",
  },
  // Partner club card, same split treatment as Brick House.
  ace: {
    variant: "split",
    photo: "ace-fistbump",
    size: 66,
    measure: "11ch",
    out: "public/images/og/ace-v4-partner.jpg",
    page: "ace.html",
    headline: "Something Chicago <em>hasn&rsquo;t seen</em>.",
  },
  volunteer: {
    ...ATHLETE,
    photo: "cap-profile",
    out: "public/images/og/volunteer-v3-athlete.jpg",
    page: "volunteer.html",
    headline: "Your place on <em>this team</em>.",
  },
};

// One card per volunteer role, derived from data/volunteer-roles.mjs rather than
// listed here. Twenty-seven hand-maintained rows would drift from the board the
// first time a role was renamed, and the whole point of these cards is that a
// post about ONE role shows that role's name in the preview.
//
// The <em> around the last word is what gives the card its orange accent, and it
// costs nothing against GATE 0: that gate strips tags from the card headline and
// the page h1 before comparing, so the markup is free.
//
// Wider measure than the editorial cards because a role title is a noun phrase
// rather than a sentence, and "Sponsorship and partnership lead" needs the room.
for (const r of ROLES) {
  const words = r.name.split(" ");
  const accented =
    words.length > 1
      ? `${words.slice(0, -1).join(" ")} <em>${words[words.length - 1]}</em>`
      : `<em>${r.name}</em>`;
  CARDS[`role-${r.slug}`] = {
    // The roles are children of /volunteer, so they carry /volunteer's athlete.
    // One shared frame across 27 cards is right here in a way it was NOT right
    // across the six editorial cards: those are six different propositions and
    // needed to look different in a feed; these are one proposition with 27
    // job titles, and the title is the thing that has to change.
    ...ATHLETE,
    size: 68,
    measure: "16ch",
    photo: "cap-profile",
    out: `public/images/og/role-${r.slug}-v3-athlete.jpg`,
    page: `volunteer/${r.slug}.html`,
    headline: accented,
  };
}

// ---- candidate sets: same content, three treatments, for a design review ----
const LINE = "Your place in <em>adaptive sports</em>.";
// The photo panel in a split card is ~150px wide in a chat thread, so the
// subject is zoomed until she holds it at that size.
const SPLIT = {
  variant: "split",
  photo: "karen",
  headline: LINE,
  size: 74,
  measure: "12ch",
  zoom: "auto 168%",
  pos: "56% 34%",
};
const CANDIDATES = {
  "m1-home-black": {
    out: "m1-home-black.jpg",
    variant: "mono",
    photo: "black",
    headline: "Your place in <em>adaptive sports</em>.",
    size: 76,
    measure: "13ch",
  },
  "m3-donate-black": {
    out: "m3-donate-black.jpg",
    variant: "mono",
    photo: "black",
    headline: "Put an athlete <em>in the game</em>.",
    size: 76,
    measure: "13ch",
  },
  "m4-home-fire": {
    out: "m4-home-fire.jpg",
    variant: "mono",
    photo: "fire",
    headline: "Your place in <em>adaptive sports</em>.",
    size: 76,
    measure: "13ch",
  },
  // ---- athlete set, 2026-09-09 -------------------------------------------
  "a-home-paddle": {
    out: "a-home-paddle.jpg",
    variant: "athlete",
    photo: "paddle-portrait",
    headline: "Your place in <em>adaptive sports</em>.",
    size: 76,
    measure: "13ch",
  },
  "a-home-cap": {
    out: "a-home-cap.jpg",
    variant: "athlete",
    photo: "cap-profile",
    headline: "Your place in <em>adaptive sports</em>.",
    size: 76,
    measure: "13ch",
  },
  "a-donate-swing": {
    out: "a-donate-swing.jpg",
    variant: "athlete",
    photo: "court-swing",
    headline: "Put an athlete <em>in the game</em>.",
    size: 76,
    measure: "13ch",
  },
  "a-donate-drive": {
    out: "a-donate-drive.jpg",
    variant: "athlete",
    photo: "chair-drive",
    headline: "Put an athlete <em>in the game</em>.",
    size: 76,
    measure: "13ch",
  },
  "a-volunteer": {
    out: "a-volunteer.jpg",
    variant: "athlete",
    photo: "paddle-portrait",
    headline: "Your place on <em>this team</em>.",
    size: 76,
    measure: "13ch",
  },
  "a-hustle": {
    out: "a-hustle.jpg",
    variant: "athlete",
    photo: "court-swing",
    headline: "Keep your game <em>going</em>.",
    size: 70,
    measure: "14ch",
  },

  "b-paper": {
    out: "b-paper.jpg",
    variant: "light",
    headline: LINE,
    size: 96,
    measure: "13ch",
  },
  "c-split": { ...SPLIT, out: "c-split.jpg" },
  "d-split-light": { ...SPLIT, out: "d-split-light.jpg", variant: "split light" },
};

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const outDir = outIdx >= 0 ? args[outIdx + 1] : null;
// guard the -1 case: without --out, outIdx+1 is 0 and would eat the first name
const names = args.filter(
  (a, i) => !a.startsWith("--") && !(outIdx >= 0 && i === outIdx + 1),
);
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
  const [w, h] = execFileSync(
    "identify",
    ["-format", "%w %h", join(ROOT, rel) + "[0]"],
    { encoding: "utf8" },
  )
    .trim()
    .split(" ")
    .map(Number);
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
  else renderedH = box.h * Math.max(box.w / box.h / (src.w / src.h), 1); // cover
  return (renderedH * DSF) / src.h;
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
});
await page.goto(`file://${join(ROOT, "src/og/card.html")}`);
await page.waitForFunction(() => document.fonts.ready.then(() => true));

let failed = false;
for (const name of todo) {
  const card = set[name];
  if (!card) {
    console.error(`unknown card: ${name}`);
    failed = true;
    continue;
  }
  const photo = card.photo ? PHOTOS[card.photo] : null;

  // GATE 0 — the headline IS the page's h1. Without this the two drift the
  // first time the page is edited, and the drift is invisible on the site.
  if (card.page) {
    const pageHtml = readFileSync(join(ROOT, "public", card.page), "utf8");
    const h1 = pageHtml
      .match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1]
      ?.replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const line = card.headline
      .replace(/<[^>]*>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (h1 !== line) {
      failed = true;
      console.log(
        `FAIL ${name.padEnd(18)} headline does not match ${card.page} h1\n` +
          `       card: ${line}\n       page: ${h1}`,
      );
      continue;
    }
  }

  await page.evaluate(
    ({ card, markSvg, photoUri, pos, zoom }) => {
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
        p.hidden = false;
        s.hidden = false;
        w.hidden = true;
        w.innerHTML = "";
      } else {
        p.hidden = true;
        s.hidden = true;
        w.hidden = false;
        w.innerHTML = markSvg;
      }
    },
    {
      card,
      markSvg: mark(card.variant),
      photoUri: photo ? dataUri(photo.file) : null,
      pos: card.pos || photo?.pos,
      zoom: card.zoom || photo?.zoom,
    },
  );

  await page.waitForTimeout(160);

  // GATE 1 — thumbnail legibility + nothing outside the frame
  const probe = await page.evaluate(
    ({ W, H }) => {
      const h1 = document.getElementById("headline");
      const size = parseFloat(getComputedStyle(h1).fontSize);
      const over = [];
      document.querySelectorAll(".inner *").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (
          r.width > 0 &&
          (r.right > W + 1 || r.left < -1 || r.bottom > H + 1 || r.top < -1)
        ) {
          over.push(
            `${el.tagName}${el.id ? "#" + el.id : ""} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.right)}x${Math.round(r.bottom)}`,
          );
        }
      });
      // In a split card the type must clear the photo seam. A full stop landing
      // on the photograph is invisible at 1200px and obvious at 300px.
      const card = document.getElementById("card");
      const photo = document.getElementById("photo");
      const seam =
        card.classList.contains("split") && !photo.hidden
          ? photo.getBoundingClientRect().left
          : null;
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
      return {
        size,
        lines: Math.round(h1.getBoundingClientRect().height / (size * 1.02)),
        over,
        clear,
        box: pb ? { w: pb.width, h: pb.height } : null,
      };
    },
    { W, H },
  );

  const out = outDir ? join(outDir, card.out) : join(ROOT, card.out);
  mkdirSync(dirname(out), { recursive: true });
  // Render at 2x (2400x1260) and supersample down to 1200x630: serif type at
  // 90px has thin strokes that alias badly when rasterised once at 1x.
  const scratchRoot = join(ROOT, "node_modules", ".cache", "atl-og-render");
  mkdirSync(scratchRoot, { recursive: true });
  const scratch = mkdtempSync(join(scratchRoot, "atl-og-render-"));
  const tmp = join(scratch, `og-2x-${name}.png`);
  try {
    writeFileSync(
      tmp,
      await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: W, height: H } }),
    );
    execFileSync("convert", [
      tmp,
      "-filter",
      "Lanczos",
      "-resize",
      `${W}x${H}`,
      "-strip",
      "-interlace",
      "Plane",
      "-sampling-factor",
      "4:2:0",
      "-quality",
      "86",
      out,
    ]);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const kb = Math.round(statSync(out).size / 1024);
  const okSize = probe.size >= MIN_HEADLINE_PX;
  const okFrame = probe.over.length === 0;
  const okWeight = statSync(out).size <= BUDGET_BYTES;
  const okSeam = probe.clear === null || probe.clear >= MIN_SEAM_CLEAR;
  // GATE 4 — the crop must not upscale the photograph past MAX_UPSCALE
  const scale =
    photo && probe.box
      ? sourceScale({
          box: probe.box,
          src: intrinsic(photo.file),
          zoom: card.zoom || photo.zoom,
        })
      : null;
  const okScale = scale === null || scale <= MAX_UPSCALE;
  const ok = okSize && okFrame && okWeight && okSeam && okScale;
  if (!ok) failed = true;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name.padEnd(18)} ${String(kb).padStart(3)}KB  ` +
      `headline ${Math.round(probe.size)}px/${probe.lines} lines` +
      (probe.clear === null ? "" : `  seam clear ${probe.clear}px`) +
      (scale === null
        ? ""
        : `  photo ${scale <= 1 ? "sharp" : scale.toFixed(2) + "x upscaled"}`) +
      `  ${out}` +
      (okSize
        ? ""
        : `  [headline < ${MIN_HEADLINE_PX}px: unreadable in a chat thread]`) +
      (okFrame ? "" : `  [outside frame: ${probe.over.join("; ")}]`) +
      (okSeam ? "" : `  [type within ${MIN_SEAM_CLEAR}px of the photo seam]`) +
      (okScale
        ? ""
        : `  [source too small: crop upscales ${scale.toFixed(2)}x, needs a ~${Math.ceil((intrinsic(photo.file).h * scale) / 100) * 100}px-tall master]`) +
      (okWeight ? "" : `  [over ${BUDGET_BYTES / 1024}KB preview budget]`),
  );
}

await browser.close();
process.exit(failed ? 1 : 0);
