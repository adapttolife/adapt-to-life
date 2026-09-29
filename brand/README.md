# Brand files: which one to use

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

## Retired: never use

| File | Why it is still here |
|---|---|
| `obsolete/atl-logo.svg`, `.eps`, `.pdf` | The pre-2026 swoosh mark. Kept for history only. |
| `obsolete/atl-logo-2000px.png` | Raster of the same retired mark. |
| `obsolete/atl-logo-before-after.png` | The comparison image from the 2026-07-30 trace cleanup. |
| `public/images/atl-logo.svg` (outside this folder) | The same retired mark, kept at its old URL on purpose because caches and old pages still request it. Its hash is pinned in `test/site_logo.test.js`. It is not a source for anything new. |
