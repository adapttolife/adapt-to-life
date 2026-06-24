# Adapt To Life

Static marketing site for **Adapt To Life — Your Place in Adaptive Sports**, deployed on Cloudflare Workers (Static Assets).

- **Live:** https://adapt-to-life.alec-af3.workers.dev
- **Cloudflare Worker:** `adapt-to-life` (account: Alec@alecability.com)
- **Hosting model:** Workers Static Assets — no server code, the contents of `public/` are served directly.

## Structure

```
public/
  index.html                    # homepage  ( / )
  about.html                    # /about
  contact.html                  # /contact
  roadmap.html                  # /roadmap
  transparency.html             # /transparency
  hustle-and-heart.html         # /hustle-and-heart
  adaptive-sports-near-me.html  # /adaptive-sports-near-me
  images/                       # logo, favicon, touch icon
wrangler.jsonc                  # Cloudflare deploy config
```

Clean URLs (`/about`) are handled automatically by Cloudflare; the source file is `about.html`.

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
