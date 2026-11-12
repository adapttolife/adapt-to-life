# Working on adapttolife.org

Notes for any agent (Claude, Codex or another) working in this repo. Read this first, then the
document it points to for the job at hand.

## Show your work

- Preview on the playground, never by pushing a branch or deploying staging. Build first, then
  publish the built site (the playground skill has the rules: one link, the newest variant):

  ```sh
  npm run build:app && node scripts/build-css.mjs && node scripts/version-assets.mjs
  play publish atl <round> <variant> "$PWD/public" --path /<page> --note "<plain words>"
  ```

- Hand it over so it opens on a phone. Start the message with the link as a markdown link,
  `[Open the sponsor page preview](https://...)`, because a bare URL is not tappable in the chat
  app the reviewer uses. Add phone screenshots from the playground skill's `shot.mjs`
  (`--selector` for just the part that changed). Repeat the link in every later message that asks
  for a look or a decision.
- Layout check: `node scripts/check-layout.mjs <preview url> --engines chromium --pages /a,/b`.
  On a playground preview, `/api/raised` 404s and "Failed to fetch" on pages with the Givebutter
  widget are expected: previews are static and calls to production are blocked.

## Before you hand it over

- `npm test`, `node scripts/smart-quotes.mjs --list` and `npm run icons -- --check` all pass.
- What the deploy builds matches what you commit. This must list only your intended changes:

  ```sh
  npm run build:app && node scripts/build-css.mjs && node scripts/version-assets.mjs \
    && npm run events && npm run guides && npm run blog && git status --porcelain
  ```

- Money or policy copy (prices, where money goes, sponsor terms, tax lines) gets an independent
  second look before the owner sees it, and again before it goes live.
- Generated pages are rebuilt from their sources, never hand-edited: guides and `/links`
  (`npm run guides`), events (`npm run events`), the blog, its feed, `/llms.txt` and the
  "More from the blog" section on every page the blog collects (`npm run blog`, from
  `data/blog.mjs`), volunteer roles (`npm run volunteer`), the campaign
  module (`node scripts/build-module.mjs`).

## Ship

- One short-lived PR into `staging` when the change is going to ship. Production releases run only
  when the owner says "push live" (`npm run release`). Other contributors' staging commits ride
  along untouched.
- Changed an outside system ahead of the site (Givebutter, email, social)? Ship the matching site
  change in the same step, or say exactly what is out of sync and until when.

## Measure

- What people read: `cfrun npm run traffic` (Cloudflare Web Analytics, no cookies: top pages,
  every page the blog lists, where visitors came from, countries; `-- --days 7` for a week).
- Search engines hear about changed pages from each release: `scripts/release.mjs` sends them to
  IndexNow (`scripts/lib/indexnow.mjs`, key file `public/<key>.txt`). To see or resend the list:
  `node scripts/indexnow.mjs --since <ref> --dry-run`.
- AI crawlers are allowed: Cloudflare's AI-bot block and its managed robots.txt are off for the
  zone (Alec, Nov 12 2026), so `public/robots.txt` is what crawlers read.

## Where the rules live

- Content standard, claims and page roles: `docs/CONTENT.md`.
- Money: `public/data/campaigns.json` (campaigns, goals, the road's stops), `src/fund.js` (how the
  bar fills), `docs/sponsor-letter.md` (named sponsorships).
- No calculator needed: say what the money does, then one amount. Never make the reader add,
  multiply or convert (no "at $15 each", no "$129 a month, or $1,548 a year", no "52 nights × $225",
  no per-day figures). A simple contrast or an obvious relationship is fine. `npm test` guards the
  worst patterns ("no page asks the reader to do math").
- Standing copy rules: Adapt To Life funds and supports the crew and does not run it; the crew is
  "Chicago Pickleball: Wheelie Big Dills" at first mention on a page and "the Wheelie Big Dills"
  after; no absolutes in money or partner copy ("every week" is a campaign name); every money
  button says Donate; partner clubs are Open Court clubs, never a "home court"; the US Open picks
  players by lottery, so never promise a place.
