// scripts/wire-og.mjs — point every page at its share card, once, from data.
//
// 16 pages carry og:image tags. Editing them by hand is how five of them end up
// on last quarter's card. This is the only writer: it sets the image URL, the
// declared dimensions (crawlers that cannot fetch the file still lay out the
// card correctly), and og:image:alt, which is the card's alt text on the
// platforms that honour it. An organisation built around disabled athletes does
// not ship an unlabelled image.
//
// Run after scripts/make-og.mjs. Idempotent.
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUB = join(ROOT, "public");
const BASE = "https://adapttolife.org";

// page -> its own card. Anything not listed falls back to the default card.
const PER_PAGE = {
  "donate.html": "donate",
  "road.html": "road",
  "popcorn.html": "popcorn",
  "hustle-and-heart.html": "hustle-and-heart",
  "volunteer.html": "volunteer",
  "juan.html": "juan",
  "brickhouse.html": "brickhouse",
  "pickleball.html": "pickleball",
  "ace.html": "ace",
  "chicago-classic.html": "chicago-classic",
  "picklr.html": "picklr",
  "chicago-adaptive-sports.html": "chicago-adaptive-sports",
  "amp.html": "amp",
  "bread-and-butter.html": "bread-and-butter",
  "karen.html": "karen",
  // Guides are written by scripts/build-guides.mjs with their own cards;
  // listed here so this script keeps them instead of resetting to _default.
  "sport-wheelchair-cost.html": "guide-sport-wheelchair-cost",
  "sponsor-adaptive-athletes.html": "guide-sponsor-adaptive-athletes",
  "corporate-matching.html": "guide-corporate-matching",
};

// ALT DESCRIBES THE PHOTOGRAPH AGAIN, because from 2026-09-09 the cards ARE
// photographs. The previous text said "the Adapt To Life mark, embossed in
// black" — accurate for the mono cards and a plain falsehood for these, which
// is worse than terse alt text. It reads the line first (that is the message)
// and then who is actually pictured, briefly. An organisation built around
// disabled athletes does not ship an unlabelled — or a mislabelled — image.
const ALT = {
  _default:
    "Your place in adaptive sports. Adapt To Life. A wheelchair pickleball player in glasses turns his paddle up mid-rally on an indoor court.",
  donate:
    "Put an athlete in the game. Adapt To Life. A wheelchair pickleball player swings, the ball in the air beside her.",
  road:
    "The Road to the US Open. Adapt To Life. A wheelchair pickleball player drives across an indoor court.",
  popcorn:
    "Popcorn that helps athletes play. Adapt To Life. A wheelchair pickleball player drives across an indoor court.",
  "hustle-and-heart":
    "More than a check. The Hustle and Heart Fund, Adapt To Life. A wheelchair pickleball player in a headband holds his paddle.",
  volunteer:
    "Your place on this team. Adapt To Life. A wheelchair pickleball player in a cap reaches for a shot.",
  // An athlete profile card is his name over his own face, so the alt is the
  // name and then the man, in that order.
  brickhouse:
    "Brick House keeps the court open. Adapt To Life. An athlete in a sport wheelchair and a Brick House Pickleball shirt rolls across the Brick House courts.",
  picklr: "Open play, open doors. Adapt To Life. A player in a sport wheelchair stretches wide for a backhand.",
  "chicago-adaptive-sports": "Push. Play. Persist. Adapt To Life. Juan Ortiz in a Chicago Adaptive Sports shirt.",
  amp: "Active. Mobile. Proud. Adapt To Life. Karen Atkinson water skiing in a sit-ski, a jet ski behind her.",
  "chicago-classic": "The Chicago Classic. Adapt To Life. Juan Ortiz in his sport wheelchair, paddle up, on a dark indoor court.",
  ace: "Something Chicago hasn't seen. Adapt To Life. A player in a sport wheelchair bumps fists with a player across the net.",
  pickleball:
    "Chicago Pickleball: Wheelie Big Dills. Adapt To Life. Juan Ortiz, a wheelchair pickleball player in glasses, tosses the ball to serve from his sport wheelchair.",
  "guide-sport-wheelchair-cost": "What a sport wheelchair really costs. Adapt To Life. A wheelchair pickleball athlete on an indoor court.",
  "guide-sponsor-adaptive-athletes": "Sponsor an athlete in Chicago. Adapt To Life. A wheelchair pickleball athlete on an indoor court.",
  "guide-corporate-matching": "Double your gift with an employer match. Adapt To Life. A wheelchair pickleball athlete on an indoor court.",
  karen: "Karen Atkinson. Adapt To Life. Karen water skiing in a sit-ski, spray behind her.",
  "bread-and-butter":
    "Play Juan's paddle. Help his crew compete. Adapt To Life. Juan Ortiz in his sport wheelchair, paddle up, on a dark indoor court.",
  juan: "Juan Ortiz. Adapt To Life. Juan, a wheelchair pickleball player in glasses, tosses the ball to serve from his sport wheelchair.",
};

// Cards live under /images/og/ on their own paths, including the default one.
// /images/og-image.jpg is left in place, still regenerated, for anything outside
// this repo that already points at it (Givebutter, signatures) — but no page
// references it, so a redesign is never served from a stale third-party cache.
// THE SUFFIX IS PER CARD, NOT PER SITE. The -v3-athlete rename moved every card
// at once; the colour home card (2026-09-10) moved one. Both moves exist for the
// same reason — a card that changes picture at an old URL keeps serving the old
// picture to every thread that already scraped it — so the version lives beside
// the card it belongs to and the next single-card change costs one line here.
const FILE = {
  _default: "home-v4-color.jpg",
  juan: "juan-v2-serve.jpg",
  "bread-and-butter": "bread-and-butter-v2-crew.jpg",
  karen: "karen-v1-water.jpg",
  "guide-sport-wheelchair-cost": "guide-sport-wheelchair-cost-v1-card.jpg",
  "guide-sponsor-adaptive-athletes": "guide-sponsor-adaptive-athletes-v1-card.jpg",
  "guide-corporate-matching": "guide-corporate-matching-v1-card.jpg",
  brickhouse: "brickhouse-v4-open.jpg",
  pickleball: "pickleball-v5-name.jpg",
  ace: "ace-v4-partner.jpg",
  "chicago-classic": "chicago-classic-v1-date.jpg",
  road: "road-v5-season.jpg",
  picklr: "picklr-v1-partner.jpg",
  "chicago-adaptive-sports": "chicago-adaptive-sports-v1-partner.jpg",
  amp: "amp-v1-partner.jpg",
  popcorn: "popcorn-v4-content.jpg",
  "hustle-and-heart": "hustle-and-heart-v5-check.jpg",
};
const fileFor = (card) =>
  FILE[card] ?? `${card === "_default" ? "home" : card}-v3-athlete.jpg`;
const url = (card) => `${BASE}/images/og/${fileFor(card)}`;

function setMeta(html, selector, attr, value) {
  // one tag, replaced in place; the tag must already exist (every page has both)
  const re = new RegExp(`(<meta ${selector}="${attr}" content=")[^"]*(">)`);
  if (!re.test(html)) return null;
  return html.replace(re, `$1${value}$2`);
}

// Insert a tag right after an anchor tag if it is not already present.
function ensureAfter(html, anchorRe, tag, presenceRe) {
  if (presenceRe.test(html)) return html.replace(presenceRe, tag);
  const m = html.match(anchorRe);
  if (!m) throw new Error("anchor not found");
  return html.replace(anchorRe, `${m[0]}\n${tag}`);
}

let changed = 0,
  skipped = 0;
for (const file of readdirSync(PUB)
  .filter((f) => f.endsWith(".html"))
  .sort()) {
  const path = join(PUB, file);
  let html = readFileSync(path, "utf8");
  if (!/property="og:image"/.test(html)) {
    skipped++;
    continue;
  }

  const card = PER_PAGE[file] || "_default";
  const src = url(card);
  const alt = ALT[card];

  // the card file must exist before a page is allowed to point at it
  const local = join(PUB, "images/og", fileFor(card));
  if (!existsSync(local))
    throw new Error(`${file}: card missing at ${local} (run make-og.mjs first)`);

  const before = html;
  html = setMeta(html, "property", "og:image", src) ?? html;
  html = setMeta(html, "name", "twitter:image", src) ?? html;
  html = ensureAfter(
    html,
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="${alt}">`,
    /<meta property="og:image:width"[\s\S]*?<meta property="og:image:alt" content="[^"]*">/,
  );
  // waiver.html carries og tags but no twitter block, so this half is optional
  if (/name="twitter:image"/.test(html)) {
    html = ensureAfter(
      html,
      /<meta name="twitter:image" content="[^"]*">/,
      `<meta name="twitter:image:alt" content="${alt}">`,
      /<meta name="twitter:image:alt" content="[^"]*">/,
    );
  }

  if (html !== before) {
    writeFileSync(path, html);
    changed++;
  }
  console.log(`${file.padEnd(28)} -> ${card === "_default" ? "default card" : card}`);
}
console.log(`\n${changed} page(s) rewritten, ${skipped} without og tags`);
