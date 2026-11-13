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
  guides: { name: "Guides", blurb: "Plain answers for donors and sponsors." },
  public: { name: "Building in public", blurb: "The numbers behind the work, in the open." },
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
    // His own profiles (Instagram, LinkedIn): shown in the "Written by" box and
    // given to search engines as the same person (sameAs). Add them when he
    // sends them; never guess a handle.
    sameAs: [],
  },
};

// Authors appear on posts only. The blog page and the pages it collects carry
// no author: they are the organization's own pages. Alec, Nov 12 2026: "I
// don't think we need my name there ... Eventually Karen will write something
// and we'll invite different ppl from the community ... Maybe for now we just
// have nothing?"

// One photograph per entry, the same shape everywhere (Alec, Nov 12 2026:
// "Should we have pictures or icons? It feels sloppy"). Pictures, never icon
// tiles. Each is a 3:2 region (x, y, w, h in the source's pixels) of a photo
// the site already uses; build-blog.mjs cuts it to public/images/blog/
// <key>-<width>.<hash>.webp, where the hash comes from this spec, so changing
// a crop writes new files and drops the old ones. Look at every new photo
// before it ships: no GLASA or "Great Lakes Games" shirts.
const PHOTO = {
  // Juan serving, black and white (as on /juan). Alec, Nov 12 2026, on the
  // tight portrait crop it replaced: "let's get a better picture for Juan".
  juan: { src: "public/images/athletes/juan-serve.webp", x: 0, y: 130, w: 1500, h: 1000 },
  // Karen's profile photo, as on /karen and /about. Alec, Nov 12 2026: "For
  // Karen, use her profile image" (it replaced a water-skiing crop).
  karen: { src: "public/images/karen.jpg", x: 0, y: 0, w: 900, h: 600 },
  // Tim's own photo, as on /tim and the fund page. It shows another
  // organization's jersey; Alec kept it on Nov 5 ("the rule covers words we
  // write, not this historical photo of the fund's namesake"). Full frame.
  tim: { src: "public/images/tim.webp", x: 11, y: 0, w: 1057, h: 705 },
  // Ryan reaching low for the ball, in black and white (Brick House shoot).
  // Alec, Nov 12 2026, replacing the 720px reel frame of the crew at the
  // Lodge: "Can we pick a better picture?", then sent this frame as the one.
  // (Amanda mid-swing, assets/photos/court-swing.jpg full frame, was the
  // other choice: she took bronze there and it is the event's share card.)
  smash: { src: "public/images/athletes/ryan-reach.webp", x: 0, y: 162, w: 960, h: 640 },
  // A player mid-swing, ball in the air (ACE shoot), in place of the 720px
  // reel frame from court 29. Alec, Nov 12 2026: "Let's update the APP
  // image". The ACE shoot's group photos are out: one shows a Great Lakes
  // Games shirt (see the no-GLASA rule).
  app: { src: "public/images/athletes/wheelie-4.webp", x: 0, y: 0, w: 1500, h: 1000 },
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
    dek: "A Halloween tournament weekend at The Pickle Lodge in Cincinnati. The host made it free for wheelchair athletes, and the athletes we support came home with six medals.",
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
    dek: "Many employers match gifts to 501(c)(3) nonprofits. How to get yours matched, with our legal name, EIN and IRS letter.",
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
export const POSTS = {
  // Brian Liss (Alec, Nov 13 2026: "I know we don't have Brian page done yet
  // but we can still 'set it up' and reference it here", from the Selkirk
  // page; he and Juan "want to be apart of this"). Built only from words and
  // facts already published with approval: his quote on /hustle-and-heart, his
  // record on /pickleball (medals only, never his first year or a count of his
  // US Opens: brian-liss-record). His own answers to five questions go in next.
  "brian-liss": {
    section: "stories",
    title: "Brian Liss: US Open Silver and Bronze in Wheelchair Pickleball",
    short: "Brian Liss",
    h1: "&ldquo;The chair didn&rsquo;t fix me.&rdquo;",
    description:
      "Brian Liss has won silver and bronze at the US Open, and six medals in all, two of them gold. He plays with Chicago Pickleball: Wheelie Big Dills, the wheelchair pickleball crew Adapt To Life funds and supports.",
    dek: "US Open silver and bronze, six medals in all, and a chair that gave him options.",
    lead: "Brian Liss plays wheelchair pickleball with Chicago Pickleball: Wheelie Big Dills, a crew Adapt To Life funds and supports. He has won silver and bronze at the US Open.",
    published: "2026-11-13",
    author: "alec",
    keyPoints: [
      "Brian Liss has won silver and bronze at the US Open, and six medals in all, two of them gold.", // /pickleball (Brian's own count, Nov 11)
      "He plays with Chicago Pickleball: Wheelie Big Dills, the wheelchair pickleball crew Adapt To Life funds and supports.",
      "In his words: &ldquo;The chair didn&rsquo;t fix me. It gave me options I didn&rsquo;t have before.&rdquo;", // /hustle-and-heart
    ],
    stats: [
      ["2", "US Open medals, silver and bronze"],
      ["6", "medals in all, two of them gold"],
    ],
    body: `
      <h2>In his words</h2>
      <blockquote><p>&ldquo;Now I can play pickleball, keep up with my kid, and choose how I move. The chair didn&rsquo;t fix me. It gave me options I didn&rsquo;t have before.&rdquo;</p></blockquote>
      <h2>The record</h2>
      {{stats}}
      <p>Brian plays with the Wheelie Big Dills at Open Court clubs across the Chicago area, beside the clubs&rsquo; own members.</p>
      <h2>On the road</h2>
      <p>The Road to the US Open is a season of tournament travel for the crew. Its last stop is the US Open in Naples in spring 2027, for athletes whose names come up in the lottery. <a href="/road">See the road</a>.</p>
    `,
    sources: [
      ["Hustle &amp; Heart Fund", "Brian&rsquo;s words, as published on the fund page", "/hustle-and-heart"],
      ["Chicago Pickleball: Wheelie Big Dills", "Brian&rsquo;s record, on the crew page", "/pickleball#brian"],
      ["The Road to the US Open", "the season ahead", "/road"],
    ],
    og: { file: "blog-brian-liss-v1-card.jpg", alt: "The chair didn't fix me. Adapt To Life. Brian Liss smiling on an indoor court, paddle in hand." },
    photo: { src: "public/images/athletes/brian-slk.webp", x: 150, y: 0, w: 1600, h: 1067, alt: "Brian Liss smiling on an indoor court, paddle in hand" },
  },
};
