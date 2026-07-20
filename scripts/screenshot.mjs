// scripts/screenshot.mjs — Spec 100: the screenshot + mobile-gate half of the
// render loop. Shoots a preview dir (see preview.mjs) at desktop AND 390px
// (iPhone-class), light + dark, and runs the ZERO-OVERFLOW PROBE at 390px:
// any element past the right edge of a phone viewport is the Gmail-iOS
// shrink hazard class (one rigid row scales the whole email down — the 7/5
// tiny-text incident). Exit 1 if the probe finds overflow.
//
// Box-local dev tool (not Worker code): Playwright lives at ~/pw on the box.
// Usage: node scripts/screenshot.mjs [dir]   (default /tmp/mail-preview)
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";

const dir = process.argv[2] || "/tmp/mail-preview";
const browser = await chromium.launch();
let failed = false;

async function shot(file, out, scheme, width, probe) {
  const page = await browser.newPage({
    viewport: { width, height: 1200 },
    colorScheme: scheme,
    deviceScaleFactor: width < 500 ? 2 : 1,
  });
  await page.goto(`file://${dir}/${file}`);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${dir}/${out}`, fullPage: true });
  if (probe) {
    const over = await page.evaluate(() => {
      const bad = [];
      document.querySelectorAll("*").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
          bad.push(`${el.tagName}.${el.className || ""} right=${Math.round(r.right)}`);
        }
      });
      return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, bad: bad.slice(0, 8) };
    });
    const ok = over.scrollW <= over.innerW && over.bad.length === 0;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} probe ${out}`, JSON.stringify(over));
  } else {
    console.log(`shot ${out}`);
  }
  await page.close();
}

await shot("email.html", "email-light.png", "light", 820, false);
await shot("report.html", "report-light.png", "light", 820, false);
await shot("report.html", "report-dark.png", "dark", 820, false);
await shot("email.html", "m-email-light.png", "light", 390, true);
await shot("report.html", "m-report-light.png", "light", 390, true);
await shot("report.html", "m-report-dark.png", "dark", 390, true);
await browser.close();
if (failed) {
  console.error("MOBILE GATE FAILED — an element overflows the 390px viewport");
  process.exit(1);
}
