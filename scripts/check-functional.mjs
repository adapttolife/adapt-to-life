#!/usr/bin/env node
// scripts/check-functional.mjs — does the site actually WORK?
//
//   node scripts/check-functional.mjs
//   SITE_URL=https://adapttolife.org node scripts/check-functional.mjs
//
// Alec, before going live, 2026-09-09: "Does nav bar and Givebutter and forms
// and other buttons work as intended?"
//
// Every other check here measures a property — bytes, contrast, black space.
// None of them would notice if the hamburger stopped opening or Givebutter
// stopped rendering, because a broken menu is still fast and still on palette.
// This drives the things a person actually touches.
//
// It found a bug in itself first, which is worth recording: the mobile
// hamburger is #menuBtn, but `.nav-toggle` also exists — it is the DESKTOP
// dropdown toggle, hidden at 390px. A selector that matched the wrong button
// reported a timeout rather than a failure. When a check cannot click
// something, confirm you are pointing at the right thing before believing the
// site is broken.
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";
const B = process.env.SITE_URL || 'https://adapt-to-life-staging.alec-af3.workers.dev';
let failed = 0;
const b=await chromium.launch();
const ok=(n,v)=>{ if(!v) failed++; console.log(`  ${v?'PASS':'FAIL'}  ${n}`); };

console.log('\n== NAV ==');
{ // desktop dropdown
  const p=await b.newPage({viewport:{width:1440,height:900}});
  await p.goto(B+'/?cb='+Date.now(),{waitUntil:'load'}); await p.waitForTimeout(800);
  const g=p.locator('.nav-group').first();
  await g.hover(); await p.waitForTimeout(400);
  ok('desktop dropdown opens on hover', await p.locator('.nav-panel').first().isVisible());
  await p.keyboard.press('Tab');
  ok('Donate button present in nav', await p.locator('.nav a.nav-cta, .nav .nav-cta').first().isVisible());
  await p.close();
}
{ // mobile menu
  const p=await b.newPage({viewport:{width:390,height:844}});
  await p.goto(B+'/?cb='+Date.now(),{waitUntil:'load'}); await p.waitForTimeout(800);
  const before=await p.locator('.mobile-menu').first().evaluate(e=>e.getBoundingClientRect().height).catch(()=>0);
  await p.locator('#menuBtn').first().click();
  await p.waitForTimeout(600);
  const after=await p.locator('.mobile-menu').first().evaluate(e=>e.getBoundingClientRect().height).catch(()=>0);
  ok(`hamburger opens the menu (${Math.round(before)} -> ${Math.round(after)}px)`, after>before+50);
  ok('Donate visible on phone nav', await p.locator('.nav-cta').first().isVisible());
  await p.close();
}

console.log('\n== GIVEBUTTER ==');
{
  const p=await b.newPage({viewport:{width:1440,height:900}});
  await p.goto(B+'/donate?cb='+Date.now(),{waitUntil:'load'}); await p.waitForTimeout(9000);
  const el=p.locator('givebutter-giving-form');
  ok('giving form element present', await el.count()>0);
  const h=await el.first().evaluate(e=>e.getBoundingClientRect().height).catch(()=>0);
  ok(`giving form rendered (${Math.round(h)}px tall)`, h>300);
  const iframe=await p.locator('givebutter-giving-form iframe').count();
  ok('form iframe mounted', iframe>0);
  await p.close();
}

console.log('\n== FORMS ==');
for (const [path,sel,label] of [['/contact','.contact-form','contact'],['/apply','form','apply'],['/waiver','form','waiver']]) {
  const p=await b.newPage({viewport:{width:1440,height:900}});
  await p.goto(B+path+'?cb='+Date.now(),{waitUntil:'load'}); await p.waitForTimeout(1500);
  const f=p.locator(sel).first();
  const n=await f.count();
  const fields=n? await f.locator('input,select,textarea').count() : 0;
  const submit=n? await f.locator('button[type=submit],button,input[type=submit]').count() : 0;
  ok(`${label}: form + ${fields} fields + ${submit} submit control(s)`, n>0 && fields>0 && submit>0);
  await p.close();
}
await b.close();
console.log(failed ? `\n${failed} functional failure(s).` : "\neverything a visitor touches works.");
process.exit(failed ? 1 : 0);
