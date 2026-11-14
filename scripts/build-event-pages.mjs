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
import { versionHtml } from "./version-assets.mjs";
import { icon } from "./lib/icons.mjs";
import { moreFromBlog } from "./lib/blog-index.mjs";

const CLIP_BTN = '<button type="button" class="clip-btn" data-state="paused" aria-label="Play the video"><svg data-when="playing" class="ix-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="pause" data-style="bold"><path fill="currentColor" d="M200 28h-40a20 20 0 0 0-20 20v160a20 20 0 0 0 20 20h40a20 20 0 0 0 20-20V48a20 20 0 0 0-20-20m-4 176h-32V52h32ZM96 28H56a20 20 0 0 0-20 20v160a20 20 0 0 0 20 20h40a20 20 0 0 0 20-20V48a20 20 0 0 0-20-20m-4 176H60V52h32Z"/></svg><svg data-when="paused" class="ix-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="resume" data-style="bold"><path fill="currentColor" d="M234.49 111.07L90.41 22.94A20 20 0 0 0 60 39.87v176.26a20 20 0 0 0 30.41 16.93l144.08-88.13a19.82 19.82 0 0 0 0-33.86M84 208.85V47.15L216.16 128Z"/></svg></button>';
const CLIPS_JS = versionHtml('<script src="/js/clips.js" defer></script>');
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
  /* Clips in the hero (prototype, Nov 13 2026): the story's own medal moments, fanned like /bread-and-butter. */
  .ev-hero-grid{ display:grid; grid-template-columns:1.1fr 0.9fr; gap:clamp(1.5rem,4vw,3.5rem); align-items:center; }
  @media (max-width:880px){ .ev-hero-grid{ grid-template-columns:1fr; } }
  .ev-trio{ display:grid; grid-template-columns:repeat(var(--n,3),minmax(0,1fr)); gap:clamp(0.55rem,1.4vw,1rem); align-items:start; width:min(100%,460px); justify-self:center; }
  .ev-trio[data-n="1"]{ width:min(100%,280px); }
  .ev-trio .clip{ border-radius:18px; box-shadow:0 34px 60px -26px rgba(0,0,0,0.75), inset 0 0 0 1px rgba(249,247,242,0.08); }
  .ev-trio[data-n="3"] .clip:nth-child(1){ transform:rotate(-4deg); margin-top:clamp(1rem,3vw,2rem); }
  .ev-trio[data-n="3"] .clip:nth-child(3){ transform:rotate(4deg); margin-top:clamp(1rem,3vw,2rem); }
  .ev-trio[data-n="1"] .clip{ transform:rotate(2deg); }
  .ev-trio .clip-cap{ padding:2.2rem 0.65rem 0.7rem; }
  .ev-trio .clip-cap b{ font-size:0.98rem; }
  .ev-trio .clip-btn{ top:0.5rem; right:0.5rem; width:38px; height:38px; }
  @media (max-width:880px){ .ev-trio{ order:-1; margin-bottom:0.6rem; } }
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
  .es-photo{ margin:1.6rem 0 0; max-width:22rem; }
  .es-photo img{ width:100%; height:auto; display:block; border-radius:16px; box-shadow:0 24px 50px -28px rgba(0,0,0,0.55); }
  .es-photo figcaption{ margin-top:0.6rem; font-size:0.88rem; color:var(--muted); }
  .es-photo figcaption a{ font-weight:600; }
  .es-q{ margin:1.5rem 0 0; padding-left:1.2rem; border-left:3px solid var(--orange); font-size:1.15rem; font-weight:600; line-height:1.5; color:var(--ink); }
  .es-q cite{ display:block; margin-top:0.6rem; font-style:normal; font-family:var(--font-label); font-size:0.72rem; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
  .es-list{ margin:1rem 0 0; padding-left:1.2rem; display:grid; gap:0.4rem; color:var(--ink-soft); font-size:1.04rem; }
  .es-people{ list-style:none; padding:0; margin:clamp(2rem,4vw,3rem) 0 0; display:grid; grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr)); gap:clamp(0.8rem,2vw,1.4rem); }
  .es-person{ text-align:center; }
  .es-person img{ width:auto; height:clamp(150px,18vw,210px); object-fit:contain; filter:drop-shadow(0 18px 24px rgba(0,0,0,0.5)); }
  .es-person b{ display:block; margin-top:0.7rem; font-family:var(--font-display); font-weight:900; font-size:1.2rem; color:var(--cream); }
  .es-person .tag{ margin-top:0.45rem; }
  .es-gallery{ list-style:none; padding:0; margin:clamp(1.8rem,3vw,2.4rem) 0 0; display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:clamp(0.7rem,1.6vw,1.1rem); }
  @media (max-width:900px){ .es-gallery{ grid-template-columns:repeat(2,minmax(0,1fr)); } }
  .es-gallery figure{ margin:0; }
  .es-gallery img{ width:100%; height:auto; display:block; border-radius:14px; box-shadow:0 20px 40px -24px rgba(0,0,0,0.7); }
  .es-gallery figcaption{ margin-top:0.55rem; font-size:0.86rem; color:var(--cream-mute); }
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
    image: `${SITE}/images/og/${s.og.file}`,
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
        image: [`${SITE}/images/og/${s.og.file}`, ...(s.photo ? [SITE + s.photo.src] : []), ...(s.gallery ? [`${SITE}${s.gallery.dir}/${s.gallery.items[0][0]}.webp`] : [])],
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
  const og = `${SITE}/images/og/${s.og.file}`;
  const ogAlt = s.og.alt;
  if (!existsSync(join(ROOT, "public/images/og", s.og.file))) throw new Error(`${slug}: card ${s.og.file} missing (run make-og.mjs ${slug})`);

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
    <div class="wrap${s.clips ? " ev-hero-grid" : ""}">
      <div>
      <a class="es-back" href="/events">${BACK} All events</a>
      <p class="ev-kicker"><span>${label}</span><span>${when(d)}</span><span>${esc(where(d))}</span></p>
      <h1 class="serif display">${s.h1}</h1>
      <p class="lead sub">${s.lead}</p>
      ${d.result ? `<div class="es-tags"><span class="tag tag--win">${d.result}</span></div>` : ""}
      </div>
      ${s.clips ? `<div class="ev-trio" data-n="${s.clips.length}" style="--n:${s.clips.length}">${s.clips.map((c) => `<figure class="clip" data-clip><video muted loop playsinline preload="none" poster="${c.poster}" data-src="${c.src}" width="540" height="960" aria-hidden="true"></video>${CLIP_BTN}<figcaption class="clip-cap"><b>${c.b}</b><span>${c.span}</span></figcaption></figure>`).join("")}</div>` : ""}
    </div>
  </section>

  <section class="band">
    <div class="wrap es-grid">
      <article class="es-story">
${s.body.trim().replace(
  "{{photo}}",
  s.photo
    ? `<figure class="es-photo"><img src="${s.photo.src}" alt="${esc(s.photo.alt)}" width="${s.photo.w}" height="${s.photo.h}" loading="lazy" decoding="async"><figcaption>${s.photo.caption} <a href="${s.photo.credit[1]}" target="_blank" rel="noopener">${s.photo.credit[0]}</a></figcaption></figure>`
    : "",
)}
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
${
  s.gallery
    ? `
  <section class="dark band">
    <div class="wrap">
      <span class="eyebrow orange">The results</span>
      <h2 class="serif h2" style="margin-top:0.7rem; color:var(--cream);">The cards we posted.</h2>
      <ul class="es-gallery">
${s.gallery.items
  .map(
    ([f, alt], i) =>
      `        <li><figure><img src="${s.gallery.dir}/${f}.webp" alt="${esc(alt)}" width="${s.gallery.w}" height="${s.gallery.h}" loading="${i < 2 ? "eager" : "lazy"}" decoding="async"><figcaption>${alt.split(". ")[0]}</figcaption></figure></li>`,
  )
  .join("\n")}
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
      <p class="lead sub" style="max-width:46ch; margin-inline:auto;">Every gift goes to the <a class="textlink" href="/hustle-and-heart" style="font:inherit;">Hustle &amp; Heart Fund</a>. Right now, your gift keeps Chicago Pickleball: Wheelie Big Dills on court every week, then on the road to the US Open.</p>
      <div class="actions" style="justify-content:center;">
        <a href="/donate?utm_source=event-story&amp;utm_medium=web&amp;utm_campaign=${slug}" class="btn">Donate ${ARROW}</a>
        <a href="${s.next.href}" class="btn ghost">${s.next.label}</a>
      </div>
    </div>
  </section>

  ${moreFromBlog(`/events/${slug}`)}
</main>

${FOOTER}

${NAV_JS}

${TAIL}
${s.clips ? CLIPS_JS : ""}
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
