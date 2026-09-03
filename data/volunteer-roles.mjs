// The volunteer board and every role page are generated from this file.
// `scripts/build-volunteer.mjs` writes public/volunteer.html and
// public/volunteer/<slug>.html; `scripts/make-og.mjs` derives a share card per
// role from the same titles.
//
// HOUSE RULES FOR EVERY WORD BELOW. Each one is a claim a reader could act on.
//
//   1. Adapt To Life HAS made its first grants, all to one program: wheelchair
//      pickleball in Chicago, year round, court included. Nothing here may
//      imply more than that. No caseload, no waiting list, no track record
//      across programs or regions. What is true and is still the better story:
//      Alec paid these costs himself for years and built the org so it stops
//      depending on one person.
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
    ["Small, and saying so", "A recognized 501(c)(3) with a board and a published grant rubric. One program funded so far. The work you do now is what makes the next one possible."],
    ["A scope, not a shift", "Every role has a defined job and a person to work with. If we cannot say what done looks like, we will not ask for your time."],
    ["Async by default", "Almost none of this needs a meeting. Two hours on a Tuesday night is a real contribution."],
    ["You hear back either way", "A person reads every one. If there is no fit now, we say so."],
  ],
  // One short paragraph on a role page, not a two-paragraph essay.
  about:
    "Adapt To Life is a recognized 501(c)(3) built by adaptive athletes and coaches. The Hustle &amp; Heart Fund covers the equipment, training and travel that keep athletes on the sidelines, and Adaptive Sports Near Me is a free national directory. We are early: our founder paid these costs himself for years, and this exists so it never depends on one person again.",
  apply:
    "No interview and no resume screen. Your name and your email is the whole form, and the role comes with it.",
  legal:
    "Unpaid volunteer role, and no employment relationship. Volunteer time is not a tax-deductible gift, though out-of-pocket expenses sometimes are. Adapt To Life is a recognized 501(c)(3), EIN 41-3213344.",
};

export const LANES = [
  { key: "fund", name: "Fund the fund", head: "Money, and the people who move it.",
    blurb: "Making the Hustle &amp; Heart Fund bigger than one person's checkbook." },
  { key: "clean", name: "Keep it clean", head: "The unglamorous work that protects athletes.",
    blurb: "A nonprofit that loses its exemption stops funding anyone. This is where a professional volunteer is worth the most." },
  { key: "tell", name: "Tell it right", head: "Reach, so the next athlete finds us.",
    blurb: "An athlete cannot apply to a fund they have never heard of." },
  { key: "court", name: "On the court", head: "The part that looks like sport.",
    blurb: "Hands on, in person, usually on a weekend." },
  { key: "notitle", name: "No title required", head: "You do not need a profession to change this.",
    blurb: "Most people who want to help have a relationship, a room, or a reason to organize something." },
];

export const ROLES = [
// ---------------------------------------------------------------- fund ------
{
  slug: "grant-writer", lane: "fund", name: "Grant writer",
  card: "Find the foundations that fund adaptive sport, and write the applications.",
  time: "A few hours a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Foundation money is the one revenue line we have never touched, and nobody here has written a foundation grant. There is no pipeline to inherit and no house style to learn.",
  own: [
    "Find the funders: disability, youth sport, adaptive recreation, veterans, our sports.",
    "Keep one list, with deadlines and fit, so the next person can pick it up.",
    "Write the applications, and reuse ruthlessly. Most ask the same nine questions.",
  ],
  first: [
    "Read our published grant rubric and tell us where a funder would poke a hole in it.",
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
  payoff: "A foundation grant is the fastest path from hoping we can say yes to a chair arriving.",
},
{
  slug: "fundraising-lead", lane: "fund", name: "Fundraising lead",
  card: "Build the annual plan: which campaigns, which asks, in what order.",
  time: "A few hours a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Our campaigns have worked, including a popcorn drive that beat its goal several times over. What we do not have is a calendar, or the habit of going back to people who already gave.",
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
  payoff: "A plan is why the fund can promise an athlete a season instead of hoping for one.",
},
{
  slug: "sponsorship-and-partnership-lead", lane: "fund", name: "Sponsorship and partnership lead",
  card: "Bring businesses to the table and keep them there.",
  time: "A few hours a month", where: "Remote, with optional event days",
  withWhom: "Alec, our founder and executive director",
  why: "Our sponsorship levels are written, published and priced, and almost nobody is working them. This is the clearest gap between what we can offer today and what we are collecting.",
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
  payoff: "One mid-tier sponsor is a season of coaching for an athlete who would be watching.",
},
{
  slug: "corporate-matching-champion", lane: "fund", name: "Corporate matching champion",
  card: "Get Adapt To Life into your employer's matching program.",
  time: "One hour, once", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Plenty of employers double a charitable gift and most employees never ask. Every matched dollar is one we did not have to raise twice.",
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
  payoff: "A matched gift is the same athlete funded in half the time.",
},
{
  slug: "planned-and-major-giving-advisor", lane: "fund", name: "Planned and major giving advisor",
  card: "Donor advised funds, appreciated stock, bequests.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We publish the details an advisor asks for but have nobody who can hold the other end of that call. These are the largest gifts a small charity receives and the ones most easily lost to an unanswered question.",
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
  payoff: "One bequest keeps funding athletes long after all of us.",
},
];

// --------------------------------------------------------------- clean ------
ROLES.push(
{
  slug: "cpa-or-tax-preparer", lane: "clean", name: "CPA or tax preparer",
  card: "Our first Form 990, and keeping the exemption airtight.",
  time: "Seasonal", where: "Remote",
  withWhom: "Alec, our founder and executive director, alongside our treasurer",
  why: "Our exemption took effect in April 2026, so we owe the IRS a return and have never filed one. Missing three years running is how small nonprofits lose exemption automatically, and it happens constantly.",
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
  payoff: "Every athlete this fund will help depends on the exemption still existing.",
},
{
  slug: "bookkeeper", lane: "clean", name: "Bookkeeper",
  card: "Monthly reconciliation alongside our treasurer.",
  time: "An hour or two a month", where: "Remote",
  withWhom: "Our treasurer",
  why: "Money already arrives through more than one path, and a grant application or an audit asks the same question: show me the books. The right time to have a clean answer is before the question.",
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
  payoff: "Clean books are why a foundation says yes to an organization it has never met.",
},
{
  slug: "nonprofit-attorney", lane: "clean", name: "Nonprofit attorney",
  card: "Bylaws, a conflict of interest policy, and charitable registration as we grow.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director, and our board",
  why: "We need a written conflict of interest policy before our storefront launches, because the fund pays vendors for athletes' equipment and if we also sell equipment we become a vendor to our own fund. Separately, the fund has no geographic limit, so every state we raise in is a registration question.",
  own: [
    "A conflict of interest policy we can adopt, sized for an organization this small.",
    "A read of our bylaws against how we actually operate.",
    "Which states to worry about first for charitable solicitation.",
  ],
  first: [
    "Draft or adapt the conflict of interest policy. This is the one with a deadline.",
    "Tell us the two governance gaps that would embarrass us in front of a funder.",
  ],
  helps: ["You practise nonprofit or tax-exempt law, or you have sat on a board and seen these documents."],
  skip: "You do not need a disability law specialty, or a licence in any particular state for the policy work.",
  isNot: [
    "Being our general counsel or taking on liability you have not agreed to.",
    "Trademark work. Separate specialty, separate role.",
  ],
  payoff: "Governance is boring right until it is the reason an organization survives a hard question.",
},
{
  slug: "trademark-counsel", lane: "clean", name: "Trademark counsel",
  card: "Clear and file our marks before they go on physical product.",
  time: "A one time project", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "One of our marks is about to go on product through our storefront, which is when trademark exposure stops being theoretical. Clearance costs a fraction before a launch of what it costs after one.",
  own: [
    "A clearance search, in order of exposure, starting with the mark going on product.",
    "Telling us plainly if a name is a problem, while changing it is still cheap.",
    "Filing, if clearance comes back clean.",
  ],
  first: [
    "Search the mark going on product first. That is the one with a real deadline.",
    "Give us a go, a change it, or a proceed with risk, in one paragraph.",
  ],
  helps: ["You are a trademark attorney, or a paralegal who has run clearance searches."],
  skip: "You do not need nonprofit experience or any knowledge of adaptive sport.",
  isNot: ["Litigation or enforcement. We are trying to never need that."],
  payoff: "A name we cannot keep is a rebrand paid for with money that should have bought a chair.",
},
{
  slug: "insurance-and-risk", lane: "clean", name: "Insurance and risk",
  card: "Coverage for clinics, tournaments, volunteers, and the athletes we put on a court.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We have a nonprofit sports insurance application open now, and we would rather complete it with someone who reads these for a living than guess at the event and revenue questions. Adaptive sport carries real physical risk.",
  own: [
    "Helping us place the coverage we need, at a size that fits an organization this early.",
    "Reading our athlete release against the coverage so the paperwork and the policy agree.",
    "A pre-event checklist short enough that we will use it.",
  ],
  first: [
    "Review the application in front of us and tell us what we are answering wrong.",
    "Name the one gap most likely to hurt us, and what it costs to close.",
  ],
  helps: ["You are a broker or risk manager, ideally with nonprofit or sports and recreation experience."],
  skip: "You do not need a licence in every state we might eventually reach.",
  isNot: ["Selling us a policy. If there is a conflict, say so and we will place it elsewhere."],
  payoff: "Coverage is what lets us run the clinic instead of worrying about it.",
},
{
  slug: "grant-reviewer", lane: "clean", name: "Grant reviewer",
  card: "Score applications against our published rubric.",
  time: "A few hours per cycle", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We publish our rubric so the words an applicant reads are the words we score against, but no decision has a second set of eyes on it. Being straight with you: we are early, so the cycle you sit on will be one of our first.",
  own: [
    "Scoring against the rubric: need, use, cost reasonableness, mission fit.",
    "Writing down why in a sentence, so a decision can be explained later.",
    "Telling us when the rubric itself is wrong.",
  ],
  first: [
    "Read the rubric and our public how we decide language, and tell us where they disagree.",
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
  payoff: "A documented decision is what makes the second grant possible.",
},
);

// ---------------------------------------------------------------- tell ------
ROLES.push(
{
  slug: "social-media-manager", lane: "tell", name: "Social media manager",
  card: "Turn our work into posts people stop for.",
  time: "A few hours a week", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Adaptive sport is one of the few areas where the content is genuinely good and mostly unseen. We have real photography of real athletes and no consistent presence.",
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
  payoff: "A family who does not know adaptive sport exists cannot put their kid in it.",
},
{
  slug: "writer-or-editor", lane: "tell", name: "Writer or editor",
  card: "Athlete stories, the newsletter, and the annual impact report.",
  time: "A few hours a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "A physical therapist handed our founder a brochure for adaptive sports he did not know existed, and that brochure is why this organization exists. There are more stories like it here than we will ever have time to write down.",
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
  payoff: "One well-told story moves more than a page of statistics, because it makes an athlete a person.",
},
{
  slug: "photographer-or-videographer", lane: "tell", name: "Photographer or videographer",
  card: "Shoot our clinics and tournaments.",
  time: "A day at a time", where: "In person, at events",
  withWhom: "Alec, our founder and executive director",
  why: "Every photograph on this site is a real Adapt To Life athlete, and that rule is not moving, so the library only grows when somebody turns up with a camera. Adaptive sport photographs beautifully and is almost never photographed well.",
  own: [
    "Shooting clinics, practices and tournaments.",
    "Delivering usable files, and telling us honestly which ones are good.",
    "Getting the quiet frames, not only the action. Our best image is not the most athletic one.",
  ],
  first: [
    "Come to one event and shoot it. That is the whole onboarding.",
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
  payoff: "A photograph of a real athlete is the most persuasive thing we own.",
},
{
  slug: "graphic-designer", lane: "tell", name: "Graphic designer",
  card: "Sponsor decks, one pagers, event graphics, apparel.",
  time: "Project by project", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We have a real brand with real typography and we keep asking it to do jobs it was not cut for. Everything that lives off-screen needs someone who can work inside a system.",
  own: [
    "The pieces outside the website: decks, print, apparel, event signage.",
    "Working within the brand we have rather than proposing a new one.",
    "Telling us when we are asking for the wrong format.",
  ],
  first: [
    "Look at our mark and tell us what the brand is missing to work off-screen.",
    "Take the sponsor deck and make it good.",
  ],
  helps: [
    "You design for print as well as screen. Print is where we are weakest.",
    "You can work from a brand rather than around it.",
  ],
  skip: "You do not need illustration or web development.",
  isNot: ["A redesign of the website. Not on the table, and this is not a way in to it."],
  payoff: "A business decides whether to take us seriously in four seconds of looking at a deck.",
},
{
  slug: "press-and-media", lane: "tell", name: "Press and media",
  card: "Get athletes in front of reporters, podcasts and local news.",
  time: "As it comes up", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Our athletes compete at real events, including national championships, and those are stories a reporter would take. We have never pitched one.",
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
  payoff: "One local story reaches families who have never heard the words adaptive sport.",
},
{
  slug: "accessibility-reviewer", lane: "tell", name: "Accessibility reviewer",
  card: "Test this site with the tools our athletes actually use, then tell us what breaks.",
  time: "A one time project", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We are a disability organization and our website has never been tested by someone using assistive technology. Careful is not the same as tested, and if our grant application is hard to complete with a screen reader we have built the barrier we exist to remove.",
  own: [
    "Walking the site with the tools you use, especially the grant application.",
    "Telling us what breaks, in priority order, in whatever format is easiest for you.",
    "Re-checking after we fix it. A fix nobody verified is a guess.",
  ],
  first: [
    "Try to complete the grant application start to finish and tell us where you got stuck.",
    "Give us the list. We would rather have a blunt one.",
  ],
  helps: [
    "You use assistive technology daily. Lived experience beats a certification here.",
    "Or you audit accessibility professionally and know what actually matters.",
  ],
  skip: "You do not need web skills, or a formal report. A voice memo is fine.",
  isNot: ["Free QA on an endless backlog. This is a defined review and a re-check."],
  payoff: "An application an athlete cannot complete is a grant they never got, and we would never see it happen.",
},
);

// --------------------------------------------------------------- court ------
ROLES.push(
{
  slug: "adaptive-sports-coach", lane: "court", name: "Adaptive sports coach",
  card: "Run a clinic, coach a session, teach a sport.",
  time: "A season, or one clinic", where: "In person",
  withWhom: "Alec, our founder and executive director",
  why: "One of our board members came to coach tennis with no background in disability and helped build a wheelchair pickleball program from nothing. Good coaches adapt; the sport is learnable in an afternoon and coaching is not.",
  own: [
    "Coaching sessions or clinics, in whatever sport you know.",
    "Adapting your own drills, which you will be better at than you expect.",
    "Being the adult who treats an athlete like an athlete.",
  ],
  first: [
    "Come to a session and watch, or jump in.",
    "Tell us what you would run and we will build a clinic around it.",
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
  payoff: "A coach who sees an athlete instead of a diagnosis is why our founder is still in this sport.",
},
{
  slug: "event-crew", lane: "court", name: "Event crew",
  card: "Setup, registration, scorekeeping, teardown.",
  time: "A day at a time", where: "In person",
  withWhom: "Whoever is running the event, usually Alec",
  why: "An event either feels run or it feels chaotic, and the difference is people doing unglamorous things on time. This is the easiest yes on the board and the one where you see the result the same day.",
  own: [
    "Setup and teardown, the least fun and most necessary part.",
    "Registration, so an athlete's first ten minutes are calm.",
    "Scorekeeping, timing, water, whatever the day needs.",
  ],
  first: ["Turn up to one event."],
  helps: [
    "You can lift things, or you cannot and will say so, and we will put you somewhere better.",
    "You are cheerful early in the morning.",
  ],
  skip: "You do not need any sports knowledge, or to commit to coming back.",
  isNot: [
    "Coaching or officiating.",
    "Lifting or transferring athletes. Only people trained and asked should.",
  ],
  payoff: "An event that runs well is one an athlete's family comes back to.",
},
{
  slug: "equipment-technician", lane: "court", name: "Equipment technician",
  card: "Fit, repair and refurbish chairs and adaptive gear.",
  time: "As it comes up", where: "In person, or your own workshop",
  withWhom: "Alec, our founder and executive director",
  why: "This is the rarest skill on the board. Sport chairs are expensive and they break, and a properly refurbished used chair puts someone on a court for a fraction of a new one.",
  own: [
    "Repairs. Wheels, bearings, camber, straps, welds, tyres.",
    "Fitting, which decides whether an athlete can actually use the chair.",
    "Assessing donated gear honestly, including what is not safe to put anybody in.",
  ],
  first: [
    "Look at what we and our partner programs have sitting unused, and tell us what is salvageable.",
    "Fit one athlete properly. You will see immediately why this role is here.",
  ],
  helps: [
    "You work on wheelchairs, bikes, or anything mechanical and precise.",
    "You have fitted sport chairs, which almost nobody has.",
  ],
  skip: "You do not need a seating certification for basic repair, or your own shop.",
  isNot: [
    "Prescribing or modifying a daily-use medical wheelchair. That is a clinician's job.",
    "Certifying equipment as safe in any formal sense.",
  ],
  payoff: "A chair that fits is the difference between finishing a season and quitting in week three.",
},
{
  slug: "athlete-mentor", lane: "court", name: "Athlete mentor",
  card: "Be the person a newly injured athlete or their family calls first.",
  time: "An hour here and there", where: "Remote, or in person if you are close",
  withWhom: "Alec, our founder and executive director",
  why: "A newly injured athlete and their family are frightened and getting most of their information from the internet. What they need is somebody who has already been where they are.",
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
  skip: "You do not need peer-support training, or elite achievement. Someone who plays on a Tuesday night is often more useful.",
  isNot: [
    "Therapy, medical advice or crisis support. We make the boundary clear and give you somewhere to refer people.",
    "Being on call. You answer when you can.",
  ],
  payoff: "Somebody handed our founder a brochure. This is that, done on purpose.",
},
{
  slug: "program-scout", lane: "court", name: "Program scout",
  card: "Find and verify adaptive programs for the directory.",
  time: "An hour a month", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "A directory is only as good as whether the listing is true, and a wrong number or a program that folded is worse than nothing because a family only tries once. Verification does not scale by itself and it is the whole product.",
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
  payoff: "A family that finds a program near them does not need a grant at all.",
},
{
  slug: "clinical-referral-partner", lane: "court", name: "Clinical referral partner",
  card: "Hand someone a brochure the way one was handed to Alec.",
  time: "As it comes up", where: "In person, where you already work",
  withWhom: "Alec, our founder and executive director",
  why: "The most important handoff in this story already happened once: a physical therapist gave our founder a brochure. Rehab staff meet newly injured people at exactly the moment sport feels impossible, and most have nothing to hand over.",
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
  skip: "You do not need authority to refer on your employer's behalf. Telling someone a fund exists is not a referral.",
  isNot: [
    "Marketing to your patients. If this could conflict with your employer, tell us and we stop.",
    "Sharing any patient information with us, ever.",
  ],
  payoff: "One brochure, handed to one frightened family, is why this organization exists.",
},
);

// ------------------------------------------------------------- notitle ------
ROLES.push(
{
  slug: "make-an-introduction", lane: "notitle", name: "Make an introduction",
  card: "A company, a foundation, a venue, a coach, a reporter.",
  time: "One email", where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Almost everything difficult on this board gets easier with one introduction. A sponsor conversation that takes twenty cold emails takes one warm one.",
  own: ["Making the introduction. That is the role."],
  first: [
    "Think of one person: a business owner, someone at a foundation, a venue manager, a coach, a reporter.",
    "Send the email, or tell us who to write to and what to say.",
  ],
  helps: ["You know them well enough that your name means something to them."],
  skip: "You do not need anything else. No skill, no time, no follow-through.",
  isNot: [
    "Asking them for money for us. You open a door, we walk through it.",
    "An ongoing obligation. One introduction is a complete contribution.",
  ],
  payoff: "The shortest distance to a funded athlete is usually someone who already trusts you.",
},
{
  slug: "host-something", lane: "notitle", name: "Host something",
  card: "A tournament, a clinic, a popcorn drive, a birthday fundraiser.",
  time: "A few weeks of planning", where: "Wherever you are",
  withWhom: "Alec, our founder and executive director",
  why: "Our best fundraiser to date was a popcorn drive that beat its goal several times over and cost almost nothing to run. Anybody can run one, and you need our materials rather than our permission.",
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
    "Earmarking what you raise for one athlete. Money goes to the fund, and that is a fairness rule.",
  ],
  payoff: "A drive is how a fund gets money in a month when nothing else was going to arrive.",
},
{
  slug: "board-and-advisory", lane: "notitle", name: "Board and advisory",
  card: "The seats that steer this as it grows.",
  time: "A real commitment", where: "Remote, with some in person",
  withWhom: "Alec, our founder and executive director, and the current board",
  why: "Our board is athletes and coaches, people who lived the problem, which is the right foundation. What it does not yet include is finance, law, fundraising and governance, and we would rather add those deliberately than in a hurry because a funder asked.",
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
  payoff: "The board is who guarantees this outlives any one of us, including its founder.",
},
);
