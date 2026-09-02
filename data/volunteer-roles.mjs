// The volunteer board and every role page are generated from this file.
// One source: `scripts/build-volunteer.mjs` writes public/volunteer.html and
// public/volunteer/<slug>.html, and `scripts/make-og.mjs` derives a share card
// per role from the same titles.
//
// HONESTY RULES THAT APPLY TO EVERY WORD BELOW. They are not style notes; each
// one is a claim a reader could act on.
//
//   1. Adapt To Life has NOT made its first grant. No role description may imply
//      a running caseload, a track record, or money already moving. What is true
//      and is the better story: Alec paid these costs personally for years and
//      built the org so it stops depending on one person. Founder history is
//      never organizational impact.
//   2. No dollar figures. `docs/CONTENT.md` puts each number in the one place
//      that proves it; the fund's live position belongs in the receipt email,
//      read from src/fund.js. A figure copied into 27 pages goes stale 27 times.
//   3. "You would be the first person doing this" is the honest line for most of
//      these, and it is compelling rather than embarrassing. Never invent a team
//      around a role ("join our development team") that does not exist.
//   4. Volunteer, unpaid, and no employment relationship. So: "what you would
//      own", never "responsibilities"; "who you would work with", never "reports
//      to"; "helps if", never "requirements" or "must". A volunteer job
//      description that reads like an employment contract creates ambiguity a
//      501(c)(3) does not want, and every page carries the plain-language line.
//   5. Only publicly stated people. `/about` names Alec, Karen Atkinson, Tom
//      Daily, Mike Carrico and Pete Petersen. Officer appointments recorded in
//      ClickUp are NOT on the website, so no role page names them. Naming a
//      specific person per role would be stronger and is Alec's call, because it
//      commits their time. It is a one-line edit per role here.
//   6. No coverage claims. The nonprofit sports insurance application is still
//      open, so nothing here says a volunteer is insured.
//   7. House voice: no em-dashes, sentence case, "barrier" not "wall", and never
//      a number that caps the mission.

// Shared blocks. Written once, rendered on every role page, so the culture the
// pages describe cannot drift between them.
export const SHARED = {
  about: {
    h: "Who you would be joining",
    p: [
      "Adapt To Life is a recognized 501(c)(3) built by adaptive athletes and coaches, the people who lived the problem. We do two things today and there will be more: the Hustle &amp; Heart Fund covers the equipment, training and travel costs that keep athletes on the sidelines, and Adaptive Sports Near Me is a free national directory so a family can find a program at all.",
      "Here is the part most organizations leave out of a posting. We are early. The fund has not made its first grant yet. For years our founder covered these costs out of his own pocket, one athlete at a time, and Adapt To Life exists so that it never depends on one person's checkbook again. You would not be joining a machine. You would be helping build one.",
    ],
  },
  how: {
    h: "How we work",
    items: [
      ["Async by default", "Almost none of this needs a meeting. We write things down so a volunteer with two hours on a Tuesday night can pick up where someone else left off."],
      ["A scope, not a shift", "You get a defined job and a person to work with. If we cannot tell you what done looks like, we have no business asking for your time."],
      ["No busywork", "We will not invent tasks to keep you occupied. If there is nothing useful this month, we will say so."],
      ["You hear back either way", "A person reads every application. If there is no fit right now you will be told that, rather than left wondering."],
    ],
  },
  get: {
    h: "What you get out of it",
    items: [
      "A real outcome you can point at, not a line on a sign-up sheet.",
      "A reference from the executive director of a registered 501(c)(3), and we will be specific about what you actually did.",
      "Named credit on our supporters wall and in our reporting, if you want it. Some people would rather stay quiet, and that is fine too.",
      "First look at the board and advisory seats as we grow. Several of the people who steer this started by helping with one thing.",
    ],
  },
  apply: {
    h: "How to apply",
    p: "There is no interview, no resume screen and no minimum commitment. Use the button below and the form arrives with this role already selected. Tell us in a sentence or two what you have done before, or what you would want to do. A person reads it and comes back to you with what the work would actually look like, or with an honest no.",
  },
  legal:
    "This is an unpaid volunteer role and creates no employment relationship. Volunteer time is not tax-deductible as a charitable gift, though unreimbursed out-of-pocket expenses sometimes are. Ask your own tax advisor. Adapt To Life is a recognized 501(c)(3) nonprofit, EIN 41-3213344.",
};

// The lanes, in board order.
export const LANES = [
  { key: "fund",   name: "Fund the fund",     head: "Money, and the people who move it.",
    blurb: "The Hustle &amp; Heart Fund is young. Everything in this lane is about making it bigger than one person's checkbook." },
  { key: "clean",  name: "Keep it clean",     head: "The unglamorous work that protects athletes.",
    blurb: "A nonprofit that loses its exemption stops funding anyone. This lane is insurance against that, and it is where professional volunteers are worth the most." },
  { key: "tell",   name: "Tell it right",     head: "Reach, so the next athlete finds us.",
    blurb: "An athlete cannot apply to a fund they have never heard of. Everything here is about being findable." },
  { key: "court",  name: "On the court",      head: "The part that looks like sport.",
    blurb: "Hands on, in person, usually on a weekend." },
  { key: "notitle",name: "No title required", head: "You do not need a profession to change this.",
    blurb: "Most people who want to help do not have a job title we listed. They have a relationship, a room, or a reason to organize something." },
];

export const ROLES = [
// ---------------------------------------------------------------- fund ------
{
  slug: "grant-writer", lane: "fund", name: "Grant writer",
  card: "Find the foundations that fund adaptive sport, and write the applications. Nobody at Adapt To Life has done this at scale yet.",
  time: "A few hours a month",
  commit: "Roughly four to six hours a month, and it comes in bursts around deadlines rather than evenly.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Foundation money is the difference between funding a few athletes and funding a lot of them, and it is the one revenue line we have never touched. Nobody here has written a foundation grant. That means there is no pipeline to inherit and no house style to learn, which is either daunting or the best part of the job depending on who you are.",
  own: [
    "Find the funders. Foundations that fund disability, youth sport, adaptive recreation, veterans, or our specific sports.",
    "Keep one simple list of them, with deadlines, amounts and fit, so the work is visible to whoever picks it up next.",
    "Write the applications, and reuse ruthlessly. Most of these ask the same nine questions.",
    "Own the reporting a funder asks for afterwards, because a grant kept is cheaper than a grant won.",
  ],
  first: [
    "Read the fund pages and the grant review rubric, which we publish, and tell us where a funder would poke a hole in it.",
    "Bring back five funders worth applying to and a reason for each. Five is plenty. We would rather have five real ones than forty maybes.",
    "Pick the one with the nearest deadline and draft it with us.",
  ],
  helps: [
    "You have written a successful grant before, at any size. A five thousand dollar county arts grant teaches the same muscles as a big one.",
    "You can write plainly. Every foundation reader is tired.",
    "You are comfortable being told no repeatedly, because that is the job.",
  ],
  notNeeded: [
    "A background in adaptive sport. We can teach you the sport in an afternoon; nobody can teach you to write in an afternoon.",
    "A grant certification.",
    "Your own funder contacts, though they are welcome.",
  ],
  isNot: [
    "A fundraising quota. We will never put a dollar target on a volunteer.",
    "Cold-calling donors. That is a different role in this lane.",
  ],
  payoff: "A foundation grant is the fastest path from “we hope we can say yes” to a chair actually arriving.",
},
{
  slug: "fundraising-lead", lane: "fund", name: "Fundraising lead",
  card: "Build the annual plan. Which campaigns, which asks, in what order, and who we go back to.",
  time: "A few hours a month",
  commit: "Roughly four hours a month, more in the run-up to a campaign.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We have run real campaigns and they worked, including a popcorn drive that beat its goal several times over. What we do not have is a plan that says what happens in March, or a habit of going back to the people who already gave. Right now fundraising happens when someone has an idea. You would make it a calendar.",
  own: [
    "One annual plan on one page. What we raise for, when we ask, and what feeds each campaign.",
    "The donor thank-you and follow-up rhythm, so a first gift has a second one behind it.",
    "Deciding what we do NOT do, which is most of the value. A small org can only run so many pushes a year.",
  ],
  first: [
    "Look at what we have already run, the campaigns and the drives, and tell us honestly which one to repeat and which to retire.",
    "Sketch the next twelve months at the level of a single page.",
    "Pick the next ask and help us land it.",
  ],
  helps: [
    "You have run development at a nonprofit, or you have run marketing campaigns anywhere and can translate.",
    "You are willing to tell a founder that his favourite idea is not the highest-return one.",
  ],
  notNeeded: [
    "A rolodex.",
    "Experience in disability sport.",
  ],
  isNot: [
    "Doing every ask yourself. You are building the plan, and we execute it with you.",
    "Owning our social media. That is its own role.",
  ],
  payoff: "A plan is why the fund can promise an athlete a season instead of hoping for one.",
},
{
  slug: "sponsorship-and-partnership-lead", lane: "fund", name: "Sponsorship and partnership lead",
  card: "Bring businesses to the table and keep them there. We have levels published and almost nobody working them.",
  time: "A few hours a month",
  commit: "Roughly four hours a month, mostly conversations on your own schedule.",
  where: "Remote, with optional event days",
  withWhom: "Alec, our founder and executive director",
  why: "Our sponsorship levels are written, published and priced, from a first rung smaller than most people guess up to a founding partnership. What is missing is a person having the conversations. This is the single clearest gap between what the organization can offer today and what it is actually collecting.",
  own: [
    "The list of businesses worth approaching, and why each one fits.",
    "The conversation itself, from first contact to a signed commitment.",
    "Making sure a sponsor gets what they were promised, because the second year is worth more than the first.",
    "In-kind partnerships too. Equipment, printing, venue time and services all count and are often easier yeses than cash.",
  ],
  first: [
    "Read the sponsorship page and tell us what a business owner would object to. Then help us fix it.",
    "Bring twenty businesses worth asking and rank them.",
    "Have the first three conversations, with us on the call if you would rather not go alone.",
  ],
  helps: [
    "You have sold something, to anyone, at any price. B2B sales translates almost perfectly.",
    "You know local business owners, or you enjoy meeting them.",
  ],
  notNeeded: [
    "Nonprofit experience.",
    "A background in sport.",
  ],
  isNot: [
    "Cold-calling from a list we hand you. You would shape who we approach.",
    "A commission role. Nobody here is paid, including us.",
  ],
  payoff: "One mid-tier sponsor is a season of coaching for an athlete who would otherwise be watching.",
},
{
  slug: "corporate-matching-champion", lane: "fund", name: "Corporate matching champion",
  card: "Get Adapt To Life into your employer's matching program. The single highest return an hour of volunteering has.",
  time: "One hour, once",
  commit: "About an hour, one time. Occasionally a second hour at renewal.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Plenty of employers double a charitable gift and most employees never ask. Every dollar that goes through a match is a dollar we did not have to raise twice. This is the smallest ask on this entire board and it is close to the highest return per hour of anything on it.",
  own: [
    "Getting Adapt To Life registered as an eligible charity in your company's giving platform.",
    "Telling your colleagues it is there, once, in whatever channel your company actually reads.",
    "Sending us the paperwork so we complete our side. We will turn it around quickly.",
  ],
  first: [
    "Find out whether your employer matches. Most people do not know. Benefits or HR will.",
    "Submit us. You will need our legal name and EIN, and both are on our ways to give page.",
    "Tell us it is done so we can watch for the match coming through.",
  ],
  helps: [
    "You work somewhere with more than a few hundred employees, where a program probably already exists.",
  ],
  notNeeded: [
    "Any authority at your company. This is usually a form.",
    "A large gift of your own. The match applies to whatever you give.",
  ],
  isNot: [
    "Fundraising from your coworkers. You are opening a door, not passing a hat.",
  ],
  payoff: "A matched gift is the same athlete funded in half the time.",
},
{
  slug: "planned-and-major-giving-advisor", lane: "fund", name: "Planned and major giving advisor",
  card: "Donor advised funds, appreciated stock, bequests. The gifts that need someone who speaks the language.",
  time: "As it comes up",
  commit: "As it comes up. Some months nothing, then an hour when a donor's advisor calls.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Our ways to give page already lists donor advised funds, appreciated stock and bequests, and publishes the details an advisor asks for. What we do not have is someone who can hold the other end of that conversation when a donor's attorney or broker calls with a question. These are the largest gifts a small charity ever receives and the ones most likely to be lost to an unanswered question.",
  own: [
    "Being the person we can put on the phone with a donor's financial advisor, attorney or broker.",
    "Sanity-checking our published bequest language and the details we give advisors.",
    "Telling us when a gift structure is a bad idea for us, which is as useful as telling us when it is a good one.",
  ],
  first: [
    "Read our ways to give page as if you were a donor's advisor, and mark every place you would need more.",
    "Tell us the two or three gift types we should actually be ready to accept, and which to decline for now.",
  ],
  helps: [
    "You are a financial advisor, estate attorney, CPA or planned giving officer.",
    "You have walked a client through a DAF grant or a stock transfer before.",
  ],
  notNeeded: [
    "Nonprofit board experience.",
    "Availability on a schedule. This role is genuinely on-call.",
  ],
  isNot: [
    "Soliciting your own clients. That is a conflict and we are not asking for it.",
    "Managing our investments. We have no portfolio to manage.",
  ],
  payoff: "One bequest can outlast every one of us and keep funding athletes after we are gone.",
},
];

// --------------------------------------------------------------- clean ------
ROLES.push(
{
  slug: "cpa-or-tax-preparer", lane: "clean", name: "CPA or tax preparer",
  card: "Our first Form 990, our fiscal year call, and keeping the exemption airtight. Missing three returns is how small charities quietly disappear.",
  time: "Seasonal",
  commit: "Concentrated around the return. A handful of hours once a year, plus a question or two in between.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director, alongside our treasurer",
  why: "Our exemption became effective in April 2026, so Adapt To Life owes the IRS an annual return and we have never filed one. Missing three years in a row is how small nonprofits lose their exemption automatically, and it happens constantly to organizations that are otherwise doing everything right. This is the cheapest catastrophe on the whole board to avoid, and it needs one person who has done it before.",
  own: [
    "Confirming which Form 990 we owe and when, which depends on a fiscal year end we should settle deliberately rather than by accident.",
    "Preparing or reviewing the return.",
    "Telling us what we need to be recording all year so the return is not a scramble.",
    "A recommendation on how we treat donation principal and any interest it earns, which is an open question we would rather answer before it matters.",
  ],
  first: [
    "Tell us which return we owe, and by when.",
    "List what we should be capturing monthly to make that return easy.",
    "Flag anything we are already doing that would look wrong to the IRS.",
  ],
  helps: [
    "You have prepared or reviewed a 990, 990-EZ or 990-N before.",
    "You have worked with a nonprofit under a million in revenue, which is a different animal from a corporate return.",
  ],
  notNeeded: [
    "An active practice. A retired preparer is perfect for this.",
    "Any interest in sport whatsoever.",
  ],
  isNot: [
    "Being our accountant of record or signing anything you are not comfortable signing.",
    "Bookkeeping. That is the next role over and they pair well but are not the same job.",
  ],
  payoff: "Every athlete this fund will ever help depends on the exemption still existing. This is the role that keeps it.",
},
{
  slug: "bookkeeper", lane: "clean", name: "Bookkeeper",
  card: "Monthly reconciliation alongside our treasurer, so the books are ready before anyone asks to see them.",
  time: "An hour or two a month",
  commit: "An hour or two a month, on your own schedule.",
  where: "Remote",
  withWhom: "Our treasurer",
  why: "Money comes in through more than one path already, and it will be more. A grant application, a foundation, and eventually an audit all ask the same question: show me the books. The right time to have a clean answer is before the question, and the wrong time is the week a funder asks.",
  own: [
    "Monthly reconciliation, so the books match the bank and the donation platform.",
    "Keeping restricted and unrestricted money clearly separate, which matters more than it sounds: a gift raised for one campaign cannot quietly fund another.",
    "Flagging anything that looks odd, early, while it is still small.",
  ],
  first: [
    "Look at how we currently record income and tell us what is missing.",
    "Reconcile one month end to end so we can see the shape of it.",
    "Agree a simple monthly checklist with our treasurer.",
  ],
  helps: [
    "You have kept books for a small organization. Fund accounting experience is a bonus, not a bar.",
    "You are comfortable in whatever we are using, or willing to tell us to switch.",
  ],
  notNeeded: [
    "A CPA licence.",
    "Full-time availability. This is a couple of hours a month.",
  ],
  isNot: [
    "Approving spending or signing cheques. Those stay with our officers.",
    "Filing the return. That is the CPA role.",
  ],
  payoff: "Clean books are why a foundation says yes to an organization it has never met.",
},
{
  slug: "nonprofit-attorney", lane: "clean", name: "Nonprofit attorney",
  card: "Bylaws, a conflict of interest policy, and charitable registration in each state as we raise in more of them.",
  time: "As it comes up",
  commit: "Project by project. A few hours on a document, then quiet.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director, and our board",
  why: "Two specific things are open right now. We need a written conflict of interest policy before our storefront launches, because the Form 990 asks whether we have one and because the storefront creates the exact situation such a policy exists to handle: the fund pays vendors for athletes' equipment, and if we also sell equipment then we are a potential vendor to our own fund. Second, we are registered to solicit in Illinois, and the fund has no geographic limit, so every state we raise in is a registration question we should answer on purpose.",
  own: [
    "A conflict of interest policy we can actually adopt, sized for an organization this small.",
    "A read of our bylaws and governance documents against how we are actually operating.",
    "Guidance on multi-state charitable solicitation registration as we grow, including which states to worry about first.",
  ],
  first: [
    "Draft or adapt the conflict of interest policy. This is the one with a deadline attached to it.",
    "Tell us the two or three governance gaps that would embarrass us in front of a funder.",
  ],
  helps: [
    "You practise nonprofit, tax-exempt or corporate law, or you have sat on a nonprofit board and seen these documents.",
  ],
  notNeeded: [
    "A specialty in disability law.",
    "A licence in any particular state, for the policy work.",
  ],
  isNot: [
    "Being our general counsel or taking on liability you have not agreed to.",
    "Trademark work. That is a separate role because it is a separate specialty.",
  ],
  payoff: "Governance is boring right up to the day it is the reason an organization survives a hard question.",
},
{
  slug: "trademark-counsel", lane: "clean", name: "Trademark counsel",
  card: "Clear and file our marks before they go on physical product. Cheapest to fix right now.",
  time: "A one time project",
  commit: "A defined project. A clearance search and a filing, then renewals years later.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We have marks in use and one of them is about to go on physical product through our storefront, which is the moment trademark exposure stops being theoretical. Clearance is dramatically cheaper before a launch than after one, and this is the single most time-sensitive legal item we have.",
  own: [
    "A clearance search on our marks, in rough order of exposure, starting with the one going on product.",
    "Telling us plainly if a name is a problem, while it is still cheap to change.",
    "Filing, if clearance comes back clean.",
  ],
  first: [
    "Search the mark that is going on product first. That is the one with a real deadline.",
    "Give us a go, change it, or proceed with risk, in one paragraph.",
  ],
  helps: [
    "You are a trademark attorney or a paralegal who has run clearance searches.",
  ],
  notNeeded: [
    "Nonprofit experience.",
    "Any knowledge of adaptive sport.",
  ],
  isNot: [
    "Litigation or enforcement. We are trying to avoid ever needing that.",
  ],
  payoff: "A name we cannot keep is a rebrand paid for with money that should have bought a racing chair.",
},
{
  slug: "insurance-and-risk", lane: "clean", name: "Insurance and risk",
  card: "Coverage for clinics, tournaments, volunteers, and the athletes we put on a court.",
  time: "As it comes up",
  commit: "Concentrated at renewal and before events. Otherwise quiet.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We have a nonprofit sports insurance application open right now and we would rather complete it with someone who reads these for a living than guess at the event and revenue questions on it. Adaptive sport carries real physical risk, we ask athletes to sign a release, and an organization that puts people on a court needs to know exactly what it is and is not covered for.",
  own: [
    "Helping us complete and place the coverage we need, at a size that fits an organization this early.",
    "Reading our athlete release against the coverage, so the paperwork and the policy agree with each other.",
    "Telling us what to check before an event, in a list short enough that we will actually use it.",
  ],
  first: [
    "Review the application already in front of us and tell us what we are answering wrong.",
    "Tell us the one gap most likely to hurt us, and what it costs to close.",
  ],
  helps: [
    "You are a broker or risk manager, ideally with nonprofit or sports and recreation experience.",
  ],
  notNeeded: [
    "A licence in every state we might eventually operate in.",
  ],
  isNot: [
    "Selling us a policy. If there is a conflict, tell us and we will find someone else to place it.",
  ],
  payoff: "Coverage is what lets us say yes to running the clinic instead of worrying about it.",
},
{
  slug: "grant-reviewer", lane: "clean", name: "Grant reviewer",
  card: "Score applications against our published rubric so decisions are fair, consistent, and documented.",
  time: "A few hours per cycle",
  commit: "A few hours per review cycle, and the cycles are not frequent yet.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We publish our review rubric on purpose: the words an applicant reads and the sheet we score against are the same words. What we do not have is more than one set of eyes on a decision. An athlete asking for equipment money deserves a decision that was not made by one person in a hurry, and being able to show a funder how we decide is worth as much as the fairness itself. Being straight with you: we have not made our first grant, so the first cycle you sit on may well be the first one there has ever been.",
  own: [
    "Reading applications and scoring them against the rubric: need, use, cost reasonableness, mission fit.",
    "Writing down why, in a sentence, so a decision can be explained later.",
    "Telling us when the rubric itself is wrong, which you will notice faster than we will.",
  ],
  first: [
    "Read the rubric and the public how we decide language, and tell us where they disagree with each other.",
    "Score a small batch alongside us and compare notes on where we diverged.",
  ],
  helps: [
    "You have reviewed grants, scholarships or applications before, in any field.",
    "You can hold a line kindly. Most applications will be genuine and we will not be able to fund all of them.",
  ],
  notNeeded: [
    "A finance or clinical background.",
    "Adaptive sports knowledge, though it helps for judging whether a cost is reasonable.",
  ],
  isNot: [
    "A path to influence over who gets funded on your own behalf. Reviewers declare conflicts and step out.",
    "Deciding alone. Scores inform a decision, they are not the decision.",
  ],
  payoff: "A documented decision is what makes the second grant possible, because a funder can see how the first one was made.",
},
);

// ---------------------------------------------------------------- tell ------
ROLES.push(
{
  slug: "social-media-manager", lane: "tell", name: "Social media manager",
  card: "Turn our work into posts people stop for, on the platforms where the adaptive community actually is.",
  time: "A few hours a week",
  commit: "A few hours a week, and it works best in one sitting rather than scattered.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director, alongside the people already working on our communications",
  why: "Adaptive sport is one of the few areas where the content is genuinely good and mostly unseen. We have real photography of real athletes and almost no consistent presence. The gap is not material, it is somebody turning the material into posts on a rhythm.",
  own: [
    "A posting rhythm we can actually keep, which is probably smaller than you think and more consistent than we manage now.",
    "Platform-appropriate execution. The same story is a different post on Instagram, LinkedIn and Facebook, and copying one into the others is how a good story dies.",
    "Reading what worked and telling us, so we stop guessing.",
  ],
  first: [
    "Audit what we have posted and tell us what to stop doing.",
    "Take one piece of our work, an athlete story or a campaign, and produce the full set of posts for it.",
    "Agree a cadence you can hold for three months.",
  ],
  helps: [
    "You have run social for a brand, a team or an organization and can show it.",
    "You have opinions about which platforms are worth our time and which are not.",
  ],
  notNeeded: [
    "A big personal following.",
    "Video editing, though it is welcome.",
  ],
  isNot: [
    "Being the voice of the organization on your own. Copy that speaks for Adapt To Life is agreed with us.",
    "Community moderation, which is a separate job we will be honest about when it exists.",
  ],
  payoff: "A family who does not know adaptive sport exists cannot put their kid in it. Reach is how that changes.",
},
{
  slug: "writer-or-editor", lane: "tell", name: "Writer or editor",
  card: "Athlete stories, the newsletter, and eventually the annual impact report.",
  time: "A few hours a month",
  commit: "A few hours a month, project shaped.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "The stories here are extraordinary and mostly untold. Our founder was handed a brochure for adaptive sports he did not know existed a few months after his injury, and that brochure is the reason this organization exists. There are more stories like that in this community than we will ever have time to write down. There is also an annual impact report coming as we grow, and it will be better if a writer shapes it rather than a founder at midnight.",
  own: [
    "Interviewing athletes, coaches and families, and turning it into something worth reading.",
    "Editing what the rest of us write, which is often the higher-value half.",
    "Holding the voice steady. We have written rules about how this organization talks and they are worth keeping.",
  ],
  first: [
    "Read the site and tell us the two sentences that are not pulling their weight.",
    "Write one athlete story end to end so we can see your hands on it.",
  ],
  helps: [
    "You write for a living or you used to. Journalism, marketing, technical writing, all of it transfers.",
    "You are good at interviewing people who do not think their own story is interesting.",
  ],
  notNeeded: [
    "Nonprofit writing experience.",
    "Any knowledge of the sports.",
  ],
  isNot: [
    "Ghostwriting fundraising appeals under someone else's name.",
    "Working to a daily deadline. Nothing here is a newsroom.",
  ],
  payoff: "One well-told story moves more money than a page of statistics, and it does something the statistics cannot: it makes an athlete a person.",
},
{
  slug: "photographer-or-videographer", lane: "tell", name: "Photographer or videographer",
  card: "Shoot our clinics and tournaments. Real athletes, ours. Every image on this site came from someone who showed up.",
  time: "A day at a time",
  commit: "Event by event. A morning or a day, then a few hours to deliver files.",
  where: "In person, at events",
  withWhom: "Alec, our founder and executive director",
  why: "Every photograph on this website is a real Adapt To Life athlete, and that is a rule we do not intend to break. It also means our visual library only grows when somebody with a camera turns up. Adaptive sport photographs beautifully and is almost never photographed well, and the difference between a snapshot and a real frame is the difference between a page people scroll past and one they stop on.",
  own: [
    "Shooting at clinics, practices and tournaments.",
    "Delivering usable files, and being honest with us about which ones are actually good.",
    "Getting the wide shots and the quiet ones, not only the action. The best image on our site is not the most athletic one.",
  ],
  first: [
    "Come to one event and shoot it. That is genuinely the whole onboarding.",
    "Tell us what we are missing in our library. We know it leans toward certain sports.",
  ],
  helps: [
    "You own a camera you know well and can handle indoor court lighting, which is unforgiving.",
    "You are comfortable around people with disabilities, or willing to be shown how to be.",
  ],
  notNeeded: [
    "Sports photography experience specifically.",
    "Your own lighting rig.",
  ],
  isNot: [
    "Signing away your work forever. We agree usage up front and we credit you.",
    "Shooting athletes who have not agreed to it. Everyone signs a release and anyone can decline.",
  ],
  payoff: "A photograph of a real athlete is the most persuasive thing this organization owns.",
},
{
  slug: "graphic-designer", lane: "tell", name: "Graphic designer",
  card: "Sponsor decks, one pagers, event graphics, apparel.",
  time: "Project by project",
  commit: "Project by project, a few hours each.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We have a real brand with real typography and a mark we like, and we keep asking it to do jobs it was not cut for. A sponsor deck, an event flyer, a shirt and a printed one-pager all need someone who can work inside a system rather than start a new one each time.",
  own: [
    "The pieces that exist outside the website: decks, print, apparel, event signage.",
    "Working within the brand we have rather than proposing a new one, at least at first.",
    "Telling us when something we are asking for is the wrong format for the job.",
  ],
  first: [
    "Look at our site and our mark, and tell us what the brand is missing to work off-screen.",
    "Take one real piece we need, most likely the sponsor deck, and make it good.",
  ],
  helps: [
    "You design for print as well as screen. Print is where we are weakest.",
    "You can work from a brand rather than around it.",
  ],
  notNeeded: [
    "Illustration.",
    "Web development.",
  ],
  isNot: [
    "A redesign of the website. That is not on the table and this role is not a way in to it.",
  ],
  payoff: "A business decides whether to take us seriously in about four seconds of looking at a deck.",
},
{
  slug: "press-and-media", lane: "tell", name: "Press and media",
  card: "Get athletes in front of reporters, podcasts, and local news.",
  time: "As it comes up",
  commit: "As it comes up, in bursts around a story or an event.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Local news and adaptive sport are a natural fit and almost nobody makes the introduction. Our athletes compete at real events, including national championships, and those are stories a reporter would take if someone put them in front of them. We have never pitched one.",
  own: [
    "Finding the outlets and the individual reporters who cover this, which is more specific than a press list.",
    "Pitching a real story rather than sending a release nobody asked for.",
    "Preparing an athlete for an interview so it is a good experience for them, which matters more than the coverage.",
  ],
  first: [
    "Name five outlets or reporters worth pitching and why.",
    "Pitch one, with us, and see what comes back.",
  ],
  helps: [
    "You have worked in PR or in a newsroom, or you have placed a story before.",
    "You have relationships with reporters, though a good pitch beats a warm contact.",
  ],
  notNeeded: [
    "A national media network.",
    "Crisis communications experience.",
  ],
  isNot: [
    "Speaking for the organization on the record. That stays with us.",
    "Pushing an athlete in front of a camera who does not want to be there.",
  ],
  payoff: "One local story reaches families who have never heard the words adaptive sport, and some of them have a kid waiting.",
},
{
  slug: "spanish-translator", lane: "tell", name: "Spanish translator",
  card: "So the fund and the directory are not English only.",
  time: "Project by project",
  commit: "Project by project. The core pages are a finite job, then occasional updates.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "A fund and a directory that only exist in English are only available to families who read English, and that is a barrier we put there ourselves. It is also one of the few barriers on this list that can be removed completely rather than reduced.",
  own: [
    "Translating the pages that matter most: what the fund is, who can apply, and how.",
    "Translating the grant application itself, which is the one that actually decides who can ask.",
    "Telling us where a literal translation would be worse than a rewritten one.",
  ],
  first: [
    "Read our fund and application pages and tell us in what order to translate them.",
    "Translate one, so we can see the shape of the work.",
  ],
  helps: [
    "You are a native or fully fluent Spanish speaker and a careful writer in both languages.",
    "You have translated something with legal or medical weight before, because an application form has both.",
  ],
  notNeeded: [
    "A translation certification.",
    "Technical or web skills. Give us the words and we will handle the pages.",
  ],
  isNot: [
    "Interpreting at events, which is a separate skill. Tell us if you can do that too.",
  ],
  payoff: "A family that can read the application is a family that can apply.",
},
{
  slug: "accessibility-reviewer", lane: "tell", name: "Accessibility reviewer",
  card: "Test this site and its forms with the screen readers, switches, and magnifiers our athletes actually use, then tell us what breaks.",
  time: "A one time project",
  commit: "A defined review, a few hours, then a re-check after we fix things.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "We are a disability organization and our website has never been tested by someone using assistive technology. We have been careful, and careful is not the same as tested. If our grant application is hard to complete with a screen reader then we have built the exact barrier we exist to remove, and we would not know.",
  own: [
    "Walking the site with the tools you actually use, especially the grant application and the volunteer form.",
    "Telling us what breaks, in priority order, in whatever format is easiest for you.",
    "Re-checking after we fix it, because a fix nobody verified is a guess.",
  ],
  first: [
    "Try to complete the grant application from start to finish and tell us where you got stuck.",
    "Give us the list. We would rather have a blunt one.",
  ],
  helps: [
    "You use assistive technology daily. Lived experience is worth more here than a certification.",
    "Or you audit accessibility professionally and know WCAG well enough to say what actually matters.",
  ],
  notNeeded: [
    "Web development skills. Finding it is the hard part; fixing it is ours.",
    "A formal report. A voice memo would be fine.",
  ],
  isNot: [
    "Free QA on an endless backlog. This is a defined review and a re-check.",
  ],
  payoff: "An application an athlete cannot complete is a grant they never got, and we would never have seen it happen.",
},
);

// --------------------------------------------------------------- court ------
ROLES.push(
{
  slug: "adaptive-sports-coach", lane: "court", name: "Adaptive sports coach",
  card: "Run a clinic, coach a session, teach a sport. No adaptive experience required if you can coach.",
  time: "A season, or a single clinic",
  commit: "As little as one clinic. A season if you want one.",
  where: "In person",
  withWhom: "Alec, our founder and executive director, who coaches at the program that raised him",
  why: "One of our board members came to coach tennis with no background in disability at all and helped build a wheelchair pickleball program from nothing. Another coached wheelchair basketball for decades and taught athletes to advocate and lead as much as to play. That is the pattern: good coaches adapt. The sport is learnable in an afternoon and coaching is not.",
  own: [
    "Coaching sessions or clinics, in whatever sport you know.",
    "Adapting your own drills, which you will be better at than you expect.",
    "Being the adult who treats an athlete like an athlete, which is most of the job.",
  ],
  first: [
    "Come to a session and watch, or jump in. Either is fine.",
    "Tell us what you would run and we will build a clinic around it.",
  ],
  helps: [
    "You have coached anything at any level. Youth rec counts.",
    "You are patient with equipment. Chairs, straps and prosthetics take time and the session has to absorb that.",
  ],
  notNeeded: [
    "Adaptive sport experience. Genuinely. Two of our board members started exactly here.",
    "A coaching certification, though we will help you get one if you want it.",
  ],
  isNot: [
    "Physical therapy or medical care. You are coaching sport, not treating anyone.",
    "A commitment to a whole season unless you want one.",
  ],
  payoff: "A coach who sees an athlete instead of a diagnosis is the reason our founder is still in this sport thirty years later.",
},
{
  slug: "event-crew", lane: "court", name: "Event crew",
  card: "Setup, registration, scorekeeping, teardown. The reason an event feels organized.",
  time: "A day at a time",
  commit: "One event. A morning, or a full day if you are willing.",
  where: "In person",
  withWhom: "Whoever is running the event, usually Alec",
  why: "An event either feels run or it feels chaotic, and the difference is almost entirely people doing unglamorous things on time. This is the easiest yes on the board and the one where you will see the result the same day.",
  own: [
    "Setup and teardown, which is the least fun and most necessary part.",
    "Registration and check-in, so an athlete's first ten minutes are calm.",
    "Scorekeeping, timing, water, whatever the day needs.",
  ],
  first: [
    "Turn up to one event. That is it.",
  ],
  helps: [
    "You can lift things, or you cannot and will tell us so we put you somewhere better.",
    "You are cheerful early in the morning.",
  ],
  notNeeded: [
    "Any sports knowledge.",
    "A commitment to come back, though most people do.",
  ],
  isNot: [
    "Coaching or officiating.",
    "Lifting or transferring athletes. Only people trained and asked to do that should.",
  ],
  payoff: "An event that runs well is one an athlete's family will come back to.",
},
{
  slug: "equipment-technician", lane: "court", name: "Equipment technician",
  card: "Fit, repair, and refurbish chairs and adaptive gear. Rare, and worth more than most people realize.",
  time: "As it comes up",
  commit: "As it comes up. An afternoon at a clinic, or repairs on your own time.",
  where: "In person, or your own workshop",
  withWhom: "Alec, our founder and executive director",
  why: "This is the rarest skill on this board. Sport chairs are expensive, they break, and a broken chair means an athlete does not play that week. A used chair that has been properly refurbished and fitted can put someone on a court for a fraction of what a new one costs. There are very few people who can do this and almost nobody asks them to volunteer.",
  own: [
    "Repairs. Wheels, bearings, camber, straps, welds, tyres.",
    "Fitting, which is the part that decides whether an athlete can actually use the chair.",
    "Assessing donated and used equipment honestly, including telling us when something is not safe to put anybody in.",
  ],
  first: [
    "Look at what equipment we and our partner programs have sitting unused, and tell us what is salvageable.",
    "Fit one athlete properly. You will see immediately why this role is on the list.",
  ],
  helps: [
    "You work on wheelchairs, bikes, or anything mechanical and precise.",
    "You have fitted sport chairs before, which almost nobody has.",
  ],
  notNeeded: [
    "A clinical or seating certification for basic repair work.",
    "Your own shop, though it helps.",
  ],
  isNot: [
    "Prescribing or modifying a daily-use medical wheelchair, which is a clinician's job.",
    "Certifying equipment as safe in any formal sense.",
  ],
  payoff: "A chair that fits is the difference between finishing a season and quitting in week three.",
},
{
  slug: "athlete-mentor", lane: "court", name: "Athlete mentor",
  card: "Be the person a newly injured athlete or their family calls first. Best done by someone who has been there.",
  time: "An hour here and there",
  commit: "An hour here and there, and it is genuinely unpredictable.",
  where: "Remote, or in person if you are close",
  withWhom: "Alec, our founder and executive director",
  why: "A few months after his injury, a physical therapist handed our founder a brochure for adaptive sports he did not know existed. That is the whole origin of this organization: one person telling another that sport was still available to them. A newly injured athlete and their family are frightened and getting most of their information from the internet. What they need is someone who has already been where they are.",
  own: [
    "Talking to athletes and families who are early in this, on the phone or over a message.",
    "Being honest about the hard parts, which is what makes the encouraging parts believable.",
    "Pointing them at a real program, and at us if money is the obstacle.",
  ],
  first: [
    "Tell us your own story, briefly, so we know who to introduce you to.",
    "Take one conversation.",
  ],
  helps: [
    "You are an adaptive athlete, or a parent or partner of one. Lived experience is the qualification.",
    "You are comfortable talking to someone on a bad day.",
  ],
  notNeeded: [
    "Counselling or peer-support training, though we will get you some if you would like it.",
    "Elite athletic achievement. Someone who plays on a Tuesday night is often more useful than a champion.",
  ],
  isNot: [
    "Therapy, medical advice, or crisis support. We will make the boundary clear and give you somewhere to refer people.",
    "On call. You answer when you can.",
  ],
  payoff: "Somebody handed our founder a brochure. This role is that, done on purpose.",
},
{
  slug: "program-scout", lane: "court", name: "Program scout",
  card: "Find and verify adaptive programs so Adaptive Sports Near Me is a real directory and not a list of guesses.",
  time: "An hour a month",
  commit: "An hour a month, entirely on your own time.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Adaptive Sports Near Me is up and taking program submissions, and browsing opens once there is enough in it to be worth browsing. A directory is only as good as whether the listing is true: the wrong phone number or a program that folded two years ago is worse than nothing, because a family only tries once. Verification is unglamorous, it does not scale by itself, and it is the whole product.",
  own: [
    "Finding adaptive programs, in any region, in any sport.",
    "Verifying them, which means confirming a human answers and the program still runs.",
    "Flagging listings that have gone stale, because that is the failure that matters most.",
  ],
  first: [
    "Pick a region, ideally one you know, and find every adaptive program in it.",
    "Verify five, and tell us how many of the five were already wrong somewhere online.",
  ],
  helps: [
    "You are patient on the phone and stubborn about finding a real answer.",
    "You know a local adaptive sports scene, which is a shortcut nothing replaces.",
  ],
  notNeeded: [
    "Any technical skill. This is calls, emails and a form.",
    "Coverage of a whole state. One county well done is a real contribution.",
  ],
  isNot: [
    "Data entry against a quota.",
    "Cold outreach asking programs for money. This is not a fundraising role and should never read as one.",
  ],
  payoff: "A family that finds a program near them does not need a grant at all. That is the cheapest win this organization has.",
},
{
  slug: "clinical-referral-partner", lane: "court", name: "Clinical referral partner",
  card: "Recreational therapists, physical therapists, and hospital staff who can hand someone a brochure the way one was handed to Alec.",
  time: "As it comes up",
  commit: "As it comes up, and mostly it is a habit rather than hours.",
  where: "In person, where you already work",
  withWhom: "Alec, our founder and executive director",
  why: "The single most important handoff in this whole story already happened once: a physical therapist gave our founder a brochure. Rehab and hospital staff meet newly injured people at exactly the moment sport feels impossible, and most of them have nothing to hand over. This role is being the person who does.",
  own: [
    "Telling patients and families that adaptive sport exists, and that cost has somewhere to go.",
    "Telling us what you actually need in order to do that. If our materials are not usable in a clinic, they are not usable.",
    "Being a sanity check on how we talk about disability and injury, which is easy to get slightly wrong.",
  ],
  first: [
    "Tell us what you would need to hand someone. A card, a page, a phone number.",
    "Use it with one family.",
  ],
  helps: [
    "You work in rehabilitation, recreational therapy, physical or occupational therapy, or a hospital or clinic.",
  ],
  notNeeded: [
    "Authority to make referrals on behalf of your employer. Telling someone a fund exists is not a referral.",
    "Adaptive sports experience.",
  ],
  isNot: [
    "Marketing to your patients, and nothing here should ever create a conflict with your employer. If it might, tell us and we will stop.",
    "Sharing any patient information with us, ever.",
  ],
  payoff: "One brochure, handed to one frightened family, is the entire reason this organization exists.",
},
);

// ------------------------------------------------------------- notitle ------
ROLES.push(
{
  slug: "make-an-introduction", lane: "notitle", name: "Make an introduction",
  card: "A company, a foundation, a venue, a coach, a reporter, a family who needs us. Warm introductions beat every cold ask we could write.",
  time: "One email",
  commit: "One email. Genuinely.",
  where: "Remote",
  withWhom: "Alec, our founder and executive director",
  why: "Almost everything difficult on this board gets easier with one introduction. A sponsor conversation that would take twenty cold emails takes one warm one. Most people who want to help assume they have nothing to offer because they do not have a job title we listed, and they are wrong: they know someone.",
  own: [
    "Making the introduction, and that is the whole role.",
  ],
  first: [
    "Think of one person. A business owner, someone at a foundation, a venue manager, a coach, a reporter, or a family who could use us.",
    "Send the email, or tell us who to write to and what to say.",
  ],
  helps: [
    "You know the person well enough that your name means something to them.",
  ],
  notNeeded: [
    "Anything else. No skill, no time commitment, no follow-through required.",
  ],
  isNot: [
    "Asking them for money on our behalf. You are opening a door, we walk through it.",
    "An ongoing obligation. One introduction is a complete contribution.",
  ],
  payoff: "The shortest distance between this fund and a funded athlete is usually a person who already trusts you.",
},
{
  slug: "host-something", lane: "notitle", name: "Host something",
  card: "A tournament, a clinic, a popcorn drive, a birthday fundraiser. We will hand you everything you need.",
  time: "A few weeks of planning",
  commit: "A few weeks of planning, concentrated near the date.",
  where: "Wherever you are",
  withWhom: "Alec, our founder and executive director",
  why: "Our best-performing fundraiser to date was a popcorn drive, which beat its goal several times over and cost almost nothing to run. A drive is a dated way of raising money for a campaign, and anybody can run one. You do not need our permission or our presence, you need our materials and someone to answer questions.",
  own: [
    "The event or drive itself. The date, the venue if there is one, and the people you invite.",
    "Telling us early enough that we can help rather than react.",
  ],
  first: [
    "Tell us what you are thinking, even loosely. A tournament, a raffle, a birthday, a drive.",
    "We will send you what exists already, because you should not be building from scratch.",
  ],
  helps: [
    "You have organized anything before. A league night, a school event, a work party.",
    "You have a venue, a team, or a crowd already.",
  ],
  notNeeded: [
    "Fundraising experience.",
    "A big idea. Small and finished beats ambitious and abandoned.",
  ],
  isNot: [
    "A fundraising target you are responsible for hitting.",
    "Earmarking what you raise for a particular athlete. Money raised goes to the fund, and that is a fairness rule we hold to.",
  ],
  payoff: "A drive is how a fund gets money in a month when nothing else was going to arrive.",
},
{
  slug: "board-and-advisory", lane: "notitle", name: "Board and advisory",
  card: "The seats that steer this as it grows. We are deliberate about who sits in them, and we are looking.",
  time: "A real commitment",
  commit: "A real commitment. Meetings, judgement calls, and the responsibility that comes with a seat.",
  where: "Remote, with some in person",
  withWhom: "Alec, our founder and executive director, and the current board",
  why: "Our board today is athletes and coaches, people who lived the problem, and that is exactly right as a foundation. What it does not yet include is the professional range an organization needs as it grows: finance, law, fundraising, governance. We would rather add those seats deliberately, from people who have already worked with us on something, than fill them in a hurry because a funder asked.",
  own: [
    "Governance. The decisions that are genuinely the board's, including the ones about money and risk.",
    "Holding the organization to its own promises, starting with the promise that one hundred percent reaches the athlete.",
    "Opening doors, which every board member does whether it is in the job description or not.",
  ],
  first: [
    "Talk to us, properly, more than once.",
    "Do one thing with us first. Almost everyone who ends up in a seat here started by helping with something specific.",
  ],
  helps: [
    "You bring something the current board does not have: finance, law, fundraising, governance, or scale.",
    "You have sat on a board before and know the difference between governing and managing.",
  ],
  notNeeded: [
    "A personal capacity to write a large cheque. We will not sell a seat.",
    "A disability or a background in sport, though we will always want both represented.",
  ],
  isNot: [
    "An honorary title. If you want your name on a list without the work, this is not the seat.",
    "A quick process. This one should be slow and it will be.",
  ],
  payoff: "The board is who guarantees this outlives any one of us, including its founder.",
},
);
