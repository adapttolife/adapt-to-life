// Shared handler for inline subscribe forms (e.g. the footer field).
// Targets any <form class="js-subscribe" data-source="..."> with an email input
// named "em" and a hidden honeypot named "company". Posts to /api/subscribe.
(function () {
  function init(f) {
    var statusEl = f.querySelector(".foot-sub-msg") || f.querySelector(".form-status");
    var btn = f.querySelector('button[type="submit"]');
    var emEl = f.querySelector('input[name="em"]');
    var hp = f.querySelector('input[name="company"]');
    var source = f.getAttribute("data-source") || "website";
    function setStatus(msg, ok) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.style.color = ok ? "#7CCF8F" : "#ff9b8a";
    }
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (hp && hp.value) return; // honeypot
      var em = emEl ? emEl.value.trim() : "";
      if (!em) { setStatus("Please enter your email.", false); return; }
      var tokenEl = f.querySelector('[name="cf-turnstile-response"]');
      var token = tokenEl ? tokenEl.value : "";
      if (btn) btn.disabled = true;
      setStatus("", true);
      fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ em: em, source: source, cf_token: token }),
      })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (d) {
          if (d && d.ok) { f.reset(); setStatus("You're in. Watch your inbox.", true); }
          else { setStatus((d && d.error) || "Something went wrong. Email hello@adapttolife.org.", false); }
        })
        .catch(function () { setStatus("Network error. Email hello@adapttolife.org.", false); })
        .then(function () { if (btn) btn.disabled = false; });
    });
  }
  document.querySelectorAll("form.js-subscribe").forEach(init);
})();
