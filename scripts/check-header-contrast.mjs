// scripts/check-header-contrast.mjs — the interior header band cannot eat its
// own text.
//
// The band went from "so dark you cannot see the athletes" to "bright enough
// that the sub-line sits on somebody's cheek" in one change, and both were
// judged by looking at a screenshot. Looking is how you tell whether a design
// is good; it is not how you tell whether text is readable, because the eye
// fills in what it already knows the sentence says.
//
// So this measures. For every banded page it screenshots the header, samples
// the actual rendered pixels UNDER each line of copy, and computes the WCAG
// contrast ratio against the text's own colour. It samples the brightest
// region behind each element, not the average — a headline is unreadable if
// one word of it lands on a white shirt, even if the mean is fine.
//
// Usage: node scripts/check-header-contrast.mjs [base-url]
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8788";
// "index" is the HOMEPAGE, and it was missing from this list until 2026-09-09 —
// which is how the biggest type on the site went unmeasured while eleven
// interior pages were checked every run. Alec found it by eye: the orange
// accent word sits over Robby's frame, and his light shirt is the one bright
// thing behind any headline on the site.
//
// SUPERSEDED, kept because the correction is the point. This block used to
// record hand-measured accent numbers — 3.75:1 at 1440, 3.29:1 at 1600, 2.28:1
// at 1920 — and treat the 1920 figure as a known failure we were choosing to
// live with. Those were sampled by hand over the last third of the word. Now
// that the accent is a measured row at three widths, the instrument says
// 5.15:1 at 1440 and 3.18:1 at 1920: it passes everywhere, and the "known
// limit" was an artefact of the hand method, not a property of the page.
//
// The real limit is thinner and worth keeping: 3.18:1 at 1920 has 0.18 of
// margin over the floor. Anything that puts a lit frame behind the second
// headline line will break it. The lever is moving the panel a few percent
// clear of the word, not dimming it.
//
// It is "index", not "" — the loop fetches `${BASE}/${page}.html`, so an empty
// string requests /.html, 404s, and the page is silently skipped. I shipped
// that version first and it printed "every line clears its contrast floor"
// while measuring nothing at all. A check that passes because it tested
// nothing is worse than no check; count the rows.
// hustle-and-heart was missing from this list until 2026-09-09 — a page with a
// photographic two-column hero AND, as of the same day, a dark pull-quote, and
// neither had ever been measured. It is the fund's own landing page.
const PAGES = ["index", "about", "promise", "apply", "donate", "sponsorship", "volunteer",
               "roadmap", "contact", "adaptive-sports-near-me", "subscribe", "waiver",
               "hustle-and-heart"];
// ONLY=index,donate narrows the run while iterating. The full sweep is 24
// page-viewport pairs and ~90 clip screenshots, and it OOM-killed this box
// once — Chromium holds every decode. Keep it out of CI (unset = everything),
// but reach for it when you are debugging one page.
const ONLY = (process.env.ONLY || "").split(",").map((x) => x.trim()).filter(Boolean);
const RUN = ONLY.length ? PAGES.filter((p) => ONLY.includes(p)) : PAGES;

// 4.5 is the WCAG AA floor for body text; large text is allowed 3.0, but a
// header sub-line is body text and gets the body number.
// "em" is the display-size accent inside an h1, so it earns the same 3.0
// large-text allowance the h1 gets — not the 4.5 body number.
const FLOOR = { "h1": 3.0, "em": 3.0, ".eyebrow": 4.5, ".lead": 4.5, "p": 4.5 };

const lum = (r, g, b) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

const browser = await chromium.launch();
let failed = 0;
let skipped = 0;

// A HEADER BAND IS NOT THE ONLY PLACE TYPE SITS ON A PHOTOGRAPH. This checked
// `.hero.pg-band, .hero-wall-photo` and nothing else, which was right for as
// long as those were the only photographic grounds on the site. On 2026-09-09
// the directory section got one — an empty dusk court behind .dir-stats — and
// it would have shipped completely unmeasured, which is the same silent-hole
// failure the homepage hid in for weeks and the reason the SKIP line below
// exists at all. Add a region here whenever copy is put over a picture.
//
// `required` separates "this page has no such region" from "this region is
// missing". Every page has a header, so a header that yields no targets is a
// bug worth shouting about; only one page has a .dir-stats, so its absence
// everywhere else is not.
const REGIONS = [
  // THREE hero types, not two. .hero-2col is the two-column "door" header on
  // /hustle-and-heart — copy in one column, photograph in the other — and it
  // matched neither of the first two selectors, so that page reported "no
  // measurable header found" the moment it was added to PAGES. Its .wrap is the
  // right copy root: the caption under the photo is real copy on the same dark
  // ground, and no text column overlaps the image.
  { name: "header", sel: ".hero.pg-band, .hero-wall-photo, .hero-2col", copy: ".wrap, .mw-copy", required: true },
  { name: "ground", sel: ".dir-stats",                      copy: ".wrap",           required: false },
];

for (const page of RUN) {
  // 1920 is here because it is the width this page is WORST at and the only one
  // that was never tested. The wall scales with the viewport while the headline
  // does not move, so the orange accent slides further onto a lit frame as the
  // window widens — hand-measured at 3.29:1 (1600) and 2.28:1 (1920) against a
  // 3.0 floor. Checking only 1440 and 390 meant the check passed at every width
  // except the common one.
  for (const [w, h, tag] of [[1920, 1080, "1920"], [1440, 900, "1440"], [390, 844, "390"]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    await p.goto(`${BASE}/${page}.html`, { waitUntil: "load", timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);

    for (const region of REGIONS) {
    // BRING THE REGION INTO VIEW BEFORE MEASURING IT. Every box here is clamped
    // to the viewport and dropped if under 8px tall, which is right for a
    // header — a header is always at the top — and quietly wrong for anything
    // below the fold. .dir-stats is, so the first run of this measured whatever
    // sliver of the section happened to poke into a 900px window and reported a
    // number for it: the same target scored at 1920 and 390 but vanished
    // entirely at 1440, which is the tell. A row that appears and disappears
    // with the window height is not measuring the thing it names.
    //
    // The reveal class has to be forced too. Copy inside .reveal is opacity 0
    // and translated until an IntersectionObserver fires, so its box is both
    // in the wrong place and the wrong size until it lands.
    await p.evaluate((regionSel) => {
      document.querySelectorAll(".reveal").forEach((e) => e.classList.add("is-in"));
      const el = document.querySelector(regionSel);
      if (!el) return;
      el.scrollIntoView({ block: "start", behavior: "instant" });
      // ...AND THEN BACK OFF, because the nav is FIXED and overlays the top of
      // the viewport. scrollIntoView aligns the section's top edge with y=0,
      // which parks its first line UNDER the nav bar — so the clip photographs
      // the nav instead of the page. On /hustle-and-heart at 390px that put the
      // eyebrow at viewport y=47 behind a near-white nav and reported 2.08:1
      // for a line that measures 6.65:1 and is perfectly legible on screen.
      // Same class of bug as every other phantom this file documents: the
      // instrument moved the thing it was measuring.
      const nav = [...document.querySelectorAll("header, nav, .nav")].find((n) => {
        const pos = getComputedStyle(n).position;
        return pos === "fixed" || pos === "sticky";
      });
      const pad = nav ? Math.ceil(nav.getBoundingClientRect().height) + 8 : 0;
      if (pad) window.scrollBy(0, -pad);
    }, region.sel);
    await p.waitForTimeout(250);

    const targets = await p.evaluate(({ regionSel, copySel }) => {
      // The homepage's hero is .hero-wall-photo, not .hero.pg-band. Selecting
      // only the band meant this returned null on the homepage and the loop
      // below skipped it SILENTLY — which is why the biggest type on the site
      // went unchecked while the check reported success every run.
      const band = document.querySelector(regionSel);
      if (!band) return null;
      const out = [];
      // "em" is here because measuring the h1 is not the same as measuring the
      // word that is actually at risk. The homepage headline is white for four
      // words and orange for one, and the h1 row samples the whole two-line box
      // against the WHITE — so it reported 9.11:1 while the orange "sports."
      // sat over a light shirt at a third of that. Alec caught it by eye
      // ("the 'rts' in sports is kinda hard to see") on a run this check had
      // already passed. The accent gets its own row and its own colour.
      for (const sel of ["h1", "em", ".eyebrow", ".lead", "p"]) {
        const wrap = band.querySelector(copySel);
        const list = [...(wrap || band).querySelectorAll(sel)];
        for (const [idx, el] of list.entries()) {
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          out.push({ sel, idx, colour: getComputedStyle(el).color,
                     box: { x: Math.round(r.x), y: Math.round(r.y),
                            width: Math.round(r.width), height: Math.round(r.height) } });
        }
      }
      return out;
    }, { regionSel: region.sel, copySel: region.copy });
    // Loudly, not silently. A skipped page used to look exactly like a passing
    // page, and that is how the homepage hid for weeks.
    if (!targets || !targets.length) {
      if (region.required) {
        console.log(` SKIP ${page.padEnd(24)} ${tag.padEnd(5)} no measurable ${region.name} found`);
        skipped++;
      }
      continue;   // NOT `await p.close(); continue;` — the page is still needed
                  // by the next region, and closing it here skipped every
                  // region after the first one that happened to be absent.
    }

    // Make the GLYPHS invisible, not the element.
    //
    // Three versions of this got it wrong the same way, each time reporting a
    // failure that was not real:
    //   · hiding `.wrap` also hid `.wrap::before`, the soft shadow protecting
    //     the copy — visibility is inherited by pseudo elements;
    //   · hiding `.wrap > *` also hid /donate's white donation panel, so dark
    //     text on white scored 1.54:1 against the black band behind it;
    //   · hiding the measured element hid its OWN backdrop, where the
    //     protection is attached to the text rather than to the container.
    //
    //   · `color: transparent` did not silence an <a> inside the measured <p>,
    //     so white link glyphs were sampled as background and scored 1.23:1.
    //
    // `opacity: 0` is the right tool: it suppresses exactly one element's own
    // painting — glyphs, borders, its own pseudo elements — and touches nothing
    // else on the page. The protection here lives on .wrap::before and on
    // parent backgrounds, both of which survive it.
    //
    // Worth stating plainly: every failure this reported on 2026-09-08 except
    // one was the RULER's, not the page's. A measurement that changes the thing
    // it measures is worse than no measurement, because it gets believed and
    // then acted on — two of the "fixes" it prompted made the page worse before
    // the instrument was right.
    for (const t of targets) {
      // Re-read the box NOW rather than trusting the one captured up front.
      // /donate's Givebutter panel is still settling for seconds after load, so
      // every box below it moves; measuring against stale coordinates sampled a
      // region the text had already left and reported 1.31:1 for a line that
      // reads at 5:1.
      const live = await p.evaluate(({ sel, i, regionSel, copySel }) => {
        // Same two-hero reality as above: the homepage's copy lives in
        // .mw-copy inside .hero-wall-photo, not .wrap inside .hero.pg-band.
        const band = document.querySelector(regionSel);
        const root = (band && band.querySelector(copySel)) || band;
        const el = root && root.querySelectorAll(sel)[i];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, { sel: t.sel, i: t.idx, regionSel: region.sel, copySel: region.copy });
      if (!live) continue;
      // clamp to the viewport: a header line that is off screen is not a
      // contrast question
      const box = {
        x: Math.max(0, Math.round(live.x)),
        y: Math.max(0, Math.round(live.y)),
        width: Math.round(Math.min(live.width, w - Math.max(0, live.x))),
        height: Math.round(Math.min(live.height, h - Math.max(0, live.y))),
      };
      if (box.width < 8 || box.height < 8) continue;
      // HIDE EVERY LINE OF COPY, not just the one being measured. Hiding only
      // the target was correct for a block element and silently wrong for an
      // INLINE one: /volunteer's accent is <em>this team</em> inside the h1 and
      // it wraps across two lines, so its bounding box also contains the white
      // words "on" and "." that are NOT part of the em. Sampling that box while
      // only the em was hidden measured those white GLYPHS — luminance 0.93,
      // immovable no matter what sits behind the text — and reported a 2.71:1
      // failure for a line that is fine. The homepage accent has its own line,
      // which is why it read sane and this one did not.
      //
      // "The pixels UNDER each line of copy" means the photograph and the field,
      // never a neighbouring word. Buttons are left alone: they are separate
      // blocks below the type and their own fill is legitimately background.
      const TEXT = "h1, h2, em, .eyebrow, .lead, p, li";
      await p.evaluate(({ TEXT, regionSel, copySel }) => {
        const band = document.querySelector(regionSel);
        const root = band.querySelector(copySel) || band;
        for (const el of root.querySelectorAll(TEXT)) el.style.setProperty("opacity", "0", "important");
      }, { TEXT, regionSel: region.sel, copySel: region.copy });
      const shot = await p.screenshot({ clip: box });
      await p.evaluate(({ TEXT, regionSel, copySel }) => {
        const band = document.querySelector(regionSel);
        const root = band.querySelector(copySel) || band;
        // removeProperty, not = "" — an !important inline value is not cleared
        // by assigning the empty string.
        for (const el of root.querySelectorAll(TEXT)) el.style.removeProperty("opacity");
      }, { TEXT, regionSel: region.sel, copySel: region.copy });
      // decode with the browser rather than pulling in a node image library
      const px = await p.evaluate(async (b64) => {
        const img = new Image();
        img.src = "data:image/png;base64," + b64;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        // brightest 5% of pixels: one word on a white shirt is the failure
        const lums = [];
        for (let i = 0; i < d.length; i += 4) lums.push([d[i], d[i + 1], d[i + 2]]);
        return lums;
      }, shot.toString("base64"));

      const ls = px.map(([r, g, b]) => lum(r, g, b)).sort((a, b) => b - a);
      const worst = ls[Math.floor(ls.length * 0.05)];        // 95th percentile brightness
      const m = t.colour.match(/\d+/g).map(Number);
      const cr = ratio(lum(m[0], m[1], m[2]), worst);
      const floor = FLOOR[t.sel] ?? 4.5;
      const ok = cr >= floor;
      if (!ok) failed++;
      console.log(`${ok ? " ok " : "FAIL"}  ${page.padEnd(24)} ${tag.padEnd(5)} ${region.name.padEnd(6)} ${t.sel.padEnd(9)} ${cr.toFixed(2)}:1 (floor ${floor})`);
    }
    }
    await p.close();
  }
}
await browser.close();
console.log(skipped ? `\n${skipped} header(s) SKIPPED — nothing was measured there.` : "");
console.log(failed ? `\n${failed} contrast failure(s)` : "\nevery line clears its contrast floor");
process.exit(failed ? 1 : 0);
