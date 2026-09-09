#!/usr/bin/env node
// scripts/check-cta.mjs — are the buttons on this site intentional?
//
//   node scripts/check-cta.mjs
//
// Alec, 2026-09-09, looking at the closing section of /donate: "It feels weird
// putting a donate button here? Feels like we can do better. Act as a web
// designer and ux specialist and make sure we're being intentional with our
// CTA and buttons throughout our website."
//
// He was right about that button and the audit found it was not alone. 37
// buttons across the site, and the failures were all the same shape: a button
// that looks like it offers something and does not. So these are the four
// rules, and they are checked rather than remembered.
//
//   1. NO SELF-REFERENCING CTA. A "Donate" button on /donate asks somebody to
//      do the thing they are already doing, and names the page instead of the
//      next step. This is the one Alec spotted.
//   2. NO TWO BUTTONS IN ONE GROUP WITH THE SAME DESTINATION. The homepage
//      offered "Donate" and "Other ways to give" side by side and both went to
//      /donate. Presenting one road as two is worse than presenting one.
//   3. ONE PRIMARY PER GROUP. Two solid buttons next to each other is the
//      designer failing to decide, and it pushes the decision onto the reader
//      at the exact moment you wanted to make it easy.
//   4. NO href="#" THAT NEVER GETS FILLED. A button that does nothing when
//      pressed is worse than no button; the ones here are populated by script,
//      so they are allowed only when something on the page writes to them.
//
// Not checked, because it is a judgement and not a rule: the WORDS. Worth
// re-reading them anyway — a label should say what happens next ("Choose an
// amount"), not name the destination ("Donate").
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../public/", import.meta.url);
const SKIP = new Set(["review.html", "photo-picks.html"]);
let bad = 0;
const fail = (page, msg) => { console.log(`  FAIL ${page.padEnd(26)} ${msg}`); bad++; };

for (const file of readdirSync(ROOT).filter((f) => f.endsWith(".html"))) {
  if (SKIP.has(file) || file.startsWith("hero-")) continue;
  const html = readFileSync(new URL(file, ROOT), "utf8");
  const page = "/" + file.replace(/\.html$/, "").replace(/^index$/, "");

  // Buttons are grouped by the .actions block they sit in; a group is one
  // decision offered at one moment, which is the unit these rules are about.
  for (const g of html.match(/<div class="actions[^"]*"[\s\S]*?<\/div>/g) || []) {
    const btns = [...g.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*class="([^"]*\bbtn\b[^"]*)"[^>]*>([\s\S]*?)<\/a>/g)]
      .map((m) => ({ href: m[1], cls: m[2], text: m[3].replace(/<[^>]+>/g, "").trim() }));
    if (!btns.length) continue;

    const primaries = btns.filter((b) => !/\bghost\b|\bquiet\b/.test(b.cls));
    if (primaries.length > 1)
      fail(page, `${primaries.length} primary buttons in one group: ${primaries.map((b) => `"${b.text}"`).join(", ")}`);

    const seen = new Map();
    for (const b of btns) {
      const key = b.href.split("#")[0] || b.href;
      if (seen.has(key) && key !== "")
        fail(page, `two buttons, one destination (${key}): "${seen.get(key)}" and "${b.text}"`);
      else seen.set(key, b.text);

      const dest = b.href.replace(/[?#].*$/, "").replace(/\/$/, "");
      if (dest && dest === page.replace(/\/$/, ""))
        fail(page, `"${b.text}" links to the page it is on (${b.href})`);
    }
  }

  // rule 4, page-wide: a bare "#" is only honest if script fills it in
  for (const m of html.matchAll(/<a\b([^>]*)>/g)) {
    const tag = m[1];
    if (!/\bclass="[^"]*\bbtn\b/.test(tag) || !/href="#"/.test(tag)) continue;
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    if (!id) { fail(page, `a btn has href="#" and no id, so nothing can fill it`); continue; }
    m[1] = id;
    // Referenced by script is the bar, not "assigned nearby". /popcorn wires
    // this button through a helper — wire(el, href) — so the assignment is
    // nowhere near the id, and an order-sensitive check called a working
    // button dead. What actually matters is whether ANY code knows the button
    // exists. If nothing references it, the "#" is permanent.
    const refs = (html.match(new RegExp(`\\b${id}\\b`, "g")) || []).length;
    if (refs < 2)
      fail(page, `button #${id} has href="#" and no script references it`);
  }
}
console.log(bad ? `\n${bad} CTA problem(s).` : "\nevery button offers something real.");
process.exit(bad ? 1 : 0);
