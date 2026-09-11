# Homepage story refinement

## Scope

Alec requested implementation on staging of the reviewed homepage story, with intentional pathways for athletes, donors, and volunteers. Production and live fundraising remain outside this change.

## Editorial decisions

- Keep the accepted headline and photo mosaic. Put a plain explanation and athlete, donor, and volunteer paths immediately below the photos rather than over people's faces.
- Replace the generic participation headline with “A chance to play should not come down to luck.” Ground it in Alec's existing About page, not an invented testimonial or life-changing impact claim.
- Explain finding a program and getting help with equipment, training, and travel before showing the campaign. Keep the practical paragraph short and athlete-led: “What comes next is up to you.” No competing program-card grid.
- Retain the live shared campaign component and its authoritative data. Remove only the completed-drive summary from the homepage. Its results and campaign history remain available on existing pages.
- Keep Tim's name, basketball context, and the original “Hustle & Heart is how Tim played” headline. Do not turn the homepage into a memorial biography.
- Explain growth as sustaining support beyond one fundraiser. Detailed revenue and donation terms stay on the roadmap and giving page, with visible links.
- Close the brochure story using Alec's existing quote verbatim, followed by concrete ways to give money, time, skills, or introductions.
- Do not introduce new beneficiary counts, invented results, blanket donation guarantees, new quotations, or claims that future programs already exist.

## Source and design continuity

Reviewed the existing staging homepage, About, Tim, Hustle & Heart, roadmap, content decisions, and Alec's current direction. The brochure origin, two decades as athlete/coach, personal financial support, and Tim's identity are supported by those sources. Public site copy is context, not an independent impact audit.

Merged the current main-branch phone-photo refinements through `63fac4b` into the existing content branch before editing. No main-branch push is part of this work. Preserved image assets/crops, fonts, shared colors, navigation, photography motion control, footer, and staging payment/write protections. Updated the stale structured description so search metadata does not introduce a new or different mission.

## Verification procedure

`npm run build:app`, `npm run css`, `npm test`.

`node scripts/check-homepage-story.mjs <origin> <evidence-directory>` exercises widths 320, 390, 768, and 1440; actual visible image decoding; horizontal overflow; heading sequence; three welcome actions and touch targets; navigation destinations; fixed navigation position; preservation of closing motion controls; and readable core narrative without JavaScript. Produces initial-viewport and full-page screenshots for visual inspection. No donor, application, contact, or subscription form is submitted.

Use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to point to an installed browser rather than downloading one. Run `scripts/check-site.mjs` against the deployed staging origin for wider regression coverage. Full-page screenshots must be captured after scrolling to the top; otherwise a fixed header is stitched into the middle of the long image and falsely looks like a layout obstruction.

Evidence and deployment receipts: `/opt/data/workspace/research/atl-homepage-story-evidence/`.
