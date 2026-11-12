// /links: the page behind the Instagram bio and the Facebook Page website field.
//
// Alec, Nov 8 2026: "Can we make the links better? I want this to help convert
// social media to website. We can do even better than linktree bc we can create
// our own website custom with pictures and videos and go above and beyond."
//
// Why it is a page and not a list: a reel viewer taps through to find out who
// these athletes are. So the page opens on the same court they just watched,
// then the people, then the medals, then one tap to give or to follow along.
// 32 posts in 90 days earned 7 Facebook link clicks (Rose, Nov 8), so every
// button carries utm tags (public/js/attribution.js carries them into a
// Givebutter gift). A post can link /links?from=<key> to open on its own
// section and tag what follows with that post.
//
// Built by scripts/build-guides.mjs (npm run guides) through
// scripts/lib/links-page.mjs. Facts here repeat what /pickleball and the event
// stories already say; change them there first.

export const HERO = {
  video: "/videos/links/rally-brickhouse.44e69db0.mp4",
  poster: "/videos/links/rally-brickhouse.9b9fb227.webp",
  // the clip is a rally at Brick House, our partner club (Rose, Oct 31)
  label: "A wheelchair pickleball rally at Brick House Pickleball in Lake Forest",
};

// Same people, order and facts as the crew cards on /pickleball.
export const CREW = [
  {
    slug: "juan",
    name: "Juan",
    tag: "Ambassador",
    img: "/images/pickleball/juan.webp",
    w: 616,
    h: 900,
    fact: "Singles gold at Monster Smash. He asked the APP Tour for its first wheelchair division, and got it.",
    href: "/juan",
    cta: "Read his story",
    share: "/juan",
  },
  {
    slug: "brian",
    name: "Brian",
    img: "/images/pickleball/brian.webp",
    w: 952,
    h: 900,
    fact: "US Open silver and bronze. Six medals in all, two of them gold.",
    href: "/pickleball#brian",
    cta: "See more",
    share: "/pickleball#brian",
  },
  {
    slug: "bob",
    name: "Bob",
    img: "/images/pickleball/bob.webp",
    w: 552,
    h: 900,
    fact: "Doubles gold at Monster Smash, with Kenneth Holman.",
    href: "/pickleball#bob",
    cta: "See more",
    share: "/pickleball#bob",
  },
  {
    slug: "robby",
    name: "Robby",
    img: "/images/pickleball/robby.webp",
    w: 649,
    h: 900,
    fact: "Three straight US Opens, plus singles bronze and doubles silver at Monster Smash.",
    href: "/pickleball#robby",
    cta: "See more",
    share: "/pickleball#robby",
  },
  {
    slug: "ken",
    name: "Ken",
    img: "/images/pickleball/ken.webp",
    w: 659,
    h: 900,
    fact: "Doubles silver at Monster Smash, with Robby.",
    href: "/pickleball#ken",
    cta: "See more",
    share: "/pickleball#ken",
  },
  {
    slug: "amanda",
    name: "Amanda",
    img: "/images/pickleball/amanda.webp",
    w: 919,
    h: 900,
    fact: "Doubles bronze at Monster Smash, with Kasey Stelter.",
    href: "/pickleball#amanda",
    cta: "See more",
    share: "/pickleball#amanda",
  },
];

// The Monster Smash results cards, with the alt text the story page uses.
export const MEDALS = [
  ["0-cover", "Six athletes, six medals: 2 gold, 2 silver, 2 bronze. Monster Smash results card with The Pickle Lodge and Adapt To Life logos."],
  ["2-juan", "Juan Ortiz, gold, singles."],
  ["4-bob", "Bob Swanson, gold, doubles with Kenneth Holman."],
  ["5b-robby-silver", "Robby Wolf, silver, doubles with Ken Carwell."],
  ["6-ken", "Ken Carwell, silver, doubles with Robby Wolf."],
  ["5a-robby-bronze", "Robby Wolf, bronze, singles."],
  ["1-amanda", "Amanda Tworek, bronze, doubles with Kasey Stelter."],
];

// More stories, newest push first. [href, title, line, thumbnail]
export const STORIES = [
  ["/events/app-vlasic-classic-2026", "The APP Tour’s first wheelchair division", "How Juan got the APP to say yes", "/images/links/app-court.e96d1f7e.webp"],
  ["/juan", "Juan Ortiz, on CBS News Chicago", "His story, his press, his road to the US Open", "/images/links/juan-face.3b2b05b6.webp"],
  ["/bread-and-butter", "Juan’s Bread & Butter code", "JuanitoLoco takes 10% off. The commission comes to the fund.", "/images/links/bnb-loco.a731e45d.webp"],
  ["/ace", "ACE Pickleball Club, Des Plaines", "Our partner club", "/images/links/ace-court.ed4a355f.webp"],
  ["/sponsor-adaptive-athletes", "Sponsor an athlete", "Court time, training and tournament travel", "/images/links/sponsor-swing.680e5b35.webp"],
];

// /links?from=<key>: the section a post's link opens on. Rose's captions and
// Story stickers use these keys; anything else falls back to the normal order.
export const FROM = {
  "monster-smash": "medals",
  medals: "medals",
  crew: "crew",
  juan: "crew",
  app: "stories",
  bnb: "stories",
  "bread-and-butter": "stories",
  road: "give",
  "us-open": "give",
  give: "give",
  donate: "give",
  play: "play",
  rules: "play",
  sponsor: "partners",
};
