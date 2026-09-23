# Adapt To Life

Marketing site for **Adapt To Life — Your Place in Adaptive Sports**, deployed on Cloudflare Workers. Serves a static site plus one form-capture API route.

- **Live:** https://adapttolife.org
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
src/index.js                    # Worker: serves assets + form posts → ClickUp
wrangler.jsonc                  # Cloudflare deploy config
```

Clean URLs (`/about`) are handled automatically by Cloudflare; the source file is `about.html`.

## The forms → ClickUp

Both public forms write to ClickUp. Nothing writes to Airtable — that was the
prototype, and the line was cut on 2026-07-30. The full map of the three trackers,
including the one that is deliberately **not** automated, is
[`docs/clickup-trackers.md`](docs/clickup-trackers.md).

| Form | Endpoint | Lands in |
|---|---|---|
| `/contact` | `POST /api/contact` | **Contacts** (`901418639884`) |
| `/apply` | `POST /api/apply` | **Hustle & Heart — Applications** (`901418622126`) |

Both validate before writing (email required, honeypot spam guard, Turnstile), put
the sender's own words verbatim in the task description, and set Stage `New`. List
IDs are non-secret `vars` in `wrangler.jsonc`; field IDs are a schema contract and
live in `src/clickup.js`.

**Last contacted** is the staleness rung on both lists. The receipt emails promise
every sender they will hear back, so anything sitting in `New` with a stale Last
contacted is a broken promise, not a backlog.

The token is a **Worker secret**, never in the repo:

```sh
op read "op://Stingel/ClickUp API/credential" | cfrun npx wrangler secret put CLICKUP_TOKEN
```

It authenticates as Alec, so tasks show as created by him.


_Roadmap: Beehiiv (newsletter / "Join the list") and Givebutter (donations) are not wired yet._

## Editing content

Edit the relevant `.html` file under `public/`. CSS is shared in `public/css/site.css`; fonts load from Google Fonts.

## Fund & grant process

The Hustle & Heart Fund pages are `public/hustle-and-heart.html` (purpose and athlete context), `public/promise.html` (How Giving Works), and `public/apply.html` (eligibility, review, payment questions, and the application form → `POST /api/apply`). Support includes direct vendor/program payments and reimbursements for approved expenses; past expenses may be considered case by case without a guarantee. The internal review guidance lives in [`docs/grant-review-rubric.md`](docs/grant-review-rubric.md). Keep public wording and internal guidance aligned without treating draft controls as already implemented procedures.

## Deploy

This repository owns three deliberately separate Workers:

| Worker | Host | Entrypoint | Purpose |
|---|---|---|---|
| `adapt-to-life` | `adapttolife.org`, `www`, `sign` | `src/index.js` | Public site, forms, waivers, QR redirects |
| `amelioration-reports` | `reports.amelioration.is` | `src/reports_worker.js` | Human report views behind Cloudflare Access |
| `amelioration-agent-mail` | `api.amelioration.is` | `src/agent_mail_worker.js` | Machine mail API plus inbound Email Worker events |

**Production ships from `main`, and only from `main`.** On 2026-09-10 the live build stamp
resolved to `fix/tim-mobile-framing` while `main` sat 272 commits behind without the homepage
hero — so every deploy started by working out what production actually was, and anyone branching
from `main` would have built against a site that did not exist. `scripts/guard-prod-branch.mjs`
now refuses a production deploy unless HEAD is `main`, the tree is clean, and `main` matches
`origin/main`. It runs from the `build` hook, so a bare `cfrun npx wrangler deploy` hits it too.
Staging is unguarded on purpose — it exists to look at a branch — and opts out through
`ATL_TARGET=staging`, which `deploy:staging` and `preview` set for you. Emergencies:
`ATL_ALLOW_UNSAFE_DEPLOY=<reason>`, which logs loudly.

The Cloudflare API token is injected at runtime from 1Password through `cfrun`; no secrets live in Git. Always name the intended deployment explicitly:

```sh
cfrun npm run deploy:prod
cfrun npm run deploy:reports
cfrun npm run deploy:agent-mail
```

`amelioration-agent-mail` accepts HTTP only on its custom domain, which is protected by a Cloudflare Access **Service Auth** policy. Access is the transport gate; the existing operator/per-agent bearer token remains mandatory inside the Worker and continues to enforce inbox ownership. Its `workers.dev` and preview hostnames must stay disabled. Inbound `*@agents.adapttolife.org` mail keeps the same address and DNS identity; Cloudflare Email Routing sends the event directly to this Worker and does not traverse the HTTP hostname.

### Two sessions at once: use a per-version preview URL, not shared staging

`--env staging` is ONE Worker. Two concurrent workstreams deploying to it silently replace each
other, and every check you run afterwards passes against whichever build landed last. On
2026-07-25 that happened for real: eleven staging deploys in ninety minutes from two sessions, and
the review link handed over served a month-old card.

**So do not deploy to shared staging for review. Upload a version and use its own URL:**

```sh
npm run preview
# → Version Preview URL: https://<version-prefix>-adapt-to-life.adapt-to-life.workers.dev
```

That URL is yours alone, it is a full working copy of the site, and it does not change what
`adapt-to-life` serves. No second Worker, no second environment, no config change: the
isolation already exists in Wrangler. Check and hand over THAT link.

Shared staging (only when you know you are the only session on it — front-end only, no data
bindings, no cron, so it can never touch prod ClickUp/D1/R2/email):

```sh
npm run deploy:staging
# → https://adapt-to-life.adapt-to-life.workers.dev
```

Every wrangler invocation stamps `public/build.txt` through the `build` hook in `wrangler.jsonc`,
including a bare `cfrun npx wrangler deploy`, and `check-site.mjs` fails if the build it reaches is
not the build you are testing. The hook is not in an npm script because a second session deployed
production with bare wrangler 19 seconds after ours and the stamp went missing: a control a human
has to remember to invoke is not a control. That check is the point: it is what turns "someone deployed over
me" from a thing you find out from Alec into a thing the harness tells you.

Preview locally without deploying:

```sh
npx wrangler dev
```

## Checking a deploy

```sh
node scripts/check-site.mjs <your-preview-url>       # your own version, the normal case
node scripts/check-site.mjs                          # shared staging
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

## Handing an iteration over

`/review` has ONE writer per branch and two concurrent branches will both rewrite it. That is fine
and it is not worth coordinating: resolve the conflict in favour of the branch that merges last,
because the file means "the newest iteration". Review happens on your own preview URL, so the
shared path never has to arbitrate between two live iterations.

`/review` is the one link a reviewer gets: a single ordered walk of what changed, staging-only
(production 302s it home). It is part of the work, not a chore afterwards, so **update
`public/review.html` in the same commit as the iteration.** Give it the stops in the order a
visitor would walk them, one line each on what changed, plus what specifically to look at and
what is deliberately unfinished, so nobody spends attention reporting known gaps.

`check-site.mjs` fails if the tour's `updated` stamp predates the newest change under `public/`,
or if it links to a page that no longer resolves. It went stale once and the person reviewing
had to ask twice for a usable link.

## Provenance

This repo was reconstructed from the live deployment (the only source that existed at the time). Because the Worker serves static assets with no server code, the captured files are byte-identical to what was deployed.

<!-- Workers Builds connected 2026-07-06 (Spec 59 AC4 drill) -->
