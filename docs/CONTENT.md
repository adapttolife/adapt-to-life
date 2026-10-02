# Adapt To Life content standard

This is the current editorial standard for adapttolife.org. It replaces the former two-barrier/two-program framing. Earlier versions are recoverable in git; they are not concurrent guidance.

## The shared story

**Your place in adaptive sports.**

**We expand access to adaptive sports so athletes can find their place.**

**We build more ways into adaptive sports.** Sport is also belonging, choice, a regular part of life, and something to work toward. ATL connects and supports an existing community; it does not claim to create or operate every program. Current initiatives demonstrate the mission but do not define its limits.

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

## Keep the original voice, not the overcorrection

Start with the live/original wording and preserve what works: concrete scenes, conversational rhythm, and a clear point. The chair shop, the court time, and a coach's tank of gas explain more than abstract statements about responsible participation. Correct inaccuracies without replacing every sentence.

The giving page explains the approach, not every application contingency. Keep direct payments and reimbursement in one short explanation. Safety remains a firm principle: clinic insurance, SafeSport certification, training and relevant safeguards are program costs, and programs must meet the safety standards their athletes need. Do not soften this into generic assurances or follow it with an unrelated funding disclaimer.

Put the general funding limitation and the past-expense answer beside the application. State each clearly, once; do not append a no-guarantee sentence to every FAQ or campaign paragraph. Keep the campaign target and cost variation together on the campaign page. About tells the human story and links to How Giving Works rather than restating payment mechanics.

Do not confuse less defensive copy with fewer safeguards. Preserve material donor terms, tax disclosures, unpaid volunteer status, and relevant professional qualifications/consent. Keep detailed grant procedures in the internal guidance. Tests should protect these meanings, not require the old defensive sentences word for word.

## Page responsibilities

| Page | Owns | Primary next step |
| --- | --- | --- |
| `/` | Enduring mission, belonging, human context, current proof, and sustainable growth | Find a place to play, help an athlete, or volunteer |
| `/hustle-and-heart` | Fund purpose and equipment, training, and travel | Give or explore the application |
| `/apply` | Eligibility, review, limitations, payment methods, past-expense questions, and application | Apply for support |
| `/donate` | Giving choices, checkout, and donor administration details | Give |
| `/promise` | How giving works and the relationship between support and sustainability | Understand the terms before giving |
| `/send-6` | The campaign goal, selection process, cost categories, and progress | Give toward the campaign |
| `/popcorn` | Drive status, vendor sales model, ordering, participation, and past results | Buy during a drive; otherwise give or subscribe |
| `/events` | The index of every dated thing we take part in: upcoming (soonest featured) and past, each linking to its own page when it has one | Attend, or join the list for new dates |
| `/adaptive-sports-near-me` | Directory utility and the first step into a program | Browse the directory |
| `/about` | People, origins, shared purpose, and current work at `#our-work` | Meet the community and explore the work |
| `/adapt-body-shop` | Truthful coming-soon shop context within the same mission | Share an idea, get ATL updates, or find a role |
| `/tim` | Tim's story and why the fund carries his name | Explore or support the fund |
| `/karen` | Karen's role and connection to finding programs | Continue the conversation |
| `/sponsorship` (nav: Partners) | The mission for partners, our partners (one card each, linking to their page), what support makes possible, levels, recognition, and conditions | Start a conversation |
| `/brickhouse` (and each future partner page) | One partner's story: who they are, what we do together, their events | Visit, attend, or explore partnering |
| `/volunteer` | Ambassadors first (a band linking to `/ambassadors`), then roles and the terms of contributing | Explore a role or offer another idea |
| `/ambassadors` | The program: who ambassadors are, the three ways in (athlete, coach or program builder, community connector), what we give and ask, one card per ambassador linking to their page | Raise your hand (`/contact?rsn=ambassador`) |
| `/juan` (and each future athlete or ambassador page) | One person's story in their own words, their seat or role, and a share link | Support their seat, or share |
| `/volunteer/<role>` | A bounded contribution, time, suitability, scope, and interest form | Express interest, not automatic placement |
| `/roadmap` | Current capability, ongoing work, and future direction | Follow or support the work |
| `/contact` | Route the visitor to the right conversation | Contact |
| `/subscribe` | What email updates cover and unsubscribe expectations | Subscribe |
| `/waiver` | The existing unsigned photo/media release and consent interface | Read the terms; signing stays off in staging |

`/ways-to-give` is a redirect to `/donate`, not a second giving page. Keep useful secondary text links, but do not give every section a competing primary action.

## Partner pages

Each partner gets its own page at a short root URL (`/brickhouse`), modeled on `/brickhouse`: the co-branded lockup, their place, our athletes there, and their events. The page owns the partner's story; `/sponsorship` carries one card per partner that links to it, and the nav lists Partners, not individual partners. Every partner page has its own share card (`public/images/og/<slug>-v<N>-<tag>.jpg`, usually the page's hero photo), a link back to `/sponsorship`, and a sitemap entry. `test/partners.test.js` enforces all four. Never publish deal terms, a partner's level, or background shared in conversation.

## People pages

Athletes and ambassadors get their own page at a short root URL (`/juan`). Their words are quoted verbatim (punctuation only), facts come from a source they or Alec approved, and the page has its own share card from a clean photo of them. `/ambassadors` carries one card per ambassador; `test/ambassadors.test.js` enforces that each card leads to a public page with its own card, a link back, and a sitemap entry. Being an ambassador never depends on receiving Hustle & Heart support, and support never depends on being an ambassador. An `/athletes` index waits until there are three profiles.

## Navigation and footer

Use the same navigation across pages. Keep Donate and Apply for support easy to find. The existing Our Work, Get Involved, and About groups provide orientation; they are not the story itself.

Each group answers one question with at most three links: Our Work is what we do, Get Involved is how to help, About is who we are. Individual partners, people, and events are reached through their index pages (`/sponsorship`, `/ambassadors` via the first band on `/volunteer`, `/events`), never their own menu item. The footer may list more. `test/nav.test.js` enforces all of this.

Descriptions must reflect what is available now. The directory is open, not opening soon. Adapt Body Shop is coming soon, not a live store: use `/adapt-body-shop` for its current explanation, including in mobile navigation and the footer. `How Giving Works` leads to `/promise`. `Photo and media release` describes the signing link accurately; do not call it a sports-liability waiver.

The footer keeps the brand promise, useful routes, newsletter entry, social links, and legal disclosure. It does not need another mission essay.

## Claims and source ownership

- Explain approved support through direct vendor/program payments or reimbursement for approved expenses. Payment method can vary with the request and athlete's circumstances. Do not turn it into a vendor-only promise or treat reimbursement as inherently less trustworthy.
- Prior expenses can be considered case by case, not automatically approved or automatically excluded. Keep detailed application guidance on `/apply`. Do not invent a fixed lookback period, a mandatory preapproval rule, or automatic reimbursement. Update the internal grant rubric whenever this public guidance changes.
- Do not use a payment channel as proof of a donation percentage. Do not restore `every dollar reaches an athlete`, `0% overhead`, or exact donation equivalences without a verified allocation and fee policy.
- A target is not a quote, a reconciled expense, a guaranteed award, or a confirmed roster. Describe the Send 6 budget as a fundraising target.
- Do not invent a balancing expense to make illustrative line items equal a fundraising goal.
- `/send-6` owns the campaign explanation. `/popcorn` links to it instead of maintaining another budget.
- `/public/data/campaigns.json` owns campaign and drive names, dates, relationships, and shared card copy. It is also the events calendar: every entry has a `type` (`fundraiser`, `tournament`, or `event`), and adding an event is appending one object. Only fundraisers feed a campaign or steer QR campaign-follow codes. A big event gets its own page (like `/brickhouse`) and its entry links there with `page`. Keep campaign and drive distinct: no open popcorn drive does not mean the Send 6 campaign has ended.
- The public fundraising API is a displayed total, not independent financial reconciliation. Review-only snapshots must record their source and capture time.
- Double Good's published model returns 50% of popcorn sales to the fundraiser. Vendor prices, minimums, shipping, and availability belong at vendor checkout; do not hard-code them without a current reason.
- The directory's generated statistics come from its current API through `scripts/build-asnm.mjs`. Distinguish states from D.C. and do not describe the database as nationally complete or every listing as independently verified.
- The directory is a starting point. Readers confirm schedules, eligibility, equipment, and accessibility with providers.
- Adapt Body Shop contributes to the organization's longer term sustainability story. The store is forthcoming. Do not invent products already for sale, launch dates, a profit-transfer percentage, or purchase deductibility. Keep the directory free to browse; describe revenue development as a plan, not proof of current earnings.
- Tax language, legal entity details, restricted gifts, and grant policy require evidence and the appropriate decision-maker. A staging copy edit is not authority to establish a new policy.

## Generated and connected content

Edit volunteer content in `data/volunteer-roles.mjs` and its existing generator. Run `npm run volunteer`; never hand-edit the generated role pages as a parallel source.

Keep role-specific introductions short and practical. State the relevant work and boundaries. Do not claim a current deadline, missing policy, published rubric, or lack of prior work unless verified. Expressing interest does not confirm placement. Scope, qualifications, screening, consent, and supervision are agreed before relevant work begins.

Descriptions, social titles, image alt text, captions, form help, and client-generated messages are part of the copy pass. Check them alongside the visible page.

Share-card headlines match their pages. Keep the accepted photographs and treatment, change only the wording needed, generate new versioned assets, and wire the image URLs and accurate alt text. Do not leave an old promise embedded in a social preview after removing it from the page.

The separate adaptivesportsnearme.com directory and adaptbodyshop.com storefront remain outside this ATL-site staging pass. The new ATL `/adapt-body-shop` page explains its forthcoming role; it is not a storefront launch. Their voices and operating facts must be checked on those sites, not inferred from ATL copy.

## Review and release

Use the latest-main-based content branch and the standard staging environment. Do not create another preview stack or merge content into production without approval.

Alec removed the persistent content-staging banner. Do not bring it back, add page-bottom padding for it, or replace it with another persistent alert. Keep write refusal, disabled payment widgets, and submission safeguards behind the scenes. The absence of a banner does not make staging production or make its totals live.

Read back the deployed revision, exercise navigation and forms without sending real submissions, check phone and desktop layout, preserve image quality, and verify main/production stayed unchanged. A completed draft is not an approved production release. Track any remaining policy or evidence gates explicitly in the review record.
