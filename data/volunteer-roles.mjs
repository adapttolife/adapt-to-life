// The volunteer board and every role page are generated from this file.
// `scripts/build-volunteer.mjs` writes public/volunteer.html and
// public/volunteer/<slug>.html; `scripts/make-og.mjs` derives a share card per
// role from the same titles.
//
// HOUSE RULES FOR EVERY WORD BELOW. Each one is a claim a reader could act on.
//
//   1. Adapt To Life HAS made its first grants. Nothing here may imply a
//      caseload, a waiting list, or a track record across regions. Do NOT
//      state a program count anywhere: it moves, and every count this site has
//      published has later needed correcting. Say what the fund does, not how
//      many. What is true and is still the better story: Alec paid these costs
//      himself for years and built the org so it stops depending on one person.
//   2. No dollar figures. Each number lands once, in the place that proves it.
//   3. Volunteer, unpaid, no employment relationship. "What you would own", not
//      responsibilities. "Who you would work with", not reports-to. "Helps if",
//      not requirements.
//   4. Only publicly stated people. /about names Alec, Karen Atkinson, Tom
//      Daily, Mike Carrico, Pete Petersen. Naming a person per role would be
//      stronger and is Alec's call: one line per role here.
//   5. No coverage claims. The sports insurance application is still open.
//   6. No em-dashes, sentence case, never a number that caps the mission.
//
// AND THE ONE THAT SHAPES THE LENGTH (Alec, 2026-09-02: "say all the same
// things with less bloat and cut the fat"). A posting is scanned, not read, so:
//
//   - `card` is ONE sentence. The board is for scanning; the page is for the
//     argument. Anything that belongs to the argument goes in `why`.
//   - `why` is TWO sentences. It is the only place a role gets to editorialize,
//     and it earns that by being specific to Adapt To Life.
//   - Three bullets in `own`, three steps in `first`, two in `helps`, one line
//     in `skip`, one or two in `isNot`. If a fourth bullet is needed, one of the
//     others was not pulling its weight.
//   - A bullet does not explain itself. "Write the applications" beats "Write
//     the applications, because that is how the money arrives." Trailing
//     justification on every bullet is what makes careful writing read padded.
//   - NEVER narrate the page's own design to the reader. The first draft opened
//     its first-month list with "Nobody starts with the whole job. This is what
//     we would actually ask you to do first, in order." The heading already said
//     that. Cut every sentence whose job is to introduce the next one.
//   - "How we work" and "what you get" live on the BOARD, once, and never on a
//     role page. They were repeated 27 times, four headed blocks each.

// Shared blocks, written once so the culture cannot drift between pages.
export const SHARED = {
  // The board carries the terms of joining. Role pages do not repeat them.
  terms: [
    ["Built around participation", "A recognized 501(c)(3) expanding access to adaptive sports so athletes can find their place."],
    ["A scope, not a shift", "Every role has a defined job and a person to work with. If we cannot say what done looks like, we will not ask for your time."],
    ["Flexible contributions", "Two hours on a Tuesday night is a real contribution. For events and coaching, we agree on a time together."],
    ["You hear back either way", "A person reads every one. If there is no fit now, we say so."],
  ],
  // One short paragraph on a role page, not a two-paragraph essay.
  about:
    "Adapt To Life expands access to adaptive sports so athletes can find their place. We bring people and opportunities together and build the support around participation.",
  apply:
    "Start with your name and email. We'll talk through the work, timing, and any screening or credentials before you begin.",
  legal:
    "Unpaid volunteer role, and no employment relationship. Volunteer time is not a tax-deductible gift, though out-of-pocket expenses sometimes are. Adapt To Life is a recognized 501(c)(3), EIN 41-3213344.",
};

export const LANES = [
  { key: "fund", name: "Fundraising", head: "Money, and the people who move it.",
    blurb: "Making the Hustle & Heart Fund bigger than one person's checkbook." },
  { key: "clean", name: "Operations", head: "The unglamorous work that protects athletes.",
    blurb: "The books. The insurance. The advice that keeps the work on solid ground." },
  { key: "tell", name: "Stories", head: "Reach, so the next athlete finds us.",
    blurb: "Help people discover what is possible in adaptive sports and how they can take part." },
  { key: "court", name: "Participation", head: "The part that looks like sport.",
    blurb: "Coaching a session, fixing a chair, making a first introduction." },
  { key: "notitle", name: "Connections", head: "You do not need a profession to change this.",
    blurb: "Most people who want to help have a relationship, a room, or a reason to organize something." },
];

export const ROLES = [
// ---------------------------------------------------------------- fund ------
{
  slug: "grant-writer", lane: "fund", name: "Grant writer",
  card: "Find the foundations that fund adaptive sport, and write the applications.",
  time: "A few hours a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Help turn athlete needs into clear funding requests. Find suitable grants and work with us on the application.",
  own: [
    "Find the funders: disability, youth sport, adaptive recreation, veterans, our sports.",
    "Keep one list, with deadlines and fit, so the next person can pick it up.",
    "Write the applications, and reuse ruthlessly. Most ask the same nine questions.",
  ],
  first: [
    "Read our grant review guidance and tell us where a funder would poke a hole in it.",
    "Bring back five funders worth applying to. Five real ones beat forty maybes.",
    "Take the nearest deadline and draft it with us.",
  ],
  helps: [
    "You have written a successful grant at any size. A county arts grant teaches the same muscles.",
    "You can write plainly, and being told no does not rattle you.",
  ],
  skip: "You do not need adaptive sport experience, a certification, or your own funder contacts.",
  isNot: [
    "A fundraising quota. We will never put a dollar target on a volunteer.",
    "Cold-calling donors. That is a different role in this lane.",
  ],
  payoff: "Stronger applications help the fund reach more athletes.",
},
{
  slug: "fundraising-lead", lane: "fund", name: "Fundraising lead",
  card: "Build the annual plan: which campaigns, which asks, in what order.",
  time: "A few hours a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Help people understand what the fund supports and choose a way to contribute. Bring a fundraising idea we can carry through together.",
  own: [
    "One annual plan on one page: what we raise for, when we ask, what feeds each campaign.",
    "The thank-you and follow-up rhythm, so a first gift has a second behind it.",
    "Deciding what we do not do. A small org can only run so many pushes a year.",
  ],
  first: [
    "Look at what we have run and tell us which to repeat and which to retire.",
    "Sketch the next twelve months at the level of a single page.",
    "Pick the next ask and help us land it.",
  ],
  helps: [
    "You have run development at a nonprofit, or campaigns anywhere and can translate.",
    "You will tell a founder his favourite idea is not the highest-return one.",
  ],
  skip: "You do not need a rolodex or any background in disability sport.",
  isNot: ["Making every ask yourself. You build the plan and we run it with you."],
  payoff: "Steady fundraising builds support beyond a single event.",
},
{
  slug: "sponsorship-and-partnership-lead", lane: "fund", name: "Sponsorship and partnership lead",
  card: "Bring businesses to the table and keep them there.",
  time: "A few hours a month", where: "Remote, with optional event days",
  withWhom: "Alec, our founder and executive director",
  why: "Help businesses find a useful role in adaptive sports. Match their interests with support we can deliver and recognition we can responsibly offer.",
  own: [
    "The list of businesses worth approaching, and why each one fits.",
    "The conversation, from first contact to a signed commitment.",
    "In-kind too. Equipment, printing and venue time are often easier yeses than cash.",
  ],
  first: [
    "Read the sponsorship page and tell us what a business owner would object to.",
    "Bring twenty businesses worth asking, ranked.",
    "Have the first three conversations, with us on the call if you would rather not go alone.",
  ],
  helps: [
    "You have sold something to anyone at any price. B2B translates almost perfectly.",
    "You know local business owners, or you enjoy meeting them.",
  ],
  skip: "You do not need nonprofit experience or a background in sport.",
  isNot: [
    "Working a list we hand you. You would shape who we approach.",
    "A commission role. Nobody here is paid, including us.",
  ],
  payoff: "A well matched partnership can support participation over time.",
},
{
  slug: "corporate-matching-champion", lane: "fund", name: "Corporate matching champion",
  card: "Get Adapt To Life into your employer's matching program.",
  time: "One hour, once", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "An employer match can add to a gift already made. Help colleagues understand their program and complete its requirements.",
  own: [
    "Getting us registered as eligible in your company's giving platform.",
    "Telling your colleagues it is there, once.",
    "Sending us the paperwork so we complete our side.",
  ],
  first: [
    "Ask benefits or HR whether your employer matches. Most people do not know.",
    "Submit us. You need our legal name and EIN, both on our ways to give page.",
    "Tell us it is done so we can watch for it.",
  ],
  helps: ["You work somewhere large enough that a program probably already exists."],
  skip: "You do not need any authority at your company, or a large gift of your own.",
  isNot: ["Fundraising from your coworkers. You are opening a door, not passing a hat."],
  payoff: "A completed match adds to the support available.",
},
{
  slug: "planned-and-major-giving-advisor", lane: "fund", name: "Planned and major giving advisor",
  card: "Donor advised funds, appreciated stock, bequests.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Help us prepare for larger and planned gifts, with clear processes, appropriate advice, and commitments the organization can honor.",
  own: [
    "Being the person we can put on the phone with a donor's advisor, attorney or broker.",
    "Sanity-checking our published bequest language.",
    "Telling us when a gift structure is a bad idea for us.",
  ],
  first: [
    "Read our ways to give page as a donor's advisor would, and mark what is missing.",
    "Tell us which gift types we should be ready to accept, and which to decline for now.",
  ],
  helps: [
    "You are a financial advisor, estate attorney, CPA or planned giving officer.",
    "You have walked a client through a DAF grant or a stock transfer.",
  ],
  skip: "You do not need board experience or any availability on a schedule.",
  isNot: [
    "Soliciting your own clients. That is a conflict and we are not asking for it.",
    "Managing investments. We have no portfolio.",
  ],
  payoff: "Careful gift planning supports the work for the long term.",
},
];

// --------------------------------------------------------------- clean ------
ROLES.push(
{
  slug: "cpa-or-tax-preparer", lane: "clean", name: "CPA or tax preparer",
  card: "Our first Form 990, and keeping the exemption airtight.",
  time: "Seasonal", where: "Remote",
  withWhom: "Alec, our founder and executive director, alongside our treasurer",
  why: "Help the organization meet its filing and reporting responsibilities. Work with the treasurer on the records, returns, and deadlines that apply.",
  own: [
    "Confirming which 990 we owe and when, which depends on a fiscal year end we should choose deliberately.",
    "Preparing or reviewing the return.",
    "Telling us what to record all year so the return is not a scramble.",
  ],
  first: [
    "Tell us which return we owe, and by when.",
    "List what we should capture monthly to make it easy.",
    "Flag anything we already do that would look wrong to the IRS.",
  ],
  helps: [
    "You have prepared or reviewed a 990, 990-EZ or 990-N.",
    "You have worked with a nonprofit under a million in revenue.",
  ],
  skip: "You do not need an active practice, or any interest in sport.",
  isNot: [
    "Signing anything you are not comfortable signing.",
    "Bookkeeping. That is the next role over.",
  ],
  payoff: "Reliable reporting helps keep the organization accountable.",
},
{
  slug: "bookkeeper", lane: "clean", name: "Bookkeeper",
  card: "Monthly reconciliation alongside our treasurer.",
  time: "An hour or two a month", where: "Remote",
  withWhom: "Our treasurer",
  why: "Keep the books clear as gifts arrive and grants go out. Reconcile the records and flag questions while the details are still easy to resolve.",
  own: [
    "Monthly reconciliation, so the books match the bank and the donation platform.",
    "Keeping restricted and unrestricted money separate. A gift raised for one campaign cannot quietly fund another.",
    "Flagging anything odd early, while it is small.",
  ],
  first: [
    "Look at how we record income and tell us what is missing.",
    "Reconcile one month end to end.",
    "Agree a monthly checklist with our treasurer.",
  ],
  helps: [
    "You have kept books for a small organization. Fund accounting is a bonus, not a bar.",
    "You are happy in whatever we use, or will tell us to switch.",
  ],
  skip: "You do not need a CPA licence or more than a couple of hours a month.",
  isNot: ["Approving spending or signing cheques. Those stay with our officers."],
  payoff: "Clear records explain what each gift supported.",
},
{
  slug: "nonprofit-attorney", lane: "clean", name: "Nonprofit attorney",
  card: "Bylaws, a conflict of interest policy, and charitable registration as we grow.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director, and our board",
  why: "Help align governance with our work. Review charitable registration, bylaws, and conflicts of interest, including the relationship between the fund and shop.",
  own: [
    "A conflict of interest policy we can adopt, sized for an organization this small.",
    "A read of our bylaws against how we actually operate.",
    "Which states to worry about first for charitable solicitation.",
  ],
  first: [
    "Review the current conflict of interest policy and recommend any changes needed.",
    "Identify the highest priority governance questions and practical next steps.",
  ],
  helps: ["You are appropriately licensed counsel with nonprofit or tax-exempt experience."],
  skip: "We agree the legal scope and any jurisdiction requirements before work begins.",
  isNot: [
    "Being our general counsel or taking on liability you have not agreed to.",
    "Trademark work. Separate specialty, separate role.",
  ],
  payoff: "Good governance protects the mission and the people it serves.",
},
{
  slug: "trademark-counsel", lane: "clean", name: "Trademark counsel",
  card: "Review and protect the marks we use on websites and products.",
  time: "A one time project", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Review the names and marks used across our websites and products. Assess current use before recommending searches or filings.",
  own: [
    "A clearance search, in order of exposure, starting with the mark going on product.",
    "Telling us plainly if a name is a problem, while changing it is still cheap.",
    "Filing, if clearance comes back clean.",
  ],
  first: [
    "Confirm the marks, current uses, and priorities before clearance work.",
    "Give us a go, a change it, or a proceed with risk, in one paragraph.",
  ],
  helps: ["You are trademark counsel, or a paralegal working under appropriate supervision."],
  skip: "You do not need nonprofit experience or any knowledge of adaptive sport.",
  isNot: ["Litigation or enforcement. We are trying to never need that."],
  payoff: "Clear rights let the organization build on names it can keep.",
},
{
  slug: "insurance-and-risk", lane: "clean", name: "Insurance and risk",
  card: "Coverage for clinics, tournaments, volunteers, and the athletes we put on a court.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Match insurance and risk planning to the activities we actually undertake. Review current scope, not coverage for hypothetical programs.",
  own: [
    "Helping us place the coverage we need, at a size that fits an organization this early.",
    "Reviewing activity documentation against the policy and its exclusions.",
    "A pre-event checklist short enough that we will use it.",
  ],
  first: [
    "Review current activities, coverage, and any open application with us.",
    "Name the one gap most likely to hurt us, and what it costs to close.",
  ],
  helps: ["You are a broker or risk manager, ideally with nonprofit or sports and recreation experience."],
  skip: "We agree the scope and applicable licensing requirements before work begins.",
  isNot: ["Selling us a policy. If there is a conflict, say so and we will place it elsewhere."],
  payoff: "Appropriate coverage supports responsible participation.",
},
{
  slug: "grant-reviewer", lane: "clean", name: "Grant reviewer",
  card: "Review funding requests against agreed criteria.",
  time: "A few hours per cycle", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Help assess funding requests fairly and consistently. Review the criteria with us, document your reasoning, and disclose conflicts before taking part.",
  own: [
    "Scoring against the rubric: need, use, cost reasonableness, mission fit.",
    "Writing down why in a sentence, so a decision can be explained later.",
    "Telling us when the rubric itself is wrong.",
  ],
  first: [
    "Review the current criteria and the public application guidance with us.",
    "Score a small batch alongside us and compare where we diverged.",
  ],
  helps: [
    "You have reviewed grants, scholarships or applications in any field.",
    "You can hold a line kindly. Most applications will be genuine and we cannot fund them all.",
  ],
  skip: "You do not need a finance or clinical background.",
  isNot: [
    "Influence over who gets funded on your own behalf. Reviewers declare conflicts and step out.",
    "Deciding alone. Scores inform a decision, they are not the decision.",
  ],
  payoff: "A clear review gives each request a fair hearing.",
},
);

// ---------------------------------------------------------------- tell ------
ROLES.push(
{
  slug: "social-media-manager", lane: "tell", name: "Social media manager",
  card: "Turn our work into posts people stop for.",
  time: "A few hours a week", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Help people see the athletes and work behind Adapt To Life. Build a realistic publishing rhythm from real stories and approved images.",
  own: [
    "A posting rhythm we can keep, which is smaller and steadier than we manage now.",
    "Platform-appropriate execution. Copying one post into three platforms is how a good story dies.",
    "Reading what worked, so we stop guessing.",
  ],
  first: [
    "Audit what we have posted and tell us what to stop doing.",
    "Take one athlete story and produce the full set of posts for it.",
    "Agree a cadence you can hold for three months.",
  ],
  helps: [
    "You have run social for a brand, a team or an organization.",
    "You have opinions about which platforms are worth our time.",
  ],
  skip: "You do not need a large personal following, or video editing.",
  isNot: ["Being the voice of the organization alone. Copy that speaks for us is agreed with us."],
  payoff: "Useful stories help people find a way to take part.",
},
{
  slug: "writer-or-editor", lane: "tell", name: "Writer or editor",
  card: "Athlete stories, the newsletter, and the annual impact report.",
  time: "A few hours a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Help athletes and coaches tell their stories in their own words. Interview, organize, and clarify without making an ordinary day of sport a story of pity or heroism.",
  own: [
    "Interviewing athletes, coaches and families, and making it worth reading.",
    "Editing what the rest of us write, which is often the higher-value half.",
    "Holding the voice steady. We have written rules about how we talk.",
  ],
  first: [
    "Read the site and tell us the two sentences not pulling their weight.",
    "Write one athlete story end to end.",
  ],
  helps: [
    "You write for a living or you used to. Journalism, marketing, technical writing all transfer.",
    "You are good at interviewing people who think their own story is not interesting.",
  ],
  skip: "You do not need nonprofit writing experience or any knowledge of the sports.",
  isNot: ["Ghostwriting fundraising appeals under someone else's name."],
  payoff: "Good writing helps readers understand the person and the sport.",
},
{
  slug: "photographer-or-videographer", lane: "tell", name: "Photographer or videographer",
  card: "Shoot our clinics and tournaments.",
  time: "A day at a time", where: "In person, at events",
  withWhom: "Alec, our founder and executive director",
  why: "Capture the play, practice, and people behind adaptive sports. Agree access, consent, and usage with us before photographing an event.",
  own: [
    "Shooting clinics, practices and tournaments.",
    "Delivering usable files, and telling us honestly which ones are good.",
    "Getting the quiet frames, not only the action. Our best image is not the most athletic one.",
  ],
  first: [
    "Agree an event, access arrangements, and consent requirements before shooting.",
    "Tell us what our library is missing.",
  ],
  helps: [
    "You own a camera you know well and can handle indoor court lighting.",
    "You are comfortable around people with disabilities, or willing to be shown how.",
  ],
  skip: "You do not need sports photography experience or your own lighting rig.",
  isNot: [
    "Signing away your work forever. We agree usage up front and we credit you.",
    "Shooting anyone who has not agreed. Everyone signs a release and anyone can decline.",
  ],
  payoff: "Real photographs show what participation looks like.",
},
{
  slug: "graphic-designer", lane: "tell", name: "Graphic designer",
  card: "Sponsor decks, one pagers, event graphics, apparel.",
  time: "Project by project", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Bring the existing visual identity to print, events, and partner materials. Make information clear and useful without rebuilding the brand.",
  own: [
    "The pieces outside the website: decks, print, apparel, event signage.",
    "Working within the brand we have rather than proposing a new one.",
    "Telling us when we are asking for the wrong format.",
  ],
  first: [
    "Look at our mark and tell us what the brand is missing to work off-screen.",
    "Improve one agreed partner or event material using the existing brand.",
  ],
  helps: [
    "You design for print as well as screen. Print is where we are weakest.",
    "You can work from a brand rather than around it.",
  ],
  skip: "You do not need illustration or web development.",
  isNot: ["A redesign of the website. Not on the table, and this is not a way in to it."],
  payoff: "Clear materials help people understand the work and how to join it.",
},
{
  slug: "press-and-media", lane: "tell", name: "Press and media",
  card: "Get athletes in front of reporters, podcasts and local news.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Find reporters suited to an athlete or program story. Work with the people involved so coverage reflects what they want to share.",
  own: [
    "Finding the individual reporters who cover this, which is narrower than a press list.",
    "Pitching a real story rather than sending a release nobody asked for.",
    "Preparing an athlete so the interview is a good experience for them.",
  ],
  first: [
    "Name five outlets or reporters worth pitching, and why.",
    "Pitch one with us and see what comes back.",
  ],
  helps: [
    "You have worked in PR or a newsroom, or placed a story before.",
    "You know reporters, though a good pitch beats a warm contact.",
  ],
  skip: "You do not need a national network or crisis communications experience.",
  isNot: [
    "Speaking for the organization on the record.",
    "Putting an athlete in front of a camera who does not want to be there.",
  ],
  payoff: "Relevant coverage can introduce people to adaptive sports.",
},
{
  slug: "accessibility-reviewer", lane: "tell", name: "Accessibility reviewer",
  card: "Test this site with the tools our athletes actually use, then tell us what breaks.",
  time: "A one time project", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Test the site with assistive technology, especially finding information and completing an application. Help identify barriers and recheck the fixes.",
  own: [
    "Walking the site with the tools you use, especially the grant application.",
    "Telling us what breaks, in priority order, in whatever format is easiest for you.",
    "Re-checking after we fix it. A fix nobody verified is a guess.",
  ],
  first: [
    "Try to complete the grant application start to finish and tell us where you got stuck.",
    "Share the issues in whatever format works best for you.",
  ],
  helps: [
    "You use assistive technology daily. Lived experience beats a certification here.",
    "Or you audit accessibility professionally and know what actually matters.",
  ],
  skip: "You do not need web skills, or a formal report. A voice memo is fine.",
  isNot: ["Free QA on an endless backlog. This is a defined review and a re-check."],
  payoff: "People should be able to use the tools built for them.",
},
);

// --------------------------------------------------------------- court ------
ROLES.push(
{
  slug: "adaptive-sports-coach", lane: "court", name: "Adaptive sports coach",
  card: "Run a clinic, coach a session, teach a sport.",
  time: "A season, or one clinic", where: "In person",
  withWhom: "Alec, our founder and executive director",
  why: "Help athletes learn, practice, and enjoy their sport. Bring your coaching experience and work with us on the session, equipment, and participant needs.",
  own: [
    "Coaching sessions or clinics, in whatever sport you know.",
    "Adapting your own drills, which you will be better at than you expect.",
    "Treating each participant as an athlete with their own goals.",
  ],
  first: [
    "Arrange a session to observe after any required checks are complete.",
    "Discuss a suitable session, participant needs, and required qualifications with us.",
  ],
  helps: [
    "You have coached anything at any level. Youth rec counts.",
    "You are patient with equipment. Chairs and straps take time and the session absorbs that.",
  ],
  skip: "You do not need adaptive sport experience. Two of our board members started exactly here.",
  isNot: [
    "Physical therapy or medical care. You are coaching sport.",
    "A whole season unless you want one.",
  ],
  payoff: "Good coaching gives athletes room to learn and grow.",
},
{
  slug: "event-crew", lane: "court", name: "Event crew",
  card: "Setup, registration, scorekeeping, teardown.",
  time: "A day at a time", where: "In person",
  withWhom: "Whoever is running the event, usually Alec",
  why: "Help the day run smoothly, from registration to packing up. Agree the shift and tasks with us so everyone knows where they are needed.",
  own: [
    "Setup and teardown, the least fun and most necessary part.",
    "Registration, so an athlete's first ten minutes are calm.",
    "Scorekeeping, timing, water, whatever the day needs.",
  ],
  first: ["Confirm a shift, your tasks, and any access needs before the event."],
  helps: [
    "Tell us what tasks work for you. Not every role involves lifting or moving equipment.",
    "You are cheerful early in the morning.",
  ],
  skip: "You do not need any sports knowledge, or to commit to coming back.",
  isNot: [
    "Coaching or officiating.",
    "Lifting or transferring athletes. Only people trained and asked should.",
  ],
  payoff: "A well run event lets athletes focus on playing.",
},
{
  slug: "equipment-technician", lane: "court", name: "Equipment technician",
  card: "Fit, repair and refurbish chairs and adaptive gear.",
  time: "As it comes up", where: "In person, or your own workshop",
  withWhom: "Alec, our founder and executive director",
  why: "Help assess and maintain the gear athletes use. Work within your training and experience, with clear limits around fitting, repairs, and safety.",
  own: [
    "Repairs. Wheels, bearings, camber, straps, welds, tyres.",
    "Fitting, which decides whether an athlete can actually use the chair.",
    "Assessing donated gear honestly, including what is not safe to put anybody in.",
  ],
  first: [
    "Look at what we and our partner programs have sitting unused, and tell us what is salvageable.",
    "Agree a suitable assessment or repair within your qualifications.",
  ],
  helps: [
    "You work on wheelchairs, bikes, or anything mechanical and precise.",
    "You have fitted sport chairs, which almost nobody has.",
  ],
  skip: "Scope, supervision, and any required qualifications are agreed before work begins.",
  isNot: [
    "Prescribing or modifying a daily-use medical wheelchair. That is a clinician's job.",
    "Certifying equipment as safe in any formal sense.",
  ],
  payoff: "Well maintained equipment helps athletes keep playing.",
},
{
  slug: "athlete-mentor", lane: "court", name: "Athlete mentor",
  card: "Be the person a newly injured athlete or their family calls first.",
  time: "An hour here and there", where: "Remote, or in person if you are close",
  withWhom: "Alec, our founder and executive director",
  why: "Share your experience with someone exploring adaptive sports. Listen to what they want and help them find a next step, without assuming their experience is the same as yours.",
  own: [
    "Talking to athletes and families early in this, by phone or message.",
    "Being honest about the hard parts, which is what makes the encouraging parts believable.",
    "Pointing them at a real program, and at us if money is the obstacle.",
  ],
  first: [
    "Tell us your own story briefly, so we know who to introduce you to.",
    "Take one conversation.",
  ],
  helps: [
    "You are an adaptive athlete, or a parent or partner of one. Lived experience is the qualification.",
    "You are comfortable talking to someone on a bad day.",
  ],
  skip: "You do not need elite sporting achievements. We agree preparation and boundaries before introductions.",
  isNot: [
    "Therapy, medical advice or crisis support. We make the boundary clear and give you somewhere to refer people.",
    "Being on call. You answer when you can.",
  ],
  payoff: "Another athlete can make getting started less unfamiliar.",
},
{
  slug: "program-scout", lane: "court", name: "Program scout",
  card: "Find and verify adaptive programs for the directory.",
  time: "An hour a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Check listings with providers, suggest missing programs, and flag details that have changed. Help people find current, useful information.",
  own: [
    "Finding adaptive programs, in any region, in any sport.",
    "Verifying them, which means confirming a human answers and the program still runs.",
    "Flagging listings that have gone stale.",
  ],
  first: [
    "Pick a region you know and find every adaptive program in it.",
    "Verify five, and tell us how many were already wrong somewhere online.",
  ],
  helps: [
    "You are patient on the phone and stubborn about a real answer.",
    "You know a local adaptive sports scene.",
  ],
  skip: "You do not need any technical skill, or a whole state. One county done well is a real contribution.",
  isNot: [
    "Data entry against a quota.",
    "Asking programs for money. This is not a fundraising role and must never read as one.",
  ],
  payoff: "A current listing makes the next step easier to take.",
},
{
  slug: "clinical-referral-partner", lane: "court", name: "Clinical referral partner",
  card: "Hand someone a brochure the way one was handed to Alec.",
  time: "As it comes up", where: "In person, where you already work",
  withWhom: "Alec, our founder and executive director",
  why: "Help patients and families learn about adaptive sports when it is relevant to them. Share public resources within your professional and workplace guidelines.",
  own: [
    "Telling patients and families that adaptive sport exists, and that cost has somewhere to go.",
    "Telling us what you need in order to do that. If our materials are not usable in a clinic, they are not usable.",
    "Being a check on how we talk about disability and injury.",
  ],
  first: [
    "Tell us what you would need to hand someone. A card, a page, a number.",
    "Use it with one family.",
  ],
  helps: ["You work in rehabilitation, recreational therapy, physical or occupational therapy, or a clinic."],
  skip: "Follow your professional obligations and workplace rules when sharing resources.",
  isNot: [
    "Marketing to your patients. If this could conflict with your employer, tell us and we stop.",
    "Sharing any patient information with us, ever.",
  ],
  payoff: "A useful resource can open a conversation about sport.",
},
);

// ------------------------------------------------------------- notitle ------
ROLES.push(
{
  slug: "make-an-introduction", lane: "notitle", name: "Make an introduction",
  card: "A company, a foundation, a venue, a coach, a reporter.",
  time: "One email", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Know someone who could contribute? An introduction to a business, foundation, program, or venue can start a useful conversation.",
  own: ["Making the introduction. That is the role."],
  first: [
    "Think of one person: a business owner, someone at a foundation, a venue manager, a coach, a reporter.",
    "Send the email, or tell us who to write to and what to say.",
  ],
  helps: ["You know them well enough that your name means something to them."],
  skip: "You do not need anything else. No ongoing role is required.",
  isNot: [
    "Asking them for money for us. You open a door, we walk through it.",
    "An ongoing obligation. One introduction is a complete contribution.",
  ],
  payoff: "One introduction can be a complete contribution.",
},
{
  slug: "host-something", lane: "notitle", name: "Host something",
  card: "A tournament, a clinic, a popcorn drive, a birthday fundraiser.",
  time: "A few weeks of planning", where: "Wherever you are",
  withWhom: "Alec, our founder and executive director",
  why: "Bring an event or fundraiser idea. Agree its purpose, responsibilities, and use of the Adapt To Life name before making plans or commitments.",
  own: [
    "The event itself. The date, the venue, the people you invite.",
    "Telling us early enough that we can help rather than react.",
  ],
  first: [
    "Tell us what you are thinking, even loosely.",
    "We send you what exists already, because you should not build from scratch.",
  ],
  helps: [
    "You have organized anything before. A league night, a school event, a work party.",
    "You have a venue, a team, or a crowd already.",
  ],
  skip: "You do not need fundraising experience or a big idea. Small and finished beats ambitious and abandoned.",
  isNot: [
    "A target you are responsible for hitting.",
    "Promising a beneficiary, grant, or use of funds before we have agreed the terms.",
  ],
  payoff: "A well planned event brings people together around the work.",
},
{
  slug: "board-and-advisory", lane: "notitle", name: "Board and advisory",
  card: "The seats that steer this as it grows.",
  time: "A real commitment", where: "Remote, with some in person",
  withWhom: "Alec, our founder and executive director, and the current board",
  why: "Help guide the organization as it grows. Bring judgment and relevant experience, and understand the responsibilities before taking a seat.",
  own: [
    "Governance. The decisions that are genuinely the board's, including money and risk.",
    "Holding us to our own promises, starting with one hundred percent reaching the athlete.",
    "Opening doors, which every board member does anyway.",
  ],
  first: [
    "Talk to us properly, more than once.",
    "Do one thing with us first. Almost everyone in a seat here started that way.",
  ],
  helps: [
    "You bring what the current board does not: finance, law, fundraising, governance, or scale.",
    "You know the difference between governing and managing.",
  ],
  skip: "You do not need capacity to write a large cheque. We will not sell a seat.",
  isNot: [
    "An honorary title. If you want your name on a list without the work, this is not it.",
    "A quick process. This one should be slow.",
  ],
  payoff: "Thoughtful oversight helps the organization serve its community well.",
},
);
