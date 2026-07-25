// Lazy Turnstile. Replaces the eager <script src=".../turnstile/v0/api.js">
// that sat on all sixteen pages.
//
// Why: measured 2026-07-25, the Turnstile challenge platform was ~820KB across
// 7 requests on the home page, about 60% of the entire mobile payload, to guard
// a newsletter field in the footer that most visitors never scroll to. The
// widget is already data-appearance="interaction-only", so it is invisible until
// it is needed; loading it before the visitor is anywhere near a form buys
// nothing.
//
// The part that makes this safe: TURNSTILE_SECRET_KEY IS configured, so
// verifyTurnstile in src/index.js fails CLOSED on a missing token. A naive
// lazy-load would silently break every form for anyone who submits before the
// token lands. So there are three triggers, deliberately overlapping:
//
//   1. the widget nearing the viewport (800px out) starts the load early,
//   2. any focus or pointer press inside a form that carries a widget forces it,
//   3. and a submit with no token yet is HELD until the token arrives.
//
// (3) is the actual guarantee; (1) and (2) exist so that (3) almost never has to
// do anything a human would notice.
(function () {
  var SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  var WAIT_MS = 8000;
  var loading = false;

  function load() {
    if (loading) return;
    loading = true;
    var s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function tokenOf(form) {
    var el = form.querySelector('[name="cf-turnstile-response"]');
    return el && el.value ? el.value : "";
  }

  function guarded(node) {
    return node && node.querySelector && node.querySelector(".cf-turnstile");
  }

  var widgets = document.querySelectorAll(".cf-turnstile");
  if (!widgets.length) return;

  // 1. Load as the widget approaches the viewport. On a long page the footer
  //    form is far below the fold, so most visits never pay for Turnstile.
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { load(); io.disconnect(); return; }
      }
    }, { rootMargin: "800px 0px" });
    for (var i = 0; i < widgets.length; i++) io.observe(widgets[i]);
  } else {
    load();
  }

  // 2. Touching a guarded form forces the load, whatever the observer thinks.
  function onIntent(e) {
    var f = e.target && e.target.closest ? e.target.closest("form") : null;
    if (guarded(f)) load();
  }
  document.addEventListener("focusin", onIntent, true);
  document.addEventListener("pointerdown", onIntent, true);

  // 3. The guarantee. Capture on `document` so this runs BEFORE the listeners
  //    each page registers on the form itself, then re-submit once the token is
  //    in the DOM so those listeners read a populated field.
  document.addEventListener("submit", function (e) {
    var f = e.target;
    if (!guarded(f)) return;
    if (tokenOf(f)) return;      // token already there: nothing to do
    if (f.__tsPending) {         // a wait is already running for this form
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (f.__tsReleased) {        // our own re-submit: let it through
      f.__tsReleased = false;
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    load();
    f.__tsPending = true;
    var started = Date.now();

    (function poll() {
      // Release on a token, or give up after WAIT_MS and submit anyway so the
      // server decides. A rejected submit shows the form's own error; a submit
      // silently swallowed here would not.
      if (tokenOf(f) || Date.now() - started > WAIT_MS) {
        f.__tsPending = false;
        f.__tsReleased = true;
        if (f.requestSubmit) f.requestSubmit();
        else f.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        f.__tsReleased = false;
        return;
      }
      setTimeout(poll, 120);
    })();
  }, true);
})();
