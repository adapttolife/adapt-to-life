#!/usr/bin/env node
// scripts/build-event-pages.mjs: one story page per event, /events/<slug>.
//
// Reads data/event-stories.mjs (the story, written by hand) and the event's
// row in public/data/campaigns.json (dates, venue, host, result), and writes
// public/events/<slug>.html with the site's shared header and footer, taken
// from public/events.html so every page stays in step.
//
// Each page carries SportsEvent + Article + BreadcrumbList structured data,
// and links out to the host, venue, listing and anything else that connects
// the event to us. Run by `npm run events` with build-events.mjs.
//
//   node scripts/build-event-pages.mjs          write the pages
//   node scripts/build-event-pages.mjs --check  fail if any page is stale
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { STORIES } from "../data/event-stories.mjs";
import { icon } from "./lib/icons.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://adapttolife.org";
const data = JSON.parse(readFileSync(join(ROOT, "public/data/campaigns.json"), "utf8"));
const shell = readFileSync(join(ROOT, "public/events.html"), "utf8");
const pick = (re) => {
  const m = shell.match(re);
  if (!m) throw new Error(`events.html is missing ${re}`);
  return m[0];
};
const HEADER = pick(/<header class="nav[\s\S]*?<\/header>/);
const FOOTER = pick(/<footer class="footer">[\s\S]*?<\/footer>/);
const NAV_JS = shell.slice(shell.indexOf("</footer>")).match(/<script>[\s\S]*?<\/script>/)[0];
const HEAD = pick(/<link rel="icon"[\s\S]*?<script src="\/js\/attribution\.js[^>]*><\/script>/).replace(
  /<meta property="og:[\s\S]*?<meta name="twitter:image:alt"[^>]*>\n/,
  "",
);
const TAIL = pick(/<script src="\/js\/subscribe\.js[^>]*><\/script>\s*<script src="\/js\/turnstile-lazy\.js[^>]*><\/script>/);

const ARROW = `<span class="arrow">${icon("arrow", "bold")}</span>`;
const EXT = `<span class="arrow">${icon("external", "bold")}</span>`;
const BACK = icon("back", "bold");
const esc = (s) => String(s).replace(/&(?![a-z]+;|#\d+;)/g, "&amp;").replace(/"/g, "&quot;");
const text = (s) =>
  String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function when(d) {
  const a = (d.starts_at || d.opens).split("-").map(Number);
  const b = (d.ends_at || d.closes || d.starts_at || d.opens).split("-").map(Number);
  if (a.join() === b.join()) return `${MONTHS[a[1] - 1]} ${a[2]}, ${a[0]}`;
  if (a[0] === b[0] && a[1] === b[1]) return `${MONTHS[a[1] - 1]} ${a[2]}&ndash;${b[2]}, ${a[0]}`;
  return `${MONTHS[a[1] - 1]} ${a[2]}&ndash;${MONTHS[b[1] - 1]} ${b[2]}, ${b[0]}`;
}
const where = (d) => [d.city, d.state].filter(Boolean).join(", ");
const mapUrl = (d) =>
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent([d.venue, d.address || where(d)].filter(Boolean).join(" "));

const STYLE = `<style>
  /* Event story pages (scripts/build-event-pages.mjs). Built on /events: the
     same hero, then a facts card, the story as an article, and the links. */
  .ev-hero{ position:relative; isolation:isolate; overflow:hidden; padding:clamp(4.5rem,11vh,7rem) 0 clamp(3rem,7vh,4.5rem); }
  .ev-hero::after{ content:""; position:absolute; inset:0; z-index:-1; background:radial-gradient(ellipse 55% 70% at 85% 30%, rgba(255,92,57,0.20) 0%, transparent 70%); }
  .es-back{ display:inline-flex; align-items:center; gap:0.4rem; font-family:var(--font-label); font-weight:800; font-size:0.72rem; letter-spacing:0.16em; text-transform:uppercase; color:var(--cream-mute); text-decoration:none; }
  .es-back:hover{ color:var(--orange); }
  .es-back svg{ width:1em; height:1em; }
  .ev-kicker{ margin-top:1.6rem; display:flex; flex-wrap:wrap; align-items:center; gap:0.5rem 0.9rem; font-family:var(--font-label); font-weight:800; font-size:0.8rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--orange); }
  .ev-hero .display{ margin-top:1.1rem; max-width:16ch; font-size:clamp(2.6rem,5.6vw,4.8rem); line-height:0.98; }
  .ev-hero .sub{ margin-top:1.2rem; max-width:52ch; color:var(--cream-mute); }
  .es-tags{ margin-top:1.3rem; display:flex; flex-wrap:wrap; gap:0.5rem; }
  .es-grid{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,20rem); gap:clamp(2rem,5vw,4rem); align-items:start; }
  @media (max-width:880px){ .es-grid{ grid-template-columns:1fr; } .es-facts{ order:-1; } }
  .es-facts{ position:sticky; top:6rem; background:var(--paper); border:1px solid var(--hairline); border-radius:18px; padding:clamp(1.2rem,2.4vw,1.6rem); }
  @media (max-width:880px){ .es-facts{ position:static; } }
  .es-facts dl{ margin:0; display:grid; gap:0.9rem; }
  .es-facts dt{ font-family:var(--font-label); font-size:0.66rem; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
  .es-facts dd{ margin:0.25rem 0 0; font-size:0.95rem; color:var(--ink); }
  .es-facts a{ color:var(--orange-ink); font-weight:700; }
  .es-story{ max-width:var(--reading); }
  .es-story h2{ margin-top:2.2rem; }
  .es-story h2:first-child{ margin-top:0; }
  .es-story p{ margin-top:1rem; font-size:1.06rem; line-height:1.65; color:var(--ink-soft); }
  .es-story a{ color:var(--orange-ink); font-weight:700; text-decoration:underline; text-underline-offset:3px; }
  .es-q{ margin:1.5rem 0 0; padding-left:1.2rem; border-left:3px solid var(--orange); font-size:1.15rem; font-weight:600; line-height:1.5; color:var(--ink); }
  .es-q cite{ display:block; margin-top:0.6rem; font-style:normal; font-family:var(--font-label); font-size:0.72rem; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
  .es-list{ margin:1rem 0 0; padding-left:1.2rem; display:grid; gap:0.4rem; color:var(--ink-soft); font-size:1.04rem; }
  .es-people{ list-style:none; padding:0; margin:clamp(2rem,4vw,3rem) 0 0; display:grid; grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr)); gap:clamp(0.8rem,2vw,1.4rem); }
  .es-person{ text-align:center; }
  .es-person img{ width:auto; height:clamp(150px,18vw,210px); object-fit:contain; filter:drop-shadow(0 18px 24px rgba(0,0,0,0.5)); }
  .es-person b{ display:block; margin-top:0.7rem; font-family:var(--font-display); font-weight:900; font-size:1.2rem; color:var(--cream); }
  .es-person .tag{ margin-top:0.45rem; }
  .es-links{ list-style:none; padding:0; margin:clamp(1.8rem,3vw,2.4rem) 0 0; display:grid; grid-template-columns:repeat(auto-fill,minmax(16rem,1fr)); gap:clamp(0.8rem,2vw,1.2rem); }
  .es-links > li{ display:flex; }
  .es-link{ width:100%; display:flex; flex-direction:column; padding:1.1rem 1.2rem; background:var(--paper); border:1px solid var(--hairline); border-radius:16px; color:inherit; text-decoration:none; transition:transform .3s ease, border-color .3s ease; }
  .es-link:hover{ transform:translateY(-3px); border-color:rgba(255,92,57,0.45); }
  .es-link b{ font-weight:800; display:flex; align-items:center; gap:0.35rem; }
  .es-link b .arrow svg{ width:0.85em; height:0.85em; color:var(--orange-ink); }
  .es-link span{ margin-top:0.35rem; font-size:0.9rem; color:var(--ink-soft); }
</style>`;

async function personImg(slug) {
  const src = `/images/pickleball/${slug}.webp`;
  const file = join(ROOT, "public", src);
  if (!existsSync(file)) throw new Error(`no cutout for ${slug}`);
  const m = await sharp(file).metadata();
  return { src, w: m.width, h: m.height };
}
const NAMES = { juan: "Juan", bob: "Bob", robby: "Robby", ken: "Ken", amanda: "Amanda", brian: "Brian" };

async function page(slug, s) {
  const d = data.drives.find((x) => x.slug === slug);
  if (!d) throw new Error(`${slug}: no row in campaigns.json`);
  const url = `${SITE}/events/${slug}`;
  const title = `${s.title} | Adapt To Life`;
  const label = d.type === "tournament" ? "Tournament" : d.type === "fundraiser" ? "Fundraiser" : "Event";
  const facts = [
    ["When", when(d)],
    ["Where", [d.venue, d.address || where(d)].filter(Boolean).join("<br>") + `<br><a href="${esc(mapUrl(d))}" target="_blank" rel="noopener">Directions</a>`],
    ...(d.host ? [["Host", s.links[0] ? `<a href="${esc(s.links[0][2])}" target="_blank" rel="noopener">${d.host}</a>` : d.host]] : []),
    ...s.facts,
    ...(d.result ? [["Result", d.result]] : []),
  ];
  const people = await Promise.all(
    (s.people || []).map(async (p) => {
      const img = await personImg(p);
      const medal = s.medals?.[p];
      return `        <li class="es-person"><img src="${img.src}" alt="${NAMES[p]} in a sport wheelchair with a paddle" width="${img.w}" height="${img.h}" loading="lazy" decoding="async"><b>${NAMES[p]}</b>${
        medal ? `<span class="tag tag--win">${medal}</span>` : ""
      }</li>`;
    }),
  );

  const event = {
    "@type": d.type === "tournament" ? "SportsEvent" : "Event",
    "@id": url + "#event",
    name: d.name,
    description: text(s.description),
    startDate: d.starts_at || d.opens,
    endDate: d.ends_at || d.closes || d.starts_at || d.opens,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    location: {
      "@type": "Place",
      name: d.venue || d.city,
      hasMap: mapUrl(d),
      address: {
        "@type": "PostalAddress",
        ...(d.address ? { streetAddress: d.address.split(", ")[0] } : {}),
        ...(d.address && d.address.match(/\b\d{5}\b/) ? { postalCode: d.address.match(/\b\d{5}\b/)[0] } : {}),
        addressLocality: d.city,
        addressRegion: d.state,
        addressCountry: "US",
      },
    },
    organizer: d.host ? { "@type": "Organization", name: d.host, url: s.links[0]?.[2] } : { "@id": SITE + "/#org" },
    ...(d.relationship === "we_compete"
      ? { performer: { "@type": "SportsTeam", name: "Chicago Pickleball: Wheelie Big Dills", url: SITE + "/pickleball" } }
      : {}),
    ...(d.type === "tournament" ? { sport: "Wheelchair pickleball" } : {}),
    sameAs: s.links.map((l) => l[2]).filter((u) => !/instagram\.com\/reel|facebook\.com\/groups/.test(u)),
  };
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      event,
      {
        "@type": "Article",
        "@id": url + "#story",
        headline: text(s.title),
        description: text(s.description),
        datePublished: s.published,
        dateModified: s.modified || s.published,
        author: { "@id": SITE + "/#org" },
        publisher: { "@id": SITE + "/#org" },
        mainEntityOfPage: url,
        about: { "@id": url + "#event" },
        image: `${SITE}/images/og/juan-v2-serve.jpg`,
        ...([...(s.people || []), ...(s.mentions || [])].includes("juan") ? { mentions: { "@id": SITE + "/juan#person" } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: "Events", item: SITE + "/events" },
          { "@type": "ListItem", position: 3, name: d.name, item: url },
        ],
      },
    ],
  };
  const desc = esc(text(s.description));
  const og = `${SITE}/images/og/juan-v2-serve.jpg`;
  const ogAlt = "Juan Ortiz. Adapt To Life. Juan, a wheelchair pickleball player in glasses, tosses the ball to serve from his sport wheelchair.";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0f0e0d">
<meta name="color-scheme" content="light only">
<title>${esc(title)}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
${HEAD.replace(
  '<link rel="preconnect"',
  `<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${ogAlt}">
<meta property="og:url" content="${url}">
<meta property="article:published_time" content="${s.published}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${og}">
<meta name="twitter:image:alt" content="${ogAlt}">
<link rel="preconnect"`,
)}
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
${STYLE}
</head>
<body>

${HEADER}

<main>
<!-- Generated by scripts/build-event-pages.mjs from data/event-stories.mjs and
     public/data/campaigns.json. Edit those, then run npm run events. -->
  <section class="ev-hero dark">
    <div class="wrap">
      <a class="es-back" href="/events">${BACK} All events</a>
      <p class="ev-kicker"><span>${label}</span><span>${when(d)}</span><span>${esc(where(d))}</span></p>
      <h1 class="serif display">${s.h1}</h1>
      <p class="lead sub">${s.lead}</p>
      ${d.result ? `<div class="es-tags"><span class="tag tag--win">${d.result}</span></div>` : ""}
    </div>
  </section>

  <section class="band">
    <div class="wrap es-grid">
      <article class="es-story">
${s.body.trim()}
      </article>
      <aside class="es-facts" aria-label="Event details">
        <dl>
${facts.map(([k, v]) => `          <div><dt>${k}</dt><dd>${v}</dd></div>`).join("\n")}
        </dl>
      </aside>
    </div>
  </section>
${
  people.length
    ? `
  <section class="dark band">
    <div class="wrap">
      <span class="eyebrow orange">Athletes we support</span>
      <h2 class="serif h2" style="margin-top:0.7rem; color:var(--cream);">${s.medals ? "Who brought them home." : "On court."}</h2>
      <ul class="es-people">
${people.join("\n")}
      </ul>
      <p style="margin-top:1.6rem;"><a class="textlink" href="/pickleball" style="color:var(--orange);">Meet Chicago Pickleball: Wheelie Big Dills ${ARROW}</a></p>
    </div>
  </section>
`
    : ""
}
  <section class="band tint">
    <div class="wrap">
      <span class="eyebrow">Around the web</span>
      <h2 class="serif h2" style="margin-top:0.7rem;">The host, the listing, and more.</h2>
      <ul class="es-links">
${s.links
  .map(
    ([name, note, href]) =>
      `        <li><a class="es-link" href="${esc(href)}" target="_blank" rel="noopener"><b>${name} ${EXT}</b><span>${note}</span></a></li>`,
  )
  .join("\n")}
      </ul>
    </div>
  </section>

  <section class="closing dark band-lg">
    <div class="wrap center">
      <span class="eyebrow orange">What&rsquo;s next</span>
      <h2 class="serif display">Help the next one happen.</h2>
      <p class="lead sub" style="max-width:46ch; margin-inline:auto;">Every gift goes to the <a class="textlink" href="/hustle-and-heart" style="font:inherit;">Hustle &amp; Heart Fund</a>: court time, equipment and travel for the athletes we support.</p>
      <div class="actions" style="justify-content:center;">
        <a href="/donate?utm_source=event-story&amp;utm_medium=web&amp;utm_campaign=${slug}" class="btn">Donate ${ARROW}</a>
        <a href="${s.next.href}" class="btn ghost">${s.next.label}</a>
      </div>
    </div>
  </section>
</main>

${FOOTER}

${NAV_JS}

${TAIL}
</body>
</html>
`;
}

const check = process.argv.includes("--check");
const outDir = join(ROOT, "public/events");
if (!check) mkdirSync(outDir, { recursive: true });
let stale = 0;
for (const [slug, s] of Object.entries(STORIES)) {
  const html = await page(slug, s);
  const file = join(outDir, `${slug}.html`);
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== html) {
      console.error(`public/events/${slug}.html is stale: run npm run events`);
      stale++;
    }
  } else {
    writeFileSync(file, html);
    console.log(`public/events/${slug}.html`);
  }
}
if (stale) process.exit(1);
if (check) console.log("event pages are up to date");
