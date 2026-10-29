# Brand files: which one to use

This folder is the map of Adapt To Life's design assets: logos, icons and symbols, what is current, what is retired, and where the rest lives across adapttolife.org, adaptivesportsnearme.com and adaptbodyshop.com. Current comes first; retired is labeled with a date and a reason, and kept so it can come back.

Read this before you pick a logo for anything. On 2026-09-29 an agent put the retired swoosh mark on a signed grant letter because it took `atl-logo.svg`, the most official-sounding name in the repo, at face value. That file existed in two places, `brand/` and `public/images/`, with nothing saying it was retired. The `brand/` copy now lives in `obsolete/`, and `test/brand_door.test.js` fails if a file in this folder is not listed below.

The design source of truth is Alec's Drive: *Adapt To Life Brand Standards, Canonical Working Reference* (Google Doc) and the Laura Lian Creative Partners identity set dated 2026-09-02. `identity/` is a copy of that set. If the two ever disagree, Drive wins; re-copy it here.

## Print, documents, letterhead, anything a person holds

Use `identity/`. These carry the locked palette.

| File | Use it for |
|---|---|
| `identity/atl-primary.svg` | Default. Letterhead, letters, flyers, reports, slides: the mark with ADAPT TO LIFE beside it. |
| `identity/atl-secondary-badge.svg` | The round "Made by athletes for athletes" badge. Shirts, stickers, merch. |
| `identity/atl-icon.svg` | The mark alone, when the name is already on the page or the space is square. |
| `identity/atl-wordmark.svg` | ADAPT TO LIFE lettering alone. |
| `identity/atl-slogan.svg` | The slogan lettering. |
| `identity/atl-brand-identity-full-set.pdf` | The designer's sheet showing all of the above together. Reference only. |

Locked colors (Brand Standards doc, black confirmed by the designer 2026-09-09): black `#3B3B46`, orange `#FF5C39`, yellow `#F6BE00`, teal `#00B7BD`, purple `#483698`, off-white `#F9F7F2`, beige `#EFE8DC`. `#1A1A1A` is superseded; some site code still uses it and is known drift.

## Website UI

The site header, footer, favicon and social cards use single-color traces of the same 2026 mark so they can inherit `currentColor` and stay tiny. Do not print these; the detail only holds up small.

| File | Use it for |
|---|---|
| `atl-logo-2026.svg` | The 2026 mark master (one color). Large single-color uses such as a shirt graphic. |
| `atl-logo-2026-black.svg` | Same mark, black. |
| `atl-logo-2026-white.svg` | Same mark, white, for dark backgrounds. |
| `atl-logo-2026-ui.svg` | Lightweight trace for the site UI. |
| `atl-logo-v2-option2-ui.svg` | The trace the OG card generator and `/images/brand/atl-logo-512.png` are built from. |

## Icons and symbols (current, since 2026-10-29)

One meaning, one picture, everywhere. Pages ask for a meaning (`giving`, `place`) and the symbol dictionary, `data/icons.mjs`, says which drawing that is. `npm run icons` pulls each drawing from its open-source package into `scripts/lib/icons.mjs`, and the tests fail if that file falls behind the dictionary.

| File | Use it for |
|---|---|
| `icons/README.md` | **Start here for icons.** The catalog of the current collection, with a preview of every symbol and logo. GitHub renders it. Generated. |
| `icons/svg/` | One SVG per meaning per style (`giving.svg`, `giving-duotone.svg`, …), ready for Figma, Canva or a slide. Generated. |
| `icons/logos/` | The platform and tool logos we use, one SVG each. Generated. |
| `icons/sheet.html` | Every meaning in every style at 18, 28 and 56px on both page colors. Generated; open it before shipping a new icon. |

Each library has one job, so they complement each other instead of clashing:

| Library | Job | License |
|---|---|---|
| Phosphor | The core voice: lane symbols, chips, row details, navigation | MIT |
| Material Symbols Light | Sport and accessibility symbols Phosphor lacks, pickleball above all | Apache 2.0 |
| Hugeicons (free set) | Fallback for a meaning nobody above draws | MIT |
| Simple Icons | Real logos of platforms and tools we use (Instagram, Facebook, Buffer, Google) | CC0 |
| Tabler | Internal tools only, such as Mission Control; never public pages | MIT |
| Lucide | Retired from public pages: it reads as the default look of AI-built sites | ISC |

`npm run icons` also keeps the shared pieces in step: every icon on a public page, the header carets, the link arrows (the external arrow whenever a link leaves adapttolife.org), the footer logos, the photo-band controls, the event-card and add-to-calendar icons in `public/js/`, and the check and plus masks the stylesheet draws (`--icon-check`, `--icon-more`). `scripts/lib/apply-icons.mjs` is the one place that knows those patterns, and `test/icons.test.js` fails on a hand-drawn icon or a typed arrow in a link.

The style is part of the message: **duotone** is a section's symbol (a lane tile), **regular** is chips and row details, **bold** is where you are, **fill** is selected. A **logo** only ever means a tool or platform, never a concept. A tool with no official logo shows its name alone. Motion is built-in CSS first and Anime.js only when CSS runs out, and it always respects the visitor's reduce-motion setting.

The research behind these choices (packages, licenses, GitHub and X activity, 2026-10-29) is summarized in PR #206.

## Retired: never use

| File | Why it is still here |
|---|---|
| `obsolete/atl-logo.svg`, `.eps`, `.pdf` | The pre-2026 swoosh mark. Kept for history only. |
| `obsolete/atl-logo-2000px.png` | Raster of the same retired mark. |
| `obsolete/atl-logo-before-after.png` | The comparison image from the 2026-07-30 trace cleanup. |
| `public/images/atl-logo.svg` (outside this folder) | The same retired mark, kept at its old URL on purpose because caches and old pages still request it. Its hash is pinned in `test/site_logo.test.js`. It is not a source for anything new. |
| `obsolete/icons-2026-10-custom/README.md` | **Retired 2026-10-29.** Why the custom icon set and reel covers were retired, and how to bring them back. |
| `obsolete/icons-2026-10-custom/icons.mjs` | The thirteen custom line icons (wheel, court, paddle, paddle tap), as they were in `scripts/lib/icons.mjs`. |
| `obsolete/icons-2026-10-custom/reel-covers.json` | The six line-art reel covers from `/social`. |
| `obsolete/icons-2026-10-custom/sheet.html` | Open to see the retired set and covers at real sizes. |
| `obsolete/icons-2026-10-custom/svg/` | Each retired icon and cover as its own SVG, previewed in that folder's README. |
| 3D sport icons (adaptivesportsnearme repo, `design/retired/3d-sport-icons/`) | **Retired 2026-10-29.** Eleven 3D sport renders that ASNM's category chips used before Alec's flat drawings replaced them. Nothing on the site uses them; they are labeled and kept there. |

## Design assets across the three sites

Where everything else lives, so nobody has to go looking. Each site keeps its own files; this is the index.

| Site and repo | Asset | Where | Status |
|---|---|---|---|
| adapttolife.org (`adapttolife/adapt-to-life`) | Logos | this folder | Current: `identity/` for print, the `atl-logo-2026*` traces for the site |
| | Icons and symbols | `data/icons.mjs` → `scripts/lib/icons.mjs` | Current (see above) |
| | Photographs | `public/images/athletes/`, `public/images/brickhouse/`, `public/images/hero/` | Current. They belong to the hooks: home, landing, donate and campaign pages, not the pages in between |
| | Share cards | `public/images/og/` | Current, generated by `npm run cards` |
| adaptivesportsnearme.com (`adapttolife/adaptivesportsnearme`) | Sport drawings ("emblems") | `public/emblems/sports/` | Current. Alec's flat vector drawings, one per sport; Drive is the source (see that folder's README) |
| | Sport drawings in motion | `public/emblems/motion/` | Current. Each drawing plays its sport's move |
| | Grant, event and adaptive badges | `public/emblems/*.png`, `public/emblems/adaptive.svg` | Current |
| | Scenes | `public/scenes/` | Current |
| | UI icons | `public/app/icons.js` (a Lucide subset) | Current there; a candidate to move onto this dictionary |
| | 3D sport icons | `design/retired/3d-sport-icons/` | **Retired 2026-10-29** |
| | Earlier sport photos | `public/assets/archived-sport-photos/` | Retired before 2026-10-29, kept by that repo |
| | The map for that repo | `design/README.md` | Current |
| adaptbodyshop.com (`adapttolife/adapt-body-shop-storefront`) | Logo traces and the hero source | `brand/` in that repo | Current |
| | UI icons | `app/components/Icons.tsx` | Current (search, account, cart) |
| | The older Liquid theme | `adapttolife/adapt-body-shop` | Not what serves the shop; do not take assets from it |

