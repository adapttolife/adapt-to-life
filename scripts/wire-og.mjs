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
  "ways-to-give.html": "ways-to-give",
  "volunteer.html": "volunteer",
};

// Every card is now the same artwork with a different line, so the alt text
// leads with the words. The image is the Adapt To Life mark, not a photograph,
// and describing embossing at length would tell a screen reader nothing useful.
const ALT = {
  _default: "Adapt To Life: your place in adaptive sports. The Adapt To Life mark, embossed in black.",
  donate: "Put an athlete in the game. Adapt To Life.",
  "send-6": "Send 6 to the US Open Spring 2027. Adapt To Life.",
  popcorn: "Half of every bag puts an athlete in the game. Adapt To Life.",
  "hustle-and-heart": "Every dollar goes to an athlete. The Hustle and Heart Fund, Adapt To Life.",
  "ways-to-give": "Every road here ends on a court. Adapt To Life.",
  volunteer: "Your place on this team. Adapt To Life.",
};

// Cards live under /images/og/ on their own paths, including the default one.
// /images/og-image.jpg is left in place, still regenerated, for anything outside
// this repo that already points at it (Givebutter, signatures) — but no page
// references it, so a redesign is never served from a stale third-party cache.
const url = (card) => {
  const name = card === "_default" ? "home" : card;
  return `${BASE}/images/og/${name}-v2-option2.jpg`;
};

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
  const name = card === "_default" ? "home" : card;
  const local = join(PUB, "images/og", `${name}-v2-option2.jpg`);
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
