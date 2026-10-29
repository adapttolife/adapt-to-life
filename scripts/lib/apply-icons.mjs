// scripts/lib/apply-icons.mjs: put the dictionary's icons into a page's
// shared pieces, and keep every dictionary icon on the page current.
//
// The site has no templating, so the header, footer and links are copied into
// every page. This is the one place that knows how those copies draw their
// symbols, so a typed arrow or a hand-pasted logo can't creep back:
//
//   link arrows      "→" in a link becomes the arrow, or the external arrow
//                    when the link leaves adapttolife.org
//   back links       "←" becomes back
//   menu carets      the hand-drawn chevrons become caret
//   footer social    hand-pasted Instagram and Facebook marks become logos
//   photo band       hand-drawn pause and play become pause and resume
//   sponsor sheet    the hand-drawn close mark becomes close
//   any icon()/logo() output already on the page is redrawn from the registry
//
// It is idempotent. scripts/build-icons.mjs runs it over the hand-written
// pages; scripts/build-volunteer.mjs runs it over the pages it generates.
import { icon, logo } from "./icons.mjs";

const ARROW_SPAN = /<span class="arrow"[^>]*>\s*(?:&rarr;|→|&#8594;|\\u2192)\s*<\/span>/g;
const ours = (href) => !/^https?:\/\//.test(href) || /^https?:\/\/([a-z0-9-]+\.)*adapttolife\.org(\/|$)/.test(href);
const arrowFor = (href) => `<span class="arrow">${icon(href && !ours(href) ? "external" : "arrow", "bold")}</span>`;

export function applyIcons(html) {
  let out = html;

  // 1. Links: an arrow span, or a bare trailing arrow, inside an anchor.
  out = out.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/g, (whole, attrs, inner) => {
    const href = (attrs.match(/\bhref="([^"]*)"/) || [])[1] || "";
    let next = inner.replace(ARROW_SPAN, () => arrowFor(href));
    next = next.replace(/\s*(?:&rarr;|→)\s*$/, () => ` ${arrowFor(href)}`);
    next = next.replace(/^\s*(?:&larr;|←)\s*/, () => `<span class="arrow">${icon("back", "bold")}</span> `);
    return next === inner ? whole : `<a${attrs}>${next}</a>`;
  });
  // An arrow span outside any link (a button label) is a plain arrow.
  out = out.replace(ARROW_SPAN, () => arrowFor(""));

  // 2. The footer sign-up button is only an arrow.
  out = out.replace(/(<button class="foot-sub-btn"[^>]*>)\s*(?:&rarr;|→)\s*(<\/button>)/g,
    (_, a, b) => `${a}${icon("arrow", "bold")}${b}`);

  // 3. Menu carets.
  out = out.replace(/<svg class="caret" viewBox="0 0 10 10"[^>]*>[\s\S]*?<\/svg>/g, () => icon("caret", "bold", "caret"));

  // 4. Footer social marks: the anchor's label says which.
  out = out.replace(/(<a [^>]*aria-label="Adapt To Life on (Instagram|Facebook)"[^>]*>)\s*<svg viewBox="0 0 24 24"[^>]*>[\s\S]*?<\/svg>/g,
    (_, a, which) => `${a}${logo(which.toLowerCase())}`);

  // 5. Photo band controls.
  out = out.replace(/<svg class="rb-i-pause"[^>]*>[\s\S]*?<\/svg>/g, () => icon("pause", "fill", "rb-i-pause"));
  out = out.replace(/<svg class="rb-i-play"[^>]*>[\s\S]*?<\/svg>/g, () => icon("resume", "fill", "rb-i-play"));

  // 6. The sponsor sheet's close button.
  out = out.replace(/(<button type="button" class="sheet-close"[^>]*>)<svg viewBox="0 0 24 24"[^>]*>[\s\S]*?<\/svg>/g,
    (_, a) => `${a}${icon("close", "bold", "sheet-x")}`);

  // 7. Redraw every dictionary icon and logo from the current registry.
  out = out.replace(/<svg class="([^"]*)"[^>]*data-icon="([a-z-]+)" data-style="([a-z]+)"[^>]*>[\s\S]*?<\/svg>/g,
    (_, cls, name, style) => icon(name, style, cls));
  out = out.replace(/<svg class="([^"]*)"[^>]*data-logo="([a-z-]+)"[^>]*>[\s\S]*?<\/svg>/g,
    (_, cls, name) => logo(name, cls));
  return out;
}
