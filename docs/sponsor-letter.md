# Sponsorship letter (template)

The one-page letter for each named sponsorship: Captain, Train to Compete, Champion or Founding
Partner. It is the "documentation for each partnership" that /sponsorship promises, and it carries
the two rules Alec chose on Nov 12 2026 ("yes to both"): if a sponsor's name goes on a part, their
money pays for that part, and each part carries one sponsor's name at a time. Fill in the brackets,
keep the one option that applies in each section, and delete the internal checklist before
sending. Have Adapt To Life's accountant read it once before the first deal.

---

[Date]

[Sponsor name]
[Contact name, title]
[Address]

Dear [Contact name],

Thank you for sponsoring Chicago Pickleball: Wheelie Big Dills through Adapt To Life. This letter
sets out what your sponsorship pays for and how we will thank you for it.

**Your sponsorship**

- Level: [Captain / Train to Compete / Champion / Founding Partner]
- Amount: [$11,700 / $15,480 / $21,000 / $50,000 or more]
- Term: [the year from (month, year) to (month, year) / the (2026-27) season, through the US Open in Naples in spring 2027]

**What it pays for**

[Keep one.]

- Captain: a year of court time for the crew, 52 nights for up to 15 athletes a night, priced at the partner club's regular rates.
- Train to Compete: a year of unlimited sessions for ten athletes.
- Champion: The Road to the US Open for the season, about 21 tournament trips for the crew: tournament entry fees, travel and accessible rooms. The US Open, the last stop, picks players by lottery.
- Founding Partner: the year ahead: court time, Train to Compete and the road, with the rest toward the Chicago Classic [or: the parts still open, which are (list)].

Your sponsorship goes to the Hustle & Heart Fund and is held for what it pays for. We pay clubs and
vendors directly or reimburse approved expenses.

**If part of it is already paid for**

[Keep one.]

- Nothing toward [part] is paid for yet, so all of your sponsorship goes to it.
- [Part] already has $[amount] toward it ([money raised earlier for the US Open / court time the partner club gives]). The $[amount] it doesn't need goes to [the rest of the year's goal, every week first / (other, as agreed)].

Anything [the road / court time / Train to Compete] doesn't use in the term stays with it for the
next [season / year], unless we agree in writing to move it.

**Your name, and only yours**

For the term above, [Sponsor] is the only sponsor named on [court time / Train to Compete / The Road
to the US Open / the year ahead]. We will thank you with:

[Keep the lines for the level, from /sponsorship.]

- Your logo on the road page, and your name in posts from the stops ahead (Champion)
- A spotlight on your partnership across our social channels, and your logo on the Wheelie Big Dills page (Captain and up)
- Your logo on our donate page, and your name or logo on our supporters wall (every level)
- Your logo beside our goal for the year ahead, and first call on naming the Chicago Classic, presented by Adapt To Life, once it has a date (Founding Partner)
- Your name and logo on the thank you sign at our table when the crew is at a club event, a clinic or a tournament, where the host allows it (gear partners)

[If the deal names one sponsor in a category, keep:] For the term, [Sponsor] is the only [paddle
brand] Adapt To Life names as a crew sponsor. That covers our naming only: athletes keep their own
sponsorships and gear, and clubs and tournaments keep theirs. Any film or other work with an athlete
is between [Sponsor] and the athlete, with the athlete's OK.

Recognition is a thank-you: your name, your logo and a link to your website. It is not advertising,
an endorsement of your products, or an agreement to use them.

**What you will hear from us**

Each month, a short recap with attendance, views and results, as /sponsorship promises. At the end of
the [year / season], what your sponsorship paid for and what it cost.

**Tax**

Adapt To Life is a 501(c)(3) nonprofit (EIN 41-3213344). We will send a receipt for your
sponsorship. Please check with your tax advisor on the deductible portion.

Thank you for backing the crew.

______________________________
[Name], [Title], Adapt To Life

Accepted for [Sponsor]:

______________________________
[Name], [Title]          Date: ____________

---

## Internal checklist (delete before sending)

- Ask the accountant to book the sponsorship as restricted to its purpose, released as it is spent.
- Champion: set `ROAD_NAMED` (and `ROAD_NAMED_ONLINE` for any part paid through Givebutter) in
  `wrangler.jsonc`, release, and check that the road row and the total add up (`src/fund.js`).
  Captain or Train to Compete paid by check or transfer: add it to `FUND_OFFLINE_RAISED`.
- On /sponsorship, mark the part as taken and adjust the Founding Partner line to the parts still
  open. Reword or pause the lines that sell the same part to others: the night and athlete units,
  Teammate and Coach for the road, "Put your name on the court." on /ace, and "Kept going by night
  sponsors" and "tournament sponsors" on /pickleball.
- If the deal has a category clause (for example, the only paddle brand we name), no other brand in
  that category can be named at any level for the term: Teammate, Coach, the night and athlete
  units, and the supporters wall. Check before thanking a new sponsor in that category.
- Put the logo everywhere the level promises it, and add the sponsor to the Givebutter sponsors
  campaign description if it lists sponsors by then.
