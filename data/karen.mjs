// data/karen.mjs: Karen Atkinson's page, the facts and every outside link.
//
// Alec, Nov 8 2026: "Let's level up Karen's page... leverage everything Karen
// gave us to the max." Karen sent her press and posts. Rose (muse-rose) read
// the Facebook posts and found more; the web pages were read directly. Each
// fact below names its source. scripts/build-karen.mjs writes the page.
//
// Left out on purpose, until Karen confirms:
//   - the Steamboat STARS winter post (Aug 24 2026): it names no one;
//   - frames 1 and 2 of Maine Adaptive's 2025 carousel: a woman in Karen's
//     white jacket and blue helmet, but no name on the post (ask Karen);
//   - the Hookin' Veterans video: no public post names her (ask Karen);
//   - the 2019 US Sailing Independence Cup result: it lists a Karen Atkinson
//     of Arlington Heights, Illinois.
// Never name GLASA. ATL funds and supports and never runs programs.

export const QUOTES = [
  // 29 News WVIR, Wounded Warrior Weekend, posted by Wintergreen Adaptive Sports, Feb 8 2025
  { q: "Programs like these change my life. Normally, my life ends at the pavement.", by: "29 News WVIR, February 2025", big: true },
  // Bay News 9, Apr 30 2025
  { q: "I&rsquo;m not just somebody that&rsquo;s sitting on the sidelines. I&rsquo;m a participant.", by: "Bay News 9, April 2025" },
  // WINK News, Nov 10 2024
  { q: "From a sitting position to a standing position, it is only about 18 inches. It changes the world.", by: "WINK News, November 2024" },
  // 29 News WVIR, Feb 2025
  { q: "We don&rsquo;t have to explain PTSD to anybody. We don&rsquo;t have to explain why I&rsquo;m in a wheelchair.", by: "29 News WVIR, February 2025" },
  // 29 News WVIR, Feb 2025 (a repeated "and" dropped, as speech is usually printed)
  { q: "I am beyond grateful to have a purpose and friends.", by: "29 News WVIR, February 2025" },
  // WSET, Feb 9 2025
  { q: "I felt like I had a new chance at life. I feel like I&rsquo;m still alive.", by: "WSET, February 2025" },
];

// Her roles, each linked to the organization's own page about it.
export const ROLES = [
  {
    t: "Stand Up and Play Foundation",
    r: "First Chair of the board",
    d: "A national, all-volunteer nonprofit that puts people who use wheelchairs back on the golf course, standing up, in a VertaCat. Karen received hers at the foundation&rsquo;s awards dinner, and she is helping build its new chapter in the Tampa Bay area.",
    href: "https://standupandplayfoundation.org/our-team/",
    label: "standupandplayfoundation.org",
  },
  {
    t: "Move United",
    r: "Warfighter Ambassador",
    d: "Move United&rsquo;s Warfighter Ambassadors help veterans with disabilities find out how and where to play adaptive sports.",
    href: "https://moveunitedsport.org/sports/move-united-warfighters-ambassador-program/",
    label: "moveunitedsport.org",
  },
  {
    t: "AMP Adaptive Sports",
    r: "Board member",
    d: "Our partner nonprofit in Elkhorn, Wisconsin, getting athletes of all abilities on the water and the snow. Karen has water skied with AMP.",
    href: "/amp",
    label: "Our partnership with AMP",
  },
  {
    t: "Adapt To Life",
    r: "Board member",
    d: "Karen helps people find their sport through Adaptive Sports Near Me, the free directory we&rsquo;re building, and signs up its beta testers.",
    href: "/adaptive-sports-near-me",
    label: "Adaptive Sports Near Me",
  },
];

// In the news and on air, newest first. kind: tv, radio, article, video, photo.
export const PRESS = [
  {
    kind: "Photo", src: "Maine Adaptive Sports &amp; Recreation", date: "January 24, 2026", iso: "2026-01-24",
    t: "Veterans No Boundaries winter camp at Sunday River",
    n: "Karen, in the blue jacket, on a sit ski with Maine Adaptive instructors in Newry, Maine.",
    url: "https://www.facebook.com/photo.php?fbid=1511673764293949&set=a.636561731805161&type=3",
  },
  {
    kind: "Video", src: "Maine Adaptive Sports &amp; Recreation", date: "January 27, 2026", iso: "2026-01-27",
    t: "Closing day of Veterans No Boundaries, on a powder day",
    n: "The camp&rsquo;s closing reel. The only comment on it: &ldquo;Karen!&rdquo;",
    url: "https://facebook.com/reel/25714419898197224/",
  },
  {
    kind: "Photo", src: "Move United", date: "December 10, 2024", iso: "2024-12-10",
    t: "The Hartford Ski Spectacular in Breckenridge",
    n: "Karen, with her name on her bib, laughing between runs.",
    url: "https://facebook.com/100064317086209/posts/pfbid02bPc5qY5td3yw19D9YS8TSG3DfJ8SD1DQycGxvk5VKd6h9QhFGEodbtLNvo2bvQQgl",
  },
  {
    kind: "TV", src: "Bay News 9", date: "April 30, 2025", iso: "2025-04-30",
    t: "Nonprofit helps injured veterans and first responders get mobile again",
    n: "Karen golfs standing up in a VertaCat from the Stand Up and Play Foundation.",
    url: "https://baynews9.com/fl/tampa/news/2025/04/30/veterans-foundation-stand-up-play", type: "NewsArticle",
  },
  {
    kind: "TV", src: "WSET ABC 13", date: "February 9, 2025", iso: "2025-02-09",
    t: "Adaptive skiing event transforms lives, offering veterans a chance to reclaim their joy",
    n: "Wounded Warriors Weekend at Wintergreen Resort, Virginia. Karen speaks as a Move United Warfighter Ambassador.",
    url: "https://wset.com/news/local/adaptive-skiing-event-transforms-lives-offering-veterans-a-chance-to-reclaim-their-joy-wintergreen-wounded-warriors-weekend-february-2025", type: "NewsArticle",
  },
  {
    kind: "TV", src: "29 News WVIR, via Wintergreen Adaptive Sports", date: "February 8, 2025", iso: "2025-02-08",
    t: "Wounded Warrior Weekend at Wintergreen",
    n: "Karen is the segment&rsquo;s main interview, on the slopes and off.",
    url: "https://facebook.com/wintergreenadaptivesports/videos/1682146392364891/", type: "VideoObject",
  },
  {
    kind: "Article", src: "The Golf Wire", date: "November 12, 2024", iso: "2024-11-12",
    t: "Stand Up and Play Foundation returns to Legends Golf Club for Veterans Day",
    n: "Karen received a VertaCat at the foundation&rsquo;s awards dinner and is organizing its Clearwater and St. Petersburg chapter.",
    url: "https://thegolfwire.com/stand-up-and-play-foundation-legends-golf-club/", type: "NewsArticle",
  },
  {
    kind: "TV", src: "WINK News", date: "November 10, 2024", iso: "2024-11-10",
    t: "Local golf and country club finds unique way to honor veterans",
    n: "A Veterans Day golf ball drop at Legends Golf and Country Club in Fort Myers, with Karen in the VertaCat.",
    url: "https://www.winknews.com/news/lee/local-golf-and-country-club-finds-unique-way-to-honor-veterans/article_69eddb47-e16e-59ed-8fe9-da5eff8c0062.html", type: "NewsArticle",
  },
  {
    kind: "Radio", src: "Sports Innerview with Ann Liguori, WLIW 88.3 FM", date: "September 28, 2024", iso: "2024-09-28",
    t: "Karen Atkinson, Stand Up and Play Foundation",
    n: "Karen&rsquo;s own 27-minute interview with Ann Liguori. The full hour, with founder Anthony Netto, is episode 322.",
    url: "https://audioboom.com/posts/8584031-sports-innerview-09-28-2024-karen-atkinson", type: "PodcastEpisode",
    also: [["The full hour, episode 322", "https://audioboom.com/posts/8578396-sports-innerview-09-28-2024-karen-atkinson-anthony-netto"], ["Ann&rsquo;s post", "https://facebook.com/100003635717628/posts/pfbid02CYLkwQ1thSwoVWHSUByAh3EcCn5SBCWbSrK5PYCuYhsPwg5DTkfLfAgYzhtbAvWml"]],
  },
  {
    kind: "Profile", src: "Dive Pirates Foundation", date: "2022", iso: "2022-07-26",
    t: "Karen Atkinson, 2022 adaptive diver",
    n: "From Army officer to adaptive scuba diver, with her son Tanner as her dive buddy.",
    url: "https://divepirates.org/karen-atkinson/", type: "Article",
  },
  {
    kind: "Video", src: "Hookin&rsquo; Veterans", date: "", iso: "",
    t: "Sailfishing for Veterans",
    n: "An offshore fishing trip out of Palm Beach for injured veterans.",
    url: "https://www.youtube.com/watch?v=kKw8KPFdIOc", type: "VideoObject",
  },
];

// Photos on the page. Both belong to the organizations that posted them,
// found by Rose and confirmed as Karen (her bib; her own note about the blue
// jacket). Credited and linked. Ask the owner before reuse beyond this page.
export const PHOTOS = [
  {
    src: "/images/karen/ski-spectacular.webp", w: 1400, h: 934,
    alt: "Karen Atkinson laughing in a sit ski at The Hartford Ski Spectacular, her name written on her blue bib, an instructor beside her",
    cap: "The Hartford Ski Spectacular, Breckenridge, December 2024.",
    credit: ["Move United", "https://facebook.com/100064317086209/posts/pfbid02bPc5qY5td3yw19D9YS8TSG3DfJ8SD1DQycGxvk5VKd6h9QhFGEodbtLNvo2bvQQgl"],
  },
  {
    src: "/images/karen/sunday-river-sit-ski.webp", w: 1400, h: 1174,
    alt: "Karen Atkinson in a blue jacket on a sit ski at Sunday River, with Maine Adaptive instructors around her",
    cap: "Veterans No Boundaries at Sunday River, Maine, January 2026.",
    credit: ["Maine Adaptive Sports &amp; Recreation", "https://www.facebook.com/photo.php?fbid=1511673764293949&set=a.636561731805161&type=3"],
  },
];

// Sports Innerview with Ann Liguori, episode 323 (aired Sep 28 2024). Lines
// checked word for word against the audio (faster-whisper medium.en on each
// passage, Nov 8 2026); filler words ("you know", "um") dropped. Times are
// minutes:seconds into the episode.
export const RADIO = {
  url: "https://audioboom.com/posts/8584031-sports-innerview-09-28-2024-karen-atkinson",
  quotes: [
    { t: "14:20", q: "I had to do the work to discover what&rsquo;s available. Nobody brought it to me. I had to find it. And so for me, my passion now is to make sure that nobody else has those six years." },
    { t: "15:40", q: "I get to be a participant. I get to hit that ball. Not very well, but I can hit that ball. And that to me is everything. I am now an equal part of this foursome." },
    { t: "20:25", q: "Anthony reached over and hit the button and I stood up to salute the flag for the first time in 10 years." },
    { t: "17:35", q: "You don&rsquo;t have to be really good at wheelchair pickleball. You just have to show up and meet the other people, the other veterans who you didn&rsquo;t know are going through the same thing that you&rsquo;re going through every day." },
    { t: "23:05", q: "Just ask them what they need. Don&rsquo;t say no. Ask them what they need. &hellip; What can we do for you? How can we help you?" },
  ],
};
