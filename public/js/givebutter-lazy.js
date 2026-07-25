// Lazy Givebutter. Replaces the eager
// <script async src="https://widgets.givebutter.com/latest.umd.cjs?acct=...">
// on /donate and /hustle-and-heart.
//
// Why: measured 2026-07-25, the embed pulls ~8.5MB across ~80 requests from 19
// third-party hosts — Stripe (1MB), Google Maps Places (1.3MB), moment-timezone
// (773KB), lottie, the Facebook SDK, GTM, Google Analytics, FontAwesome Pro and
// a PostHog session recorder. None of that is ours and none of it can be
// trimmed, but WHEN it loads is entirely ours. Parsing it during first paint
// blocked the main thread for ~2.1s and made taps lag up to 577ms on a
// throttled phone, in a window roughly ten seconds in.
//
// What this does NOT do: hide the form behind a click. The panel still loads on
// its own as the donor approaches it, because /donate exists to take a gift and
// putting a click in front of the amounts is a conversion decision, not a
// performance one.
//
// Pair this with the reserved min-height on the element (see each page's CSS).
// The embed used to mount ~1.9s in with no space held for it, which shoved the
// page and scored CLS between 0.12 and 0.76 run to run.
(function () {
  var els = document.querySelectorAll("givebutter-giving-form");
  if (!els.length) return;

  var ACCT = document.documentElement.getAttribute("data-gb-acct") || "7FsgcjXFnW6fabQn";
  var SRC = "https://widgets.givebutter.com/latest.umd.cjs?acct=" + ACCT;
  var loading = false;

  // Warm the connections the embed will need the moment we know it is coming.
  // These are handshakes we can pay early and in parallel rather than serially
  // once the bundle starts pulling its own dependencies.
  function preconnect(origin) {
    var l = document.createElement("link");
    l.rel = "preconnect";
    l.href = origin;
    l.crossOrigin = "";
    document.head.appendChild(l);
  }

  function load() {
    if (loading) return;
    loading = true;
    ["https://widgets.givebutter.com", "https://givebuttercdn.com",
     "https://givebutter.com", "https://js.stripe.com"].forEach(preconnect);
    var s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    document.head.appendChild(s);
  }

  // Load as the form approaches the viewport. On both pages the panel sits below
  // a full-height hero on a phone, so this fires on the donor's first scroll —
  // early enough that the form is ready when they arrive, late enough that the
  // bundle is not competing with first paint.
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { load(); io.disconnect(); return; }
      }
    }, { rootMargin: "600px 0px" });
    for (var i = 0; i < els.length; i++) io.observe(els[i]);
  } else {
    load();
  }

  // Any intent at all beats the observer: a tap or a keyboard focus anywhere in
  // the giving panel loads immediately.
  function onIntent(e) {
    var t = e.target;
    if (t && t.closest && t.closest("givebutter-giving-form, .give-panel, .give-split-form")) load();
  }
  document.addEventListener("pointerdown", onIntent, true);
  document.addEventListener("focusin", onIntent, true);
})();
