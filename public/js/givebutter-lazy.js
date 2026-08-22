// Lazy Givebutter for below-the-fold embeds (currently /hustle-and-heart).
// /donate loads the official widget script in <head> immediately — do not
// include this file there or it will delay first fetch of the form.
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

  ["https://widgets.givebutter.com", "https://givebuttercdn.com",
   "https://givebutter.com", "https://js.stripe.com"].forEach(preconnect);

  function load() {
    if (loading) return;
    loading = true;
    var s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    document.head.appendChild(s);
  }

  function afterFirstPaint(fn) {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(fn, { timeout: 400 });
    } else {
      setTimeout(fn, 1);
    }
  }

  // /donate's form sits in the hero. Waiting on a scroll observer there just
  // delays the gift. Start the widget after first paint so HTML/CSS win the
  // first frame and the form is already fetching when the donor looks at it.
  // Other pages keep the observer (widened) so the 8.5MB bundle does not
  // contend with first paint. Never a click-wall.
  var eager = document.querySelector(".give-hero givebutter-giving-form, givebutter-giving-form[data-gb-eager]");
  if (eager) {
    afterFirstPaint(load);
  } else if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { load(); io.disconnect(); return; }
      }
    }, { rootMargin: "1200px 0px" });
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
