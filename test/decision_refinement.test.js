import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('campaign fallback is prospective and existing gift terms survive',()=>{
 const p=read('public/promise.html'),s=read('public/send-6.html');
 assert.ok(p.includes('Gifts already received keep their original terms.'));
 assert.ok(p.includes('before you give'));
 assert.ok(!p.includes('the money moves to'));
 assert.ok(s.includes('For new gifts:'));
 assert.ok(s.includes('remaining campaign funds from those gifts'));
 assert.ok(s.indexOf('id="campaign-terms"') < s.indexOf('<a class="btn" href="/donate">'));
 for(const f of ['public/donate.html','public/hustle-and-heart.html']) assert.ok(read(f).includes('href="/promise#campaign-gifts"'));
});
test('overhead confirmation includes both revenue projects without an allocation percentage',()=>{
 const p=read('public/promise.html');
 assert.match(p,/Alec covers the overhead himself/);
 assert.match(p,/building revenue/);
 assert.ok(p.includes('https://adaptivesportsnearme.com'));
 assert.ok(p.includes('https://adaptbodyshop.com'));
 assert.ok(!/hundred percent|100% of/.test(p));
});
test('sponsorship removes automatic recurring and naming commitments',()=>{
 const p=read('public/sponsorship.html');
 for(const s of ['Quarterly impact reports','An athlete story each year','Naming rights on a grant cycle','An annual impact briefing','A speaking moment at an event']) assert.ok(!p.includes(s),s);
 assert.ok(p.includes('worked out individually, not included automatically'));
 assert.ok(p.includes('Your name or logo on our supporters wall'));
});
test('formal donor entity matches the IRS letter',()=>{
 assert.ok(read('public/donate.html').includes('<span class="give-fact-v">Adapt To Life NFP</span>'));
});
test('future thank-you templates do not resurrect blanket allocation promises',()=>{
 const p=read('src/givebutter_webhook.js');
 assert.ok(!/hundred percent|100% of/.test(p));
 assert.ok(p.includes('equipment, training, and travel'));
});
