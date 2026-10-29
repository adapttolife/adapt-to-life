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
// `css: true` also writes the drawing into src/css/site.css as a mask
// variable (--icon-<meaning>), for symbols the stylesheet draws itself.

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

  // How the fund spends: the content standard's own sequence. Equipment,
  // training and travel always appear with these three symbols, in this order.
  equipment:     { src: "ph", icon: "toolbox",           means: "Equipment: sport chairs, gear, repairs" },
  training:      { src: "ph", icon: "target",            means: "Training: practice, clinics, coaching time" },
  travel:        { src: "ph", icon: "airplane-tilt",     means: "Travel: getting to the tournament or event" },

  // How a grant works, from application to money (/apply), and money arriving.
  apply:         { src: "ph", icon: "paper-plane-tilt",  means: "Send an application or a request" },
  review:        { src: "ph", icon: "book-open-text",    means: "A person reads it" },
  decision:      { src: "ph", icon: "scales",            means: "A decision is weighed and made" },
  funding:       { src: "ph", icon: "hand-coins",        means: "Money paid to or for an athlete or the fund" },

  // Ways to give (/donate).
  recurring:     { src: "ph", icon: "arrows-clockwise",  means: "Something that repeats, like a monthly gift" },
  business:      { src: "ph", icon: "buildings",         means: "A business or employer" },
  tribute:       { src: "ph", icon: "flower-lotus",      means: "In honor or in memory of someone" },
  investments:   { src: "ph", icon: "chart-line-up",     means: "Stock, donor-advised funds, other assets" },
  secure:        { src: "ph", icon: "lock-key",          means: "Secure: checkout, data, privacy" },
  receipt:       { src: "ph", icon: "receipt",           means: "A receipt or tax record" },

  // Fundraisers and roles.
  store:         { src: "ph", icon: "storefront",        means: "A store opens, ours or a partner's" },
  order:         { src: "ph", icon: "shopping-bag-open", means: "Place an order" },
  coaching:      { src: "ph", icon: "chalkboard-teacher",means: "Coaching and building a program" },
  scope:         { src: "ph", icon: "list-checks",       means: "A defined scope of work" },
  reply:         { src: "ph", icon: "envelope-simple",   means: "We reply; you hear back" },
  search:        { src: "ph", icon: "magnifying-glass",  means: "Search or look something up" },
  open:          { src: "ph", icon: "lock-simple-open",  means: "Open to everyone: no account, no fee" },

  // Where a piece of work stands (/roadmap).
  live:          { src: "ph", icon: "check-circle",      means: "Live today: done and available" },
  building:      { src: "ph", icon: "hammer",            means: "Being built or strengthened now" },
  later:         { src: "ph", icon: "compass",           means: "Where we are headed next" },

  // Row details and navigation: plain on purpose.
  time:          { src: "ph", icon: "clock",             means: "How much time something takes" },
  place:         { src: "ph", icon: "map-pin",           means: "A city or venue" },
  arrow:         { src: "ph", icon: "arrow-right",       means: "Go to a page on this site" },
  external:      { src: "ph", icon: "arrow-up-right",    means: "Opens another site" },
  back:          { src: "ph", icon: "arrow-left",        means: "Back to the list this page belongs to" },
  caret:         { src: "ph", icon: "caret-down",        means: "Opens a menu" },
  check:         { src: "ph", icon: "check",             means: "Yes: included, you qualify, it applies", css: true },
  more:          { src: "ph", icon: "plus",              means: "Show more (turns to a close mark when open)", css: true },
  close:         { src: "ph", icon: "x",                 means: "Close this sheet or dialog" },
  pause:         { src: "ph", icon: "pause",             means: "Pause moving pictures" },
  resume:        { src: "ph", icon: "play",              means: "Resume moving pictures (not a video: that is play)" },
};

// Logos for the "Works in" tool chips and social links. Only tools Simple
// Icons draws officially; a tool without one (Givebutter, Beehiiv, Double
// Good) shows its name alone rather than a made-up mark.
export const LOGOS = {
  instagram: { src: "brand", icon: "instagram", means: "Instagram" },
  facebook:  { src: "brand", icon: "facebook",  means: "Facebook" },
  buffer:    { src: "brand", icon: "buffer",    means: "Buffer" },
  google:    { src: "brand", icon: "google",    means: "Google Workspace" },
  apple:     { src: "brand", icon: "apple",     means: "Apple Calendar (add to calendar)" },
  googlecalendar: { src: "brand", icon: "googlecalendar", means: "Google Calendar (add to calendar)" },
  outlook:   { src: "brand", icon: "microsoftoutlook", means: "Outlook (add to calendar)" },
};
