/* Add to calendar: one button, one small menu, one tap per calendar.

   Markup (works without JavaScript, because the button is a real link to the
   hosted .ics file):

     <div class="atc" data-title="..." data-start="2026-10-25" data-end="2026-10-25"
          data-location="..." data-details="..." data-ics="/cal/x.ics">
       <a class="btn" href="/cal/x.ics">Add to calendar</a>
     </div>

   Dates are all day (YYYY-MM-DD, end inclusive) until an event has a time;
   add data-time-start="12:00" data-time-end="18:00" (America/Chicago) when it
   does. Google and Outlook open prefilled in a new tab; Apple opens the hosted
   file, which iPhone and Mac show as their own "Add Event" screen. */
(function () {
  "use strict";
  var TZ = "America/Chicago";
  /* The menu lives on <body>, not inside the button's section: hero bands use
     overflow:hidden and transforms, which clip a dropdown and trap a fixed
     sheet. Desktop: placed under the button. Phones: a bottom sheet. */
  var css = ".atc{display:inline-block}" +
    ".atc-menu{position:absolute;z-index:1000;min-width:236px;padding:6px;border-radius:16px;background:#141416;box-shadow:0 0 0 1px rgba(255,255,255,.12),0 24px 60px -18px rgba(0,0,0,.8);display:none;font-family:var(--font-body,system-ui)}" +
    ".atc-menu.open{display:block}" +
    ".atc-scrim{position:fixed;inset:0;z-index:999;background:rgba(12,12,14,.55);display:none}.atc-scrim.open{display:block}" +
    ".atc-menu a{display:flex;align-items:center;gap:.7rem;padding:.8rem .9rem;border-radius:11px;color:#F9F7F2;font-weight:600;text-decoration:none;font-size:1rem}" +
    ".atc-menu a:hover,.atc-menu a:focus-visible{background:rgba(255,92,57,.16);outline:none}" +
    ".atc-menu svg{width:20px;height:20px;flex:none}" +
    "@media (max-width:560px){.atc-menu{position:fixed;left:12px!important;right:12px;top:auto!important;bottom:calc(12px + env(safe-area-inset-bottom));min-width:0;padding:10px}.atc-menu a{padding:1rem 1rem;font-size:1.05rem}}";
  var scrim = null, current = null;
  function closeAll() {
    document.querySelectorAll(".atc-menu.open").forEach(function (m) { m.classList.remove("open"); });
    document.querySelectorAll(".atc [aria-expanded=true]").forEach(function (b) { b.setAttribute("aria-expanded", "false"); });
    if (scrim) scrim.classList.remove("open");
    current = null;
  }
  var ICON = {
    apple: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.3 1.2 9.7.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.1-1.2 2.9-2.4.9-1.3 1.3-2.6 1.3-2.7 0 0-2.4-.9-2.4-3.9zM14 5.5c.7-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z"/></svg>',
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4c-.2 1.2-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6C4.7 19.8 8.1 22 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1C2.4 8.8 2 10.4 2 12s.4 3.2 1.1 4.6L6.4 14z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C17 2.9 14.7 2 12 2 8.1 2 4.7 4.2 3.1 7.4L6.4 10c.8-2.3 3-4.1 5.6-4.1z"/></svg>',
    outlook: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="5" width="12" height="14" rx="2" fill="#0A64C9"/><circle cx="8" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><path fill="#28A8EA" d="M14 7h7a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-7z"/><path fill="none" stroke="#fff" stroke-width="1.3" d="M14 8.5l4 3 4-3"/></svg>'
  };
  function ymd(s) { return s.replace(/-/g, ""); }
  function nextDay(s) {
    var p = s.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
    return d.toISOString().slice(0, 10);
  }
  function links(e) {
    var timed = e.ts && e.te;
    var gDates = timed
      ? ymd(e.start) + "T" + e.ts.replace(":", "") + "00/" + ymd(e.end) + "T" + e.te.replace(":", "") + "00"
      : ymd(e.start) + "/" + ymd(nextDay(e.end));
    var g = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(e.title) + "&dates=" + gDates +
      (timed ? "&ctz=" + encodeURIComponent(TZ) : "") +
      "&details=" + encodeURIComponent(e.details) + "&location=" + encodeURIComponent(e.location);
    var o = "https://outlook.live.com/calendar/0/action/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent" +
      "&subject=" + encodeURIComponent(e.title) +
      "&startdt=" + encodeURIComponent(timed ? e.start + "T" + e.ts + ":00" : e.start) +
      "&enddt=" + encodeURIComponent(timed ? e.end + "T" + e.te + ":00" : nextDay(e.end)) +
      (timed ? "" : "&allday=true") +
      "&body=" + encodeURIComponent(e.details) + "&location=" + encodeURIComponent(e.location);
    return { google: g, outlook: o, apple: e.ics };
  }
  function item(href, icon, label, external) {
    var a = document.createElement("a");
    a.href = href; a.setAttribute("role", "menuitem");
    if (external) { a.target = "_blank"; a.rel = "noopener"; }
    a.innerHTML = ICON[icon];
    a.appendChild(document.createTextNode(label));
    return a;
  }
  function mount(box) {
    if (box.__atc) return; box.__atc = true;
    var d = box.dataset, btn = box.querySelector("a,button");
    if (!btn) return;
    var e = { title: d.title, start: d.start, end: d.end || d.start, ts: d.timeStart, te: d.timeEnd,
              location: d.location || "", details: d.details || "", ics: d.ics };
    var L = links(e);
    var apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
    var menu = document.createElement("div");
    menu.className = "atc-menu"; menu.setAttribute("role", "menu");
    var A = item(L.apple, "apple", "Apple Calendar", false),
        G = item(L.google, "google", "Google Calendar", true),
        O = item(L.outlook, "outlook", "Outlook", true);
    (apple ? [A, G, O] : [G, A, O]).forEach(function (n) { menu.appendChild(n); });
    document.body.appendChild(menu);
    btn.setAttribute("aria-haspopup", "menu"); btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var wasOpen = current === menu;
      closeAll();
      if (wasOpen) return;
      if (window.matchMedia("(max-width:560px)").matches) {
        if (!scrim) { scrim = document.createElement("div"); scrim.className = "atc-scrim"; document.body.appendChild(scrim); }
        scrim.classList.add("open");
      } else {
        var r = btn.getBoundingClientRect();
        menu.style.left = (r.left + window.scrollX) + "px";
        menu.style.top = (r.bottom + window.scrollY + 8) + "px";
      }
      menu.classList.add("open"); current = menu;
      if (!scrim || !scrim.classList.contains("open")) {
        var h = menu.offsetHeight, rr = btn.getBoundingClientRect();
        if (rr.bottom + h + 16 > window.innerHeight && rr.top - h - 8 > 0) menu.style.top = (rr.top + window.scrollY - h - 8) + "px";
      }
      btn.setAttribute("aria-expanded", "true");
      menu.querySelector("a").focus({ preventScroll: true });
    });
    menu.addEventListener("click", function (ev) { ev.stopPropagation(); setTimeout(closeAll, 0); });
  }
  function init() {
    if (!document.getElementById("atc-css")) {
      var s = document.createElement("style"); s.id = "atc-css"; s.textContent = css; document.head.appendChild(s);
    }
    document.querySelectorAll(".atc").forEach(mount);
  }
  document.addEventListener("click", closeAll);
  window.addEventListener("resize", closeAll);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeAll(); });
  window.ATLCalendar = { mount: function (el) { init(); mount(el); }, init: init };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
