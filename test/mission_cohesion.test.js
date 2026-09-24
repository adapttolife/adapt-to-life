import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('homepage defines one enduring mission before current work',()=>{
 const h=read('public/index.html');
 assert.ok(h.includes('We expand access to adaptive sports so athletes can find their place.'));
 assert.ok(h.includes('We build more ways into adaptive sports.'));
 const bridge=h.split('id="next-step"')[1].split('</section>')[0];
 const enduringPurpose=bridge.split('<h3')[0];
 for(const name of ['Adaptive Sports Near Me','Hustle &amp; Heart','Adapt Body Shop']) assert.ok(!enduringPurpose.includes(name));
 assert.ok(bridge.includes('Our upcoming store,'), 'future example stays explicitly forthcoming');
 assert.ok(bridge.includes('href="/about#our-work"'));
 assert.ok(!h.includes('supports equipment, training, and travel so more athletes can take part.'));
 const ld=JSON.parse(h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
 assert.ok(ld.description.includes('expands access to adaptive sports so athletes can find their place'));
});
test('shop is a coming-soon part of the mission, not a premature store',()=>{
 const h=read('public/adapt-body-shop.html');

 assert.ok(h.includes('The store is not open yet.'));
 assert.ok(h.includes('A purchase is not the same as a charitable gift.'));
 assert.ok(!/Shop now|Buy now|Add to cart|100%|all profits/i.test(h));
 for(const path of ['index','about','roadmap','promise','volunteer','donate'])assert.ok(read('public/'+path+'.html').includes('href="/adapt-body-shop"'));
});
test('current initiative details do not cap the mission or repurpose donations',()=>{
 const about=read('public/about.html'),donate=read('public/donate.html'),promise=read('public/promise.html');
 assert.ok(about.includes('These are starting points, not the limits of the mission.'));
 assert.ok(donate.includes('Gifts support the Hustle &amp; Heart Fund.'));
 assert.ok(promise.includes('Gifts already received keep their original terms.'));
 assert.ok(promise.includes("If a program can't meet the safety standards its athletes need, it isn't a program we fund."));
 const roles=read('data/volunteer-roles.mjs');
 assert.ok(roles.includes('We bring people and opportunities together and build the support around participation.'));
});
