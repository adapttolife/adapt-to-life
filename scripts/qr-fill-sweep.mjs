#!/usr/bin/env node
// Spec 116 principle 5: "Design serves scanning. Rounded modules, custom eyes,
// frames and colour are all welcome right up to the point they cost decode
// margin, and then they lose. Every treatment is measured, not eyeballed."
//
// This is the measurement. It exists in the repo rather than in a comment
// because MODULE_FILL in lib/qr-art.mjs is a load-bearing constant chosen from
// data, and a number justified only by prose is a number nobody can re-check.
//
//   node scripts/qr-fill-sweep.mjs
//
// Run it after ANY change to the module or eye geometry. The original sweep
// concluded 0.88 was safe; it had only ever looked at the framed style, and
// --style=plain did not decode at all on any live slug until 2026-07-31.

import QR from 'qrcode';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';

const INK='#0C0C0E', ORANGE='#E8572A', CREAM='#F7F4EE';
const isEye=(r,c,n)=>(r<7&&c<7)||(r<7&&c>=n-7)||(r>=n-7&&c<7);

function build(url, fill, frame){
  const qr=QR.create(url,{errorCorrectionLevel:'H'});
  const n=qr.modules.size,d=qr.modules.data,m=10,quiet=40,dim=n*m+quiet*2;
  const pad=(1-fill)/2;
  let body='';
  for(let r=0;r<n;r++)for(let c=0;c<n;c++){
    if(!d[r*n+c]||isEye(r,c,n))continue;
    const x=quiet+c*m,y=quiet+r*m;
    body+=`<rect x="${x+m*pad}" y="${y+m*pad}" width="${m*fill}" height="${m*fill}" rx="${m*fill*0.34}" fill="${INK}"/>`;
  }
  const eye=(x,y)=>`<rect x="${x}" y="${y}" width="${7*m}" height="${7*m}" rx="${m*2.1}" fill="${INK}"/>`
    +`<rect x="${x+m}" y="${y+m}" width="${5*m}" height="${5*m}" rx="${m*1.5}" fill="#FFFFFF"/>`
    +`<circle cx="${x+3.5*m}" cy="${y+3.5*m}" r="${m*1.55}" fill="${ORANGE}"/>`;
  const eyes=eye(quiet,quiet)+eye(quiet+(n-7)*m,quiet)+eye(quiet,quiet+(n-7)*m);
  if(!frame) return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}" width="${dim}" height="${dim}"><rect width="${dim}" height="${dim}" fill="#FFFFFF"/>${body}${eyes}</svg>`,n};
  const band=dim*0.20,H=dim+band,inset=dim*0.035;
  return {svg:`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${H}" width="${dim}" height="${H}">`
    +`<rect width="${dim}" height="${H}" rx="${dim*0.045}" fill="${CREAM}"/>`
    +`<rect x="${inset}" y="${inset}" width="${dim-inset*2}" height="${dim-inset*2}" rx="${dim*0.02}" fill="#FFFFFF"/>`
    +body+eyes+`</svg>`,n};
}

const SLUGS=['chair','sign','card','popcorn'];
const FILLS=[0.88,0.90,0.92,0.94,0.96,0.98,1.0];
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:2400,height:2800}});
async function ok(url,fill,frame){
  const {svg,n}=build(url,fill,frame);
  const W=Math.round(2048/(n+8))*(n+8);
  await page.setContent(`<body style="margin:0;background:#fff"><div id="w" style="width:${W}px">`
    +svg.replace(/ width="[\d.]+" height="[\d.]+"/,` width="${W}"`)+`</div></body>`);
  await page.waitForTimeout(120);
  const img=PNG.sync.read(await (await page.$('#w')).screenshot());
  const got=jsQR(new Uint8ClampedArray(img.data),img.width,img.height);
  return got&&got.data===url;
}
for(const frame of [false,true]){
  console.log(`\n  ${frame?'FRAME':'PLAIN'}   ` + FILLS.map(f=>f.toFixed(2)).join('  '));
  for(const s of SLUGS){
    const row=[];
    for(const f of FILLS) row.push(await ok('https://adapttolife.org/q/'+s,f,frame)?' ok ':'FAIL');
    console.log(`  ${s.padEnd(8)} ${row.join('  ')}`);
  }
}
await browser.close();
