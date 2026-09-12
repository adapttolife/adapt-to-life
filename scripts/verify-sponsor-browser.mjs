import http from 'node:http';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import worker from '../src/index.js';
import {formBindings} from '../test/helpers/form-db.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const OUT=process.env.FORM_TEST_OUTPUT || path.join(ROOT,'.wrangler/form-proof');mkdirSync(OUT,{recursive:true});
const contexts=[];let current,mail=[],tasks=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,opts)=>{if(!String(url).startsWith('https://api.clickup.com/api/v2/list/'))throw Error('ISOLATED TEST forbids external network');const body=JSON.parse(opts.body);tasks.push(body);return Response.json({id:'offline-'+tasks.length,url:'https://app.clickup.com/t/offline-'+tasks.length})};
function reset(){mail=[];tasks=[];current={...formBindings(),TURNSTILE_MODE:'off',FORM_LIMITER:{limit:async()=>({success:true})},CLICKUP_TOKEN:'isolated',CLICKUP_CONTACTS_LIST_ID:'isolated',SEND_EMAIL:{send:async m=>{mail.push(m);return {messageId:'offline-mail-'+mail.length}}}};}
reset();
const server=http.createServer(async(req,res)=>{try{
 if(req.url.startsWith('/api/')) {let data='';for await(const c of req)data+=c;const pending=[];const response=await worker.fetch(new Request('http://127.0.0.1'+req.url,{method:req.method,headers:req.headers,body:data}),current,{waitUntil:p=>pending.push(p)});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());contexts.push(Promise.all(pending));return;}
 const u=new URL(req.url,'http://localhost');let file=path.join(ROOT,'public',u.pathname);if(!path.extname(file))file+='.html';if(!file.startsWith(path.join(ROOT,'public')+path.sep)||!existsSync(file)){res.writeHead(404);res.end();return;}
 const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'};res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(readFileSync(file));
}catch(e){res.writeHead(500);res.end(e.stack)}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.AGENT_BROWSER_EXECUTABLE_PATH,headless:true});
const result=[];
try {
for(const width of [390,1440]) {
 reset();const page=await browser.newPage({viewport:{width,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Only on localhost: challenge mechanics tested separately; NEVER bypass prod.
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin)return route.abort();if(u.pathname==='/js/turnstile-lazy.js')return route.fulfill({body:'// isolated UI harness only',contentType:'application/javascript'});return route.continue()});
 await page.goto(origin+'/sponsorship');
 const tiers=await page.locator('[data-sponsor-tier]').evaluateAll(es=>es.map(e=>({tier:e.dataset.sponsorTier,amount:e.dataset.sponsorAmount})));
 assert(tiers.length>0);
 for(const tier of tiers){await page.locator(`[data-sponsor-tier="${tier.tier}"]`).click();await page.locator('#sponsorSheet').waitFor({state:'visible'});assert((await page.locator('[data-sheet-tier]').innerText())===tier.tier);if(tier.amount){const href=await page.locator('[data-sheet-give-btn]').getAttribute('href');assert.equal(new URL(href,origin).searchParams.get('amount'),tier.amount)}await page.locator('[data-sheet-close]').first().click();}
 await page.locator('[data-sponsor-tier]').first().click();await page.locator('#sheetName').fill('Offline Julia');await page.locator('#sheetEmail').fill('offline@example.com');await page.getByText('Add a note',{exact:false}).click();await page.locator('#sheetMsg').fill('Preserve this sponsorship note exactly.');
 // A lost response AFTER acceptance must not duplicate the record/task/receipt.
 let lost=true,ids=[];
 await page.route('**/api/contact',async route=>{const payload=route.request().postDataJSON();ids.push(payload.submission_id);if(lost){lost=false;await route.fetch();await route.abort('failed')}else await route.continue()});
 await page.locator('[data-sheet-submit]').click();await page.locator('[data-sheet-status]').filter({hasText:'Network error'}).waitFor();await Promise.all(contexts.splice(0));
 assert.equal(current.WAIVERS_DB.sql.prepare('SELECT count(*) n FROM form_submissions').get().n,1);
 await page.locator('[data-sheet-submit]').click();await page.locator('[data-sheet-sent]').waitFor({state:'visible'});await Promise.all(contexts.splice(0));
 assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);assert.equal(tasks.length,1);assert.equal(mail.length,1);assert.equal(mail[0].bcc,'hello@adapttolife.org');assert(current.WAIVERS_DB.sql.prepare("SELECT receipt FROM form_deliveries WHERE channel='receipt'").get().receipt.includes('offline-mail-1'));
 const raw=current.WAIVERS_DB.sql.prepare('SELECT * FROM form_submissions').get();const payload=JSON.parse(raw.payload);assert.equal(payload.message,'Preserve this sponsorship note exactly.');assert.equal(payload.tier,tiers[0].tier);
 const mirrored=current.INTAKE.sql.prepare('SELECT * FROM intake').get();assert.equal(mirrored.kind,'sponsor');assert(JSON.parse(mirrored.payload).clickup_url);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(OUT,`sponsor-${width}.png`),fullPage:true});
 result.push({width,tiers_checked:tiers.length,duplicate_retry_ids_match:ids[0]===ids[1],raw_records:1,clickup_tasks:tasks.length,receipts:mail.length,mirrored_kind:mirrored.kind,page_errors:errors});await page.close();
}
writeFileSync(path.join(OUT,'browser-proof.json'),JSON.stringify({isolation:'localhost, SQLite D1, fake provider transports; no external sends',results:result},null,2));console.log(JSON.stringify(result,null,2));
} finally {await browser.close();server.close();globalThis.fetch=originalFetch;}
