import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import PostalMime from 'postal-mime';
import { buildMime } from '../src/mail-transport.js';
import { sendContactReceipt } from '../src/receipts.js';
test('contact receipt works without SEND_EMAIL and preserves Gmail provider/house BCC',async()=>{
 const original=globalThis.fetch;let parsed;
 globalThis.fetch=async(url,init)=>{if(url.includes('oauth2'))return Response.json({access_token:'x',token_type:'Bearer'});parsed=await PostalMime.parse(Buffer.from(JSON.parse(init.body).raw,'base64url'));return Response.json({id:'contact-accepted'});};
 try{const result=await sendContactReceipt({...gmail,INTAKE_CAPTURE_RECEIPT:true,INTAKE_SUBMISSION_ID:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},{name:'Zoë',email:'person@example.test',message:'Original words',type:'question'});assert.equal(result.provider,'gmail');assert.equal(result.messageId,'contact-accepted');assert.equal(parsed.bcc[0].address,'hello@adapttolife.org');assert.ok(parsed.headers.some(h=>h.key==='auto-submitted'&&h.value==='auto-generated'));}
 finally{globalThis.fetch=original;}
});
import { claimAndThank, recoverDonorEmails } from '../src/givebutter_webhook.js';
function database(){const s=new DatabaseSync(':memory:');s.exec(readFileSync(new URL('../schema/donor_gifts.sql',import.meta.url),'utf8'));return {s,db:{prepare(sql){let a=[];const q=s.prepare(sql);return {bind(...v){a=v;return this;},async first(){return q.get(...a);},async all(){return {results:q.all(...a)};},async run(){return {meta:{changes:Number(q.run(...a).changes)}};}};}}};}
const gmail={MAIL_TRANSPORT:'gmail',GMAIL_FROM:'hello@adapttolife.org',GMAIL_CLIENT_ID:'test',GMAIL_CLIENT_SECRET:'test',GMAIL_REFRESH_TOKEN:'test'};
function insert(s,id,status,attempt=0){s.prepare(`INSERT INTO donor_gifts(transaction_id,email,amount,donated,transacted_at,email_status,attempt_count,email_attempted_at,next_attempt_at,created_at,updated_at) VALUES (?,'person@example.test',10,10,'2026-01-01',?,?, '2026-01-01','2026-01-01','2026-01-01','2026-01-01')`).run(id,status,attempt);}
test('Gmail donor errors terminate for review; no cron retry or stale-lease re-send',async()=>{
 const {s,db}=database(),original=globalThis.fetch;let submissions=0;
 globalThis.fetch=async url=>{if(url.includes('oauth2'))return Response.json({access_token:'x',token_type:'Bearer'});submissions++;throw Error('response lost');};
 try{insert(s,'new','pending');const env={...gmail,WAIVERS_DB:db};await claimAndThank(env,{transactionId:'new',email:'person@example.test',amount:10,donated:10});assert.equal(submissions,1);assert.equal(s.prepare("SELECT email_status FROM donor_gifts WHERE transaction_id='new'").get().email_status,'failed');
  insert(s,'crashed','sending',1);insert(s,'legacy-retry','retry',1);insert(s,'legacy-pending','pending',1);
  const result=await recoverDonorEmails(env);assert.equal(submissions,1);assert.equal(result.failed,4);assert.equal(result.ok,false);
 }finally{globalThis.fetch=original;s.close();}
});
test('Gmail donor claimant rejects stale lease even outside the cron recovery path',async()=>{const {s,db}=database();try{insert(s,'stale','sending',1);assert.equal((await claimAndThank({...gmail,WAIVERS_DB:db},{transactionId:'stale'})).duplicate,true);assert.equal(s.prepare("SELECT attempt_count FROM donor_gifts WHERE transaction_id='stale'").get().attempt_count,1);}finally{s.close();}});
test('independent MIME parser preserves Unicode, reply identity, PDF bytes and inline image',async()=>{
 const raw=buildMime({from:'Adapt To Life <hello@adapttolife.org>',to:'Person <person@example.test>',replyTo:'hello@adapttolife.org',subject:'Hello — Zoë',text:'Plain Zoë',html:'<p>Zoë<img src="cid:logo"></p>',attachments:[{filename:'Signed waiver.pdf',type:'application/pdf',content:new Uint8Array([37,80,68,70,0,255])},{filename:'logo.png',type:'image/png',disposition:'inline',contentId:'logo',content:new Uint8Array([137,80,78,71])}]},gmail.GMAIL_FROM);
 const parsed=await PostalMime.parse(raw);assert.equal(parsed.subject,'Hello — Zoë');assert.equal(parsed.from.name,'Adapt To Life');assert.equal(parsed.replyTo[0].address,'hello@adapttolife.org');assert.equal(parsed.text.trim(),'Plain Zoë');assert.match(parsed.html,/cid:logo/);assert.equal(parsed.attachments.length,2);assert.equal(parsed.attachments[0].filename,'Signed waiver.pdf');assert.deepEqual(new Uint8Array(parsed.attachments[0].content),new Uint8Array([37,80,68,70,0,255]));assert.equal(parsed.attachments[1].contentId,'<logo>');
});
