// sponsor-sheet.js — open the sponsorship ask over the card instead of on
// another page. See src/css/sponsor-sheet.css for why.
//
// PROGRESSIVE ENHANCEMENT IS THE CONTRACT. Every tier button stays a real
// anchor to /contact?rsn=sponsor&tier=..., which still works, still prefills,
// and is still what a crawler, a shared link, and a browser without <dialog>
// get. This file only intercepts the click when it can do better. If anything
// here throws, the href is still underneath it.
//
// THE TIER IS READ OFF THE BUTTON, NOT KEPT IN A TABLE HERE. A second copy of
// the ladder in JavaScript is a second thing to update when a price changes,
// and the one that gets forgotten is always the copy nobody can see. The
// attributes live on the markup that renders the card, and
// test/sponsor_sheet.test.js asserts they match the card's own price and name.
(function () {
  var sheet = document.getElementById("sponsorSheet");
  if (!sheet || typeof sheet.showModal !== "function") return;

  var triggers = document.querySelectorAll("[data-sponsor-tier]");
  if (!triggers.length) return;

  var els = {
    title: sheet.querySelector("[data-sheet-tier]"),
    amount: sheet.querySelector("[data-sheet-amount]"),
    line: sheet.querySelector("[data-sheet-line]"),
    give: sheet.querySelector("[data-sheet-give]"),
    giveBtn: sheet.querySelector("[data-sheet-give-btn]"),
    or: sheet.querySelector("[data-sheet-or]"),
    form: sheet.querySelector("#sponsorForm"),
    body: sheet.querySelector("[data-sheet-body]"),
    sent: sheet.querySelector("[data-sheet-sent]"),
    sentTier: sheet.querySelector("[data-sheet-sent-tier]"),
    status: sheet.querySelector("[data-sheet-status]"),
    source: sheet.querySelector("[name=sheet_source]"),
    msg: sheet.querySelector("#sheetMsg"),
    submit: sheet.querySelector("[data-sheet-submit]"),
  };

  var current = null;

  function money(n) {
    return "$" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Give-now keeps people on adapttolife.org rather than handing them to
  // givebutter.com, because our own /donate is where the attribution chain
  // survives (see js/attribution.js) — and because the widget forwards `amount`
  // into its iframe, which is the whole reason this button can exist. Measured
  // 2026-09-12: /donate?amount=500 opens with $500 already selected.
  function donateHref(tier, amount) {
    var slug = tier.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return (
      "/donate?amount=" + encodeURIComponent(amount) +
      "&utm_source=sponsorship&utm_medium=site&utm_campaign=sponsor-" + slug
    );
  }

  // THE ONE THING THAT CAN SILENTLY BREAK THIS FORM.
  //
  // Turnstile lives inside a <dialog>, which is display:none until it opens, and
  // a widget rendered into a hidden, zero-sized box is a widget that may never
  // run its challenge. That is not hypothetical here: the footer subscribe form
  // on this page carries its own widget, so scrolling toward the footer trips
  // turnstile-lazy's observer and the API auto-renders OURS blind, long before
  // anyone taps a tier.
  //
  // So the sheet does not inherit whatever state that left behind. Every open
  // tears any existing widget down and renders a fresh one into a box that is
  // on screen, which also settles the second problem — a token is single-use, so
  // a visitor who sponsors twice in one visit needs a new one either way.
  //
  // If none of this runs (the API has not loaded yet), turnstile-lazy.js renders
  // the widget on first touch of the form and HOLDS the submit until a token
  // lands. And if even that fails, verifyTurnstile on the server fails closed
  // with a message the sender can act on. Three layers, because a sponsorship
  // that vanishes silently is the worst outcome this page has.
  function primeTurnstile() {
    var box = sheet.querySelector(".cf-turnstile");
    if (!box) return;
    if (!window.turnstile) return;          // not loaded yet: turnstile-lazy.js will render it
    try {
      if (box.dataset.wid) {
        window.turnstile.remove(box.dataset.wid);
        box.innerHTML = "";
      }
      box.dataset.wid = window.turnstile.render(box) || "";
    } catch (e) {
      // render() throws if the API auto-rendered this box before we tracked an
      // id. Reset is the recovery: same widget, fresh challenge, now visible.
      try { window.turnstile.reset(box); } catch (e2) { /* the submit hold covers us */ }
    }
  }

  function open(trigger) {
    var tier = trigger.getAttribute("data-sponsor-tier");
    var amount = trigger.getAttribute("data-sponsor-amount");
    var line = trigger.getAttribute("data-sponsor-line") || "";
    var price = trigger.getAttribute("data-sponsor-price") || (amount ? money(amount) : "");
    current = { tier: tier, amount: amount, price: price };

    els.title.textContent = tier;
    els.amount.textContent = price ? " · " + price : "";
    els.line.textContent = line;

    var canGive = !!amount;
    els.give.hidden = !canGive;
    els.or.hidden = !canGive;
    if (canGive) {
      els.giveBtn.setAttribute("href", donateHref(tier, amount));
      els.giveBtn.textContent = "Give " + money(amount) + " now";
    }

    // What the sender would have had to type. Kept as real, editable text in the
    // note rather than a hidden field, so nothing is sent on their behalf that
    // they cannot see — the same principle the /contact prefill was built on.
    els.msg.value = "I'm interested in sponsoring at the " + tier + " level.";

    // The filterable half. `source` is a ClickUp field on the Contacts list, so
    // "how many people asked about Captain this quarter" becomes a view instead
    // of a read-every-message exercise.
    els.source.value = ("Sponsorship page: " + tier + (price ? " (" + price + ")" : "")).slice(0, 80);

    els.body.hidden = false;
    els.sent.hidden = true;
    setStatus("", null);
    sheet.showModal();
    document.documentElement.classList.add("sheet-open");
    primeTurnstile();
  }

  function setStatus(text, ok) {
    els.status.textContent = text;
    els.status.className = "sheet-status" + (ok === true ? " is-ok" : ok === false ? " is-err" : "");
  }

  function close() {
    sheet.close();
  }

  sheet.addEventListener("close", function () {
    document.documentElement.classList.remove("sheet-open");
    // Escape, the close button and a committed drag all land here. Whatever the
    // route out, the next open must start from rest.
    sheet.style.transform = "";
    sheet.classList.remove("is-dragging", "is-settling");
    if (current) {
      var back = document.querySelector('[data-sponsor-tier="' + current.tier + '"]');
      if (back && back.focus) back.focus();
    }
  });

  // Clicking the backdrop. <dialog> reports backdrop clicks as clicks on the
  // dialog itself, so the test is "did this land on the element and not inside
  // its content", which is what the inner wrapper is for.
  //
  // BOTH ends of the gesture are checked, not just the click target. A `click`
  // fires on the common ancestor of where the press began and where it ended, so
  // a drag that starts inside the sheet and finishes anywhere else resolves to
  // the dialog and used to dismiss the sheet mid-sentence — selecting text in
  // the note field was enough. Measured on the deployed page 2026-09-12.
  var pressedOnBackdrop = false;
  sheet.addEventListener("pointerdown", function (e) { pressedOnBackdrop = e.target === sheet; });
  sheet.addEventListener("click", function (e) {
    if (e.target === sheet && pressedOnBackdrop) close();
    pressedOnBackdrop = false;
  });

  // DRAG THE SHEET DOWN TO DISMISS IT.
  //
  // The grab handle was drawing a promise the sheet did not keep. On a phone,
  // flicking a bottom sheet away is the gesture people reach for first, and its
  // absence is most of why the close button was carrying all the traffic and
  // getting blamed for it — the corner of the screen is the furthest point from
  // a thumb that is already resting near the bottom.
  //
  // Deliberately narrow: it arms ONLY from the grab strip, so it can never
  // compete with scrolling the form, selecting text, or a stray downward swipe
  // over the fields. Pointer events, so a trackpad drag on a small window works
  // the same way. Phones only — on desktop this is a centred dialog with a
  // cursor, and there is nothing to flick.
  var grab = sheet.querySelector("[data-sheet-grab]");
  if (grab && window.PointerEvent) {
    var startY = 0, dy = 0, dragging = false, pid = null;
    var CLOSE_AT = 90;      // px pulled down that commits to a dismiss
    var FLICK = 0.55;       // or a fast flick, however short
    var startedAt = 0;

    function moveTo(y) { sheet.style.transform = y ? "translateY(" + y + "px)" : ""; }

    function endDrag(commit) {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove("is-dragging");
      if (pid !== null && grab.releasePointerCapture) {
        try { grab.releasePointerCapture(pid); } catch (err) { /* already gone */ }
      }
      pid = null;
      if (commit) {
        close();
        // Cleared after the dialog is gone, so the next open starts square
        // rather than animating up from wherever the last one was let go.
        moveTo(0);
        return;
      }
      // Not far enough: spring back, and take the transition off again once it
      // lands so the next drag is direct.
      sheet.classList.add("is-settling");
      moveTo(0);
      window.setTimeout(function () { sheet.classList.remove("is-settling"); }, 240);
    }

    grab.addEventListener("pointerdown", function (e) {
      if (!window.matchMedia("(max-width: 640px)").matches) return;
      dragging = true; startY = e.clientY; dy = 0; startedAt = Date.now(); pid = e.pointerId;
      sheet.classList.add("is-dragging");
      sheet.classList.remove("is-settling");
      if (grab.setPointerCapture) { try { grab.setPointerCapture(e.pointerId); } catch (err) { /* no capture */ } }
    });

    grab.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      dy = e.clientY - startY;
      // Upward drag resists rather than lifting the sheet off the bottom edge:
      // there is nothing above it to reveal, and a gap under a bottom sheet
      // looks broken.
      moveTo(dy > 0 ? dy : dy / 4);
    });

    grab.addEventListener("pointerup", function () {
      var speed = dy / Math.max(Date.now() - startedAt, 1);
      endDrag(dy > CLOSE_AT || (dy > 24 && speed > FLICK));
    });
    grab.addEventListener("pointercancel", function () { endDrag(false); });
  }
  sheet.querySelectorAll("[data-sheet-close]").forEach(function (b) {
    b.addEventListener("click", close);
  });

  triggers.forEach(function (t) {
    t.addEventListener("click", function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return; // open-in-new-tab still works
      e.preventDefault();
      open(t);
    });
  });

  // Submit. A real form submit event, not a button click handler, because
  // turnstile-lazy.js hooks `submit` on document capture to hold the send until
  // a token lands. Routing around it would ship a form that fails closed at the
  // server for anyone who types quickly.
  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (els.submit.disabled) return;
    var pot = els.form.querySelector("[name=company]");
    if (pot && pot.value) return; // honeypot: bots fill it, accept silently

    var name = sheet.querySelector("#sheetName").value.trim();
    var email = sheet.querySelector("#sheetEmail").value.trim();
    if (!email) return setStatus("Please add your email so we can reply.", false);

    var tk = els.form.querySelector('[name="cf-turnstile-response"]');
    var payload = {
      fn: name,
      ln: "",
      em: email,
      rsn: "Giving or sponsoring",
      msg: els.msg.value.trim(),
      source: els.source.value,
      sponsor_tier: current ? current.tier : "",
      sponsor_amount: current ? current.amount : "",
      cf_token: tk ? tk.value : "",
    };

    window.ATLFormSubmission(els.form, payload);
    var label = els.submit.textContent;
    els.submit.disabled = true;
    els.submit.textContent = "Sending...";
    setStatus("", null);

    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: "We could not verify receipt. Please try again." };
        });
      })
      .then(function (d) {
        if (d && d.ok) {
          els.sentTier.textContent = current ? current.tier : "sponsorship";
          els.body.hidden = true;
          els.sent.hidden = false;
          els.form.reset();
          delete els.form._atlSubmission;
        } else {
          setStatus((d && d.error) || "Something went wrong. Please email hello@adapttolife.org.", false);
        }
      })
      .catch(function () {
        setStatus("Network error. Please email hello@adapttolife.org.", false);
      })
      .then(function () {
        if (!els.body.hidden) primeTurnstile();
        els.submit.disabled = false;
        els.submit.textContent = label;
      });
  });
})();
