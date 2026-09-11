// Read-only homepage experience checks. Never submits a form or payment.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.argv[2] || 'http://localhost:8787';
const out = process.argv[3];
if (!out) throw new Error('Pass an evidence directory outside public/');
mkdirSync(out, {recursive:true});
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
const results = [];
try {
  for (const width of [320,390,600,768,1024,1440]) {
    const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    const response=await page.goto(base, {waitUntil:'networkidle'});
    assert.equal(response.status(),200);
    await page.locator('#homeBand .camp-band').waitFor();
    for (const section of await page.locator('main > section:visible, main > div.home-welcome').all()) await section.scrollIntoViewIfNeeded();
    await page.evaluate(async()=>{await document.fonts.ready; await Promise.all([...document.querySelectorAll('main img[src]')].filter(x=>x.getClientRects().length).map(x=>x.decode().catch(()=>{})));});
    const state=await page.evaluate(()=>({
      h1:[...document.querySelectorAll('h1')].map(x=>x.textContent.trim()),
      headings:[...document.querySelectorAll('main h2')].filter(x=>x.getClientRects().length).map(x=>x.textContent.trim()),
      overflow:document.documentElement.scrollWidth > innerWidth+1,
      brokenImages:[...document.querySelectorAll('main img[src]')].filter(x=>x.getClientRects().length && (!x.complete||!x.naturalWidth)).map(x=>x.src),
      welcomeLinks:[...document.querySelectorAll('.home-welcome a')].map(a=>({href:a.getAttribute('href'),height:a.getBoundingClientRect().height,width:a.getBoundingClientRect().width,x:a.getBoundingClientRect().x,y:a.getBoundingClientRect().y})),
      campaignAfterStory:document.querySelector('#homeBand').getBoundingClientRect().top > document.querySelector('#participation').getBoundingClientRect().top,
      campaignBeforeFuture:document.querySelector('#homeBand').getBoundingClientRect().top < document.querySelector('#next-step').getBoundingClientRect().top,
      oldResult:!!document.querySelector('#homeResult'),
      campaignText:document.querySelector('#homeBand').innerText,
      imageUrls:[...document.querySelectorAll('#heroStage img')].map(x=>x.getAttribute('src')),
    }));
    assert.equal(state.h1.length,1);assert.equal(state.overflow,false,`overflow ${width}`);
    assert.deepEqual(state.brokenImages,[]);assert.ok(state.campaignAfterStory);assert.equal(state.oldResult,false);
    assert.deepEqual(state.welcomeLinks, [], 'opening establishes mission without branching');
    assert.ok(state.campaignBeforeFuture);assert.deepEqual(errors,[]);
    assert.equal(await page.locator('.rb-bottom .btn').count(),1);
    assert.equal(await page.locator('.rb-bottom a[href="/volunteer"].textlink').count(),1);
    await page.evaluate(()=>window.scrollTo(0,0));
    await page.waitForFunction(()=>window.scrollY===0);
    const navBox=await page.locator('#nav').boundingBox();
    assert.ok(navBox.y>=0 && navBox.y<2,'navigation stays at viewport top');
    await page.screenshot({path:`${out}/viewport-${width}.png`});
    await page.screenshot({path:`${out}/home-${width}.png`,fullPage:true});
    await page.locator('#participation').screenshot({path:`${out}/story-${width}.png`});
    await page.locator('.home-welcome').screenshot({path:`${out}/welcome-${width}.png`});
    for (const href of ['/adaptive-sports-near-me','/donate','/volunteer']) {
      const menu = page.locator('#menuBtn');
      if (await menu.isVisible()) {
        await menu.click();
        await page.locator(`.mobile-menu a[href="${href}"]`).first().click();
      } else {
        // Exercise preserved navigation, not the removed hero shortcuts.
        if(href==='/adaptive-sports-near-me') await page.locator('[aria-controls="navOurWork"]').click();
        if(href==='/volunteer') await page.locator('[aria-controls="navJoin"]').click();
        await page.locator(`#nav a[href="${href}"]:visible`).first().click();
      }
      await page.waitForURL(base+href);assert.equal(new URL(page.url()).origin,new URL(base).origin);
      assert.equal(await page.locator('h1').count(),1);
      await page.goBack({waitUntil:'networkidle'});
    }
    results.push({width,...state});await page.close();
  }
  const motion=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'});
  await motion.goto(base,{waitUntil:'networkidle'});
  const pause=motion.locator('[data-rb-pause]');await pause.scrollIntoViewIfNeeded();await pause.click();
  assert.equal(await pause.getAttribute('aria-label'),'Play the moving photo strip');
  assert.ok(await motion.locator('.roll-band').evaluate(el=>el.classList.contains('is-paused')));
  await pause.click();assert.equal(await pause.getAttribute('aria-label'),'Pause the moving photo strip');
  await motion.close();
  const nojs=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});
  await nojs.goto(base,{waitUntil:'networkidle'});
  const opacity=await nojs.locator('#participationTitle').evaluate(el=>getComputedStyle(el.closest('.reveal')).opacity);
  assert.equal(opacity,'1','story remains readable without JS');
  await nojs.close();
  writeFileSync(`${out}/homepage-check.json`,JSON.stringify({base,results,motionControls:'pass',noJavaScript:'pass'},null,2));
  console.log(JSON.stringify({base,widths:results.map(x=>x.width),navigation:'pass',images:'pass',overflow:'pass',motionControls:'pass',noJavaScript:'pass'}));
} finally { await browser.close(); }
