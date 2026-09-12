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
    if (!box) return;                       // staging strips the widget entirely
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
    if (current) {
      var back = document.querySelector('[data-sponsor-tier="' + current.tier + '"]');
      if (back && back.focus) back.focus();
    }
  });

  // Clicking the backdrop. <dialog> reports backdrop clicks as clicks on the
  // dialog itself, so the test is "did this land on the element and not inside
  // its content", which is what the inner wrapper is for.
  sheet.addEventListener("click", function (e) {
    if (e.target === sheet) close();
  });
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
      cf_token: tk ? tk.value : "",
    };

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
          return { ok: r.ok };
        });
      })
      .then(function (d) {
        if (d && d.ok) {
          els.sentTier.textContent = current ? current.tier : "sponsorship";
          els.body.hidden = true;
          els.sent.hidden = false;
          els.form.reset();
        } else {
          setStatus((d && d.error) || "Something went wrong. Please email hello@adapttolife.org.", false);
        }
      })
      .catch(function () {
        setStatus("Network error. Please email hello@adapttolife.org.", false);
      })
      .then(function () {
        els.submit.disabled = false;
        els.submit.textContent = label;
      });
  });
})();
