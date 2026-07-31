// Spec 116 P6 — keep QR attribution alive from the scan to the gift.
//
// The chain broke here before this file existed. /q/chair redirects to
// /send-6?utm_campaign=qr-chair..., the visitor reads the campaign, then taps
// Donate — and every Donate link on the site is a bare href="/donate", so the
// attribution died at that hop and Givebutter saw an unattributed gift. Scans
// were counted, dollars were not, and "which surface actually works" had no
// answer.
//
// So: remember the attribution for the visit, put it back on the URL of the
// page carrying the donation form, and carry it across internal links.
//
// The parameter list is not arbitrary. The live Givebutter widget forwards
// exactly utm_* and gba_* from the parent page URL into its iframe and drops
// everything else — measured on 2026-07-31 with scripts/probe-givebutter-utm.mjs.
// `src` is ours, kept because it predates this and reads well in logs.
//
// Deliberately does nothing else: no cookies, no storage that outlives the tab,
// no identifiers. sessionStorage clears when the tab closes, which is the right
// lifetime for "this visit came from a sticker".
(function () {
  var KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'gba_source', 'src'];
  var STORE = 'atl_attribution';

  function fromSearch(search) {
    var p = new URLSearchParams(search);
    var out = {};
    for (var i = 0; i < KEYS.length; i++) {
      var v = p.get(KEYS[i]);
      if (v) out[KEYS[i]] = v;
    }
    return out;
  }

  function read() {
    try {
      var raw = sessionStorage.getItem(STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save(data) {
    try { sessionStorage.setItem(STORE, JSON.stringify(data)); } catch (e) { /* private mode */ }
  }

  // The URL always wins. Someone who scans a second, different code mid-visit
  // is telling us the newer surface is the one that moved them.
  var current = fromSearch(location.search);
  var attribution = Object.keys(current).length ? current : read();
  if (Object.keys(current).length) save(current);

  if (!attribution || !Object.keys(attribution).length) return;

  // Only QR traffic. An email or ad campaign carries its own utm_* and this
  // file has no business rewriting links for it.
  var isQr = attribution.utm_source === 'qr' || /^qr-/.test(attribution.gba_source || attribution.src || '');
  if (!isQr) return;

  function applyTo(url) {
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      if (attribution[k] && !url.searchParams.has(k)) url.searchParams.set(k, attribution[k]);
    }
    return url;
  }

  // Put the attribution back on this page's own URL before the donation widget
  // reads it. This runs deferred in <head>, and the widget is lazy-loaded on
  // approach, so the ordering has real margin.
  if (document.querySelector('givebutter-giving-form') && !Object.keys(current).length) {
    try {
      var here = applyTo(new URL(location.href));
      history.replaceState(null, '', here.pathname + here.search + here.hash);
    } catch (e) { /* history unavailable; the link rewrite below still carries it */ }
  }

  // Carry it across internal navigation, so the hop from a campaign page to the
  // donation form keeps it.
  function rewriteLinks() {
    var links = document.querySelectorAll('a[href]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) === '#' || /^(mailto|tel):/i.test(href)) continue;
      var u;
      try { u = new URL(href, location.origin); } catch (e) { continue; }
      if (u.origin !== location.origin) continue;   // never leak our markers off-site
      applyTo(u);
      a.setAttribute('href', u.pathname + u.search + u.hash);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', rewriteLinks);
  } else {
    rewriteLinks();
  }
})();
