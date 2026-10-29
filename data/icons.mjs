// data/icons.mjs: the symbol dictionary. One meaning, one picture, everywhere.
//
// Pages never name an icon library. They ask for a meaning ("giving", "place")
// and scripts/build-icons.mjs looks the meaning up here, pulls the drawing from
// the open-source package, and writes scripts/lib/icons.mjs. Changing what a
// meaning looks like is one line in this file, and the whole site follows.
//
// Alec, 2026-10-29: use the libraries "intentionally to complement each
// other". Each one has a job (brand/README.md, "Icons and symbols"):
//   ph        Phosphor (MIT). The core voice. Its weights carry meaning:
//             duotone = a section's symbol (a lane tile), regular = chips and
//             row details, bold = where you are, fill = selected.
//   msl       Material Symbols Light (Apache 2.0). Sport and accessibility
//             symbols Phosphor lacks, pickleball above all. The light weight
//             matches Phosphor's line.
//   huge      Hugeicons free (MIT). Fallback for a meaning no one above has.
//   brand     Simple Icons (CC0). Real logos of platforms and tools we use.
//             A logo always means "a tool or platform", never a concept.
// Tabler is for internal tools only, and Lucide is retired from public pages.
//
// Add a meaning when a page needs one: say what it means, pick the source by
// the jobs above, run `npm run icons`, and look at brand/icons/sheet.html.

export const SOURCES = {
  ph: { pkg: "@iconify-json/ph", name: "Phosphor", license: "MIT" },
  msl: { pkg: "@iconify-json/material-symbols-light", name: "Material Symbols Light", license: "Apache-2.0" },
  huge: { pkg: "@iconify-json/hugeicons", name: "Hugeicons", license: "MIT" },
  brand: { pkg: "@iconify-json/simple-icons", name: "Simple Icons", license: "CC0-1.0" },
};

// Phosphor ships each drawing in these weights; the others ship one style.
export const PH_WEIGHTS = ["regular", "duotone", "bold", "fill"];

export const MEANINGS = {
  // The five volunteer lanes, and anywhere the site means the same thing.
  giving:        { src: "ph", icon: "hand-heart",        means: "Giving and fundraising: money and support that reach athletes" },
  operations:    { src: "ph", icon: "shield-check",      means: "The books, insurance and legal work that protect athletes" },
  stories:       { src: "ph", icon: "megaphone-simple",  means: "Stories and reach: social, writing, photo, video, press" },
  participation: { src: "ph", icon: "wheelchair-motion", means: "Taking part in sport: coaching, events, equipment, mentoring" },
  connections:   { src: "ph", icon: "handshake",         means: "Connections: introductions, hosting, advising" },

  // Sport and place.
  pickleball:    { src: "msl", icon: "pickleball-rounded",  means: "Pickleball specifically" }, // filled: the outline closes into a magnifier at 18px
  courts:        { src: "ph", icon: "court-basketball",  means: "Courts and venues that host us" },
  community:     { src: "ph", icon: "users-three",       means: "The organizations and people we play alongside" },
  cheering:      { src: "ph", icon: "chats-circle",      means: "Support and conversation in the comments" },
  play:          { src: "ph", icon: "play-circle",       means: "Watch a video or reel" },
  event:         { src: "ph", icon: "calendar-dots",     means: "A dated event or campaign" },
  tournament:    { src: "ph", icon: "trophy",            means: "Tournaments and results" },

  // Row details and navigation: plain on purpose.
  time:          { src: "ph", icon: "clock",             means: "How much time something takes" },
  place:         { src: "ph", icon: "map-pin",           means: "A city or venue" },
  arrow:         { src: "ph", icon: "arrow-right",       means: "Go to a page on this site" },
  external:      { src: "ph", icon: "arrow-up-right",    means: "Opens another site" },
};

// Logos for the "Works in" tool chips and social links. Only tools Simple
// Icons draws officially; a tool without one (Givebutter, Beehiiv, Double
// Good) shows its name alone rather than a made-up mark.
export const LOGOS = {
  instagram: { src: "brand", icon: "instagram", means: "Instagram" },
  facebook:  { src: "brand", icon: "facebook",  means: "Facebook" },
  buffer:    { src: "brand", icon: "buffer",    means: "Buffer" },
  google:    { src: "brand", icon: "google",    means: "Google Workspace" },
};
