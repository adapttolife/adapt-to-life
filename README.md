# Adapt To Life

Marketing site for **Adapt To Life — Your Place in Adaptive Sports**, deployed on Cloudflare Workers. Serves a static site plus one form-capture API route.

- **Live:** https://adapt-to-life.alec-af3.workers.dev
- **Cloudflare Worker:** `adapt-to-life` (account: Alec@alecability.com)
- **Hosting model:** Workers with Static Assets — `public/` is served directly; `src/index.js` handles `POST /api/contact`.

## Structure

```
public/
  index.html                    # homepage  ( / )
  about.html                    # /about
  contact.html                  # /contact  (form → /api/contact)
  roadmap.html                  # /roadmap
  transparency.html             # /transparency
  hustle-and-heart.html         # /hustle-and-heart
  adaptive-sports-near-me.html  # /adaptive-sports-near-me
  images/                       # logo, favicon, touch icon
src/index.js                    # Worker: serves assets + POST /api/contact → Airtable
wrangler.jsonc                  # Cloudflare deploy config
```

Clean URLs (`/about`) are handled automatically by Cloudflare; the source file is `about.html`.

## Contact form → Airtable (CRM)

The contact form posts JSON to `POST /api/contact`. The Worker validates it (email required, honeypot spam guard) and creates a row in Airtable:

- **Base:** `Adapt To Life` (`appVPKDdwnOG5qkYG`) · **Table:** `Leads` (`tblhJaZtMY37K7Uio`)
- Base/table IDs are non-secret `vars` in `wrangler.jsonc`.
- The Airtable PAT is a **Worker secret**, never in the repo:

  ```sh
  op read "op://Julia/Airtable PAT/credential" | cfrun npx wrangler secret put AIRTABLE_TOKEN
  ```

The form's "reaching out as" dropdown maps to the `Type` field, so interested athletes/volunteers and program submissions land in one CRM table, filterable by type.

_Roadmap: Beehiiv (newsletter / "Join the list") and Givebutter (donations) are not wired yet._

## Editing content

Edit the relevant `.html` file under `public/`. CSS is shared in `public/css/site.css`; fonts load from Google Fonts.

## Fund & grant process

The Hustle & Heart Fund pages are `public/hustle-and-heart.html` (the fund explainer — includes the "How we decide", "What the fund is for", and FAQ sections) and `public/apply.html` (the application form → `POST /api/apply`). The internal grant review rubric — scoring criteria, approval-stage checklist, and the direct-to-vendor payment policy (adopted from the Kelly Brush Foundation model) — lives in [`docs/grant-review-rubric.md`](docs/grant-review-rubric.md). The public "how we decide / what we don't fund" copy and that rubric are kept in sync on purpose.

## Deploy

This repo deploys to the existing `adapt-to-life` Worker. The Cloudflare API token is injected at runtime from 1Password via the `cfrun` wrapper — no secrets live in the repo or the environment.

```sh
cfrun npx wrangler deploy
```

Staging preview first (front-end only — no data bindings, no cron — so it can never touch prod Airtable/D1/R2/email):

```sh
cfrun npx wrangler deploy --env staging
# → https://adapt-to-life-staging.alec-af3.workers.dev
```

Preview locally without deploying:

```sh
npx wrangler dev
```

## Checking a deploy

```sh
node scripts/check-site.mjs                        # staging
node scripts/check-site.mjs https://adapttolife.org  # prod, after promoting
```

Run it after every deploy. It clicks rather than greps: every page returns 200 and an unknown
path 404s, the mobile menu opens on one tap, the desktop dropdown opens on click, the mobile
and desktop navs list the same items, there is no horizontal overflow at 390px or 1440px, no
reachable dead links, and no console errors. It exists because `/popcorn` once shipped with the
nav script included twice, so every tap toggled the mobile menu open and shut and the menu never
opened. The markup was identical on every page and grepping it found nothing.

Edge propagation runs ~35 to 60 seconds. Poll the served HTML for a string from your change
before trusting a check or a screenshot, or you will verify the previous build.

## Provenance

This repo was reconstructed from the live deployment (the only source that existed at the time). Because the Worker serves static assets with no server code, the captured files are byte-identical to what was deployed.

<!-- Workers Builds connected 2026-07-06 (Spec 59 AC4 drill) -->
