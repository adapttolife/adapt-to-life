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
  "send-6.html": "send-6",
  "popcorn.html": "popcorn",
  "hustle-and-heart.html": "hustle-and-heart",
  "volunteer.html": "volunteer",
  "juan.html": "juan",
};

// ALT DESCRIBES THE PHOTOGRAPH AGAIN, because from 2026-09-09 the cards ARE
// photographs. The previous text said "the Adapt To Life mark, embossed in
// black" — accurate for the mono cards and a plain falsehood for these, which
// is worse than terse alt text. It reads the line first (that is the message)
// and then who is actually pictured, briefly. An organisation built around
// disabled athletes does not ship an unlabelled — or a mislabelled — image.
const ALT = {
  _default: "Your place in adaptive sports. Adapt To Life. A wheelchair pickleball player in glasses turns his paddle up mid-rally on an indoor court.",
  donate: "Put an athlete in the game. Adapt To Life. A wheelchair pickleball player swings, the ball in the air beside her.",
  "send-6": "Send 6 to the US Open Spring 2027. Adapt To Life. A wheelchair pickleball player drives across an indoor court.",
  popcorn: "Popcorn that helps athletes play. Adapt To Life. A wheelchair pickleball player drives across an indoor court.",
  "hustle-and-heart": "Keep your game going. The Hustle and Heart Fund, Adapt To Life. A wheelchair pickleball player in a headband holds his paddle.",
  volunteer: "Your place on this team. Adapt To Life. A wheelchair pickleball player in a cap reaches for a shot.",
  // An athlete profile card is his name over his own face, so the alt is the
  // name and then the man, in that order.
  juan: "Juan. Adapt To Life. Juan, a wheelchair pickleball player in glasses, sits courtside in a Chicago Adaptive Sports shirt.",
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
  juan: "juan-v1-athlete.jpg",
  popcorn: "popcorn-v4-content.jpg",
  "hustle-and-heart": "hustle-and-heart-v4-content.jpg",
};
const fileFor = (card) => FILE[card] ?? `${card === "_default" ? "home" : card}-v3-athlete.jpg`;
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

let changed = 0, skipped = 0;
for (const file of readdirSync(PUB).filter((f) => f.endsWith(".html")).sort()) {
  const path = join(PUB, file);
  let html = readFileSync(path, "utf8");
  if (!/property="og:image"/.test(html)) { skipped++; continue; }

  const card = PER_PAGE[file] || "_default";
  const src = url(card);
  const alt = ALT[card];

  // the card file must exist before a page is allowed to point at it
  const local = join(PUB, "images/og", fileFor(card));
  if (!existsSync(local)) throw new Error(`${file}: card missing at ${local} (run make-og.mjs first)`);

  const before = html;
  html = setMeta(html, "property", "og:image", src) ?? html;
  html = setMeta(html, "name", "twitter:image", src) ?? html;
  html = ensureAfter(html,
    /<meta property="og:image" content="[^"]*">/,
    `<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="${alt}">`,
    /<meta property="og:image:width"[\s\S]*?<meta property="og:image:alt" content="[^"]*">/);
  // waiver.html carries og tags but no twitter block, so this half is optional
  if (/name="twitter:image"/.test(html)) {
    html = ensureAfter(html,
      /<meta name="twitter:image" content="[^"]*">/,
      `<meta name="twitter:image:alt" content="${alt}">`,
      /<meta name="twitter:image:alt" content="[^"]*">/);
  }

  if (html !== before) { writeFileSync(path, html); changed++; }
  console.log(`${file.padEnd(28)} -> ${card === "_default" ? "default card" : card}`);
}
console.log(`\n${changed} page(s) rewritten, ${skipped} without og tags`);
