# adapttolife.org — content spine

This is the content standard for the site. Every page, section, and future addition (events,
campaigns, sponsor features) follows it. If a change fights this doc, fix the change or change
this doc — never drift silently.

## The through-line

**"Your place in adaptive sports."** Belonging leads every page. The 100% promise is the trust
seal that closes each ask — it supports the story, it is not the story.

## The story arc (site-wide and inside each page)

1. **Belief** — access to sport is a right, not a privilege.
2. **Problem** — two barriers keep athletes out: cost, and finding it at all.
3. **Plan** — two programs, one per barrier: Hustle & Heart Fund (cost), Adaptive Sports Near Me (access).
4. **Proof** — Tim (the why), Brian (the outcome), athletes funded, the US Open push.
5. **Trust** — one hundred percent reaches the athlete; we build in the open.
6. **Join** — one door per audience: give, sponsor, apply, find a program.

Each page runs the same arc in miniature: hook (belonging) → substance (its one job) → proof or
trust beat → one ask.

## One job, one ask per page

| Page | The ONE job | The ONE primary ask (page-end) |
|---|---|---|
| `/` | The whole arc in miniature; route people to their door | Donate (doors: fund + directory mid-page) |
| `/hustle-and-heart` | The fund's story (the cost barrier) | Give, in place (the give moment) |
| `/donate` | Complete the gift, zero friction | Finish your gift |
| `/sponsorship` | The business case | Talk to us |
| `/apply` | Athlete requests funding | Submit the application |
| `/adaptive-sports-near-me` | The access barrier | Visit the directory |
| `/ways-to-give` | Every way to back an athlete, campaigns first | Donate |
| `/send-6` | The US Open campaign: the goal, who it reaches, what feeds it | Donate |
| `/popcorn` | The recurring popcorn series | Buy popcorn (or Donate when no store is open) |
| `/tim` | The heart | Into the fund |
| `/about` | The people + the canonical promise | Meet us → give |
| `/roadmap` | Accountability + momentum | Back the campaign |
| `/karen` `/contact` `/subscribe` `/waiver` | Support: one function each | Their form |

A page may carry secondary links (text links, ghost buttons) but exactly **one** primary orange
ask at its close.

## Message ownership (say it once)

Each message lives in ONE canonical place. Everywhere else: one line max, linking home.

| Message | Canonical home | Elsewhere |
|---|---|---|
| The full 100% promise (overhead covered separately, documented grants) | `/about#promise` | One line: "One hundred percent reaches the athlete." + link |
| What playing costs (equipment/travel/training + $ ranges) | `/hustle-and-heart` | Name the three words, no numbers |
| How a grant works (steps) | `/apply` | Link only |
| The sponsor pitch + tiers | `/sponsorship` | One card/line + link |
| Impact grid ($3,500 / $500 / $200 / 0%) | `/donate` | Not repeated |
| **"Sports in abundance."** (the vision) | `/` (home), in the hero, directly after the belief line | Quotable elsewhere, but it is a declaration, never body filler. See the rule below |
| The two-barriers framing | `/` (home) | One clause |
| The US Open campaign goal and its per-athlete arithmetic ($3,500 × 6) | `/send-6` | The figure and a link. `/popcorn` carries a short version because it is that page's conversion device |
| Planned and major giving (DAF, stock, bequests, matching, tribute) | `/ways-to-give` | Link only |
| Tim's story | `/tim` | One sentence + link |
| Region vs national scope | `/about` ("we fund adaptive athletes wherever they are, and our directory reaches nationwide") | Footer line. **The fund carries no geographic limit**; the earlier "Northern Illinois and Southern Wisconsin" line was retired and this row lagged behind the page |

## Voice canon

- No em-dashes in user-facing copy (commas, periods, parens).
- Show, don't tell. A logo on a racing chair at nationals, not "real visibility."
- "Barrier," never "wall." Non-cornering legal/ops language.
- **Recognized** 501(c)(3), EIN 41-3213344, "tax-deductible to the extent allowed by law."
- The promise, exactly: "One hundred percent reaches the athlete." ("100%" only in tight UI chips.)
- **One fact, one register.** A number we state in words stays in words everywhere it is a sentence;
  numerals belong to stat tiles and chips. Two spellings of one fact is the single thing that makes
  careful copy read as careless, and it is how three of these drifted:
  - The popcorn split, exactly: **half**. `/popcorn` carried "half", "50%", and "fifty percent" at
    once, the h1 and the line under it disagreeing.
  - The promise above. `/donate` stated it three times in one viewport, twice as "100%" in prose,
    on the one page where the money actually moves.
  - The fund's name, exactly: **Hustle & Heart Fund** (`&amp;` in HTML), *including meta
    descriptions* — `/tim`, `/apply` and `/hustle-and-heart` said "Hustle and Heart Fund" there, so
    the name rendered two ways in search results and every shared link while looking fine on-page.
- **The three lines, and what each is for.** They are not interchangeable and none of them is decoration.
  - **"Your place in adaptive sports."** The *promise*, made to an athlete. Second person, about
    belonging. It leads the site and it does not change.
  - **"Sports in abundance."** The *vision*, about the world rather than the athlete. Adaptive sport
    is scarce today: it costs too much, there is too little of it, and what exists is hard to find.
    Our job is to end that scarcity. It lives in the home hero, one line after the belief, and it is
    said **once**: everything downstream pays it off rather than repeating it (the work section is
    "How we make more of it," not a second billing). Never a caption, never a sign-off, and never
    stretched to mean "we do lots of things."
    **Sentence case in prose**, because every headline on this site is sentence case and breaking
    that would make it read as a product name. Title case only when it genuinely is a name: a
    campaign, a deck title, a shirt.
  - **"The more we grow, the more we give."** The *engine*. Growth is the method, not the goal, and
    the reason growth is not self-serving is that overhead is covered separately.
- **Never localize the organization.** The fund has no geographic limit, the directory is national,
  the board is spread out, and the athletes are wherever they are. So no home state, no home region,
  no home courts, and no distance measured from a single base. Third-party facts are fine and often
  necessary: the US Open really is in Naples, AMP really is in Elkhorn, Double Good really pops in
  Chicago. The test is whether the place is a fact about someone else or a claim about our reach.
- **Never write a number that caps the mission.** "Two barriers," "both of them," "our two programs"
  all describe today's list as if it were the definition, and each one has to be rewritten the day
  the list grows. Adapt To Life is an umbrella: the Hustle & Heart Fund is what it delivers, Adaptive
  Sports Near Me is how it removes the access barrier, and there will be more surfaces
  ([Spec 117](https://github.com/adapttolife/adapt-to-life) adds a storefront). Name what exists
  today, say plainly that it grows, and let the count live in the data rather than in the prose.
- **Funding maturity, corrected 2026-07-29. Adapt To Life has not yet made a grant.** The site said
  "We've started funding athletes to compete" on `/roadmap` under *Live today*, and it was not true
  of the organization. What is true, and is the better story, is that **Alec covered these costs
  personally for years** and built ATL so it stops depending on one person's checkbook. Two rules
  come out of it and both outlive the current numbers:
  - **Founder history is never organizational impact.** Alec's personal giving predates the org and
    may never be counted in athletes funded, dollars granted, or anything that reaches a 990. Tell
    it as his history. The org's first number has to be the org's.
  - **A status claim names the stage it is actually at.** "Funding, so far" beats "Athletes funded"
    when the honest content is "the first grants come as we raise." Neither bravado nor pre-launch
    coyness: say where the thing is.
- **The grant funnel manages expectations before it asks for anything** (Alec, 2026-07-29). Someone
  applying for equipment money is the most vulnerable reader the site has, and the failure mode is
  not rudeness, it is a warm page that reads as a promise. Three rules, live on `/apply` and in the
  receipt email:
  - **The honest line is placed, not buried.** "Applying is not a promise of a grant" sits second on
    the page, not third in a block of prose under two friendlier paragraphs.
  - **A numbered ladder must contain the outcome that actually happens most.** The four steps used to
    run Apply → Review → Approve → Covered, which promises delivery in its own structure no matter
    what the surrounding prose says. Step 3 is now **Decision**: some we fund now, some wait, you
    hear either way.
  - **Words on the page, numbers in the email.** The fund's live position ($ raised of $ goal) is in
    the receipt, not on `/apply`. On the page a small number discourages the application we need; in
    the receipt, after someone has already applied, the same number is the thing that makes the
    invitation to help land. It is read live from `src/fund.js` and **omitted entirely** if
    Givebutter is unreachable, because a guessed figure in writing to an applicant is worse than none.
- **Never condition help on helping.** The invitation for an applicant to share or fundraise is
  always marked optional and always explicitly severed from their application ("this has no bearing
  on your application"). An applicant who believes fundraising buys consideration is a fairness
  problem and a legal one. Money raised goes to **the fund**, never earmarked as someone's own grant.
  Pinned by `test/receipts.test.js`; a copy edit that drops the severance sentence fails the suite.
- CTA verbs, always: **Donate** (give money) · **Apply** (request a grant) · **Suggest a program**
  (directory) · **Talk to us** (sponsor/custom).
- Directory links: internal explainer is `/adaptive-sports-near-me`; the external link opens a new
  tab and is labeled **"Get notified when it opens"** until Adaptive Sports Near Me actually
  launches, then reverts to **"Visit the directory."** One label, everywhere, flipped in one pass.
- **Never claim a sibling product is live that says it is not** (2026-07-29). adapttolife.org
  described the directory as live in five places, including `/roadmap` under *Live today* and the
  dropdown nav on all sixteen pages, while `adaptivesportsnearme.com` read "We are not live yet" and
  `/programs` returned 404. Three buttons labeled "Visit the directory" delivered visitors straight
  into that contradiction. Same class of failure as the grant funnel above, and worse, because a
  button makes the promise clickable.
  - **The claim lives where the product is, not where the marketing is.** Before writing that
    anything is live, load it. This drifted because ASNM's launch gate went up after ATL's copy was
    written and nothing connected the two.
  - **Say precisely which part is live.** ASNM's site, its program-submission intake and its notify
    capture are all up; only browsing is gated. So `/roadmap` says exactly that rather than
    downgrading the whole thing to "coming soon", which would undersell real work.
  - Flip list, for whoever launches ASNM: nav description on all 16 pages, `/`, `/about`,
    `/roadmap`, `/karen`, and `/adaptive-sports-near-me` (hero, closing, and both CTA labels).
- **A campaign and a drive are different things and never merge.** A *campaign* is what we are
  raising for and who it reaches (Send 6 to the US Open Spring 2027, six athletes, $21,000). It has a goal and a
  named beneficiary, and it gets a page. A *drive* is a dated way we raise it (the August popcorn
  store, a tournament). It feeds exactly one campaign and is a row on that campaign's page until it
  earns a page of its own, the way popcorn did. Goals nest and never compete: a drive carries what
  that drive can raise, the campaign carries the total.
- **Say our actual relationship to an event.** Three exist and they are not the same: events we
  **host**, events we **fundraise around**, and events we **send athletes to**. An event we only
  compete in names its real host and its real beneficiary, and nothing on our page may imply we run
  it or receive from it. This is a claim about someone else's charity, not a style choice.
- **No click that does nothing.** With a live purchase link, every path goes to it. Without one,
  every path goes to `/donate`, because the fund is open every day of the year even when a store is
  not. Email capture is a secondary line, never a button dressed as a product.

## Momentum hand-offs (no circles)

Every page ends by handing the visitor forward, never sideways to a page that hands them back:

home → doors → (fund | directory) · tim → fund · fund → give · donate → done (+ level up: monthly,
sponsor) · sponsorship → talk · apply → submit · about → give · roadmap → back the campaign ·
ways to give → a campaign or a standing way · send-6 → give · popcorn → buy (or give).

Adding something new? Give it ONE home page, one ask, one line + link everywhere else. Update this
doc in the same PR.

## Share cards (og:image)

The card a link draws in a text thread is content, not decoration, and it is the one surface nobody
sees while building the site. It is generated, never exported by hand:

- `scripts/make-og.mjs` renders every card from `src/og/card.html` at 1200x630, using the same
  tokens and typefaces as `site.css`. Hand-exporting drifts: the first card shipped in Arial and
  the previous orange, and stayed that way for a month after the brand moved.
- **A card's headline is its page's `h1`, verbatim.** Never new copy. A card is the page's first
  impression, so inventing a line there would put an unapproved promise in front of someone before
  they ever reach the page. The generator fails the build if the two ever differ.
- One line, the mark, the domain. No eyebrow, no supporting sentence: a 15px tracked line is 4px
  wide in a chat bubble.
- Only pages people actually send each other get their own card. Everything else falls back to the
  default. Adding one is a row in `CARDS` plus a row in `scripts/wire-og.mjs`, which is the ONLY
  writer of `og:image` tags.
- **One style across every card; only the line changes** (Alec, 2026-07-25). The backdrop is the
  Adapt To Life mark embossed in black, identical on all of them, so a run of shared links reads as
  one organisation. Resist per-page imagery: the variation belongs in the sentence.
- The type sits right on these cards, the one place the system breaks the site's left alignment. The
  mark sits left of centre in the artwork and cannot be moved right without zooming past what the
  file carries, which the resolution gate refuses. Composition decided it, not taste.
- Photographs, when a card uses one, are of real athletes, ours, and are cropped rather than
  altered. Nothing generated stands in for an athlete. The photo layout is still in the generator
  and one flag away, kept deliberately rather than deleted.
- **A card's photograph must match the page's actual sport.** Read the page; never infer the sport
  from whichever images happen to be at hand. The first Send 6 card showed water-skiing because the
  photo library is full of it, while the page has always said "six adaptive pickleball athletes".
- **No other organisation's branding on our card.** It applies to a partner's product (the popcorn
  vendor's bag) and to a host venue's logo on a shirt in the background alike.
- **Deploy with `npm run deploy:staging`, never bare `wrangler deploy`.** It stamps
  `public/build.txt` with the commit and a digest of `public/` first, and `check-site.mjs` fails if
  the deployed stamp is not the build you are checking. One staging Worker serves one branch, so
  without this a green check can be a green check against somebody else's deploy: on 2026-07-25
  staging took eleven deploys in ninety minutes, three of them ours, and the review link served a
  month-old card.
- `scripts/check-site.mjs` fetches every card off the deployed host on every deploy: it must resolve,
  be absolute, carry alt text, match its declared 1200x630, and fit the 300KB budget above which
  WhatsApp silently drops the preview.
