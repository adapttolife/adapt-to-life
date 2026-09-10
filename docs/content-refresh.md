# ATL content refresh: working review

## One source and one preview

Production source is `main`. This session's branch is `content/atl-story-2026-09`, based on main `8fb2c1e76cfbc10114eae2d978d85bb13ea45df9`. The draft PR targets main; nothing authorizes merge or production deployment.

The one review site remains https://adapt-to-life-staging.alec-af3.workers.dev/ on the standard `env.staging`. There is no second staging stack.

## Full draft, not a homepage sample

The content pass covers the homepage, all main and footer destinations, every volunteer role, shared navigation/footer, page descriptions, relevant form help, client-generated campaign text, and the fund/popcorn social previews. Direct quotes are retained. The existing photographs, crops, shared visual styles, and layout system remain the baseline.

The persistent content-staging banner and its page-bottom padding are removed at Alec's request. Do not replace them with another persistent alert. Forms and payments remain disabled. The unsigned release's legal agreement is unchanged; only shared navigation/footer wording is aligned.

The editorial standard is `docs/CONTENT.md`: one participation story, not two barriers/two program pillars. Equipment, training, and travel stays in that order. Individual pages own useful detail instead of repeating it everywhere.

### Page inventory

These entries describe completed draft scope, not production approval or financial certification.

| Page | Draft scope |
| --- | --- |
| `/` | Content, navigation/footer, metadata |
| `/about` | Content, navigation/footer, metadata |
| `/adaptive-sports-near-me` | Content, navigation/footer, metadata |
| `/apply` | Content, navigation/footer, metadata |
| `/contact` | Content, navigation/footer, metadata |
| `/donate` | Content, navigation/footer, metadata |
| `/hustle-and-heart` | Content, navigation/footer, metadata |
| `/karen` | Content, navigation/footer, metadata |
| `/promise` | Content, navigation/footer, metadata |
| `/roadmap` | Content, navigation/footer, metadata |
| `/sponsorship` | Content, navigation/footer, metadata |
| `/subscribe` | Content, navigation/footer, metadata |
| `/tim` | Content, navigation/footer, metadata |
| `/volunteer` | Content, navigation/footer, metadata |
| `/send-6` | Content, navigation/footer, metadata |
| `/popcorn` | Content, navigation/footer, metadata |
| `/volunteer/grant-writer` | Role-specific copy and regenerated shared template |
| `/volunteer/fundraising-lead` | Role-specific copy and regenerated shared template |
| `/volunteer/sponsorship-and-partnership-lead` | Role-specific copy and regenerated shared template |
| `/volunteer/corporate-matching-champion` | Role-specific copy and regenerated shared template |
| `/volunteer/planned-and-major-giving-advisor` | Role-specific copy and regenerated shared template |
| `/volunteer/cpa-or-tax-preparer` | Role-specific copy and regenerated shared template |
| `/volunteer/bookkeeper` | Role-specific copy and regenerated shared template |
| `/volunteer/nonprofit-attorney` | Role-specific copy and regenerated shared template |
| `/volunteer/trademark-counsel` | Role-specific copy and regenerated shared template |
| `/volunteer/insurance-and-risk` | Role-specific copy and regenerated shared template |
| `/volunteer/grant-reviewer` | Role-specific copy and regenerated shared template |
| `/volunteer/social-media-manager` | Role-specific copy and regenerated shared template |
| `/volunteer/writer-or-editor` | Role-specific copy and regenerated shared template |
| `/volunteer/photographer-or-videographer` | Role-specific copy and regenerated shared template |
| `/volunteer/graphic-designer` | Role-specific copy and regenerated shared template |
| `/volunteer/press-and-media` | Role-specific copy and regenerated shared template |
| `/volunteer/accessibility-reviewer` | Role-specific copy and regenerated shared template |
| `/volunteer/adaptive-sports-coach` | Role-specific copy and regenerated shared template |
| `/volunteer/event-crew` | Role-specific copy and regenerated shared template |
| `/volunteer/equipment-technician` | Role-specific copy and regenerated shared template |
| `/volunteer/athlete-mentor` | Role-specific copy and regenerated shared template |
| `/volunteer/program-scout` | Role-specific copy and regenerated shared template |
| `/volunteer/clinical-referral-partner` | Role-specific copy and regenerated shared template |
| `/volunteer/make-an-introduction` | Role-specific copy and regenerated shared template |
| `/volunteer/host-something` | Role-specific copy and regenerated shared template |
| `/volunteer/board-and-advisory` | Role-specific copy and regenerated shared template |
| `/waiver` | Shared navigation/footer only; legal agreement preserved |

## Payment-method refinement

Alec confirmed both direct vendor/program payments and reimbursements, and approved updating the site with case-by-case consideration of past expenses without guaranteeing reimbursement. This supersedes the earlier vendor-only wording.

The change is carried through `/promise`, `/hustle-and-heart`, `/about`, `/apply`, the application cost label and FAQ, the grant-review guidance, the README, and the editorial standard. The homepage and About links use How Giving Works consistently. The shared campaign-result label identifies the supported campaign without absolute every-dollar shorthand. Other current pages, shared templates, metadata, and client/server messages are checked for contrary claims rather than burdened with repetitive payment explanations. Regression tests cover both methods and the absence of the old vendor-only statements across all current public pages.

The internal rubric distinguishes confirmed payment practice from proposed implementation controls. No new payment system, approval workflow, fixed lookback period, reimbursement deadline, or automatic entitlement is created. The archived old-content Google Doc remains unchanged. Separate allocation, fee, restricted-gift, and legal questions below remain open; this clarification does not resolve them.

## Decisions that must not be invented by a copy pass

Before any production release, confirm:

- **Gift allocation and fees.** The draft replaces broad 100%/0% headlines with specific grant-payment and program-support explanations. It does not establish a new accounting, processor-fee, overhead, or shop-transfer policy. Confirm the final promise wording and current operating facts with the responsible decision-maker.
- **Restricted campaign gifts.** The existing `/promise` clause about a funded or cancelled campaign is retained, not silently rewritten. Its treatment of donor restrictions needs appropriate review before publication. Do not invent a new refund or reassignment policy here.
- **Legal and operational facts.** The donor legal name, legal release name, tax statement, registrations, and current grant/program claims require source-backed confirmation. The IRS letter stays available. Renaming the footer link to Photo and media release is a label correction, not a rewrite of the agreement.
- **Sponsorship commitments.** Prices and existing benefit tiers remain the baseline. Added consent/scope qualifications and removal of unsupported dollar-to-outcome equivalences need review as part of the final offer. The draft is not authority to grant naming rights or commit the organization.

The Send 6 target remains $21,000 for six athletes, or $3,500 per athlete. It is labelled as a target, not an exact trip price. The unexplained line-item total is not filled with an invented expense. The popcorn page links to the campaign rather than maintaining its own budget.

## Review isolation

`src/staging.js` is the existing staging entrypoint and has only ASSETS and STAGING. It has no production database, email binding, secrets, schedules, production routes, or operational handler imports. It refuses every non-GET/HEAD request before asset handling. All paths run through it.

Payment scripts/preloads and frames are removed; form controls and outbound actions are disabled, including links added by client JavaScript. Same-site navigation stays in staging. CSP forbids offsite connections, frames, and form submission. None of this changes production form behavior.

Staging rewrites own-site social image and page metadata URLs to its actual origin so draft-only cards resolve for real crawlers. Production template URLs remain unchanged. The standing checker fetches the exact declared image URL; it must not silently rebase a broken URL onto the test host.

Fundraising and unsigned-release snapshots in `public/data/staging-*.json` preserve real public source responses and capture timestamps. They are review data, not live balances, reconciled finances, or a second policy source. They contain no signed document or private applicant records.

This is link-accessible website staging, not a private document host. Search exclusions are not authentication. Do not put internal audits, private notes, personal information, or credentials in public assets. Cloudflare Access application creation remains separately permission-blocked. Version preview URLs are off, leaving one stable review ingress.

## Build, verify, and revise

Use the repository's existing commands:

```text
npm ci
npm run volunteer
npm run build:app
node scripts/build-css.mjs
node scripts/build-asnm.mjs
npm test
npm run deploy:staging
npm run check
```

For social headline changes, run the existing named-card generator and wire its output. Make the new card URL versioned. Use the repository-pinned Playwright and Wrangler; a provisioned browser can be selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` without a machine-specific import path.

The standing browser check now covers every role, not just a template sample. After the final deploy, check exact build/commit identity, phone and desktop layout, menu behavior, links, forms, share cards, and staging write refusal. Recheck production's build and active version; they must remain unchanged. Keep source committed, pushed, and recoverable in the same branch/PR.

Do not promote until Alec approves the content and the policy/evidence questions are resolved. Revert unwanted draft changes on this branch and redeploy staging; never roll back production to undo a draft.

## Tooling limits retained

Wrangler 4.130.0 and patched Playwright 1.55.1 are pinned. npm audit reports inherited fflate/nanoid advisories and the development-only sharp → miniflare → wrangler chain. These are recorded, not silently declared fixed; the isolated deployed staging module does not import them. Test success is not a dependency security clearance.
