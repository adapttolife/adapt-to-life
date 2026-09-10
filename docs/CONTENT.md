# Adapt To Life content standard

This is the current editorial standard for adapttolife.org. It replaces the former two-barrier/two-program framing. Earlier versions are recoverable in git; they are not concurrent guidance.

## The shared story

**Your place in adaptive sports.**

The problem is the gap between wanting to participate and having a practical way to do it. Adapt To Life is building the support that helps more people make adaptive sports part of their lives.

The directory, fund, shop, and future work serve that purpose. Do not organize the mission as an inventory of initiatives, a choice between access and finance, or two boxes renamed to sound more connected.

A first game, regular practice, and competition all belong in the story. Do not imply that participation must lead to elite achievement. Athletes have their own goals.

The progression in funding copy is always **equipment, training, and travel**. It explains getting equipped, developing skills, and reaching the next opportunity. It is not an eligibility sequence or a promise that every grant covers all three.

## Writing with the existing visuals

Keep the accepted imagery, crops, layout system, typography, and brand palette. Let the photographs show the people and the sport. Let text add meaning, useful details, evidence, and a next step.

- Use a concrete hook, a short explanation, and a useful action.
- Give each paragraph one thought. End when it has done its job.
- Prefer ordinary language over nonprofit jargon, startup positioning, or motivational slogans.
- Remove repeated explanations and self-description before cutting useful eligibility, consent, or process information.
- Use lists for practical steps, options, qualifications, and costs. Do not make the mission a list of products.
- Do not add decorative groups of three. Equipment, training, and travel is a deliberate content sequence, not a template for every sentence.
- Avoid pity, savior framing, claims that everyone experiences disability the same way, and language that makes ordinary participation heroic.
- Preserve direct quotes verbatim. Do not improve, paraphrase, or assign a quote to someone who did not say it.
- Do not assume a photograph depicts a selected grant recipient or the final campaign roster.

## Page responsibilities

| Page | Owns | Primary next step |
| --- | --- | --- |
| `/` | Shared purpose, human context, current work, and routes into it | Give, with secondary athlete pathways |
| `/hustle-and-heart` | Fund purpose and equipment, training, and travel | Give or explore the application |
| `/apply` | Eligibility, review, limitations, direct vendor payment, and application | Apply for support |
| `/donate` | Giving choices, checkout, and donor administration details | Give |
| `/promise` | How giving works and the relationship between support and sustainability | Understand the terms before giving |
| `/send-6` | The campaign goal, selection process, cost categories, and progress | Give toward the campaign |
| `/popcorn` | Drive status, vendor sales model, ordering, participation, and past results | Buy during a drive; otherwise give or subscribe |
| `/adaptive-sports-near-me` | Directory utility and the first step into a program | Browse the directory |
| `/about` | People, origins, and shared purpose | Meet the team and get involved |
| `/tim` | Tim's story and why the fund carries his name | Explore or support the fund |
| `/karen` | Karen's role and connection to finding programs | Continue the conversation |
| `/sponsorship` | Partnership scope, levels, recognition, and conditions | Discuss a partnership |
| `/volunteer` | Roles and the terms of contributing | Explore a role or offer another idea |
| `/volunteer/<role>` | A bounded contribution, time, suitability, scope, and interest form | Express interest, not automatic placement |
| `/roadmap` | Current capability, ongoing work, and future direction | Follow or support the work |
| `/contact` | Route the visitor to the right conversation | Contact |
| `/subscribe` | What email updates cover and unsubscribe expectations | Subscribe |
| `/waiver` | The existing unsigned photo/media release and consent interface | Read the terms; signing stays off in staging |

`/ways-to-give` is a redirect to `/donate`, not a second giving page. Keep useful secondary text links, but do not give every section a competing primary action.

## Navigation and footer

Use the same navigation across pages. Keep Donate and Apply for support easy to find. The existing Our Work, Get Involved, and About groups provide orientation; they are not the story itself.

Descriptions must reflect what is available now. The directory is open, not opening soon. `How Giving Works` leads to `/promise`. `Photo and media release` describes the signing link accurately; do not call it a sports-liability waiver.

The footer keeps the brand promise, useful routes, newsletter entry, social links, and legal disclosure. It does not need another mission essay.

## Claims and source ownership

- Explain approved grants and direct provider payments rather than using blanket percentage shorthand. Do not restore `every dollar reaches an athlete`, `0% overhead`, or exact donation equivalences without a verified allocation and fee policy.
- A target is not a quote, a reconciled expense, a guaranteed award, or a confirmed roster. Describe the Send 6 budget as a fundraising target.
- Do not invent a balancing expense to make illustrative line items equal a fundraising goal.
- `/send-6` owns the campaign explanation. `/popcorn` links to it instead of maintaining another budget.
- `/public/data/campaigns.json` owns campaign and drive names, dates, relationships, and shared card copy. Keep campaign and drive distinct: no open popcorn drive does not mean the Send 6 campaign has ended.
- The public fundraising API is a displayed total, not independent financial reconciliation. Review-only snapshots must record their source and capture time.
- Double Good's published model returns 50% of popcorn sales to the fundraiser. Vendor prices, minimums, shipping, and availability belong at vendor checkout; do not hard-code them without a current reason.
- The directory's generated statistics come from its current API through `scripts/build-asnm.mjs`. Distinguish states from D.C. and do not describe the database as nationally complete or every listing as independently verified.
- The directory is a starting point. Readers confirm schedules, eligibility, equipment, and accessibility with providers.
- Adapt Body Shop contributes to the organization's longer term sustainability story. Do not invent a current transfer formula or portray the free directory as a confirmed revenue source.
- Tax language, legal entity details, restricted gifts, and grant policy require evidence and the appropriate decision-maker. A staging copy edit is not authority to establish a new policy.

## Generated and connected content

Edit volunteer content in `data/volunteer-roles.mjs` and its existing generator. Run `npm run volunteer`; never hand-edit the generated role pages as a parallel source.

Keep role-specific introductions short and practical. State the relevant work and boundaries. Do not claim a current deadline, missing policy, published rubric, or lack of prior work unless verified. Expressing interest does not confirm placement. Scope, qualifications, screening, consent, and supervision are agreed before relevant work begins.

Descriptions, social titles, image alt text, captions, form help, and client-generated messages are part of the copy pass. Check them alongside the visible page.

Share-card headlines match their pages. Keep the accepted photographs and treatment, change only the wording needed, generate new versioned assets, and wire the image URLs and accurate alt text. Do not leave an old promise embedded in a social preview after removing it from the page.

Adaptivesportsnearme.com and adaptbodyshop.com remain separate later passes. Their voices and operating facts must be checked on those sites, not inferred from ATL copy.

## Review and release

Use the latest-main-based content branch and the standard staging environment. Do not create another preview stack or merge content into production without approval.

Alec removed the persistent content-staging banner. Do not bring it back, add page-bottom padding for it, or replace it with another persistent alert. Keep write refusal, disabled payment widgets, and submission safeguards behind the scenes. The absence of a banner does not make staging production or make its totals live.

Read back the deployed revision, exercise navigation and forms without sending real submissions, check phone and desktop layout, preserve image quality, and verify main/production stayed unchanged. A completed draft is not an approved production release. Track any remaining policy or evidence gates explicitly in the review record.
