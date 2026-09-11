// Compare accepted live framing with a candidate; read-only, no forms submitted.
// Save the reference before publication, then compare the new live build to it.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const [base,out,reference]=process.argv.slice(2);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
const results=[];
try{
 for(const [width,height] of [[320,700],[390,844],[430,932],[768,1024],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:2,reducedMotion:'reduce'});
  assert.equal((await page.goto(base,{waitUntil:'networkidle'})).status(),200);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('#heroStage img')].filter(i=>i.getClientRects().length).map(i=>i.decode()));});
  const state=await page.evaluate(()=>{
   const box=el=>{const r=el.getBoundingClientRect();return ['x','y','width','height'].map(k=>Math.round(r[k]*100)/100)};
   const styles=(el,keys)=>Object.fromEntries(keys.map(k=>[k,getComputedStyle(el)[k]]));
   return {hero:box(document.querySelector('#heroStage')),headline:document.querySelector('#heroStage h1').textContent,panels:[...document.querySelectorAll('#heroStage .mw-p')].filter(p=>getComputedStyle(p).display!=='none').map(p=>{
    const i=p.querySelector('img');return {class:p.className,src:i.getAttribute('src'),natural:[i.naturalWidth,i.naturalHeight],panel:box(p),image:box(i),panelStyle:styles(p,['order','transform','overflow','filter']),imageStyle:styles(i,['objectFit','objectPosition','transform','filter'])};
   }).sort((a,b)=>Number(a.panelStyle.order)-Number(b.panelStyle.order))};
  });
  assert.equal(state.panels.length,width<=900?4:22);
  if(width<=900)assert.deepEqual(state.panels.map(p=>p.class.match(/p-(\S+)/)[1]),['net','whitecap','brian','forehand']);
  results.push({width,height,...state});
  await page.locator('#heroStage').screenshot({path:`${out}/hero-${width}.png`});
  await page.close();
 }
 if(reference)assert.deepEqual(results,JSON.parse(readFileSync(reference,'utf8')),'accepted image sources, geometry, order and crop styles must match exactly');
 writeFileSync(`${out}/hero.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify({base,widths:results.map(r=>r.width),reference:reference||'baseline captured',photoPreservation:'pass'}));
}finally{await browser.close();}
