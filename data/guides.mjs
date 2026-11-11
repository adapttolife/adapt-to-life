// data/guides.mjs: evergreen pages for what sponsors and donors search for.
//
// Alec, Nov 8 2026: "Pages aimed at sponsors and donors, such as sponsoring
// adaptive athletes in Chicago, the cost of a sport wheelchair ($4,000 to
// $6,000, not covered by insurance), and corporate matching. Athlete
// searches still go to Adaptive Sports Near Me."
//
// scripts/build-guides.mjs writes public/<slug>.html from each entry.
// Every number here is one the site already states, and the source page is
// named beside it, so a guide never says something the rest of the site
// doesn't. The cost numbers are checked by test/one_cta.test.js's real
// numbers rule too. Rules: ATL funds and supports and never runs programs;
// every money button says Donate; no GLASA; athletes looking for help go to
// adaptivesportsnearme.com.

const ASNM = "https://adaptivesportsnearme.com";

export const GUIDES = {
  "sport-wheelchair-cost": {
    title: "How Much Does a Sport Wheelchair Cost? $4,000 to $6,000",
    description:
      "A sport wheelchair runs $4,000 to $6,000, and insurance doesn't cover it. What athletes need beyond an everyday chair, and how donors close the gap.",
    eyebrow: "Guide for donors",
    h1: "What a sport wheelchair <em class=\"italic\" style=\"color:var(--orange)\">really costs.</em>",
    lead:
      "A sport wheelchair runs $4,000 to $6,000, and insurance doesn&rsquo;t cover it. For most athletes, that price is the first thing between them and the game.",
    published: "2026-11-08",
    stats: [
      ["$4,000&ndash;$6,000", "for one sport wheelchair"], // /donate, /pickleball
      ["$0", "from insurance toward it"], // /donate: "insurance doesn't cover it"
      ["$129", "a month for a club membership to train"], // /sponsorship
    ],
    body: `
      <h2 class="serif h2">Why an everyday wheelchair isn&rsquo;t enough</h2>
      <p>An everyday wheelchair is built for getting through a day. A sport chair is built for the game. Juan Ortiz, a Wheelchair Softball Hall of Famer, plays pickleball in his PER4MAX basketball chair, which was built for contact. His next one will be built for pickleball, because the game needs a lighter chair that turns quick. <a href="/juan">Read Juan&rsquo;s story</a>.</p>

      <h2 class="serif h2">Why insurance doesn&rsquo;t pay</h2>
      <p>Insurance doesn&rsquo;t cover a sport chair. The athlete or their family pays the full $4,000 to $6,000, or does without and doesn&rsquo;t play.</p>

      <h2 class="serif h2">The chair is the first cost, not the last</h2>
      <p>Once an athlete has a chair, they still need somewhere to play and a way to get there. Around Chicago, that looks like this:</p>
      <ul class="es-list">
        <li><b>Court time:</b> about $15 a night for a drop-in. $225 covers up to 15 athletes for a night.</li>
        <li><b>Training:</b> $129 a month for a club membership, or $1,548 a year, for athletes who train to compete.</li>
        <li><b>Tournaments:</b> entry fees and travel. Getting one athlete to the US Open has cost about $3,500 the last couple of years.</li>
      </ul>
      <p>See how the numbers add up for the athletes we support on <a href="/numbers">the numbers</a>.</p>

      <h2 class="serif h2">How donors close the gap</h2>
      <p>Gifts to the <a href="/hustle-and-heart">Hustle &amp; Heart Fund</a> pay for equipment, training and travel. We raise for one athlete at a time and pay the vendor directly. Ambassadors like Juan tell the fund where it will do the most.</p>
      <p>Businesses can sponsor a night of court time, a year of training, or a whole program. <a href="/sponsor-adaptive-athletes">See how to sponsor an athlete</a>.</p>

      <h2 class="serif h2">If you&rsquo;re an athlete looking for a chair</h2>
      <p>Grants and programs that help athletes get equipment are listed on <a href="${ASNM}/" target="_blank" rel="noopener">Adaptive Sports Near Me</a>, our free directory. You can also <a href="/apply">apply to the Hustle &amp; Heart Fund</a>.</p>`,
    faq: [
      ["How much does a sport wheelchair cost?", "A sport wheelchair runs $4,000 to $6,000."],
      ["Does insurance cover a sport wheelchair?", "No. Insurance doesn&rsquo;t cover a sport wheelchair, so athletes and families pay the full cost or rely on donors and grants."],
      ["Can I donate toward a sport wheelchair?", "Yes. Gifts to the Hustle &amp; Heart Fund pay for equipment, training and travel for adaptive athletes. We raise for one athlete at a time and pay the vendor directly."],
      ["Is my gift tax deductible?", "Adapt To Life is a recognized 501(c)(3) nonprofit, EIN 41-3213344. Gifts are tax deductible to the extent allowed by law."],
    ],
    related: [
      ["/sponsor-adaptive-athletes", "Sponsor adaptive athletes in Chicago"],
      ["/corporate-matching", "Double your gift with an employer match"],
      ["/hustle-and-heart", "The Hustle &amp; Heart Fund"],
    ],
    image: "/images/og/donate-v3-athlete.jpg",
  },

  "sponsor-adaptive-athletes": {
    title: "Sponsor Adaptive Athletes in Chicago",
    description:
      "Sponsor a wheelchair pickleball athlete in Chicago: a night of court time for $225, a year of training for $1,548, or a whole program. What it pays for and what you get back.",
    eyebrow: "Guide for sponsors",
    h1: "Sponsor an athlete <em class=\"italic\" style=\"color:var(--orange)\">in Chicago.</em>",
    lead:
      "Sponsor court time, training or a tournament for wheelchair pickleball athletes in the Chicago area. Every dollar goes to the Hustle &amp; Heart Fund, and we pay the clubs and vendors directly.",
    published: "2026-11-08",
    stats: [
      ["$225", "a night of court time for up to 15 athletes"], // /sponsorship
      ["$1,548", "a year of training for one athlete"], // /sponsorship
      ["334,000", "views in 90 days across Instagram and Facebook"], // /sponsorship
    ],
    body: `
      <h2 class="serif h2">Who you&rsquo;d be sponsoring</h2>
      <p><a href="/pickleball">Chicago Pickleball: Wheelie Big Dills</a> is a crew of wheelchair pickleball players in the Chicago area, and Adapt To Life is proud to fund and support them. Brian Liss has won silver and bronze at the US Open, and Robby Wolf has played the last three. At Monster Smash in October 2026 they brought home <a href="/events/monster-smash-2026">six medals</a>. Their first ambassador, <a href="/juan">Juan Ortiz</a>, asked the APP Tour for its <a href="/events/app-vlasic-classic-2026">first wheelchair division</a>, and got it.</p>

      <h2 class="serif h2">What a sponsorship pays for</h2>
      <ul class="es-list">
        <li><b>Sponsor a night, $225:</b> court time for up to 15 athletes, at $15 each.</li>
        <li><b>Sponsor an athlete, $1,548 a year:</b> one athlete&rsquo;s unlimited club membership, $129 a month, so they can train to compete.</li>
        <li><b>Train to Compete, presented by you, $15,480 a year:</b> ten athletes on unlimited memberships, with your name on the program.</li>
      </ul>
      <p>Businesses can also choose a partnership level, from Teammate at $500 to Champion at $25,000, including naming the <a href="/chicago-classic">Chicago Classic</a>. <a href="/sponsorship#tiers">See every level</a>.</p>

      <h2 class="serif h2">Where the athletes play</h2>
      <p>The athletes play at clubs we partner with: <a href="/ace">ACE Pickleball Club</a> in Des Plaines, <a href="/brickhouse">Brick House Pickleball</a> in Lake Forest and <a href="/picklr">The Picklr</a> in Mount Prospect. The clubs host the play. Where we fund court time, we pay the club&rsquo;s regular rates. We call it the Open Court Model.</p>

      <h2 class="serif h2">What you get back</h2>
      <ul class="es-list">
        <li><b>Your name, seen by new people:</b> about 334,000 views in 90 days on Instagram and Facebook, and more than 9 in 10 Instagram views come from people who don&rsquo;t follow us yet.</li>
        <li><b>Content:</b> video and athlete spotlights with your name on them. Our Monster Smash spotlights drew more than 38,000 views.</li>
        <li><b>Proof, every month:</b> a short recap with attendance, views and results.</li>
      </ul>

      <h2 class="serif h2">How to start</h2>
      <p>Tell us what you&rsquo;d like to sponsor and we&rsquo;ll shape it with you. Individuals can give any amount to the fund with the Donate button below.</p>`,
    faq: [
      ["How much does it cost to sponsor an adaptive athlete?", "A night of court time for up to 15 athletes is $225. One athlete&rsquo;s club membership for a year, so they can train to compete, is $1,548. Partnership levels for businesses run from $500 to $25,000."],
      ["Where does sponsorship money go?", "Every sponsorship goes to the Hustle &amp; Heart Fund. Adapt To Life pays the clubs and vendors directly."],
      ["Is a sponsorship tax deductible?", "Adapt To Life is a recognized 501(c)(3) nonprofit, EIN 41-3213344. Sponsorships may be tax deductible to the extent allowed by law. Some levels include benefits, so check with your tax advisor."],
      ["Do you run the program?", "No. The clubs host the play and the crew brings the players. Adapt To Life funds court time, memberships, equipment and travel."],
    ],
    cta: { href: "/contact?rsn=sponsor", label: "Talk to us about sponsoring" },
    related: [
      ["/sponsorship", "Partners and sponsorship levels"],
      ["/sport-wheelchair-cost", "What a sport wheelchair costs"],
      ["/corporate-matching", "Double your gift with an employer match"],
    ],
    image: "/images/og/pickleball-v5-name.jpg",
  },

  "corporate-matching": {
    title: "Corporate Matching Gifts: Double Your Gift to Adapt To Life",
    description:
      "Many employers match gifts to 501(c)(3) nonprofits. How to get your gift to Adapt To Life matched, with our legal name, EIN and IRS letter.",
    eyebrow: "Guide for donors",
    h1: "Double your gift with <em class=\"italic\" style=\"color:var(--orange)\">an employer match.</em>",
    lead:
      "Many employers match their employees&rsquo; gifts to 501(c)(3) nonprofits. If yours does, the same gift to adaptive athletes can go twice as far.",
    published: "2026-11-08",
    stats: [
      ["Adapt To Life NFP", "our legal name"], // /donate
      ["41-3213344", "our EIN"], // /donate, footer
      ["501(c)(3)", "recognized by the IRS"], // /donate determination letter
    ],
    body: `
      <h2 class="serif h2">How it works</h2>
      <ol class="es-list">
        <li><b>Give.</b> <a href="/donate">Donate</a> to Adapt To Life any way you like.</li>
        <li><b>Ask whether your employer matches.</b> Check with benefits or HR, or search your company&rsquo;s giving portal. Most people don&rsquo;t know their employer has a program.</li>
        <li><b>Submit the match.</b> Your employer will ask for our legal name, Adapt To Life NFP, and our EIN, 41-3213344. Some also ask for our <a href="/docs/adapt-to-life-501c3-determination-letter.pdf">IRS determination letter</a>.</li>
        <li><b>Tell us it&rsquo;s done.</b> Email <a href="mailto:hello@adapttolife.org">hello@adapttolife.org</a> so we can watch for it and confirm it when your employer asks.</li>
      </ol>

      <h2 class="serif h2">Where a matched gift goes</h2>
      <p>Matched gifts go to the <a href="/hustle-and-heart">Hustle &amp; Heart Fund</a>, which pays for equipment, training and travel for adaptive athletes. A sport wheelchair alone runs <a href="/sport-wheelchair-cost">$4,000 to $6,000</a>, and insurance doesn&rsquo;t cover it.</p>

      <h2 class="serif h2">Stock, donor-advised funds and other gifts</h2>
      <p>You can also give stock or give through a donor-advised fund. Talk to us before you arrange it, so we can confirm the process for your gift.</p>

      <h2 class="serif h2">Help your whole office give</h2>
      <p>If your employer doesn&rsquo;t list us yet, you can help get Adapt To Life into its program. That is a volunteer role of its own: <a href="/volunteer/corporate-matching-champion">corporate matching champion</a>. Businesses that want to go further can <a href="/sponsor-adaptive-athletes">sponsor athletes</a> directly.</p>`,
    faq: [
      ["What is Adapt To Life&rsquo;s EIN?", "41-3213344. Our legal name is Adapt To Life NFP."],
      ["Is Adapt To Life a 501(c)(3)?", "Yes. Adapt To Life is a recognized 501(c)(3) nonprofit organization. Our IRS determination letter is on our donate page."],
      ["Does my employer match gifts to Adapt To Life?", "Many employers match gifts to 501(c)(3) nonprofits. Ask your benefits or HR team, or check your company&rsquo;s giving portal."],
      ["Can I give stock or through a donor-advised fund?", "Yes. Email hello@adapttolife.org before you arrange it so we can confirm the process."],
    ],
    related: [
      ["/donate", "Donate"],
      ["/promise", "How giving works"],
      ["/sport-wheelchair-cost", "What a sport wheelchair costs"],
    ],
    image: "/images/og/donate-v3-athlete.jpg",
  },
};

// /links moved to data/links.mjs and scripts/lib/links-page.mjs (Nov 8 2026).
