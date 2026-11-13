// data/event-stories.mjs: the story behind each event, one page per event.
//
// Alec, Nov 8 2026: "each event is really like a blog post and we tell the
// story of the event and link to the host place and any other stuff that
// helps with SEO." scripts/build-event-pages.mjs reads this file plus the
// event's row in public/data/campaigns.json (dates, venue, host, result) and
// writes public/events/<slug>.html. The row's "page" field points at it, so
// /events, the homepage and the structured data all link to the story.
//
// Rules for every story (see the project memories):
//   - Facts only, each from our own pages, the host's own pages, or the
//     official listing. Say where a number came from in a comment.
//   - Adapt To Life funds and supports; it does not run, host or play.
//     "Athletes we support", never "our athletes" or "our tournament".
//   - Outside links: full names, rel="noopener". Hosts and venues get their
//     own site plus the official listing, so search engines can connect us.
//   - Never name GLASA. Look at every photo before it ships: no GLASA or
//     "Great Lakes Games" shirts (a grep cannot see a shirt).
//
// Adding an event: add its row to campaigns.json, add a story here, set the
// row's page to /events/<slug>, run `npm run events`, and add the URL to
// public/sitemap.xml.

export const STORIES = {
  "app-vlasic-classic-2026": {
    title: "The APP Tour's First Wheelchair Division, Vlasic Classic Chicago 2026",
    h1: "The APP Tour&rsquo;s first <em class=\"italic\" style=\"color:var(--orange)\">wheelchair division.</em>",
    description:
      "Juan Ortiz asked the APP Tour for a wheelchair division at the 2026 Vlasic Classic Chicago in Highland Park, and got the APP's first. Five full teams played it.",
    lead:
      "Juan Ortiz asked the APP Tour for a wheelchair bracket at its Chicago stop. The APP said yes, and five full teams played the first wheelchair division in APP history.",
    published: "2026-11-08",
    // Facts: our /juan and /pickleball pages (Juan's request, five teams,
    // lightning), campaigns.json (dates, venue, bracket), and the APP's own
    // recap, read Nov 8 2026 (five days from Aug 5, eighth year in Chicago,
    // $25,000 for Shriners Children's, highlights on CBS Sports Network).
    facts: [
      ["Our bracket", "Wheelchair Open Doubles (All Ages), Sunday, August 9"],
      ["Benefiting", '<a href="https://www.shrinerschildrens.org/en" target="_blank" rel="noopener">Shriners Children&rsquo;s</a>'],
    ],
    body: `
      <h2 class="serif h2">How it started</h2>
      <p>Each year the <a href="https://www.theapp.global/" target="_blank" rel="noopener">APP Tour</a> (the Association of Pickleball Players) brings pros and top amateurs to Danny Cunniff Park in Highland Park for the Vlasic Classic Chicago. 2026 was its eighth year in Chicago. It had no wheelchair bracket.</p>
      <p><a href="/juan">Juan Ortiz</a>, a Wheelchair Softball Hall of Famer and Adapt To Life&rsquo;s first ambassador, asked the tournament for one. The APP said yes. That made the Wheelchair Open Doubles bracket the first wheelchair division the APP had ever run.</p>
      <blockquote class="es-q">&ldquo;In basketball and softball, I was lucky to have huge, established adaptive programs supporting us. Wheelchair pickleball doesn&rsquo;t have that infrastructure yet. If an adaptive athlete wants to try a sport, that sport has to exist first.&rdquo;<cite>Juan Ortiz</cite></blockquote>

      <h2 class="serif h2">Sunday, August 9</h2>
      <p>Five full teams signed up, more than any other amateur bracket at the tournament. Athletes we support from <a href="/pickleball">Chicago Pickleball: Wheelie Big Dills</a> were among them.</p>
      <p>Then the weather turned. Lightning stopped play on the outdoor courts, so the tournament moved the bracket indoors, and the athletes finished it.</p>
      {{photo}}

      <h2 class="serif h2">The bigger week</h2>
      <p>The tournament ran five days, starting August 5. Across the week, the APP says, it raised $25,000 for <a href="https://www.shrinerschildrens.org/en" target="_blank" rel="noopener">Shriners Children&rsquo;s</a>, the APP&rsquo;s official charity partner, and highlights were set to air on CBS Sports Network. The full results are in the <a href="https://theapp.global/news/2026-chicago-recap" target="_blank" rel="noopener">APP&rsquo;s own recap</a>.</p>
      <p>Adapt To Life didn&rsquo;t host this tournament or raise money from it. We were there because the athletes we support were playing.</p>

      <h2 class="serif h2">What it started</h2>
      <p>One bracket became a plan. Juan is now asking other tournament directors for wheelchair divisions, and the <a href="/chicago-classic">Chicago Classic</a>, a wheelchair pickleball tournament presented by Adapt To Life, is still to come: our goal is free registration, travel and hotels for every athlete. Gifts past the road to the US Open go toward it.</p>`,
    links: [
      ["APP Tour", "The Association of Pickleball Players, the tour that hosted it.", "https://www.theapp.global/"],
      ["APP recap: 2026 Vlasic Classic Chicago", "Results and the week in full, from the APP.", "https://theapp.global/news/2026-chicago-recap"],
      ["Tournament listing", "The official registration listing for the event.", "https://app.pickleballden.com/external-tournament/1359608"],
      ["Shriners Children&rsquo;s", "The charity the tournament benefited.", "https://www.shrinerschildrens.org/en"],
      ["APP Tour on Instagram", "@officialapptour", "https://www.instagram.com/officialapptour/"],
    ],
    mentions: ["juan"],
    // Frame from our reel of the bracket (instagram.com/reel/Db3q5eZN7Wf,
    // Aug 10 2026), found by Rose. The caption names no one, so neither do we.
    photo: { src: "/images/events/app-vlasic-classic-2026/court-29.webp", w: 720, h: 1280,
      alt: "Two wheelchair pickleball players at the net on APP court 29, indoors, one reaching high for an overhead",
      caption: "The wheelchair bracket on APP court 29.",
      credit: ["Adapt To Life on Instagram", "https://www.instagram.com/reel/Db3q5eZN7Wf/"] },
    og: { file: "event-app-vlasic-classic-2026-v1-card.jpg", alt: "The APP Tour's first wheelchair division. Adapt To Life. Juan Ortiz serves from his sport wheelchair." },
    next: { href: "/road", label: "The Road to the US Open" },
  },

  "monster-smash-2026": {
    title: "Monster Smash 2026: Six Wheelchair Pickleball Medals in Cincinnati",
    h1: "Six medals at <em class=\"italic\" style=\"color:var(--orange)\">Monster Smash.</em>",
    description:
      "Wheelchair pickleball athletes we support won six medals at Monster Smash 2026 at The Pickle Lodge in Cincinnati, a Halloween tournament weekend that was free for wheelchair athletes.",
    lead:
      "A Halloween tournament weekend at The Pickle Lodge in Cincinnati. The host made it free for wheelchair athletes, and the athletes we support came home with six medals.",
    published: "2026-11-08",
    // Facts: campaigns.json (dates, venue, address, from the official
    // listing), /chicago-classic (free for athletes, travel and food help,
    // six medals, 25,000+ views), /pickleball (each athlete's medal), /ace
    // (spotlights co-branded with the host club), /social (the reel), and the
    // results cards in Drive, Social Media > ATL Monster Smash carousel >
    // "RESULTS - Monster Smash (post these)" (names, partners, 2-2-2 split).
    facts: [
      ["Brackets", "Wheelchair singles and doubles"],
      ["Entry", "Free for wheelchair athletes, thanks to The Pickle Lodge"],
    ],
    body: `
      <h2 class="serif h2">A host that went all in</h2>
      <p><a href="https://thepicklelodge.com/" target="_blank" rel="noopener">The Pickle Lodge</a> hosts Monster Smash, a Halloween tournament weekend at Lunken Landing in Cincinnati. In 2026 it made the tournament free for wheelchair athletes and helped them with travel and food. Athletes we support from <a href="/pickleball">Chicago Pickleball: Wheelie Big Dills</a> made the trip from Chicago.</p>
      {{photo}}

      <h2 class="serif h2">The medals</h2>
      <p>Six athletes we support made the trip, and they came home with six medals: two gold, two silver and two bronze.</p>
      <ul class="es-list">
        <li><b>Juan Ortiz</b>: singles gold</li>
        <li><b>Bob Swanson</b>: doubles gold, with Kenneth Holman</li>
        <li><b>Robby Wolf</b>: singles bronze, and doubles silver with Ken Carwell</li>
        <li><b>Ken Carwell</b>: doubles silver, with Robby Wolf</li>
        <li><b>Amanda Tworek</b>: doubles bronze, with Kasey Stelter</li>
        <li><b>Brian Liss</b>: competed in Cincinnati</li>
      </ul>

      <h2 class="serif h2">More than 25,000 views</h2>
      <p>We made a spotlight for each athlete, with The Pickle Lodge&rsquo;s name on it next to ours. Together they drew more than 25,000 views across Instagram and Facebook. We offer our partner clubs the same: the courts, the athletes, and both names on the posts. <a href="https://www.instagram.com/reel/De4NJ9TNJGR/" target="_blank" rel="noopener">Watch the reel</a>.</p>

      <h2 class="serif h2">The standard for Chicago</h2>
      <p>Monster Smash showed what a tournament can do for wheelchair athletes when the host covers the cost. That is the standard we want the <a href="/chicago-classic">Chicago Classic</a> to meet: free registration, travel and hotels for every athlete. Gifts past the road to the US Open go toward it.</p>`,
    links: [
      ["The Pickle Lodge", "The host club at Lunken Landing, Cincinnati.", "https://thepicklelodge.com/"],
      ["Monster Smash 2026 listing", "The official tournament page, with brackets and results.", "https://pickleballtournaments.com/tournaments/monster-smash-2026"],
      ["The Pickle Lodge on Instagram", "@thepicklelodge", "https://www.instagram.com/thepicklelodge/"],
      ["Monster Smash Facebook group", "Players&rsquo; group for the tournament.", "https://www.facebook.com/groups/441240107886329/"],
      ["Our Monster Smash reel", "Chicago Pickleball: Wheelie Big Dills at The Pickle Lodge, October 24.", "https://www.instagram.com/reel/De4NJ9TNJGR/"],
    ],
    // Frame from our arrival reel (instagram.com/reel/De4NJ9TNJGR, Oct 24
    // 2026), found by Rose: the crew in Adapt To Life shirts at the Lodge.
    photo: { src: "/images/events/monster-smash-2026/crew-lodge.webp", w: 720, h: 1280,
      alt: "Athletes in sport wheelchairs and grey Adapt To Life shirts fist-bump inside The Pickle Lodge",
      caption: "The crew arrives at The Pickle Lodge.",
      credit: ["Adapt To Life on Instagram", "https://www.instagram.com/reel/De4NJ9TNJGR/"] },
    // The results cards we posted, co-branded with The Pickle Lodge.
    gallery: {
      dir: "/images/events/monster-smash-2026",
      w: 720,
      h: 900,
      items: [
        ["0-cover", "Six athletes, six medals: 2 gold, 2 silver, 2 bronze. Monster Smash results card with The Pickle Lodge and Adapt To Life logos."],
        ["2-juan", "Juan Ortiz, gold, singles."],
        ["4-bob", "Bob Swanson, gold, doubles with Kenneth Holman."],
        ["5b-robby-silver", "Robby Wolf, silver, doubles with Ken Carwell."],
        ["6-ken", "Ken Carwell, silver, doubles with Robby Wolf."],
        ["5a-robby-bronze", "Robby Wolf, bronze, singles."],
        ["1-amanda", "Amanda Tworek, bronze, doubles with Kasey Stelter."],
        ["3-brian", "Brian Liss, competed in Cincinnati."],
      ],
    },
    og: { file: "event-monster-smash-2026-v1-card.jpg", alt: "Six medals at Monster Smash. Adapt To Life. A wheelchair pickleball player reaches wide mid-swing." },
    next: { href: "/road", label: "The Road to the US Open" },
  },
};
