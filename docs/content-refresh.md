# Content refresh: the existing staging workflow

## One source, one review environment

- Production source is `main`. Start content work from its latest fetched commit.
- This review branch is `content/atl-story-2026-09`, based on `8fb2c1e76cfbc10114eae2d978d85bb13ea45df9`.
- Use the existing `adapt-to-life-staging` Worker and `env.staging`. No parallel Worker, hostname, or deployment configuration.
- Stable review URL: `https://adapt-to-life-staging.alec-af3.workers.dev/`.
- This is link-accessible website staging, not a private document host. Publish website copy only; no internal audit, private notes, source correspondence or personal data.
- `/review` on staging redirects to the draft homepage section. Retired design tours, admin applications, report viewers and production APIs are unavailable here.

## Build and deploy

```sh
npm ci
npm run build:app
npm run css
npm run asnm
npm test
# Commit and push the reviewed branch, then:
npm run deploy:staging
npm run check
```

The normal build hook handles generated assets and the commit/content stamp. Use the existing deployment script so `ATL_TARGET=staging` is explicit. Never bypass the production branch guard to deploy content work.

`npm run check` uses the repository's pinned Playwright dependency. Install its browser normally, or supply `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for an already provisioned Chromium. Do not hardcode workstation paths or install symlinks into another user's home.

## Review safety

`env.staging.main` selects `src/staging.js`; production retains `src/index.js`. Staging has only static ASSETS and its STAGING marker. Every request crosses that entrypoint. It rejects writes before any asset handling and cannot call the operational backend.

Payment widgets, frames and external submission scripts are removed at response time; form controls and outbound links are disabled. Same-site links stay in staging, and the signing hostname becomes the local release-copy preview. CSP forbids offsite fetches, frames and form submissions. This does not change any production forms.

Fundraising figures are a real dated snapshot from the public production API, stored at `public/data/staging-raised.json`, not a fake total or a live integration. The unsigned release document is likewise preserved verbatim from the public document endpoint in `public/data/staging-waiver.json`, so its words can be reviewed without any signing or record-download capability. Both snapshots record their source and capture time. Refresh deliberately for review; they are not a second policy source or financial reconciliation.

Search exclusion is `robots.txt` plus response-level `X-Robots-Tag`. It is not authentication. Version preview URLs are disabled so there is one stable review ingress.

## Editorial state

FIRST DRAFT: the homepage participation section replaces the initiative panels with one short narrative and useful next steps. Unused panel CSS and the obsolete homepage directory-count writer are removed rather than left to drift.

UNCHANGED BASELINE: the hero imagery, photo assets, visual system, all other homepage sections and all other website pages. Existing promises and eligibility statements on those pages have not been approved anew merely by appearing in staging.

The editorial sequence is homepage direction, mission/fund/directory/trust pages together, practical conversion pages, human stories, then shared navigation/footer/forms/metadata and every volunteer role. AdaptiveSportsNearMe and Adapt Body Shop are later coordinated site updates, not part of this deployment.

Before calling the whole-site revision finished, check each page and its dependencies. Do not treat a homepage sample as completion of the site refresh. No merge to main or production deployment is implied by staging approval.

## Verification and rollback

Check the deployed build stamp against the exact source commit and digest. Read back Cloudflare bindings, routes and scheduled triggers. Exercise nav and page links at phone and desktop widths, look at real screenshots, and verify writes are refused on staging. Confirm the live production build and active version are unchanged by the staging release.

Preserve every reviewed revision as a normal commit. Subsequent changes revise this branch and environment rather than starting a new stack. To undo an unapproved content change, revert its commit on the content branch and redeploy staging; do not alter main or roll back production.

The CLI is pinned to Wrangler 4.130.0, the version exercised for this staging release, so `npx` cannot silently select a different version on the next deploy. Playwright is pinned to patched 1.55.1 rather than the vulnerable 1.55.0 local tooling version.

`npm audit` reports five dependency entries: inherited fflate and nanoid advisories, plus the development-only sharp → miniflare → wrangler chain. The suggested Wrangler downgrade is not applied. None of those modules is imported by the isolated staging Worker. These advisories remain open; passing application tests is not a dependency security clearance.
