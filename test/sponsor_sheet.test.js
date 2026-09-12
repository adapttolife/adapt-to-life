// The sponsorship sheet's contract with the page it opens over.
//
// The sheet reads the tier, price and one-liner off the button's data-sponsor-*
// attributes rather than keeping its own copy of the ladder — but attributes on
// a button and text inside a card are still two places the same number is
// written. These tests are the thing that stops them drifting: change $2,500 in
// the card and forget the attribute, and the build fails here instead of a
// sponsor seeing one price on the card and another in the sheet.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/sponsorship.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/js/sponsor-sheet.js", import.meta.url), "utf8");

// The four ladder cards, each sliced from its opening <div class="tier ..."> to
// the start of the next one (or to the founding block, which is a different
// shape and is asserted separately below).
function cards() {
  const starts = [];
  const re = /<div class="tier reveal[^"]*">/g;
  let m;
  while ((m = re.exec(html))) starts.push(m.index);
  const end = html.indexOf('<div class="founding');
  return starts.map((start, i) => html.slice(start, i + 1 < starts.length ? starts[i + 1] : end));
}

function attr(block, name) {
  const m = block.match(new RegExp(`data-sponsor-${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function text(block, cls) {
  const m = block.match(new RegExp(`<div class="${cls}">([\\s\\S]*?)</div>|<p class="${cls}">([\\s\\S]*?)</p>`));
  if (!m) return null;
  return (m[1] ?? m[2]).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

test("every tier card carries the sheet attributes", () => {
  const blocks = cards();
  assert.equal(blocks.length, 4, "four ladder tiers on the page");
  for (const b of blocks) {
    assert.ok(attr(b, "tier"), "tier card has data-sponsor-tier");
    assert.ok(attr(b, "price"), "tier card has data-sponsor-price");
    assert.ok(attr(b, "line"), "tier card has data-sponsor-line");
  }
});

test("the sheet's price and name are the card's own, character for character", () => {
  for (const b of cards()) {
    assert.equal(attr(b, "price"), text(b, "tier-price"), `price drift on ${attr(b, "tier")}`);
    assert.equal(attr(b, "tier"), text(b, "tier-name"), "tier name drift");
    assert.equal(attr(b, "line"), text(b, "tier-line"), `line drift on ${attr(b, "tier")}`);
  }
});

test("give-now is offered on the low tiers only, and its amount matches the price", () => {
  const withAmount = [];
  for (const b of cards()) {
    const amount = attr(b, "amount");
    if (!amount) continue;
    withAmount.push(attr(b, "tier"));
    // $2,500 -> 2500. A button that charges a different number than the card
    // shows is the single worst bug this feature could ship.
    assert.equal(amount, attr(b, "price").replace(/[^0-9]/g, ""), "give-now amount must equal the tier price");
  }
  assert.deepEqual(withAmount, ["Teammate", "Coach"],
    "Alec's ruling 2026-09-12: pay-now on $500 and $2,500; $10,000 and up are a conversation");
});

test("Founding Partner opens the sheet too, and is conversation-only", () => {
  // Its card is a different shape (the dark anchor block, not a ladder card),
  // so it is checked on its own rather than bent into the loop above.
  const m = html.match(/data-sponsor-tier="Founding Partner"[^>]*/);
  assert.ok(m, "the founding partner CTA opens the sheet");
  assert.ok(!/data-sponsor-amount/.test(m[0]), "no phone checkout at $50,000");
  assert.ok(m[0].includes('data-sponsor-price="$50,000+"'), "the sheet names a price");
  assert.ok(
    html.includes('href="/contact?rsn=sponsor&amp;tier=Founding%20Partner"'),
    "and keeps its no-JavaScript fallback"
  );
});

test("the buttons stay real links, so the sheet is an enhancement and not the only door", () => {
  for (const b of cards()) {
    const tier = attr(b, "tier");
    assert.ok(
      html.includes(`href="/contact?rsn=sponsor&amp;tier=${tier}"`),
      `${tier} keeps its no-JavaScript fallback to /contact`
    );
  }
});

test("the sheet posts what the contact API actually reads", () => {
  // handleContact in src/index.js reads fn/ln/em/rsn/msg/source/cf_token, and
  // "Giving or sponsoring" must be a member of LEAD_TYPES or the reason is
  // dropped on the floor and the ClickUp task loses its type.
  const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  assert.ok(worker.includes('"Giving or sponsoring"'), "LEAD_TYPES still carries the sponsor reason");
  for (const key of ["fn:", "em:", "rsn:", "msg:", "source:", "cf_token:"]) {
    assert.ok(js.includes(key), `payload carries ${key}`);
  }
  assert.ok(js.includes('rsn: "Giving or sponsoring"'), "reason is the LEAD_TYPES string, verbatim");
});

test("the tier is recorded in a field that can be filtered, not only in prose", () => {
  // src/clickup.js puts `source` on CONTACT_FIELD.source, which is what makes
  // "how many Captain enquiries this quarter" a view instead of a read-through.
  assert.ok(js.includes('"Sponsorship page: "'), "source names the page and the tier");
  assert.ok(js.includes(".slice(0, 80)"), "source stays inside the 80-char cap handleContact applies");
});

test("the Turnstile widget in the sheet is primed on open", () => {
  // A widget rendered into a display:none dialog may never run its challenge,
  // and a token is single-use, so a second sponsorship in one visit needs a
  // reset. Both are the same call site.
  assert.ok(js.includes("primeTurnstile"), "sheet primes Turnstile");
  assert.ok(/turnstile\.remove/.test(js) && /turnstile\.render/.test(js),
    "every open tears the old widget down and renders a fresh one while visible");
  assert.ok(/turnstile\.reset/.test(js), "reset is the recovery when render() throws on an auto-rendered box");
  assert.ok(!/querySelector\("\[name=company\]"\)\.value/.test(js),
    "the honeypot read is null-guarded; a throw here would swallow the submission");
  assert.ok(html.includes('id="sponsorSheet"') && /class="cf-turnstile"[\s\S]{0,400}data-sheet-submit/.test(html),
    "the widget sits inside the sheet's form, above its submit");
});

// ---------------------------------------------------------------------------
// The hidden-attribute contract, and the close target.
//
// These exist because of a bug that SHIPPED: the "or" divider stayed painted on
// the conversation-only tiers. The JS set `hidden` correctly and the old test
// asserted exactly that — the `.hidden` property, which reflects the attribute
// the code had just set and therefore could never have failed. What decides
// whether a visitor sees the divider is the CASCADE, so that is what is checked
// here. The live behavioural half runs in the browser drive.

test("nothing in the sheet declares a display that would defeat the hidden attribute", () => {
  const css = readFileSync(new URL("../src/css/sponsor-sheet.css", import.meta.url), "utf8");
  // The blanket rule that makes `hidden` authoritative inside the sheet.
  assert.ok(/\.sheet \[hidden\]\s*\{\s*display:\s*none/.test(css),
    "`.sheet [hidden] { display:none }` must outrank any component rule naming a display");

  // Every element the JS toggles must be covered by it.
  for (const hook of ["data-sheet-give", "data-sheet-or", "data-sheet-body", "data-sheet-sent"]) {
    assert.ok(html.includes(hook), `${hook} still exists to be toggled`);
  }
  assert.ok(js.includes(".hidden = "), "the JS still toggles via the hidden attribute");
});

test("the close control meets the 44px touch-target floor", () => {
  const css = readFileSync(new URL("../src/css/sponsor-sheet.css", import.meta.url), "utf8");
  const rule = css.match(/\.sheet-close\{([\s\S]*?)\}/);
  assert.ok(rule, ".sheet-close is styled");
  const w = Number((rule[1].match(/width:\s*(\d+)px/) || [])[1]);
  const h = Number((rule[1].match(/height:\s*(\d+)px/) || [])[1]);
  // Apple HIG and WCAG 2.5.8 both put the floor at 44. Alec reported the old
  // 38x38 as hard to hit on a phone, which is exactly what that gap predicts.
  assert.ok(w >= 44 && h >= 44, `close target is ${w}x${h}, under the 44x44 floor`);
  assert.ok(/\.sheet-close::before\{[^}]*inset:\s*-\d+px/.test(css),
    "the hit area is extended past the visible box, so a near miss still closes");
  assert.ok(/touch-action:\s*manipulation/.test(rule[1]),
    "no tap delay or double-tap zoom on a control this close to the screen edge");

  // Alec reported it STILL hard to hit at 44x44 with a 56px hit area, and a
  // coordinate probe showed every tap inside that area did register. The hit box
  // was never the problem: a thin grey glyph on cream reads as decoration, so an
  // invisible 56px target gets aimed at like a 14px one. It needs a surface.
  assert.ok(/background:\s*rgba\([^)]+\)/.test(rule[1]) && !/background:\s*transparent/.test(rule[1]),
    "the close control paints a visible chip, so the target looks as big as it is");
  assert.ok(/\.sheet-close:active\{[^}]*transform:\s*scale/.test(css),
    "touch has no hover, so the pressed state must be unmistakable");
});

test("the sheet can be dismissed by dragging the handle down", () => {
  // The grab handle was drawing a promise the sheet did not keep. Flicking a
  // bottom sheet away is the gesture a thumb reaches for before it travels to
  // the far corner of the screen.
  assert.ok(html.includes("data-sheet-grab"), "there is a grab strip to drag from");
  assert.ok(/grab\.addEventListener\("pointerdown"/.test(js), "the drag arms on the grab strip");
  assert.ok(/grab\.addEventListener\("pointermove"/.test(js) && /grab\.addEventListener\("pointerup"/.test(js),
    "and follows and releases");
  assert.ok(/matchMedia\("\(max-width: 640px\)"\)/.test(js),
    "phones only — a centred desktop dialog has nothing to flick");
  assert.ok(/pointercancel/.test(js), "an interrupted drag springs back rather than sticking");
});

test("a drag that starts inside the sheet cannot dismiss it", () => {
  // A `click` fires on the common ancestor of press and release, so a drag from
  // inside the sheet to outside used to resolve to the dialog and close it —
  // selecting text in the note field was enough. Both ends must be the backdrop.
  assert.ok(/pressedOnBackdrop/.test(js), "the press target is remembered, not just the click target");
  assert.ok(/e\.target === sheet && pressedOnBackdrop/.test(js),
    "dismissal requires the gesture to begin AND end on the backdrop");
});
