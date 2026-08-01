#!/usr/bin/env node
// Spec 127 AC3: the bundle has a budget and the build FAILS past it.
//
// The console replaced a 42KB single file with no dependencies. That trade is
// worth making for a console and worthless for one page, so the cost has to
// stay visible and enforced rather than drifting a few KB per feature until
// someone notices it loads slowly. A budget nobody enforces is a wish.
//
// Numbers are gzipped, because that is what crosses the wire.
import { readdirSync, readFileSync, statSync } from "fs";
import { gzipSync } from "zlib";
import path from "path";

const DIR = "public/admin/app/assets";

// TWO budgets, because they answer different questions.
//
// INITIAL is what a person waits for before the console is usable, and it is
// the number that replaced a 42KB zero-dependency page. Deferred chunks are
// real weight but they arrive after the thing is already readable.
//
// The map alone is ~21KB gzipped — a projected basemap plus d3-geo. It earns
// its place and it does not earn blocking first paint, which is exactly what
// splitting is for. Without this split the entry hit 95% of a single budget
// with five phases still to build.
const INITIAL_KB = 70;
const TOTAL_KB = 130;

let initial = 0, deferred = 0;
for (const f of readdirSync(DIR)) {
  if (f.endsWith(".map")) continue;                 // never shipped to a browser
  const gz = gzipSync(readFileSync(path.join(DIR, f))).length;
  // Vite names the entry "index-*"; everything else is a split chunk that
  // loads on demand.
  if (/^index-/.test(f)) initial += gz;
  else deferred += gz;
}
const iKB = initial / 1024, dKB = deferred / 1024, tKB = iKB + dKB;

console.log(`  initial : ${iKB.toFixed(1)}KB gzipped  (${Math.round((iKB / INITIAL_KB) * 100)}% of ${INITIAL_KB}KB)`);
console.log(`  deferred: ${dKB.toFixed(1)}KB gzipped  (loads after the page is usable)`);
console.log(`  total   : ${tKB.toFixed(1)}KB gzipped  (${Math.round((tKB / TOTAL_KB) * 100)}% of ${TOTAL_KB}KB)`);

let bad = false;
if (iKB > INITIAL_KB) {
  console.error(`\n  INITIAL OVER BUDGET by ${(iKB - INITIAL_KB).toFixed(1)}KB — this is what a person waits for.`);
  console.error(`  Split it, or take something out. Raising this number is a decision, not a fix.`);
  bad = true;
}
if (tKB > TOTAL_KB) {
  console.error(`\n  TOTAL OVER BUDGET by ${(tKB - TOTAL_KB).toFixed(1)}KB.`);
  bad = true;
}
if (bad) { console.error(""); process.exit(1); }
