#!/usr/bin/env node
// scripts/build-guides.mjs: evergreen sponsor and donor guides from
// data/guides.mjs, one page each at public/<slug>.html.
//
// Each guide carries Article + FAQPage + BreadcrumbList structured data, a
// share card from scripts/make-og.mjs (card name = slug), its numbers up
// top, the article, a short FAQ, and links to related pages.
//
//   node scripts/build-guides.mjs          write the pages
//   node scripts/build-guides.mjs --check  fail if a page is stale
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES, LINKS } from "../data/guides.mjs";
import { icon } from "./lib/icons.mjs";
import { pageShell, metaBlock, esc, text } from "./lib/page-shell.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://adapttolife.org";
const shell = pageShell(ROOT);
const ARROW = `<span class="arrow">${icon("arrow", "bold")}</span>`;

const STYLE = `<style>
  /* Guides (scripts/build-guides.mjs): the event-story layout with the
     numbers up top and a FAQ at the end. */
  .gd-hero{ position:relative; isolation:isolate; overflow:hidden; padding:clamp(4.5rem,11vh,7rem) 0 clamp(3rem,7vh,4.5rem); }
  .gd-hero::after{ content:""; position:absolute; inset:0; z-index:-1; background:radial-gradient(ellipse 55% 70% at 85% 30%, rgba(255,92,57,0.20) 0%, transparent 70%); }
  .gd-kicker{ display:flex; align-items:center; gap:0.9rem; font-family:var(--font-label); font-weight:800; font-size:0.8rem; letter-spacing:0.2em; text-transform:uppercase; color:var(--orange); }
  .gd-kicker::before{ content:""; width:2.2rem; height:2px; background:var(--orange); }
  .gd-hero .display{ margin-top:1.1rem; max-width:16ch; font-size:clamp(2.6rem,5.6vw,4.8rem); line-height:0.98; }
  .gd-hero .sub{ margin-top:1.2rem; max-width:54ch; color:var(--cream-mute); }
  .gd-stats{ list-style:none; padding:0; margin:clamp(2rem,4vw,2.8rem) 0 0; display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:clamp(0.8rem,2vw,1.4rem); }
  @media (max-width:760px){ .gd-stats{ grid-template-columns:1fr; } }
  .gd-stats li{ padding:1.1rem 1.2rem; border:1px solid rgba(247,244,238,0.14); border-radius:16px; }
  .gd-stats b{ display:block; font-family:var(--font-display); font-weight:900; font-size:clamp(1.7rem,3vw,2.3rem); line-height:1; color:var(--orange); letter-spacing:-0.02em; }
  .gd-stats span{ display:block; margin-top:0.45rem; color:var(--cream-mute); font-size:0.95rem; }
  .gd-hero .actions{ margin-top:1.8rem; display:flex; flex-wrap:wrap; gap:0.8rem; }
  .gd-grid{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,18rem); gap:clamp(2rem,5vw,4rem); align-items:start; }
  @media (max-width:880px){ .gd-grid{ grid-template-columns:1fr; } }
  .es-story{ max-width:var(--reading); }
  .es-story h2{ margin-top:2.2rem; }
  .es-story h2:first-child{ margin-top:0; }
  .es-story p{ margin-top:1rem; font-size:1.06rem; line-height:1.65; color:var(--ink-soft); }
  .es-story a{ color:var(--orange-ink); font-weight:700; text-decoration:underline; text-underline-offset:3px; }
  .es-list{ margin:1rem 0 0; padding-left:1.2rem; display:grid; gap:0.5rem; color:var(--ink-soft); font-size:1.04rem; line-height:1.55; }
  .gd-side{ position:sticky; top:6rem; background:var(--paper); border:1px solid var(--hairline); border-radius:18px; padding:clamp(1.2rem,2.4vw,1.6rem); }
  @media (max-width:880px){ .gd-side{ position:static; } }
  .gd-side h2{ font-family:var(--font-label); font-size:0.68rem; font-weight:800; letter-spacing:0.16em; text-transform:uppercase; color:var(--muted); }
  .gd-side ul{ list-style:none; padding:0; margin:0.8rem 0 0; display:grid; gap:0.7rem; }
  .gd-side a{ color:var(--orange-ink); font-weight:700; text-decoration:none; }
  .gd-side a:hover{ text-decoration:underline; }
  .gd-faq{ margin-top:clamp(2rem,3.4vw,2.8rem); max-width:var(--reading); }
  .gd-faq details{ border-bottom:1px solid var(--hairline); padding:1.05rem 0; }
  .gd-faq details:first-child{ border-top:1px solid var(--hairline); }
  .gd-faq summary{ cursor:pointer; font-weight:700; }
  .gd-faq details p{ margin-top:0.6rem; color:var(--ink-soft); }
</style>`;

function page(slug, g) {
  const url = `${SITE}/${slug}`;
  const title = `${g.title} | Adapt To Life`;
  const desc = esc(text(g.description));
  const ogFile = `guide-${slug}-v1-card.jpg`;
  // The card's headline must equal this page's h1 (make-og GATE 0), so a new
  // guide is written once without its card, then the card, then again.
  if (!existsSync(join(ROOT, "public/images/og", ogFile))) {
    if (process.argv.includes("--check")) throw new Error(`${slug}: card ${ogFile} missing`);
    console.warn(`${slug}: card ${ogFile} missing; run node scripts/make-og.mjs ${slug}, then this again`);
  }
  const og = `${SITE}/images/og/${ogFile}`;
  const ogAlt = `${text(g.h1)} Adapt To Life. A wheelchair pickleball athlete on an indoor court.`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": url + "#guide",
        headline: text(g.title),
        description: text(g.description),
        datePublished: g.published,
        dateModified: g.modified || g.published,
        author: { "@id": SITE + "/#org" },
        publisher: { "@id": SITE + "/#org" },
        mainEntityOfPage: url,
        image: og,
        isPartOf: { "@id": SITE + "/#website" },
      },
      {
        "@type": "FAQPage",
        mainEntity: g.faq.map(([q, a]) => ({
          "@type": "Question",
          name: text(q),
          acceptedAnswer: { "@type": "Answer", text: text(a) },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
          { "@type": "ListItem", position: 2, name: text(g.title), item: url },
        ],
      },
    ],
  };
  const cta = g.cta
    ? `<a href="${esc(g.cta.href)}" class="btn ghost">${g.cta.label}</a>`
    : `<a href="/sponsorship#tiers" class="btn ghost">Ways to sponsor</a>`;
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
${shell.head.replace('<link rel="preconnect"', metaBlock({ title: esc(title), desc, url, og, ogAlt, type: "article", published: g.published }) + '\n<link rel="preconnect"')}
<script type="application/ld+json">
${JSON.stringify(ld, null, 2)}
</script>
${STYLE}
</head>
<body>

${shell.header}

<main>
<!-- Generated by scripts/build-guides.mjs from data/guides.mjs. Edit that,
     then run npm run guides. -->
  <section class="gd-hero dark">
    <div class="wrap">
      <p class="gd-kicker">${g.eyebrow}</p>
      <h1 class="serif display">${g.h1}</h1>
      <p class="lead sub">${g.lead}</p>
      <ul class="gd-stats">
${g.stats.map(([n, l]) => `        <li><b>${n}</b><span>${l}</span></li>`).join("\n")}
      </ul>
      <div class="actions">
        <a href="/donate?utm_source=guide&amp;utm_medium=web&amp;utm_campaign=${slug}" class="btn">Donate ${ARROW}</a>
        ${cta}
      </div>
    </div>
  </section>

  <section class="band">
    <div class="wrap gd-grid">
      <article class="es-story">
${g.body.trim()}
      </article>
      <aside class="gd-side" aria-label="Related">
        <h2>Keep reading</h2>
        <ul>
${g.related.map(([h, l]) => `          <li><a href="${h}">${l}</a></li>`).join("\n")}
        </ul>
      </aside>
    </div>
  </section>

  <section class="band tint">
    <div class="wrap">
      <span class="eyebrow">Questions</span>
      <h2 class="serif h2" style="margin-top:0.7rem;">The short answers.</h2>
      <div class="gd-faq">
${g.faq.map(([q, a]) => `        <details><summary>${q}</summary><p>${a}</p></details>`).join("\n")}
      </div>
    </div>
  </section>

  <section class="closing dark band-lg">
    <div class="wrap center">
      <span class="eyebrow orange">Help an athlete play</span>
      <h2 class="serif display">Every gift goes to the fund.</h2>
      <p class="lead sub" style="max-width:46ch; margin-inline:auto;">The <a class="textlink" href="/hustle-and-heart" style="font:inherit;">Hustle &amp; Heart Fund</a> pays for equipment, training and travel for the athletes we support.</p>
      <div class="actions" style="justify-content:center;">
        <a href="/donate?utm_source=guide&amp;utm_medium=web&amp;utm_campaign=${slug}" class="btn">Donate ${ARROW}</a>
        ${cta}
      </div>
    </div>
  </section>
</main>

${shell.footer}

${shell.navJs}

${shell.tail}
</body>
</html>
`;
}

function linksPage() {
  const url = `${SITE}/links`;
  const title = "Links | Adapt To Life";
  const desc = "Stories, athletes and ways to give from Adapt To Life.";
  const og = `${SITE}/images/og/home-v4-color.jpg`;
  // the same alt scripts/wire-og.mjs gives the default card, so it leaves this page alone
  const ogAlt =
    "Your place in adaptive sports. Adapt To Life. A wheelchair pickleball player in glasses turns his paddle up mid-rally on an indoor court.";
  const utm = (path, i) =>
    `${path}${path.includes("?") ? "&amp;" : "?"}utm_source=link-in-bio&amp;utm_medium=social&amp;utm_campaign=bio&amp;utm_content=${i}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#0f0e0d">
<meta name="color-scheme" content="light only">
<meta name="robots" content="noindex, follow">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
${shell.head.replace('<link rel="preconnect"', metaBlock({ title, desc, url, og, ogAlt }) + '\n<link rel="preconnect"')}
<style>
  /* /links (scripts/build-guides.mjs, data/guides.mjs LINKS): the bio link. */
  .lk{ min-height:100vh; padding:clamp(6rem,14vh,8rem) 0 4rem; }
  .lk .wrap{ max-width:34rem; }
  .lk h1{ font-size:clamp(2.2rem,7vw,3rem); line-height:1; }
  .lk-sub{ margin-top:0.8rem; color:var(--cream-mute); }
  .lk-list{ list-style:none; padding:0; margin:1.8rem 0 0; display:grid; gap:0.75rem; }
  .lk-a{ display:block; padding:1rem 1.15rem; border:1px solid rgba(247,244,238,0.16); border-radius:16px; color:var(--cream); text-decoration:none; transition:border-color .25s ease, transform .25s ease; }
  .lk-a:hover{ border-color:var(--orange); transform:translateY(-2px); }
  .lk-a b{ display:flex; justify-content:space-between; gap:0.6rem; font-weight:800; font-size:1.05rem; }
  .lk-a span{ display:block; margin-top:0.3rem; font-size:0.9rem; color:var(--cream-mute); }
  .lk .btn{ margin-top:1.4rem; width:100%; justify-content:center; }
</style>
</head>
<body>

${shell.header}

<main>
<!-- Generated by scripts/build-guides.mjs from data/guides.mjs (LINKS). -->
  <section class="lk dark">
    <div class="wrap">
      <h1 class="serif display">Adapt To <em class="italic" style="color:var(--orange)">Life.</em></h1>
      <p class="lk-sub">We fund and support adaptive athletes in Chicago. Start here.</p>
      <ul class="lk-list">
${LINKS.map(([href, t, sub], i) => `        <li><a class="lk-a" href="${utm(href, i + 1)}"><b>${esc(t).replace(/'/g, "&rsquo;")} ${ARROW}</b><span>${esc(sub).replace(/'/g, "&rsquo;")}</span></a></li>`).join("\n")}
      </ul>
      <a href="${utm("/donate", "donate")}" class="btn">Donate ${ARROW}</a>
    </div>
  </section>
</main>

${shell.footer}

${shell.navJs}

${shell.tail}
</body>
</html>
`;
}

const check = process.argv.includes("--check");
let stale = 0;
for (const [slug, g] of Object.entries(GUIDES)) {
  const html = page(slug, g);
  const file = join(ROOT, "public", `${slug}.html`);
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== html) {
      console.error(`public/${slug}.html is stale: run npm run guides`);
      stale++;
    }
  } else {
    writeFileSync(file, html);
    console.log(`public/${slug}.html`);
  }
}
{
  const html = linksPage();
  const file = join(ROOT, "public/links.html");
  if (check) {
    if (!existsSync(file) || readFileSync(file, "utf8") !== html) {
      console.error("public/links.html is stale: run npm run guides");
      stale++;
    }
  } else {
    writeFileSync(file, html);
    console.log("public/links.html");
  }
}
if (stale) process.exit(1);
if (check) console.log("guides are up to date");
