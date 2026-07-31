#!/usr/bin/env node
// Spec 116 P6 — walk the attribution chain the way a donor actually walks it.
//
// Scan the chair sticker, read the campaign, tap Donate, and check the marker
// is still attached when the Givebutter form loads. Every hop here was a place
// the attribution used to die.
import { chromium } from 'playwright';

const ORIGIN = 'https://adapttolife.org';
const fail = [];
const step = (ok, msg) => { console.log(`${ok ? '  ok  ' : ' FAIL '} ${msg}`); if (!ok) fail.push(msg); };

const browser = await chromium.launch();
const page = await browser.newPage({ userAgent:
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });

console.log('1. scan /q/chair');
await page.goto(`${ORIGIN}/q/chair`, { waitUntil: 'domcontentloaded' });
const landed = new URL(page.url());
step(landed.pathname === '/send-6', `landed on ${landed.pathname}`);
step(landed.searchParams.get('gba_source') === 'qr-chair', 'landing URL carries gba_source=qr-chair');
step(landed.searchParams.get('utm_medium') === 'chair-sticker', 'utm_medium names the physical surface');

console.log('2. the Donate links on that page must carry it forward');
const donateHref = await page.evaluate(() => {
  const a = Array.from(document.querySelectorAll('a[href*="/donate"]'))[0];
  return a ? a.getAttribute('href') : null;
});
step(!!donateHref && donateHref.includes('gba_source=qr-chair'),
  `first Donate link -> ${donateHref}`);

console.log('3. follow it, the way a donor taps it');
await page.goto(new URL(donateHref, ORIGIN).toString(), { waitUntil: 'domcontentloaded' });
const onDonate = new URL(page.url());
step(onDonate.pathname === '/donate', `now on ${onDonate.pathname}`);
step(onDonate.searchParams.get('gba_source') === 'qr-chair', 'donate URL still carries the marker');

console.log('4. the Givebutter widget must pick it up');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(9000);
const frames = page.frames().filter((f) => /givebutter\.com\/embed/i.test(f.url()));
step(frames.length > 0, `givebutter embed frames: ${frames.length}`);
step(frames.some((f) => f.url().includes('qr-chair')),
  'the embed iframe URL carries qr-chair');
for (const f of frames) console.log(`      ${f.url().slice(0, 190)}`);

console.log('\n5. a direct visit with NO attribution must stay clean');
const clean = await browser.newPage();
await clean.goto(`${ORIGIN}/donate`, { waitUntil: 'domcontentloaded' });
await clean.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await clean.waitForTimeout(8000);
const cleanFrames = clean.frames().filter((f) => /givebutter\.com\/embed/i.test(f.url()));
step(!cleanFrames.some((f) => /qr-/.test(f.url())), 'no phantom attribution on an unreferred visit');

await browser.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nchain intact end to end');
process.exit(fail.length ? 1 : 0);
