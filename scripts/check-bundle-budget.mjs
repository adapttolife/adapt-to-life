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
const BUDGET_KB = 90;          // JS + CSS, gzipped, together

let js = 0, css = 0;
for (const f of readdirSync(DIR)) {
  if (f.endsWith(".map")) continue;                 // never shipped to a browser
  const gz = gzipSync(readFileSync(path.join(DIR, f))).length;
  if (f.endsWith(".js")) js += gz;
  else if (f.endsWith(".css")) css += gz;
}
const total = (js + css) / 1024;
const pct = Math.round((total / BUDGET_KB) * 100);

console.log(`  bundle: ${(js / 1024).toFixed(1)}KB js + ${(css / 1024).toFixed(1)}KB css`
  + ` = ${total.toFixed(1)}KB gzipped  (${pct}% of ${BUDGET_KB}KB budget)`);

if (total > BUDGET_KB) {
  console.error(`\n  OVER BUDGET by ${(total - BUDGET_KB).toFixed(1)}KB.`);
  console.error(`  Either the addition earns the weight and the budget moves DELIBERATELY,`);
  console.error(`  or it does not and something comes back out. Do not raise this quietly.\n`);
  process.exit(1);
}
