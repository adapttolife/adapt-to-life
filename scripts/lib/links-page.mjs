// scripts/lib/links-page.mjs: renders public/links.html, the bio link page.
// Called by scripts/build-guides.mjs (npm run guides). Data: data/links.mjs.
//
// One column, built like a story: the court the visitor just watched, the
// people, the medals, one tap to give, one field to follow along. The gift
// lines come straight from the site's picker (public/js/campaigns.js GIFTS),
// so /links never says a gift does something the picker does not.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HERO, CREW, MEDALS, STORIES, FROM } from "../../data/links.mjs";

const SITE = "https://adapttolife.org";

function pickerGifts(root) {
  const js = readFileSync(join(root, "public/js/campaigns.js"), "utf8");
  const block = (freq) => {
    const i = js.indexOf(`${freq}: [`);
    const part = js.slice(i, js.indexOf("]", i));
    return [...part.matchAll(/a: (\d+),\s*t: "([^"]+)"/g)].map((m) => ({ a: +m[1], t: m[2] }));
  };
  const def = Number(js.match(/GIFT_DEFAULT = \{ monthly: (\d+)/)[1]);
  const onceDef = Number(js.match(/GIFT_DEFAULT = \{ monthly: \d+, once: (\d+)/)[1]);
  return { monthly: block("monthly"), once: block("once"), def, onceDef };
}

export function linksPage({ root, shell, metaBlock, esc, icon }) {
  const url = `${SITE}/links`;
  const title = "Links | Adapt To Life";
  const desc = "Meet the wheelchair athletes Adapt To Life funds in Chicago: the crew, the medals, the road to the US Open, and how to help.";
  const og = `${SITE}/images/og/home-v4-color.jpg`;
  // the same alt scripts/wire-og.mjs gives the default card, so it leaves this page alone
  const ogAlt =
    "Your place in adaptive sports. Adapt To Life. A wheelchair pickleball player in glasses turns his paddle up mid-rally on an indoor court.";
  // Every link carries the bio tags; the page script renames the campaign to
  // bio-<from> when a post linked /links?from=<key>.
  const utm = (path, content) => {
    const [base, hash] = path.split("#");
    const q = `utm_source=link-in-bio&amp;utm_medium=social&amp;utm_campaign=bio&amp;utm_content=${content}`;
    return `${base}${base.includes("?") ? "&amp;" : "?"}${q}${hash ? "#" + hash : ""}`;
  };
  const shareUrl = (path, slug) => {
    const [base, hash] = path.split("#");
    return `${SITE}${base}?utm_source=share&amp;utm_medium=referral&amp;utm_campaign=links-share&amp;utm_content=${slug}${hash ? "#" + hash : ""}`;
  };
  const ARROW = icon("arrow", "bold");
  const g = pickerGifts(root);
  const once = g.once.filter((x) => [15, 60, 225].includes(x.a));
  const money = (n) => "$" + n.toLocaleString("en-US");
  const giftBtn = (x, freq, on) =>
    `<button type="button" role="radio" aria-checked="${on}" data-a="${x.a}" data-freq="${freq}" data-t="${esc(x.t)}" aria-label="${money(x.a)}${freq === "monthly" ? " a month" : " one time"}">${money(x.a)}</button>`;
  const defMonthly = g.monthly.find((x) => x.a === g.def) || g.monthly[0];
  const donateHref = (a, freq) => utm(`/donate?amount=${a}${freq === "monthly" ? "&amp;frequency=monthly" : ""}`, "give");

  const crewCards = CREW.map(
    (c, i) => `        <li class="lx-card">
          <a class="lx-card-media" href="${utm(c.href, "crew-" + c.slug)}" tabindex="-1" aria-hidden="true"><img src="${c.img}" alt="" width="${c.w}" height="${c.h}" ${i < 2 ? 'fetchpriority="low"' : 'loading="lazy"'} decoding="async"></a>
          <div class="lx-card-body">
            <h3 class="lx-card-name">${esc(c.name)}${c.tag ? ` <span class="lx-tag">${esc(c.tag)}</span>` : ""}</h3>
            <p class="lx-card-fact">${esc(c.fact)}</p>
            <div class="lx-card-row">
              <a class="lx-card-go" href="${utm(c.href, "crew-" + c.slug)}">${esc(c.cta)} ${ARROW}</a>
              <button type="button" class="lx-share" data-share-url="${shareUrl(c.share, c.slug)}" data-share-title="${esc(c.name)} | Adapt To Life" data-share-text="Meet ${esc(c.name)}, one of the wheelchair pickleball athletes Adapt To Life funds in Chicago.">${icon("share", "bold")}<span class="lx-share-label">Share</span></button>
            </div>
          </div>
        </li>`,
  ).join("\n");

  const medalCards = MEDALS.map(
    ([file, alt], i) =>
      `        <li><a href="${utm("/events/monster-smash-2026", "medal-" + file)}"><img src="/images/events/monster-smash-2026/${file}.webp" alt="${esc(alt)}" width="720" height="900" ${i < 1 ? "" : 'loading="lazy" '}decoding="async"></a></li>`,
  ).join("\n");

  const storyRows = STORIES.map(
    ([href, t, sub, thumb], i) =>
      `        <li><a class="lx-story" href="${utm(href, "story-" + (i + 1))}"><img src="${thumb}" alt="" width="240" height="240" loading="lazy" decoding="async"><span class="lx-story-text"><b>${esc(t)}</b><span>${esc(sub)}</span></span>${ARROW}</a></li>`,
  ).join("\n");

  const partners = [
    ["/chicago-adaptive-sports", "/images/partners/cas-mark.png", 240, 193, "Chicago Adaptive Sports", "is-cas"],
    ["/amp", "/images/partners/amp-logo-white.png", 340, 159, "AMP Adaptive Sports", ""],
    ["/ace", "/images/ace/ace-logo-white.png", 760, 105, "ACE Pickleball Club", ""],
    ["/brickhouse", "/images/brickhouse/brick-house-logo-orange-black-reverse.svg", 240, 171, "Brick House Pickleball", "is-bh"],
    ["/picklr", "/images/partners/picklr-wordmark-white.png", 460, 107, "The Picklr", ""],
  ]
    .map(
      ([href, src, w, h, name, cls]) =>
        `        <li><a class="${cls}" href="${utm(href, "partner")}"><img src="${src}" alt="${esc(name)}" width="${w}" height="${h}" loading="lazy" decoding="async"></a></li>`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#0f0e0d">
<meta name="color-scheme" content="light only">
<meta name="robots" content="noindex, follow">
<title>${title}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${url}">
${shell.head.replace('<link rel="preconnect"', metaBlock({ title, desc, url, og, ogAlt }) + '\n<link rel="preconnect"')}
<link rel="preload" as="image" href="${HERO.poster}">
<style>
  /* /links (scripts/lib/links-page.mjs, data/links.mjs): the bio link page.
     One phone-width column; on a wide screen the court sits blurred behind it. */
  body{ background:var(--photo-black); }
  .lx-back{ display:none; }
  @media (min-width:720px){
    .lx-back{ display:block; position:fixed; inset:0; z-index:0; background:var(--photo-black) url(${HERO.poster}) center/cover no-repeat; filter:blur(38px) brightness(0.32) saturate(0.8); transform:scale(1.15); }
  }
  .lx{ position:relative; z-index:1; max-width:30rem; margin:0 auto; background:var(--night); color:var(--cream); overflow:hidden; }
  @media (min-width:720px){ .lx{ margin-top:1.5rem; margin-bottom:3rem; border-radius:24px; box-shadow:0 30px 80px -30px rgba(0,0,0,0.8); } }

  /* the court they just watched */
  /* the nav is sticky (in flow), so the court fills what is left of the screen */
  .lx-hero{ position:relative; height:calc(100svh - 4.45rem); min-height:30rem; max-height:52rem; background:var(--photo-black) url(${HERO.poster}) center/cover no-repeat; overflow:hidden; }
  @media (min-width:720px){ .lx-hero{ height:46rem; } }
  .lx-vid{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .lx-shade{ position:absolute; inset:0; background:linear-gradient(180deg, rgba(15,14,13,0.55) 0%, rgba(15,14,13,0) 26%, rgba(15,14,13,0) 52%, rgba(15,14,13,0.9) 82%, var(--night) 100%); }
  .lx-hero-copy{ position:absolute; left:0; right:0; bottom:0; padding:0 1.25rem 1.6rem; }
  .lx-kicker{ font-weight:800; font-size:0.78rem; letter-spacing:0.14em; text-transform:uppercase; color:var(--orange); }
  .lx-h1{ margin-top:0.55rem; font-family:var(--font-display); font-weight:900; font-size:clamp(2.2rem,10vw,3rem); line-height:0.98; letter-spacing:-0.035em; color:var(--cream); text-wrap:balance; }
  .lx-down{ display:inline-flex; align-items:center; gap:0.5rem; margin-top:1.1rem; font-weight:700; color:var(--cream); text-decoration:none; padding:0.7rem 1.15rem; border-radius:999px; border:1px solid rgba(249,247,242,0.3); background:rgba(15,14,13,0.35); backdrop-filter:blur(6px); }
  .lx-down .ix-svg{ width:1.05em; height:1.05em; transform:rotate(90deg); }
  .lx-down:hover{ border-color:var(--orange); }
  .lx-vidbtn{ position:absolute; top:0.9rem; right:0.9rem; width:44px; height:44px; display:grid; place-items:center; border-radius:999px; border:1px solid rgba(249,247,242,0.28); background:rgba(15,14,13,0.45); color:var(--cream); cursor:pointer; }
  .lx-vidbtn .ix-svg{ width:18px; height:18px; }
  .lx-vidbtn [data-when]{ display:none; }
  .lx-vidbtn[data-state="playing"] [data-when="playing"], .lx-vidbtn[data-state="paused"] [data-when="paused"]{ display:block; }

  /* sections */
  .lx-sec{ padding:2.4rem 1.25rem 0.4rem; }
  .lx-sec h2{ color:var(--cream); font-family:var(--font-display); font-weight:900; font-size:clamp(1.6rem,7vw,2rem); line-height:1.02; letter-spacing:-0.03em; text-wrap:balance; }
  .lx-sec > p{ margin-top:0.5rem; color:var(--cream-mute); line-height:1.45; }
  .lx-from-note{ display:none; margin:0 0 0.6rem; font-size:0.78rem; font-weight:800; letter-spacing:0.12em; text-transform:uppercase; color:var(--orange); }
  .lx-sec.is-from .lx-from-note{ display:block; }
  .lx-more{ display:inline-flex; align-items:center; gap:0.45rem; margin-top:1rem; font-weight:700; color:var(--cream); text-decoration:none; border-bottom:1.5px solid var(--orange); padding-bottom:2px; }
  .lx-more .ix-svg{ width:1em; height:1em; }

  /* swipe rails */
  .lx-rail{ list-style:none; margin:1.1rem -1.25rem 0; padding:0 1.25rem 0.6rem; display:grid; grid-auto-flow:column; gap:0.75rem; overflow-x:auto; scroll-snap-type:x mandatory; scroll-padding:0 1.25rem; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  .lx-rail::-webkit-scrollbar{ display:none; }
  .lx-rail > li{ scroll-snap-align:start; }

  /* crew cards */
  .lx-crew .lx-rail{ grid-auto-columns:78%; }
  .lx-card{ display:flex; flex-direction:column; border-radius:20px; overflow:hidden; background:var(--night-raised); border:1px solid rgba(249,247,242,0.08); }
  .lx-card-media{ display:block; aspect-ratio:4/4.2; background:radial-gradient(120% 90% at 50% 100%, rgba(255,92,57,0.28) 0%, rgba(255,92,57,0) 60%), var(--photo-black); }
  .lx-card-media img{ width:100%; height:100%; object-fit:contain; object-position:50% 100%; }
  .lx-card-body{ padding:0.95rem 1rem 1rem; display:flex; flex-direction:column; gap:0.45rem; flex:1; }
  .lx-card-name{ font-family:var(--font-display); font-weight:900; font-size:1.5rem; line-height:1; letter-spacing:-0.02em; display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap; }
  .lx-tag{ font-family:var(--font-body); font-size:0.7rem; font-weight:800; letter-spacing:0.1em; text-transform:uppercase; color:var(--orange); border:1px solid rgba(255,92,57,0.45); border-radius:999px; padding:0.15rem 0.5rem; }
  .lx-card-fact{ color:var(--cream-mute); font-size:0.95rem; line-height:1.4; flex:1; }
  .lx-card-row{ display:flex; align-items:center; justify-content:space-between; gap:0.6rem; margin-top:0.35rem; }
  .lx-card-go{ display:inline-flex; align-items:center; gap:0.4rem; font-weight:700; font-size:0.92rem; color:var(--cream); text-decoration:none; }
  .lx-card-go .ix-svg{ width:1em; height:1em; }
  .lx-share{ display:inline-flex; align-items:center; gap:0.4rem; min-height:44px; padding:0 0.85rem; border-radius:999px; border:1px solid rgba(249,247,242,0.22); background:transparent; color:var(--cream); font:inherit; font-weight:700; font-size:0.88rem; cursor:pointer; }
  .lx-share .ix-svg{ width:1.05em; height:1.05em; }
  .lx-share:hover, .lx-share.is-done{ border-color:var(--orange); }

  /* medal cards: the posts they already saw */
  .lx-medals .lx-rail{ grid-auto-columns:62%; }
  .lx-medals .lx-rail img{ display:block; width:100%; height:auto; border-radius:16px; }

  /* give */
  .lx-give{ padding-bottom:0.4rem; }
  .lx-giftcard{ margin-top:1.1rem; padding:1.1rem; border-radius:20px; background:var(--photo-black); border:1px solid rgba(249,247,242,0.1); }
  /* the crew at The Pickle Lodge (a frame from the Monster Smash arrival reel),
     cropped to a short strip so the picker stays close */
  .lx-crewpic{ display:block; width:100%; height:auto; aspect-ratio:2/1; max-height:10rem; object-fit:cover; object-position:50% 48%; border-radius:14px; }
  .lx-road{ margin-top:0.55rem; font-size:0.9rem; color:var(--cream-mute); }
  .lx-seg{ display:inline-flex; margin-top:1rem; padding:3px; border-radius:999px; background:rgba(249,247,242,0.06); }
  .lx-seg button{ min-height:40px; padding:0 1rem; border:0; border-radius:999px; background:transparent; color:var(--cream-mute); font:inherit; font-weight:700; cursor:pointer; }
  .lx-seg button[aria-checked="true"]{ background:var(--night-raised); color:var(--cream); }
  .lx-amts{ display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.5rem; margin-top:0.75rem; }
  .lx-amts[hidden]{ display:none; }
  .lx-amts button{ min-height:52px; border-radius:14px; border:1px solid rgba(249,247,242,0.16); background:transparent; color:var(--cream); font:inherit; font-weight:800; font-size:1.1rem; cursor:pointer; font-variant-numeric:tabular-nums; }
  .lx-amts button[aria-checked="true"]{ border-color:var(--orange); background:rgba(255,92,57,0.12); }
  .lx-impact{ margin-top:0.75rem; min-height:2.8em; color:var(--cream); font-weight:600; line-height:1.4; }
  .lx-giftcard .btn{ width:100%; justify-content:center; margin-top:0.5rem; }
  .lx .btn .ix-svg{ width:1.05em; height:1.05em; flex:0 0 auto; }
  .lx .btn.ghost{ color:var(--cream); border-color:rgba(249,247,242,0.3); }
  .lx-road a{ color:var(--cream); text-decoration:underline; text-decoration-color:var(--orange); text-underline-offset:3px; }
  .lx-trust{ margin-top:0.7rem; text-align:center; font-size:0.8rem; color:var(--cream-faint); }
  .lx-trust a{ color:var(--cream-mute); }

  /* follow along */
  .lx-follow form{ margin-top:1rem; }
  .lx-follow .lx-sub-row{ display:flex; gap:0.5rem; }
  .lx-follow input[type="email"]{ flex:1; min-width:0; min-height:52px; padding:0 1rem; border-radius:14px; border:1px solid rgba(249,247,242,0.2); background:var(--photo-black); color:var(--cream); font:inherit; font-size:1rem; }
  .lx-follow input[type="email"]::placeholder{ color:var(--cream-faint); }
  .lx-follow .lx-sub-btn{ min-height:52px; padding:0 1.1rem; border-radius:14px; border:0; background:var(--cream); color:var(--night); font:inherit; font-weight:800; cursor:pointer; }
  .lx-follow .foot-sub-msg{ margin-top:0.6rem; color:var(--cream-mute); font-size:0.9rem; }
  .lx-ig{ display:inline-flex; align-items:center; gap:0.5rem; margin-top:1rem; color:var(--cream-mute); font-weight:700; font-size:0.92rem; text-decoration:none; }
  .lx-ig svg{ width:18px; height:18px; }

  /* more stories */
  .lx-list{ list-style:none; margin:1rem 0 0; padding:0; display:grid; gap:0.6rem; }
  .lx-story{ display:grid; grid-template-columns:4.4rem minmax(0,1fr) auto; align-items:center; gap:0.85rem; padding:0.6rem 0.85rem 0.6rem 0.6rem; border-radius:16px; background:var(--night-raised); color:var(--cream); text-decoration:none; border:1px solid rgba(249,247,242,0.06); }
  .lx-story img{ width:4.4rem; height:4.4rem; border-radius:12px; object-fit:cover; }
  .lx-story b{ display:block; font-weight:800; line-height:1.2; }
  .lx-story-text > span{ display:block; margin-top:0.2rem; font-size:0.86rem; color:var(--cream-mute); line-height:1.35; }
  .lx-story .ix-svg{ width:1.1em; height:1.1em; color:var(--cream-mute); }
  .lx-story:hover{ border-color:rgba(255,92,57,0.5); }

  /* play */
  .lx-play-btn{ display:inline-flex; align-items:center; gap:0.5rem; margin-top:1rem; }
  .lx-rules{ margin-top:1rem; border-radius:16px; background:var(--night-raised); border:1px solid rgba(249,247,242,0.06); }
  .lx-rules summary{ cursor:pointer; padding:1rem; font-weight:800; list-style:none; display:flex; justify-content:space-between; align-items:center; gap:0.6rem; }
  .lx-rules summary::-webkit-details-marker{ display:none; }
  .lx-rules summary .ix-svg{ width:1em; height:1em; transform:rotate(90deg); transition:transform .25s var(--ease); }
  .lx-rules[open] summary .ix-svg{ transform:rotate(-90deg); }
  .lx-rules ul{ margin:0; padding:0 1rem 0.4rem 2.1rem; display:grid; gap:0.45rem; color:var(--cream-mute); line-height:1.4; }
  .lx-rules p{ padding:0.4rem 1rem 1rem; font-size:0.88rem; }
  .lx-rules a{ color:var(--cream); }

  /* partners */
  .lx-partners{ padding-bottom:2.6rem; }
  .lx-logos{ list-style:none; margin:1rem 0 0; padding:0; display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:0.5rem; }
  .lx-logos a{ display:grid; place-items:center; height:4.2rem; padding:0.6rem; border-radius:14px; background:var(--night-raised); }
  .lx-logos img{ max-width:100%; max-height:2.1rem; width:auto; height:auto; object-fit:contain; }
  .lx-logos .is-cas img{ max-height:2.6rem; }
  .lx-logos .is-bh img{ max-height:2.8rem; }
  .lx-sponsor{ margin-top:1.1rem; color:var(--cream-mute); }
  .lx-sponsor a{ color:var(--cream); font-weight:700; }

  :where(.lx) a:focus-visible, :where(.lx) button:focus-visible, :where(.lx) summary:focus-visible{ outline:2px solid var(--cream); outline-offset:3px; border-radius:10px; }
  @media (prefers-reduced-motion: reduce){ .lx-rules summary .ix-svg{ transition:none; } }
</style>
</head>
<body>

${shell.header}

<div class="lx-back" aria-hidden="true"></div>
<main class="lx dark" id="main">
<!-- Generated by scripts/build-guides.mjs through scripts/lib/links-page.mjs from data/links.mjs. -->
  <section class="lx-hero" aria-label="${esc(HERO.label)}">
    <video class="lx-vid" muted loop playsinline preload="metadata" poster="${HERO.poster}" data-src="${HERO.video}" aria-hidden="true"></video>
    <div class="lx-shade"></div>
    <button type="button" class="lx-vidbtn" data-state="playing" aria-label="Pause the video">${icon("pause", "bold").replace("<svg", '<svg data-when="playing"')}${icon("resume", "bold").replace("<svg", '<svg data-when="paused"')}</button>
    <div class="lx-hero-copy">
      <p class="lx-kicker">Chicago Pickleball: Wheelie Big Dills</p>
      <h1 class="lx-h1">These are the athletes we fund.</h1>
      <a class="lx-down" href="#crew">Meet them ${ARROW}</a>
    </div>
  </section>

  <div class="lx-flow">
  <section class="lx-sec lx-crew" id="crew" data-key="crew" aria-labelledby="lxCrewH">
    <p class="lx-from-note">From the post you just saw</p>
    <h2 id="lxCrewH">Meet the crew</h2>
    <p>A few of the athletes in Chicago Pickleball: Wheelie Big Dills. Swipe, and share someone you’d cheer for.</p>
    <ul class="lx-rail" role="list">
${crewCards}
    </ul>
  </section>

  <section class="lx-sec lx-medals" id="medals" data-key="medals" aria-labelledby="lxMedalsH">
    <p class="lx-from-note">From the post you just saw</p>
    <h2 id="lxMedalsH">Six medals in Cincinnati</h2>
    <p>Monster Smash, October 2026. The host made it free for wheelchair athletes.</p>
    <ul class="lx-rail" role="list">
${medalCards}
    </ul>
    <a class="lx-more" href="${utm("/events/monster-smash-2026", "medals-story")}">Read the Monster Smash story ${ARROW}</a>
  </section>

  <section class="lx-sec lx-give" id="give" data-key="give" aria-labelledby="lxGiveH">
    <p class="lx-from-note">From the post you just saw</p>
    <h2 id="lxGiveH">Put an athlete on the court</h2>
    <div class="lx-giftcard" data-lx-give>
      <img class="lx-crewpic" src="/images/events/monster-smash-2026/crew-lodge.webp" alt="Athletes in sport wheelchairs and grey Adapt To Life shirts fist-bump inside The Pickle Lodge in Cincinnati" width="720" height="1280" loading="lazy" decoding="async">
      <p class="lx-road">A season of tournament travel for the crew, through the 2027 US Open. <a class="lx-inline" href="${utm("/road", "road")}">See the road</a></p>
      <div class="lx-seg" role="radiogroup" aria-label="How often">
        <button type="button" role="radio" aria-checked="true" data-freq-tab="monthly">Monthly</button>
        <button type="button" role="radio" aria-checked="false" data-freq-tab="once">One time</button>
      </div>
      <div class="lx-amts" role="radiogroup" aria-label="Monthly amount" data-amts="monthly">
        ${g.monthly.map((x) => giftBtn(x, "monthly", x.a === defMonthly.a)).join("\n        ")}
      </div>
      <div class="lx-amts" role="radiogroup" aria-label="One time amount" data-amts="once" hidden>
        ${once.map((x) => giftBtn(x, "once", x.a === g.onceDef)).join("\n        ")}
      </div>
      <p class="lx-impact" aria-live="polite" data-impact>${esc(defMonthly.t)}</p>
      <a class="btn" href="${donateHref(defMonthly.a, "monthly")}" data-give-link>Donate ${ARROW}</a>
      <p class="lx-trust">Tax-deductible · Secure checkout by Givebutter · <a href="${utm("/numbers", "numbers")}">Where it goes</a></p>
    </div>
  </section>

  <section class="lx-sec lx-follow" id="follow" data-key="follow" aria-labelledby="lxFollowH">
    <h2 id="lxFollowH">Follow the road to the US Open</h2>
    <p>Results, photos and what comes next, in your inbox.</p>
    <form class="js-subscribe lx-sub" data-source="links" novalidate>
      <div class="lx-sub-row">
        <input id="lxEm" name="em" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Your email">
        <button class="lx-sub-btn" type="submit">Follow</button>
      </div>
      <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
      <div class="cf-turnstile" data-sitekey="0x4AAAAAADrOxscajsf1zBC2" data-appearance="interaction-only"></div>
      <p class="foot-sub-msg" role="status" aria-live="polite"></p>
    </form>
    <a class="lx-ig" href="https://www.instagram.com/adapt_to_life_org/" target="_blank" rel="me noopener noreferrer">Or follow @adapt_to_life_org on Instagram</a>
  </section>

  <section class="lx-sec lx-stories" id="stories" data-key="stories" aria-labelledby="lxStoriesH">
    <p class="lx-from-note">From the post you just saw</p>
    <h2 id="lxStoriesH">More stories</h2>
    <ul class="lx-list" role="list">
${storyRows}
    </ul>
  </section>

  <section class="lx-sec lx-playsec" id="play" data-key="play" aria-labelledby="lxPlayH">
    <p class="lx-from-note">From the post you just saw</p>
    <h2 id="lxPlayH">Want to play?</h2>
    <p>Adaptive Sports Near Me is our free directory of adaptive sports programs, grants and events.</p>
    <a class="btn ghost lx-play-btn" href="https://adaptivesportsnearme.com/?utm_source=link-in-bio&amp;utm_medium=social&amp;utm_campaign=bio&amp;utm_content=play" target="_blank" rel="noopener">Find a program near you ${icon("external", "bold")}</a>
    <details class="lx-rules">
      <summary>How wheelchair pickleball works ${ARROW}</summary>
      <ul>
        <li>Same court, same net, same paddle as everyone else.</li>
        <li>The ball may bounce twice before a wheelchair player returns it, and the second bounce can land anywhere.</li>
        <li>Players stay seated when they hit, and serve with their rear wheels behind the baseline.</li>
      </ul>
      <p><a href="https://usapickleball.org/play/wheelchair-pickleball/" target="_blank" rel="noopener">The full rules from USA Pickleball</a></p>
    </details>
  </section>

  <section class="lx-sec lx-partners" id="partners" data-key="partners" aria-labelledby="lxPartnersH">
    <p class="lx-from-note">From the post you just saw</p>
    <h2 id="lxPartnersH">With our partners</h2>
    <ul class="lx-logos" role="list">
${partners}
    </ul>
    <p class="lx-sponsor">Run a business? <a href="${utm("/sponsor-adaptive-athletes", "sponsor")}">Sponsor a night of court time</a>.</p>
  </section>
  </div>
</main>

${shell.footer}

${shell.navJs}
<script>
/* /links behaviour: the hero video, the gift picker, share, and ?from=<post>. */
(function () {
  var FROM = ${JSON.stringify(FROM)};
  var q = new URLSearchParams(location.search);
  var from = (q.get("from") || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

  // ?from=<key>: open on that post's section, and tag what follows with it.
  if (from) {
    var key = FROM[from];
    var sec = key && document.querySelector('.lx-sec[data-key="' + key + '"]');
    var flow = document.querySelector(".lx-flow");
    if (sec && flow && flow.firstElementChild !== sec) flow.insertBefore(sec, flow.firstElementChild);
    if (sec) sec.classList.add("is-from");
    document.querySelectorAll('a[href*="utm_campaign=bio"]').forEach(function (a) {
      a.href = a.href.replace("utm_campaign=bio", "utm_campaign=bio-" + from);
    });
    var form = document.querySelector('form.lx-sub');
    if (form) form.setAttribute("data-source", "links-" + from);
  }

  // The court: plays muted when there is room for it, never on Save-Data or
  // reduced motion (the poster stays), and always pausable.
  var vid = document.querySelector(".lx-vid");
  var btn = document.querySelector(".lx-vidbtn");
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saver = navigator.connection && navigator.connection.saveData;
  function setPaused(p) {
    btn.setAttribute("data-state", p ? "paused" : "playing");
    btn.setAttribute("aria-label", p ? "Play the video" : "Pause the video");
  }
  if (vid && btn) {
    if (reduced || saver) { setPaused(true); }
    else {
      vid.src = vid.getAttribute("data-src");
      var p = vid.play();
      if (p && p.catch) p.catch(function () { setPaused(true); });
    }
    btn.addEventListener("click", function () {
      if (!vid.getAttribute("src")) vid.src = vid.getAttribute("data-src");
      if (vid.paused) { var r = vid.play(); if (r && r.catch) r.catch(function () {}); setPaused(false); }
      else { vid.pause(); setPaused(true); }
    });
  }

  // Gift picker: the same amounts and lines as the site's picker.
  var card = document.querySelector("[data-lx-give]");
  if (card) {
    var link = card.querySelector("[data-give-link]");
    var impact = card.querySelector("[data-impact]");
    var base = link.getAttribute("href").split("?")[1].replace(/^amount=\\d+(&amp;|&)?(frequency=monthly(&amp;|&)?)?/, "");
    function choose(b) {
      var freq = b.getAttribute("data-freq");
      b.parentNode.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-checked", x === b ? "true" : "false"); });
      impact.textContent = b.getAttribute("data-t");
      var href = "/donate?amount=" + b.getAttribute("data-a") + (freq === "monthly" ? "&frequency=monthly" : "") + "&" + base;
      if (from) href = href.replace("utm_campaign=bio&", "utm_campaign=bio-" + from + "&");
      link.setAttribute("href", href);
    }
    card.querySelectorAll(".lx-amts button").forEach(function (b) { b.addEventListener("click", function () { choose(b); }); });
    card.querySelectorAll("[data-freq-tab]").forEach(function (t) {
      t.addEventListener("click", function () {
        var f = t.getAttribute("data-freq-tab");
        card.querySelectorAll("[data-freq-tab]").forEach(function (x) { x.setAttribute("aria-checked", x === t ? "true" : "false"); });
        card.querySelectorAll("[data-amts]").forEach(function (g) { g.hidden = g.getAttribute("data-amts") !== f; });
        var on = card.querySelector('[data-amts="' + f + '"] button[aria-checked="true"]');
        if (on) choose(on);
      });
    });
  }

  // Share an athlete: the phone's share sheet, or copy the link.
  document.querySelectorAll(".lx-share").forEach(function (b) {
    b.addEventListener("click", function () {
      var url = b.getAttribute("data-share-url"), label = b.querySelector(".lx-share-label");
      var done = function (t) { b.classList.add("is-done"); label.textContent = t; setTimeout(function () { b.classList.remove("is-done"); label.textContent = "Share"; }, 2200); };
      if (navigator.share) {
        navigator.share({ title: b.getAttribute("data-share-title"), text: b.getAttribute("data-share-text"), url: url }).catch(function () {});
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(function () { done("Link copied"); }, function () { done("Copy failed"); });
      }
    });
  });
})();
</script>

${shell.tail}
</body>
</html>
`;
}
