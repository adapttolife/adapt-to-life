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
const PAGES = ["about", "promise", "apply", "donate", "sponsorship", "volunteer",
               "roadmap", "contact", "adaptive-sports-near-me", "subscribe", "waiver"];
// 4.5 is the WCAG AA floor for body text; large text is allowed 3.0, but a
// header sub-line is body text and gets the body number.
const FLOOR = { "h1": 3.0, ".eyebrow": 4.5, ".lead": 4.5, "p": 4.5 };

const lum = (r, g, b) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => { const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

const browser = await chromium.launch();
let failed = 0;

for (const page of PAGES) {
  for (const [w, h, tag] of [[1440, 900, "1440"], [390, 844, "390"]]) {
    const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
    await p.goto(`${BASE}/${page}.html`, { waitUntil: "load", timeout: 60000 });
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(600);

    const targets = await p.evaluate(() => {
      const band = document.querySelector(".hero.pg-band");
      if (!band) return null;
      const out = [];
      for (const sel of ["h1", ".eyebrow", ".lead", "p"]) {
        const wrap = band.querySelector(".wrap");
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
    });
    if (!targets) { await p.close(); continue; }

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
      const live = await p.evaluate(({ sel, i }) => {
        const el = document.querySelector(".hero.pg-band .wrap").querySelectorAll(sel)[i];
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }, { sel: t.sel, i: t.idx });
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
      await p.evaluate(({ sel, i }) => {
        const band = document.querySelector(".hero.pg-band");
        const el = band.querySelector(".wrap").querySelectorAll(sel)[i];
        if (el) el.style.opacity = "0";
      }, { sel: t.sel, i: t.idx });
      const shot = await p.screenshot({ clip: box });
      await p.evaluate(({ sel, i }) => {
        const band = document.querySelector(".hero.pg-band");
        const el = band.querySelector(".wrap").querySelectorAll(sel)[i];
        if (el) el.style.opacity = "";
      }, { sel: t.sel, i: t.idx });
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
      console.log(`${ok ? " ok " : "FAIL"}  ${page.padEnd(24)} ${tag.padEnd(5)} ${t.sel.padEnd(9)} ${cr.toFixed(2)}:1 (floor ${floor})`);
    }
    await p.close();
  }
}
await browser.close();
console.log(failed ? `\n${failed} contrast failure(s)` : "\nevery line clears its contrast floor");
process.exit(failed ? 1 : 0);
