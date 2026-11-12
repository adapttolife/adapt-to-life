// data/blog.mjs: the Adapt To Life blog at /blog.
//
// Alec, Nov 12 2026: "I think we're ready to create a blog for
// adapttolife.org ... We have story pages for parts of our team and community
// (and many more to come) ... we can throw a collection of these pages into
// the blog and build a popular content machine for SEO and ai search ... How
// to build a program? The numbers don't lie, build in public and share the
// story of what it takes to be in adaptive sports."
//
// scripts/build-blog.mjs (npm run blog) reads this file and writes:
//   public/blog.html              the hub: every entry below, by section
//   public/blog/<slug>.html       one page per post in POSTS
//   public/blog/feed.xml          RSS for every entry
//   public/llms.txt               a plain map of the site for AI search
//
// Two kinds of entry:
//   LISTED  pages that already exist at their own URL (people pages, event
//           stories, guides, /numbers). The blog collects them; it never moves
//           them, because their URLs are on share cards, QR codes and posts.
//   POSTS   new writing that lives at /blog/<slug>.
//
// Rules for every post (the same ones the rest of the site follows):
//   - Facts only. Every number names its source in a comment beside it.
//   - Quotes are verbatim, from the person, with their OK. Never write a story
//     for an athlete: collect their words (a voice note is enough).
//   - Adapt To Life funds and supports; clubs host and run the play. "Athletes
//     we support", never "our athletes", "our program" or "our sessions".
//   - No calculator: one amount per idea, never add, multiply or convert.
//   - Never name GLASA, in words or in a photo. Look at every image.
//   - No session days or schedules; athletes looking to play go to
//     adaptivesportsnearme.com.
//   - Every money button says Donate.
//   - A post names its author, a person in AUTHORS, with their face. A byline
//     is a promise: that person has read every word and stands behind it.
//     Never put a name on words its owner hasn't seen.
//
// Adding a post: add it to POSTS, run `npm run blog`, then
// `node scripts/make-og.mjs blog-<slug>` for its share card, then
// `npm run blog` again, and add /blog/<slug> to public/sitemap.xml.

// The four sections, in the order of the hub's tabs. The blurb shows under
// the tabs when a reader picks one.
export const SECTIONS = {
  stories: { name: "Stories", blurb: "Athletes, ambassadors and the people behind the fund." },
  road: { name: "On the road", blurb: "Where the athletes we support played, what happened, and who made it possible." },
  guides: { name: "Guides", blurb: "Plain answers for sponsors, donors and anyone building a program." },
  public: { name: "Building in public", blurb: "What worked, what didn’t, and what we changed." },
};

// The people who write here (Alec, Nov 12 2026, looking at a post signed
// "Adapt To Life" under the logo: "Should the author be me? A person? Use my
// profile picture more? Give more authenticity"). Every post's `author` is a
// key below. `photo` is a square region of a photo already on the site, cut
// to a 160px round avatar; `url` is the person's bio, which is also their id
// in structured data; `bio` uses facts already published there.
export const AUTHORS = {
  alec: {
    name: "Alec Tranel",
    role: "Founder and executive director, Adapt To Life",
    jobTitle: "Founder & Executive Director", // as on /about
    url: "/about#alec",
    photo: { src: "public/images/founder.webp", x: 490, y: 76, w: 880, h: 880 }, // the /about portrait, head and shoulders (Alec: "zoom out more")
    bio: "In a wheelchair since he was six, Alec spent more than twenty years in adaptive sports as an athlete and a coach.", // /about
  },
};

// The face under the hub's header: the person behind the blog.
export const EDITOR = "alec";

// One photograph per entry, the same shape everywhere (Alec, Nov 12 2026:
// "Should we have pictures or icons? It feels sloppy"). Pictures, never icon
// tiles. Each is a 3:2 region (x, y, w, h in the source's pixels) of a photo
// the site already uses; build-blog.mjs cuts it to public/images/blog/
// <key>-<width>.<hash>.webp, where the hash comes from this spec, so changing
// a crop writes new files and drops the old ones. Look at every new photo
// before it ships: no GLASA or "Great Lakes Games" shirts.
const PHOTO = {
  juan: { src: "assets/photos/juan-portrait.jpg", x: 1130, y: 0, w: 1800, h: 1200 },
  karen: { src: "public/images/karen-waterskiing.jpg", x: 226, y: 106, w: 1200, h: 800 },
  // Tim's own photo, as on /tim and the fund page. It shows another
  // organization's jersey; Alec kept it on Nov 5 ("the rule covers words we
  // write, not this historical photo of the fund's namesake"). Full frame.
  tim: { src: "public/images/tim.webp", x: 11, y: 0, w: 1057, h: 705 },
  smash: { src: "public/images/events/monster-smash-2026/crew-lodge.webp", x: 0, y: 440, w: 720, h: 480 },
  app: { src: "public/images/events/app-vlasic-classic-2026/court-29.webp", x: 0, y: 560, w: 720, h: 480 },
  chair: { src: "public/images/athletes/juan-chair.webp", x: 0, y: 139, w: 1600, h: 1067 },
  sponsor: { src: "assets/photos/cap-profile.jpg", x: 0, y: 0, w: 3900, h: 2600 },
  matching: { src: "assets/photos/paddle-portrait.jpg", x: 0, y: 0, w: 3900, h: 2600 },
  numbers: { src: "assets/photos/pickleball-court.jpg", x: 0, y: 145, w: 3467, h: 2311 },
};

// Pages that already exist. `label` replaces the date for evergreen pages.
// `published` sorts the feed (first publish, from git history or the page's
// own data). Titles and lines here are short on purpose; each page keeps its
// own longer title and description.
export const LISTED = [
  {
    href: "/juan",
    section: "stories",
    title: "Juan Ortiz",
    dek: "Paralyzed at 14, Hall of Famer in wheelchair softball, dad of three, and Adapt To Life’s first ambassador.",
    label: "Ambassador",
    published: "2026-09-19",
    photo: PHOTO.juan,
  },
  {
    href: "/karen",
    section: "stories",
    title: "Karen Atkinson",
    dek: "A retired Army captain who golfs standing up, skis, sails and dives, and serves on our board.",
    label: "Board member",
    published: "2026-06-25",
    photo: PHOTO.karen,
  },
  {
    href: "/tim",
    section: "stories",
    title: "Tim Gruensfelder",
    dek: "The wheelchair basketball athlete whose love of the game lives on through the Hustle & Heart Fund.",
    label: "In memory",
    published: "2026-06-24",
    photo: PHOTO.tim,
  },
  {
    href: "/events/monster-smash-2026",
    section: "road",
    story: "monster-smash-2026", // title, line and date come from data/event-stories.mjs
    dek: "A Halloween tournament weekend at The Pickle Lodge in Cincinnati, free for wheelchair athletes. The athletes we support came home with six medals.",
    photo: PHOTO.smash,
  },
  {
    href: "/events/app-vlasic-classic-2026",
    section: "road",
    story: "app-vlasic-classic-2026",
    dek: "Juan Ortiz asked the APP Tour for a wheelchair division in Highland Park. Five full teams played the APP’s first.",
    photo: PHOTO.app,
  },
  {
    href: "/sport-wheelchair-cost",
    section: "guides",
    guide: "sport-wheelchair-cost", // title and date come from data/guides.mjs
    dek: "A sport wheelchair runs $4,000 to $6,000, and insurance doesn’t cover it.",
    photo: PHOTO.chair,
  },
  {
    href: "/sponsor-adaptive-athletes",
    section: "guides",
    guide: "sponsor-adaptive-athletes",
    dek: "What sponsoring a wheelchair pickleball athlete pays for, and what a sponsor gets back.",
    photo: PHOTO.sponsor,
  },
  {
    href: "/corporate-matching",
    section: "guides",
    guide: "corporate-matching",
    dek: "Many employers match gifts to nonprofits. Everything you need to get yours matched.",
    photo: PHOTO.matching,
  },
  {
    href: "/numbers",
    section: "public",
    title: "The numbers",
    dek: "Every number in our goal for the year ahead, and what each one pays for.",
    label: "Updated live",
    published: "2026-11-06",
    photo: PHOTO.numbers,
  },
];

// New writing, at /blog/<slug>, each signed by its author (AUTHORS). The
// newest entry, post or page, leads the hub. Empty for now: Alec, Nov 12
// 2026, on the first draft (a viral reel's numbers): "Don't post the viral
// reel post." The next post starts from the author's own words.
//
//   "<slug>": {
//     section, title, short, h1, description, dek, lead, published,
//     author: "alec", keyPoints: [...], body: `<h2>...</h2><p>...</p>`,
//     sources: [[name, note, href]], og: { file, alt }, photo: { src, x, y, w, h, alt },
//   },
export const POSTS = {};
