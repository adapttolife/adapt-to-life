#!/usr/bin/env node
// Spec 116 P6 probe — does the EMBEDDED Givebutter widget carry the parent
// page's attribution params, or does it hand off clean?
//
// This is the one unknown the whole money-attribution chain rests on, and
// Givebutter's own docs answer it only for their hosted campaign pages. So we
// ask the widget directly: load /donate with attribution on the URL and record
// every request the widget makes, looking for our values in flight.
//
//   node scripts/probe-givebutter-utm.mjs [origin]
//
// A finding, not a test: it prints what it saw and exits 0 either way. The
// design fork it settles is whether QR traffic can land on our own /donate
// (widget propagates) or must land on Givebutter's hosted page (it does not).

import { chromium } from 'playwright';

const ORIGIN = process.argv[2] || 'https://adapttolife.org';
const MARK   = 'qr-probe-chair';
const URL_   = `${ORIGIN}/donate`
  + `?src=${MARK}&utm_source=qr&utm_medium=print&utm_campaign=${MARK}`
  + `&gba_source=${MARK}&referrer_probe=${MARK}`;

const browser = await chromium.launch();
const page = await browser.newPage();

const hits = [];
page.on('request', (req) => {
  const u = req.url();
  if (!/givebutter/i.test(u)) return;
  let body = '';
  try { body = req.postData() || ''; } catch { /* opaque body */ }
  const where = [];
  if (u.includes(MARK)) where.push('url');
  if (body.includes(MARK)) where.push('body');
  if (where.length) hits.push({ where: where.join('+'), method: req.method(), url: u.slice(0, 220), body: body.slice(0, 400) });
});

console.log(`probing ${URL_}\n`);
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
// The widget is lazy-loaded on this page, so scroll it into view and wait for
// it to boot and make its own calls.
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(9000);

const iframes = page.frames().filter((f) => /givebutter/i.test(f.url()));
console.log(`givebutter frames: ${iframes.length}`);
for (const f of iframes) console.log(`  frame url: ${f.url().slice(0, 260)}`);
console.log(`  frame carries our mark: ${iframes.some((f) => f.url().includes(MARK)) ? 'YES' : 'no'}`);

console.log(`\nrequests to givebutter carrying "${MARK}": ${hits.length}`);
for (const h of hits) {
  console.log(`  [${h.where}] ${h.method} ${h.url}`);
  if (h.body) console.log(`         body: ${h.body}`);
}

if (!hits.length) {
  console.log('\nVERDICT: the embedded widget did NOT forward parent-page attribution');
  console.log('         in any request it made while loading. Attribution must be');
  console.log('         carried another way (hosted campaign page, or our own join).');
} else {
  console.log('\nVERDICT: the widget DOES carry parent-page attribution. /donate can');
  console.log('         stay the QR landing surface.');
}

await browser.close();
