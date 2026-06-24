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

Edit the relevant `.html` file under `public/`. CSS is inline within each page; fonts load from Google Fonts.

## Deploy

This repo deploys to the existing `adapt-to-life` Worker. The Cloudflare API token is injected at runtime from 1Password via the `cfrun` wrapper — no secrets live in the repo or the environment.

```sh
cfrun npx wrangler deploy
```

Preview locally without deploying:

```sh
npx wrangler dev
```

## Provenance

This repo was reconstructed from the live deployment (the only source that existed at the time). Because the Worker serves static assets with no server code, the captured files are byte-identical to what was deployed.
