// Verify established pill CTA silhouettes, not every control (menus/inputs are distinct).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const base=process.argv[2],out=process.argv[3];mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});const results=[];
try{
 for(const width of [390,1440])for(const path of ['/','/hustle-and-heart','/donate','/volunteer','/about','/adapt-body-shop','/send-6','/sponsorship']){
  const p=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
  assert.equal((await p.goto(base+path,{waitUntil:'networkidle'})).status(),200);
  if(path==='/')await p.locator('.cb-cta').waitFor();
  const controls=await p.locator('.nav-cta,.btn,.cb-cta,.home-welcome .textlink,.fund-secondary').evaluateAll(xs=>xs.filter(x=>x.getClientRects().length&&x.getBoundingClientRect().height>0).map(x=>{const s=getComputedStyle(x),r=x.getBoundingClientRect();return {text:x.textContent.trim(),height:r.height,width:r.width,radii:[s.borderTopLeftRadius,s.borderTopRightRadius,s.borderBottomLeftRadius,s.borderBottomRightRadius].map(parseFloat)}}));
  assert.ok(controls.length);for(const c of controls)assert.ok(c.radii.every(r=>r>=Math.min(c.width,c.height)/2),`${path} ${width}: non-pill ${JSON.stringify(c)}`);
  if(path==='/'||path==='/hustle-and-heart'){
   const selector=path==='/'?'.home-welcome':'.give-moment';
   await p.locator(selector).scrollIntoViewIfNeeded();await p.evaluate(sel=>scrollTo(0,document.querySelector(sel).getBoundingClientRect().top+scrollY-document.querySelector('#nav').offsetHeight),selector);
   await p.screenshot({path:`${out}/${path==='/'?'home':'fund'}-${width}.png`});
  }
  results.push({path,width,controls});await p.close();
 }
 writeFileSync(out+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify({pages:8,widths:[390,1440],pillConsistency:'pass',controlsChecked:results.reduce((n,r)=>n+r.controls.length,0)}));
}finally{await browser.close();}
