// Read-only story/navigation checks. Staging uses live services, so do not submit forms.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2],out=process.argv[3];
assert.ok(base==='http://localhost:8787'||base==='https://adapt-to-life.adapt-to-life.workers.dev');
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
const results=[];
try {
 for(const width of [390,1440]) {
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
  for(const path of ['/about','/adapt-body-shop','/roadmap','/adaptive-sports-near-me','/hustle-and-heart','/volunteer','/promise']) {
   const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   assert.equal((await page.goto(base+path,{waitUntil:'networkidle'})).status(),200);
   for(const x of await page.locator('main > section:visible').all())await x.scrollIntoViewIfNeeded();
   const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,h1:document.querySelectorAll('h1').length,headings:[...document.querySelectorAll('main h2')].map(x=>x.textContent.trim()),body:document.querySelector('main').innerText}));
   assert.equal(state.overflow,false,path);assert.equal(state.h1,1,path);assert.deepEqual(errors,[]);
   await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${out}/${path.slice(1)}-${width}.png`,fullPage:true});
   if(path==='/adapt-body-shop') {
    assert.ok(state.body.includes('The store is not open yet.'));
    for(const dest of ['/roadmap','/contact','/subscribe','/volunteer']) {
     await page.locator(`main a[href="${dest}"]`).first().click();await page.waitForURL(base+dest);await page.goBack({waitUntil:'networkidle'});
    }
   }
   if(path==='/about')assert.ok(state.body.includes('These are starting points, not the limits of the mission.'));
   results.push({width,path,overflow:state.overflow,h1:state.h1,headings:state.headings});await page.close();
  }
  const page=await ctx.newPage();await page.goto(base,{waitUntil:'networkidle'});
  if(width===390)await page.locator('#menuBtn').click();else await page.locator('[aria-controls="navOurWork"]').click();
  const link=page.locator(width===390?'.mobile-menu a[href="/adapt-body-shop"]':'#navOurWork a[href="/adapt-body-shop"]');
  await link.waitFor({state:'visible'}); await link.focus();assert.equal(await link.evaluate(x=>x===document.activeElement),true);await page.keyboard.press('Enter');await page.waitForURL(base+'/adapt-body-shop');
  await page.goto(base+'/about#our-work',{waitUntil:'networkidle'});assert.ok(await page.locator('#ourWorkTitle').isVisible());
  await ctx.close();
 }
 const req=await browser.newContext();const page=await req.newPage();
 const shop=await page.request.get(base+'/adapt-body-shop');assert.equal(shop.status(),200);
 assert.ok(shop.headers()['x-robots-tag'].includes('noindex'));
 assert.ok(!(shop.headers()['content-security-policy']||'').includes("form-action 'none'"));
 writeFileSync(out+'/results.json',JSON.stringify({results},null,2));
 console.log(JSON.stringify({pages:7,widths:[390,1440],shopNavigation:'pass',keyboard:'pass',overflow:'pass'}));await req.close();
} finally {await browser.close();}
