#!/usr/bin/env node
// scripts/build-blog.mjs: the blog, from data/blog.mjs.
//
// Writes the hub (public/blog.html, served at /blog), one page per post
// (public/blog/<slug>.html), the RSS feed (public/blog/feed.xml) and the map
// for AI search (public/llms.txt). The hub also collects pages that already
// live at their own URL (people pages, event stories, guides, /numbers); their
// titles and dates come from data/event-stories.mjs and data/guides.mjs where
// those own them, so the blog never disagrees with the page it links to.
//
// The look (Alec, Nov 12 2026: "more like a Substack/medium blog ... I want a
// clean ux that make it easy to read. I like Anthropic's blog too"): one
// reading column on the site's beige, a publication header with an email
// sign-up, tabs instead of section blocks, one feed newest first, a real photo
// the same shape on every entry (never icons), one quiet meta line. A post is
// a Medium-style page: big title, the subtitle, a byline with Share, the cover
// photo, "In short", then the story in large type.
//
// Posts are signed by a person, with their face (Alec, Nov 12 2026: "Should
// the author be me? A person? Use my profile picture more? Give more
// authenticity"): the byline, a "Written by" box at the end, the hub's header
// and the structured data all name them.
//
// Each post carries BlogPosting + BreadcrumbList structured data and the "In
// short" summary up top: search engines and AI answers quote the first clear
// answer on a page, so it comes first.
//
//   node scripts/build-blog.mjs          write everything
//   node scripts/build-blog.mjs --check  fail if anything is stale
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { SECTIONS, AUTHORS, EDITOR, LISTED, POSTS } from "../data/blog.mjs";
import { blogIndex, photoName, moreFromBlog, MORE_START, MORE_END } from "./lib/blog-index.mjs";
import { icon } from "./lib/icons.mjs";
import { pageShell, metaBlock, esc, text } from "./lib/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://adapttolife.org";
const check = process.argv.includes("--check");
const shell = pageShell(ROOT);
const ARROW = `<span class="arrow">${icon("arrow", "bold")}</span>`;
const EXT = `<span class="arrow">${icon("external", "bold")}</span>`;
const FEED = "/blog/feed.xml";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
// RFC 822 for RSS, at noon Chicago time so the day never slips.
const rfc822 = (iso) => new Date(`${iso}T18:00:00Z`).toUTCString().replace("GMT", "+0000");
const words = (html) => text(html).split(/\s+/).filter(Boolean).length;
const minutes = (html) => Math.max(1, Math.round(words(html) / 230));

// The main text of a page already on the site, for its reading time.
function pageMain(href) {
  const file = join(ROOT, "public", href.replace(/^\//, "") + ".html");
  if (!existsSync(file)) throw new Error(`blog lists ${href}, but ${file} does not exist`);
  const html = readFileSync(file, "utf8");
  const main = html.match(/<main>([\s\S]*?)<\/main>/);
  if (!main) throw new Error(`${href} has no <main>`);
  return main[1]
    .replace(new RegExp(`${MORE_START}[\\s\\S]*?${MORE_END}`), "") // not the page's own words
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");
}

// ---- photos -----------------------------------------------------------------
// Every entry gets a 480px-wide thumbnail; a post, and whichever entry leads
// the hub, also get 800 and 1200 for a cover (never blown up past the
// source: a width more than 15% over the region is skipped). Names carry a
// hash of the spec, so a new crop is a new file and old files are removed
// (only files this script made live in images/blog).
const IMG_DIR = join(ROOT, "public/images/blog");
const wanted = new Set();
async function photoOf(key, spec, widths) {
  if (!spec?.src) throw new Error(`${key}: every entry needs a photo (data/blog.mjs)`);
  const { src, x, y, w, h } = spec;
  if (Math.abs(w / h - 1.5) > 0.01) throw new Error(`${key}: photo region ${w}x${h} is not 3:2`);
  const out = {};
  for (const width of widths.filter((wd, i) => i === 0 || wd <= w * 1.15)) {
    const name = photoName(key, spec, width);
    wanted.add(name);
    out[width] = `/images/blog/${name}`;
    if (existsSync(join(IMG_DIR, name))) continue;
    if (check) throw new Error(`${key}: ${name} is missing; run npm run blog`);
    mkdirSync(IMG_DIR, { recursive: true });
    const meta = await sharp(join(ROOT, src)).metadata();
    if (x + w > meta.width || y + h > meta.height) throw new Error(`${key}: crop runs outside ${src} (${meta.width}x${meta.height})`);
    await sharp(join(ROOT, src))
      .extract({ left: x, top: y, width: w, height: h })
      .resize(width, Math.round((width * 2) / 3))
      .webp({ quality: 72 })
      .toFile(join(IMG_DIR, name));
    console.log(`public/images/blog/${name}`);
  }
  return { ...out, alt: spec.alt || "" };
}
// A person's face: a square region, cut once to a 160px avatar (sharp at 2x
// for the 72px "Written by" box, and reused for the smaller bylines).
async function avatarOf(key, spec) {
  const { src, x, y, w, h } = spec || {};
  if (!src) throw new Error(`author ${key}: needs a photo (data/blog.mjs AUTHORS)`);
  if (w !== h) throw new Error(`author ${key}: photo region ${w}x${h} is not square`);
  const tag = createHash("sha256").update(JSON.stringify({ src, x, y, w, h, width: 160, q: 80 })).digest("hex").slice(0, 8);
  const name = `author-${key}-160.${tag}.webp`;
  wanted.add(name);
  if (!existsSync(join(IMG_DIR, name))) {
    if (check) throw new Error(`author ${key}: ${name} is missing; run npm run blog`);
    mkdirSync(IMG_DIR, { recursive: true });
    const meta = await sharp(join(ROOT, src)).metadata();
    if (x + w > meta.width || y + h > meta.height) throw new Error(`author ${key}: crop runs outside ${src} (${meta.width}x${meta.height})`);
    await sharp(join(ROOT, src)).extract({ left: x, top: y, width: w, height: h }).resize(160, 160).webp({ quality: 80 }).toFile(join(IMG_DIR, name));
    console.log(`public/images/blog/${name}`);
  }
  return `/images/blog/${name}`;
}
// "Instagram", "LinkedIn": the name of the site a profile link points to.
const profileName = (u) => {
  const host = new URL(u).hostname.replace(/^www\./, "");
  return { "instagram.com": "Instagram", "linkedin.com": "LinkedIn", "x.com": "X", "twitter.com": "X", "facebook.com": "Facebook", "youtube.com": "YouTube", "tiktok.com": "TikTok" }[host] || host;
};
const PEOPLE = {};
for (const [k, a] of Object.entries(AUTHORS)) PEOPLE[k] = { ...a, key: k, avatar: await avatarOf(k, a.photo) };
if (!PEOPLE[EDITOR]) throw new Error(`EDITOR ${EDITOR} is not in AUTHORS`);
const authorOf = (slug, p) => {
  if (!PEOPLE[p.author]) throw new Error(`${slug}: author ${p.author} is not in AUTHORS (data/blog.mjs)`);
  return PEOPLE[p.author];
};

const COVER = [480, 800, 1200];
const largest = (ph) => ph[1200] || ph[800] || ph[480];

// ---- entries: everything the hub lists, newest first ----------------------
// The list itself comes from scripts/lib/blog-index.mjs (shared with the
// "More from the blog" sections); this adds reading times and photos.
async function entries() {
  const out = blogIndex();
  for (const e of out) {
    e.mins = minutes(e.post ? e.post.body : pageMain(e.href));
    e.photo = await photoOf(e.key, e.spec, e.post ? COVER : [480]);
  }
  // The newest entry leads the hub on a cover, post or page.
  if (out[0] && !out[0].post) out[0].photo = await photoOf(out[0].key, out[0].spec, COVER);
  return out;
}

// ---- shared pieces ---------------------------------------------------------
const STYLE = `<style>
  /* The blog (scripts/build-blog.mjs): a reading page, after Substack, Medium
     and Anthropic's blog. One column on the site's beige, a photo the same
     shape on every entry, one quiet meta line, nothing else competing. */
  .bp{ --rule:rgba(59,59,70,0.14); }
  .bp-col{ width:100%; max-width:760px; margin-inline:auto; padding-inline:var(--gutter); }
  .bp-col--read{ max-width:700px; }

  /* The hub's header: who we are, the line, and the sign-up. */
  .bp-head{ padding-block:clamp(2.6rem,7vw,4.6rem) clamp(1.8rem,4vw,2.4rem); }
  .bp-kicker{ font-weight:700; font-size:0.95rem; color:var(--muted); }
  .bp-h1{ margin-top:0.55rem; font-family:var(--font-display); font-weight:800; font-size:clamp(2.35rem,6.2vw,3.7rem); line-height:1.02; letter-spacing:-0.025em; color:var(--ink); max-width:15ch; }
  .bp-h1 em, .bp-post-t em{ font-style:italic; color:var(--orange-display); }
  .bp-lede{ margin-top:1rem; font-size:clamp(1.08rem,2.2vw,1.22rem); line-height:1.55; color:var(--ink-soft); max-width:46ch; }
  .bp-ed{ margin-top:1.3rem; display:flex; align-items:center; gap:0.75rem; }
  .bp-ed p{ min-width:0; }
  .bp-ed a{ display:block; font-weight:700; font-size:1rem; color:var(--ink); text-decoration:none; }
  .bp-ed a:hover{ text-decoration:underline; text-underline-offset:3px; }
  .bp-ed span{ display:block; margin-top:0.1rem; font-size:0.88rem; line-height:1.35; color:var(--muted); }
  .bp-sub{ margin-top:1.4rem; max-width:30rem; }
  .bp-sub-row{ display:flex; gap:0.5rem; }
  .bp-sub input[type=email]{ flex:1; min-width:0; min-height:48px; padding:0 1rem; border-radius:var(--r-lg); border:1px solid rgba(59,59,70,0.24); background:var(--paper); color:var(--ink); font:inherit; font-size:1rem; }
  .bp-sub input[type=email]::placeholder{ color:var(--muted); }
  .bp-sub input[type=email]:focus-visible{ outline:2px solid var(--orange-ink); outline-offset:2px; }
  .bp-sub .btn{ flex:none; }
  .bp-sub .foot-sub-msg{ margin-top:0.6rem; min-height:1.2em; font-size:0.92rem; color:var(--ink) !important; }
  .bp-rss{ margin-top:0.7rem; font-size:0.88rem; color:var(--muted); }
  .bp-rss a{ color:var(--muted); text-decoration:underline; text-underline-offset:3px; }

  /* Tabs: one row of words, an underline on the one you're in. */
  .bp-tabs{ border-bottom:1px solid var(--rule); }
  .bp-tabs-row{ display:flex; gap:1.5rem; overflow-x:auto; scrollbar-width:none; }
  .bp-tabs-row::-webkit-scrollbar{ display:none; }
  /* On a phone the last tab runs off the edge: fade it so it reads as more. */
  @media (max-width:560px){
    .bp-tabs-row{ padding-right:2.5rem; -webkit-mask-image:linear-gradient(to right, black calc(100% - 2.5rem), transparent); mask-image:linear-gradient(to right, black calc(100% - 2.5rem), transparent); }
  }
  .bp-tab{ flex:none; display:inline-flex; align-items:center; min-height:46px; margin-bottom:-1px; border-bottom:2px solid transparent; font-weight:700; font-size:0.98rem; color:var(--muted); text-decoration:none; white-space:nowrap; }
  .bp-tab:hover{ color:var(--ink); }
  .bp-tab[aria-current="true"]{ color:var(--ink); border-bottom-color:var(--ink); }
  .bp-tab:focus-visible{ outline:2px solid var(--orange-ink); outline-offset:2px; }
  .bp-blurb{ padding-top:1.2rem; color:var(--muted); font-size:0.98rem; }

  /* The newest post leads; the rest follow, newest first. */
  .bp-lead{ position:relative; display:grid; gap:1.1rem; padding:clamp(1.6rem,4vw,2.4rem) 0; border-bottom:1px solid var(--rule); }
  @media (min-width:860px){ .bp-lead{ grid-template-columns:minmax(0,1.1fr) minmax(0,1fr); gap:2rem; align-items:center; } }
  .bp-lead-t{ margin-top:0.45rem; font-family:var(--font-display); font-weight:800; font-size:clamp(1.65rem,3.8vw,2.25rem); line-height:1.08; letter-spacing:-0.02em; color:var(--ink); }
  .bp-lead .bp-d{ font-size:1.06rem; -webkit-line-clamp:4; }
  .bp-ph{ display:block; width:100%; height:auto; aspect-ratio:3/2; object-fit:cover; border-radius:var(--r-md); background:var(--hairline); }
  .bp-lead .bp-ph{ border-radius:var(--r-lg); }
  .bp-list{ list-style:none; margin:0; padding:0; }
  .bp-item{ position:relative; display:grid; grid-template-columns:minmax(0,1fr) 112px; gap:1rem; align-items:start; padding:1.35rem 0; border-bottom:1px solid var(--rule); }
  @media (min-width:700px){ .bp-item{ grid-template-columns:minmax(0,1fr) 200px; gap:1.8rem; padding:1.7rem 0; } }
  .bp-item[hidden], .bp-feed[data-filter="all"] .bp-item.is-lead, .bp-feed:not([data-filter="all"]) .bp-lead{ display:none; }
  .bp-t{ font-family:var(--font-display); font-weight:800; font-size:1.18rem; line-height:1.22; letter-spacing:-0.01em; color:var(--ink); }
  @media (min-width:700px){ .bp-t{ font-size:1.32rem; } }
  .bp-t a, .bp-lead-t a{ color:inherit; text-decoration:none; }
  .bp-t a::after, .bp-lead-t a::after{ content:""; position:absolute; inset:0; border-radius:var(--r-md); }
  .bp-t a:focus-visible, .bp-lead-t a:focus-visible{ outline:none; }
  .bp-t a:focus-visible::after, .bp-lead-t a:focus-visible::after{ outline:2px solid var(--orange-ink); outline-offset:4px; }
  .bp-item:hover .bp-t, .bp-lead:hover .bp-lead-t{ color:var(--orange-ink); }
  .bp-d{ margin-top:0.4rem; font-size:0.98rem; line-height:1.5; color:var(--ink-soft); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .bp-meta{ margin-top:0.55rem; font-size:0.86rem; color:var(--muted); }
  .bp-lead .bp-meta:first-child{ margin-top:0; }
  .bp-meta span{ white-space:nowrap; }
  .bp-meta span + span::before{ content:"\\00b7"; margin:0 0.45em; }

  .bp-doors{ padding-block:clamp(2.2rem,5vw,3rem) clamp(3rem,7vw,4.5rem); display:grid; gap:1.6rem; }
  @media (min-width:700px){ .bp-doors{ grid-template-columns:1fr 1fr; gap:2.4rem; } }
  .bp-doors h2{ font-family:var(--font-display); font-weight:800; font-size:1.15rem; color:var(--ink); }
  .bp-doors p{ margin-top:0.35rem; font-size:0.98rem; line-height:1.55; color:var(--ink-soft); }
  .bp-doors a{ display:inline-flex; align-items:center; gap:0.35rem; margin-top:0.6rem; min-height:44px; font-weight:700; color:var(--orange-ink); }
  .bp-doors a .arrow svg{ width:0.85em; height:0.85em; }

  /* A post. */
  .bp-post-head{ padding-top:clamp(2.4rem,6vw,4rem); }
  .bp-crumb{ font-weight:700; font-size:0.95rem; color:var(--muted); }
  .bp-crumb a{ color:inherit; text-decoration:none; }
  .bp-crumb a:hover{ color:var(--ink); text-decoration:underline; text-underline-offset:3px; }
  .bp-crumb a + a::before{ content:"/"; margin:0 0.5em; color:var(--muted); display:inline-block; }
  .bp-crumb a:last-child{ color:var(--orange-ink); }
  .bp-post-t{ margin-top:0.7rem; font-family:var(--font-display); font-weight:800; font-size:clamp(2.35rem,6.6vw,3.5rem); line-height:1.03; letter-spacing:-0.025em; color:var(--ink); }
  .bp-post-sub{ margin-top:0.9rem; font-size:clamp(1.14rem,2.4vw,1.3rem); line-height:1.5; color:var(--muted); }
  .bp-byline{ margin-top:1.5rem; padding:0.9rem 0; border-top:1px solid var(--rule); border-bottom:1px solid var(--rule); display:flex; align-items:center; gap:0.8rem; }
  .bp-avatar{ width:44px; height:44px; border-radius:50%; flex:none; object-fit:cover; background:var(--hairline); box-shadow:0 0 0 1px var(--rule); }
  .bp-by{ display:block; font-weight:700; font-size:0.98rem; color:var(--ink); text-decoration:none; }
  a.bp-by:hover{ text-decoration:underline; text-underline-offset:3px; }
  .bp-byline .bp-meta{ margin-top:0.1rem; }
  .bp-share{ margin-left:auto; display:inline-flex; align-items:center; gap:0.45rem; min-height:44px; padding:0 1rem; border-radius:999px; border:1px solid var(--rule); background:var(--paper); color:var(--ink); font:inherit; font-weight:700; font-size:0.92rem; cursor:pointer; }
  .bp-share .ix-svg{ width:16px; height:16px; }
  .bp-share:hover{ border-color:var(--orange-ink); color:var(--orange-ink); }
  .bp-share:focus-visible{ outline:2px solid var(--orange-ink); outline-offset:2px; }
  .bp-cover{ margin:1.8rem 0 0; }
  .bp-cover .bp-ph{ border-radius:var(--r-lg); }
  .bp-short{ margin-top:2rem; padding:1.1rem 1.3rem 1.2rem; background:var(--paper); border:1px solid var(--rule); border-radius:var(--r-xl); }
  .bp-short h2{ font-family:var(--font-display); font-weight:800; font-size:1rem; color:var(--ink); }
  .bp-short ul{ margin:0.6rem 0 0; padding-left:1.15rem; display:grid; gap:0.5rem; font-size:1rem; line-height:1.55; color:var(--ink-soft); }
  .bp-body h2{ margin-top:2.5rem; font-family:var(--font-display); font-weight:800; font-size:clamp(1.42rem,3vw,1.66rem); line-height:1.18; letter-spacing:-0.015em; color:var(--ink); }
  .bp-body p{ margin-top:1.1rem; font-size:1.125rem; line-height:1.75; color:var(--ink-soft); }
  .bp-body ul{ margin:1.1rem 0 0; padding-left:1.25rem; display:grid; gap:0.7rem; font-size:1.125rem; line-height:1.7; color:var(--ink-soft); }
  @media (min-width:700px){ .bp-body p, .bp-body ul{ font-size:1.1875rem; } }
  .bp-body b{ color:var(--ink); }
  .bp-body a{ color:var(--orange-ink); font-weight:600; text-decoration:underline; text-underline-offset:3px; }
  .bp-stats{ list-style:none; padding:0.2rem 1.2rem; margin:1.6rem 0 0.4rem; background:var(--paper); border:1px solid var(--rule); border-radius:var(--r-xl); }
  .bp-stats li{ display:grid; grid-template-columns:7.4rem minmax(0,1fr); align-items:baseline; gap:0.8rem; padding:0.85rem 0; }
  .bp-stats li + li{ border-top:1px solid var(--rule); }
  .bp-stats b{ font-family:var(--font-display); font-weight:900; font-size:1.6rem; line-height:1; letter-spacing:-0.02em; color:var(--ink); font-variant-numeric:tabular-nums; }
  .bp-stats span{ font-size:0.98rem; color:var(--ink-soft); }
  .bp-sources{ margin-top:2.6rem; padding-top:1.4rem; border-top:1px solid var(--rule); }
  .bp-sources h2{ font-family:var(--font-display); font-weight:800; font-size:1.05rem; color:var(--ink); }
  .bp-sources ul{ list-style:none; padding:0; margin:0.8rem 0 0; display:grid; gap:0.8rem; }
  .bp-sources a{ display:inline-flex; align-items:center; gap:0.35rem; font-weight:700; color:var(--orange-ink); }
  .bp-sources a .arrow svg{ width:0.8em; height:0.8em; }
  .bp-sources span{ display:block; margin-top:0.1rem; font-size:0.94rem; color:var(--muted); }
  .bp-note{ margin-top:1rem; font-size:0.9rem; line-height:1.5; color:var(--muted); }
  .bp-fix{ margin-top:1.6rem; font-size:0.94rem; color:var(--muted); }
  .bp-fix a{ font-weight:700; color:var(--orange-ink); }
  /* "Written by": the writer's face, who they are, then the email sign-up. */
  .bp-author{ margin-top:clamp(2.6rem,6vw,3.4rem); padding:clamp(1.4rem,3vw,1.9rem); background:var(--paper); border:1px solid var(--rule); border-radius:var(--r-xl); }
  .bp-author-top{ display:flex; align-items:center; gap:1rem; }
  .bp-author-ph{ width:72px; height:72px; border-radius:50%; flex:none; object-fit:cover; background:var(--hairline); box-shadow:0 0 0 1px var(--rule); }
  .bp-author-k{ font-size:0.86rem; font-weight:700; color:var(--muted); }
  .bp-author-n{ margin-top:0.1rem; font-family:var(--font-display); font-weight:800; font-size:1.3rem; line-height:1.15; color:var(--ink); }
  .bp-author-n a{ color:inherit; text-decoration:none; }
  .bp-author-n a:hover{ text-decoration:underline; text-underline-offset:3px; }
  .bp-author-r{ margin-top:0.15rem; font-size:0.92rem; line-height:1.35; color:var(--ink-soft); }
  .bp-author-bio{ margin-top:1rem; font-size:1rem; line-height:1.6; color:var(--ink-soft); }
  .bp-author-links{ margin-top:0.7rem; display:flex; flex-wrap:wrap; gap:0.3rem 1.2rem; }
  .bp-author-links a{ display:inline-flex; align-items:center; min-height:44px; font-weight:700; font-size:0.95rem; color:var(--orange-ink); }
  .bp-author-sub{ margin-top:1.3rem; padding-top:1.2rem; border-top:1px solid var(--rule); }
  .bp-author-sub h3{ font-family:var(--font-display); font-weight:800; font-size:1.08rem; color:var(--ink); }
  .bp-author-sub .bp-sub{ margin-top:0.8rem; max-width:none; }
  .bp-more{ padding-block:clamp(2.6rem,6vw,3.4rem) clamp(3rem,7vw,4.5rem); }
  .bp-more-head{ display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:0.4rem 1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--rule); }
  .bp-more-head h2{ font-family:var(--font-display); font-weight:800; font-size:1.3rem; color:var(--ink); }
  .bp-more-head a{ font-weight:700; font-size:0.95rem; color:var(--orange-ink); }
  .bp-more .bp-t{ font-size:1.12rem; }
  @media (min-width:700px){ .bp-more .bp-t{ font-size:1.22rem; } }
</style>`;

function head({ title, desc, url, og, ogAlt, type, published, ld }) {
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
<link rel="alternate" type="application/rss+xml" title="Adapt To Life blog" href="${SITE}${FEED}">
${shell.head.replace('<link rel="preconnect"', metaBlock({ title: esc(title), desc, url, og, ogAlt, type, published }) + '\n<link rel="preconnect"')}
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
${STYLE}
</head>
<body>

${shell.header}
`;
}

const foot = (script = "") => `
${shell.footer}

${shell.navJs}
${script}
${shell.tail}
</body>
</html>
`;

// One quiet line: the section, then the date (or what the person is to us),
// then the reading time.
const meta = (e) =>
  `<p class="bp-meta"><span>${SECTIONS[e.section].name}</span><span>${e.showDate ? `<time datetime="${e.published}">${day(e.published)}</time>` : e.label}</span><span>${e.mins} min read</span></p>`;

const thumb = (e) =>
  `<img class="bp-ph" src="${e.photo[480]}" alt="" width="480" height="320" loading="lazy" decoding="async">`;

const cover = (e, { eager = false, sizes }) => {
  const ws = COVER.filter((w) => e.photo[w]);
  return `<img class="bp-ph" src="${e.photo[800] || e.photo[480]}" srcset="${ws.map((w) => `${e.photo[w]} ${w}w`).join(", ")}" sizes="${sizes}" alt="${esc(e.photo.alt)}" width="1200" height="800"${eager ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async">`;
};

const item = (e, { h = "h2", lead = false } = {}) => `          <li class="bp-item${lead ? " is-lead" : ""}" data-section="${e.section}">
            <div>
              <${h} class="bp-t"><a href="${e.href}">${e.title}</a></${h}>
              <p class="bp-d">${e.dek}</p>
              ${meta(e)}
            </div>
            ${thumb(e)}
          </li>`;

const signup = (source, id) => `<form class="js-subscribe bp-sub" data-source="${source}" novalidate>
        <div class="bp-sub-row">
          <input id="${id}" name="em" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Your email">
          <button class="btn" type="submit">Subscribe</button>
        </div>
        <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <div class="cf-turnstile" data-sitekey="0x4AAAAAADrOxscajsf1zBC2" data-appearance="interaction-only"></div>
        <p class="foot-sub-msg" role="status" aria-live="polite"></p>
      </form>`;

// ---- the hub ---------------------------------------------------------------
function hub(all) {
  const url = `${SITE}/blog`;
  const title = "Blog: Building Adaptive Sports in Public | Adapt To Life";
  const desc = esc(
    "Stories from the adaptive sports community, tournament recaps, guides to what it costs, and the real numbers behind the athletes Adapt To Life supports.",
  );
  const og = `${SITE}/images/og/blog-v1-card.jpg`;
  const ogAlt = "Building adaptive sports, in public. Adapt To Life. A wheelchair pickleball athlete on an indoor court.";
  const lead = all[0];
  const posts = all.filter((e) => e.post);
  const blurbs = Object.fromEntries(Object.entries(SECTIONS).map(([k, s]) => [k, s.blurb]));
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Blog",
        "@id": url + "#blog",
        name: "Adapt To Life blog",
        description: text(desc),
        url,
        inLanguage: "en-US",
        publisher: { "@id": SITE + "/#org" },
        isPartOf: { "@id": SITE + "/#website" },
        ...(posts.length
          ? { blogPost: posts.map((e) => ({ "@type": "BlogPosting", "@id": SITE + e.href + "#post", headline: e.seoTitle, url: SITE + e.href, datePublished: e.published })) }
          : {}),
      },
      {
        "@type": "CollectionPage",
        "@id": url + "#page",
        url,
        name: "Blog",
        isPartOf: { "@id": SITE + "/#website" },
        mainEntity: {
          "@type": "ItemList",
          itemListElement: all.map((e, i) => ({ "@type": "ListItem", position: i + 1, url: SITE + e.href, name: e.seoTitle })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: "Blog", item: url },
        ],
      },
    ],
  };
  // Tabs filter the one list. Without JavaScript everything shows.
  const script = `<script>
  (function(){
    var feed = document.querySelector(".bp-feed");
    if (!feed) return;
    var BLURB = ${JSON.stringify(blurbs)};
    var tabs = [].slice.call(document.querySelectorAll(".bp-tab"));
    var items = [].slice.call(feed.querySelectorAll(".bp-item"));
    var blurb = document.querySelector(".bp-blurb");
    function show(k){
      if (!BLURB[k]) k = "all";
      feed.setAttribute("data-filter", k);
      tabs.forEach(function(t){ t.setAttribute("aria-current", t.getAttribute("data-tab") === k ? "true" : "false"); });
      items.forEach(function(i){ i.hidden = k !== "all" && i.getAttribute("data-section") !== k; });
      blurb.textContent = k === "all" ? "" : BLURB[k];
      blurb.hidden = k === "all";
    }
    tabs.forEach(function(t){
      t.addEventListener("click", function(e){
        e.preventDefault();
        var k = t.getAttribute("data-tab");
        show(k);
        history.replaceState(null, "", k === "all" ? location.pathname : "#" + k);
      });
    });
    window.addEventListener("hashchange", function(){ show(location.hash.slice(1) || "all"); });
    show(location.hash.slice(1) || "all");
  })();
</script>`;
  return (
    head({ title, desc, url, og, ogAlt, type: "website", ld }) +
    `
<main>
<!-- Generated by scripts/build-blog.mjs from data/blog.mjs. Edit that, then
     run npm run blog. -->
<div class="bp">
  <header class="bp-col bp-head">
    <p class="bp-kicker">The Adapt To Life blog</p>
    <h1 class="bp-h1">Building adaptive sports, <em>in public.</em></h1>
    <p class="bp-lede">Stories from our community, and what we learn funding athletes on court, on the road and behind the scenes.</p>
    <div class="bp-ed">
      <img class="bp-avatar" src="${PEOPLE[EDITOR].avatar}" alt="" width="44" height="44">
      <p><a href="${PEOPLE[EDITOR].url}">${PEOPLE[EDITOR].name}</a><span>${PEOPLE[EDITOR].role}</span></p>
    </div>
    ${signup("blog", "bpEm")}
  </header>

  <nav class="bp-col" aria-label="Blog sections">
    <div class="bp-tabs">
      <div class="bp-tabs-row">
        <a class="bp-tab" href="/blog" data-tab="all" aria-current="true">All</a>
${Object.entries(SECTIONS)
  .map(([k, s]) => `        <a class="bp-tab" href="#${k}" data-tab="${k}" aria-current="false">${s.name}</a>`)
  .join("\n")}
      </div>
    </div>
    <p class="bp-blurb" aria-live="polite" hidden></p>
  </nav>

  <section class="bp-col bp-feed" data-filter="all" aria-label="Posts">
${
  lead
    ? `    <article class="bp-lead" data-section="${lead.section}">
      ${cover(lead, { eager: true, sizes: "(min-width: 860px) 390px, 100vw" })}
      <div>
        ${meta(lead)}
        <h2 class="bp-lead-t"><a href="${lead.href}">${lead.title}</a></h2>
        <p class="bp-d">${lead.dek}</p>
      </div>
    </article>
`
    : ""
}    <ul class="bp-list">
${all.map((e) => item(e, { lead: e === lead })).join("\n")}
    </ul>
  </section>

  <section class="bp-col bp-doors" aria-label="More from us">
    <div>
      <h2>Have a story we should tell?</h2>
      <p>Athletes, coaches, clubs and volunteers: tell us what you&rsquo;re building. We ask before we share a word.</p>
      <a href="/contact?rsn=story">Tell us your story ${ARROW}</a>
    </div>
    <div>
      <h2>Looking for a place to play?</h2>
      <p>Adaptive Sports Near Me is our free directory of adaptive sports programs, grants and events. It&rsquo;s in beta now: beta testers are using it before it opens to everyone.</p>
      <a href="/adaptive-sports-near-me">See the directory ${ARROW}</a>
    </div>
  </section>
</div>
</main>
` +
    foot(script)
  );
}

// ---- a post ----------------------------------------------------------------
function post(e, all) {
  const p = e.post;
  const url = SITE + e.href;
  const title = `${p.title} | Adapt To Life`;
  const desc = esc(text(p.description));
  const og = `${SITE}/images/og/${p.og.file}`;
  if (!existsSync(join(ROOT, "public/images/og", p.og.file))) {
    if (check) throw new Error(`${e.slug}: card ${p.og.file} missing`);
    console.warn(`${e.slug}: card ${p.og.file} missing; run node scripts/make-og.mjs blog-${e.slug}, then this again`);
  }
  const a = authorOf(e.slug, p);
  // The same Person as on their bio page (@id), so search engines and AI
  // answers tie the post to a real, named writer.
  const author = {
    "@type": "Person",
    "@id": SITE + a.url,
    name: a.name,
    url: SITE + a.url,
    jobTitle: a.jobTitle,
    image: SITE + a.avatar,
    worksFor: { "@id": SITE + "/#org" },
    ...(a.sameAs?.length ? { sameAs: a.sameAs } : {}),
  };
  const others = all.filter((x) => x.href !== e.href);
  const related = [...others.filter((x) => x.section === e.section), ...others.filter((x) => x.section !== e.section)].slice(0, 3);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BlogPosting",
        "@id": url + "#post",
        headline: text(p.title),
        description: text(p.description),
        abstract: p.keyPoints.map(text).join(" "),
        datePublished: p.published,
        dateModified: p.modified || p.published,
        author,
        publisher: { "@id": SITE + "/#org" },
        mainEntityOfPage: url,
        image: [og, SITE + largest(e.photo)],
        articleSection: SECTIONS[p.section].name,
        wordCount: words(p.body),
        inLanguage: "en-US",
        isPartOf: { "@id": SITE + "/blog#blog" },
        ...(p.sources?.length ? { citation: p.sources.map(([, , h]) => (h.startsWith("/") ? SITE + h : h)) } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: "Blog", item: SITE + "/blog" },
          { "@type": "ListItem", position: 3, name: text(p.title), item: url },
        ],
      },
    ],
  };
  const stats = p.stats
    ? `<ul class="bp-stats">
${p.stats.map(([n, l]) => `        <li><b>${n}</b><span>${l}</span></li>`).join("\n")}
      </ul>`
    : "";
  // Share: the phone's share sheet, or copy the link. Shared links carry
  // utm_source=share so a gift from one can be traced back to the post.
  const script = `<script>
  (function(){
    var b = document.querySelector(".bp-share");
    if (!b) return;
    var label = b.querySelector("span");
    b.addEventListener("click", function(){
      var link = location.origin + location.pathname + "?utm_source=share&utm_medium=web&utm_campaign=blog-${e.slug}";
      var data = { title: document.title.replace(/ \\| Adapt To Life$/, ""), url: link };
      if (navigator.share) { navigator.share(data).catch(function(){}); return; }
      if (navigator.clipboard) navigator.clipboard.writeText(link).then(function(){
        label.textContent = "Link copied";
        setTimeout(function(){ label.textContent = "Share"; }, 2000);
      });
    });
  })();
</script>`;
  return (
    head({ title, desc, url, og, ogAlt: p.og.alt, type: "article", published: p.published, ld }) +
    `
<main>
<!-- Generated by scripts/build-blog.mjs from data/blog.mjs. Edit that, then
     run npm run blog. -->
<div class="bp">
  <article class="bp-col bp-col--read">
    <header class="bp-post-head">
      <p class="bp-crumb"><a href="/blog">Blog</a><a href="/blog#${p.section}">${SECTIONS[p.section].name}</a></p>
      <h1 class="bp-post-t">${p.h1}</h1>
      <p class="bp-post-sub">${p.lead}</p>
      <div class="bp-byline">
        <img class="bp-avatar" src="${a.avatar}" alt="" width="44" height="44">
        <div>
          <a class="bp-by" href="${a.url}">${a.name}</a>
          <p class="bp-meta"><span><time datetime="${p.published}">${day(p.published)}</time></span><span>${e.mins} min read</span></p>
        </div>
        <button class="bp-share" type="button">${icon("share")} <span>Share</span></button>
      </div>
    </header>
    <figure class="bp-cover">${cover(e, { eager: true, sizes: "(min-width: 760px) 652px, 100vw" })}</figure>
    <aside class="bp-short" aria-label="In short">
      <h2>In short</h2>
      <ul>
${p.keyPoints.map((k) => `        <li>${k}</li>`).join("\n")}
      </ul>
    </aside>
    <div class="bp-body">
${p.body.trim().replace("{{stats}}", stats)}
    </div>
${
  p.sources?.length
    ? `    <section class="bp-sources">
      <h2>Sources</h2>
      <ul>
${p.sources
  .map(([n, note, h]) =>
    h.startsWith("/")
      ? `        <li><a href="${h}">${n} ${ARROW}</a><span>${note}</span></li>`
      : `        <li><a href="${esc(h)}" target="_blank" rel="noopener">${n} ${EXT}</a><span>${note}</span></li>`,
  )
  .join("\n")}
      </ul>${p.sourceNote ? `\n      <p class="bp-note">${p.sourceNote}</p>` : ""}
    </section>
`
    : ""
}    <p class="bp-fix">Spot a mistake? <a href="/contact?rsn=correction&amp;page=${e.href}">Tell us</a>.</p>
    <section class="bp-author" id="author" aria-labelledby="authorName">
      <div class="bp-author-top">
        <img class="bp-author-ph" src="${a.avatar}" alt="" width="72" height="72" loading="lazy" decoding="async">
        <div>
          <p class="bp-author-k">Written by</p>
          <h2 class="bp-author-n" id="authorName"><a href="${a.url}">${a.name}</a></h2>
          <p class="bp-author-r">${a.role}</p>
        </div>
      </div>
      <p class="bp-author-bio">${a.bio}</p>${
        a.sameAs?.length
          ? `\n      <p class="bp-author-links">${a.sameAs.map((u) => `<a href="${esc(u)}" target="_blank" rel="me noopener">${profileName(u)}</a>`).join("")}</p>`
          : ""
      }
      <div class="bp-author-sub">
        <h3>Get the next post by email</h3>
        ${signup(`blog-${e.slug}`, "bpEm")}
        <p class="bp-rss">Or follow with <a href="${FEED}">RSS</a>.</p>
      </div>
    </section>
  </article>

  <section class="bp-col bp-col--read bp-more">
    <div class="bp-more-head">
      <h2>Keep reading</h2>
      <a href="/blog">All posts</a>
    </div>
    <ul class="bp-list">
${related.map((r) => item(r, { h: "h3" })).join("\n")}
    </ul>
  </section>
</div>
</main>
` +
    foot(script)
  );
}

// ---- the feed and the AI map -----------------------------------------------
const xml = (s) => text(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function feed(all) {
  const newest = all.reduce((m, e) => (e.modified > m ? e.modified : m), "0000-00-00");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Adapt To Life blog</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}${FEED}" rel="self" type="application/rss+xml"/>
    <description>Stories from the adaptive sports community, tournament recaps, guides, and the numbers behind the athletes Adapt To Life supports.</description>
    <language>en-us</language>
    <lastBuildDate>${rfc822(newest)}</lastBuildDate>
${all
  .map(
    (e) => `    <item>
      <title>${xml(e.seoTitle)}</title>
      <link>${SITE}${e.href}</link>
      <guid isPermaLink="true">${SITE}${e.href}</guid>
      <pubDate>${rfc822(e.published)}</pubDate>
      <dc:creator>${xml(e.post ? authorOf(e.slug, e.post).name : "Adapt To Life")}</dc:creator>
      <category>${xml(SECTIONS[e.section].name)}</category>
      <description>${xml(e.description)}</description>
    </item>`,
  )
  .join("\n")}
  </channel>
</rss>
`;
}

// llms.txt (llmstxt.org): a plain map an AI system can read in one request.
// The key pages are fixed here; the blog section follows data/blog.mjs.
const KEY_PAGES = [
  ["/", "Adapt To Life", "Chicago adaptive sports nonprofit. We expand access to adaptive sports so athletes can find their place."],
  ["/hustle-and-heart", "Hustle & Heart Fund", "Our athlete fund: equipment, training and travel for adaptive athletes. It works through ambassadors, and any athlete can apply."],
  ["/pickleball", "Chicago Pickleball: Wheelie Big Dills", "The wheelchair pickleball crew Adapt To Life funds and supports."],
  ["/road", "The Road to the US Open", "A season of tournament travel for the crew, ending at the US Open, where players are picked by lottery."],
  ["/numbers", "The numbers", "Our goal for the year ahead and what each part pays for."],
  ["/donate", "Donate", "Give to the Hustle & Heart Fund. Donations are tax deductible to the extent allowed by law."],
  ["/sponsorship", "Partners", "Our partner clubs and nonprofits, and how sponsorship works."],
  ["/ambassadors", "Ambassadors", "Athletes, coaches and community connectors who tell the fund where it will do the most."],
  ["/events", "Events", "Tournaments and fundraisers, upcoming and past."],
  ["/apply", "Apply for support", "How athletes apply to the Hustle & Heart Fund."],
  ["/about", "About", "The people behind Adapt To Life, and why."],
  ["/adaptive-sports-near-me", "Adaptive Sports Near Me", "Our free directory of adaptive sports programs, grants and events, at adaptivesportsnearme.com. It is in beta now: beta testers are using it before it opens to everyone."],
];
function llms(all) {
  return `# Adapt To Life

> Adapt To Life is a Chicago-area adaptive sports nonprofit, a 501(c)(3) (EIN 41-3213344). We expand access to adaptive sports so athletes can find their place. We fund and support athletes and the programs they play in; clubs and partners host and run the play. Adaptive Sports Near Me (https://adaptivesportsnearme.com), our free directory for finding a place to play, is in beta now: beta testers are using it before it opens to everyone.

Our blog shares what it takes to build adaptive sports, in public: the people, the tournaments, what things cost, and what we learn.

## Key pages

${KEY_PAGES.map(([h, n, d]) => `- [${n}](${SITE}${h === "/" ? "/" : h}): ${d}`).join("\n")}

## Blog

- [Blog](${SITE}/blog): Stories, tournament recaps, guides and the numbers. RSS: ${SITE}${FEED}
${Object.entries(SECTIONS)
  .map(
    ([k, s]) =>
      `\n### ${s.name}\n\n` +
      all
        .filter((e) => e.section === k)
        .map((e) => `- [${text(e.seoTitle)}](${SITE}${e.href}): ${text(e.dek)}`)
        .join("\n"),
  )
  .join("\n")}
`;
}

// ---- write or check ----------------------------------------------------------
const all = await entries();
const outputs = [
  ["public/blog.html", hub(all)],
  ...all.filter((e) => e.post).map((e) => [`public/blog/${e.slug}.html`, post(e, all)]),
  ["public/blog/feed.xml", feed(all)],
  ["public/llms.txt", llms(all)],
];
let stale = 0;
if (!check) mkdirSync(join(ROOT, "public/blog"), { recursive: true });
for (const [rel, body] of outputs) {
  const file = join(ROOT, rel);
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== body) {
      console.error(`${rel} is stale: run npm run blog`);
      stale++;
    }
  } else {
    writeFileSync(file, body);
    console.log(rel);
  }
}
// "More from the blog" at the end of every page the blog collects. Event
// stories and guides write it themselves (npm run events, npm run guides); the
// other pages keep it between the markers, refreshed here.
for (const e of all.filter((x) => !x.post)) {
  const rel = `public${e.href}.html`;
  const html = readFileSync(join(ROOT, rel), "utf8");
  const at = html.indexOf(MORE_START);
  const end = html.indexOf(MORE_END);
  if (at < 0 || end < at) throw new Error(`${rel}: add ${MORE_START} and ${MORE_END} just before </main>; the blog keeps "More from the blog" there`);
  const next = html.slice(0, at) + moreFromBlog(e.href) + html.slice(end + MORE_END.length);
  if (next === html) continue;
  if (check) {
    console.error(`${rel}: "More from the blog" is stale: run npm run blog`);
    stale++;
  } else {
    writeFileSync(join(ROOT, rel), next);
    console.log(`${rel} (more from the blog)`);
  }
}
// Post pages whose post is gone (removed from POSTS): delete them, so an
// unpublished post never lingers at its old address.
const pagesWanted = new Set(outputs.map(([rel]) => rel));
if (existsSync(join(ROOT, "public/blog"))) {
  for (const f of readdirSync(join(ROOT, "public/blog"))) {
    const rel = `public/blog/${f}`;
    if (!f.endsWith(".html") || pagesWanted.has(rel)) continue;
    if (check) {
      console.error(`${rel} has no post in data/blog.mjs: run npm run blog`);
      stale++;
    } else {
      unlinkSync(join(ROOT, rel));
      console.log(`removed ${rel}`);
    }
  }
}
// Photos this script made that nothing uses any more.
if (existsSync(IMG_DIR)) {
  for (const f of readdirSync(IMG_DIR)) {
    if (wanted.has(f)) continue;
    if (check) {
      console.error(`public/images/blog/${f} is no longer used: run npm run blog`);
      stale++;
    } else {
      unlinkSync(join(IMG_DIR, f));
      console.log(`removed public/images/blog/${f}`);
    }
  }
}
if (stale) process.exit(1);
if (check) console.log("blog is up to date");
