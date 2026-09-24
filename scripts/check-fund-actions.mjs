import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2],out=process.argv[3];mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});const results=[];
try{
 for(const width of [320,390,600,768,1024,1440]){
  const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});const errors=[];p.on('pageerror',e=>errors.push(String(e)));
  assert.equal((await p.goto(base+'/hustle-and-heart',{waitUntil:'networkidle'})).status(),200);
  await p.locator('.give-moment').scrollIntoViewIfNeeded();
  const state=await p.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:[...document.querySelectorAll('.fund-actions a')].map(x=>({href:x.getAttribute('href'),x:x.offsetLeft,y:x.offsetTop,w:x.offsetWidth,h:x.offsetHeight})),termsBeforeForm:document.querySelector('.fund-terms').compareDocumentPosition(document.querySelector('givebutter-giving-form, .staging-payment'))&Node.DOCUMENT_POSITION_FOLLOWING,padding:parseFloat(getComputedStyle(document.querySelector('.give-moment')).paddingTop)}));
  assert.equal(state.overflow,false);assert.equal(state.buttons.length,1);assert.equal(state.buttons[0].href,'#fund-donation');assert.ok(state.buttons[0].h>=52);assert.ok(state.termsBeforeForm);assert.ok(state.padding<=72);assert.deepEqual(errors,[]);
  await p.locator('.fund-actions .btn').scrollIntoViewIfNeeded();await p.locator('.fund-actions .btn').focus();assert.ok(await p.locator('.fund-actions .btn').evaluate(x=>x===document.activeElement));await p.keyboard.press('Enter');await p.waitForURL(base+'/hustle-and-heart#fund-donation');
  const target=await p.locator('#fund-donation').boundingBox();assert.ok(target.y>=60&&target.y<900,'form target visible below header');
  assert.equal(await p.locator('.staging-payment').count(),0);assert.ok(await p.locator('givebutter-giving-form[campaign="IXM5DR"]').isVisible());
  for(const [selector,path]of [['.fund-terms a','/promise#campaign-gifts'],['.thermo-link','/send-6']]){await p.locator(selector).click();await p.waitForURL(base+path);await p.goBack({waitUntil:'networkidle'});}
  await p.evaluate(()=>{const y=document.querySelector('.give-moment').getBoundingClientRect().top+scrollY-document.querySelector('#nav').offsetHeight;scrollTo(0,y)});
  await p.screenshot({path:`${out}/fund-actions-${width}.png`});results.push({width,...state});await p.close();
 }
 writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({widths:results.map(x=>x.width),geometry:'pass',keyboard:'pass',destinations:'pass',termsPlacement:'pass',overflow:'pass'}));
}finally{await browser.close();}
