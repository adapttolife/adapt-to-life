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
  /* Official logos from the symbol dictionary (data/icons.mjs, Simple Icons),
     written by scripts/build-icons.mjs; edit the dictionary. */
  /* icons:start */
  var ICON = {
    apple: "<svg class=\"atc-svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\" data-logo=\"apple\"><path fill=\"currentColor\" d=\"M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04c-2.04.027-3.91 1.183-4.961 3.014c-2.117 3.675-.546 9.103 1.519 12.09c1.013 1.454 2.208 3.09 3.792 3.039c1.52-.065 2.09-.987 3.935-.987c1.831 0 2.35.987 3.96.948c1.637-.026 2.676-1.48 3.676-2.948c1.156-1.688 1.636-3.325 1.662-3.415c-.039-.013-3.182-1.221-3.22-4.857c-.026-3.04 2.48-4.494 2.597-4.559c-1.429-2.09-3.623-2.324-4.39-2.376c-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83c-1.207.052-2.662.805-3.532 1.818c-.78.896-1.454 2.338-1.273 3.714c1.338.104 2.715-.688 3.559-1.701\"/></svg>",
    google: "<svg class=\"atc-svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\" data-logo=\"googlecalendar\"><path fill=\"currentColor\" d=\"M18.316 5.684H24v12.632h-5.684zM5.684 24h12.632v-5.684H5.684zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684zm-7.207 6.25v-.065q.407-.216.687-.617c.28-.401.279-.595.279-.982q0-.568-.3-1.025a2.05 2.05 0 0 0-.832-.714a2.7 2.7 0 0 0-1.197-.257q-.9 0-1.481.467q-.579.467-.793 1.078l1.085.452q.13-.374.413-.633q.284-.258.767-.257q.495 0 .816.264a.86.86 0 0 1 .322.703q0 .495-.36.778t-.886.284h-.567v1.085h.633q.611 0 1.02.327q.407.327.407.843q0 .505-.387.832c-.387.327-.565.327-.924.327q-.527 0-.897-.311q-.372-.312-.521-.881l-1.096.452q.268.923.977 1.401q.707.479 1.538.477a2.84 2.84 0 0 0 1.293-.291q.574-.29.902-.794q.327-.505.327-1.149q0-.643-.344-1.105a2.07 2.07 0 0 0-.881-.689m2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0m-3.289 23.5l4.684-4.684h-4.684zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0z\"/></svg>",
    outlook: "<svg class=\"atc-svg\" viewBox=\"0 0 24 24\" fill=\"currentColor\" aria-hidden=\"true\" focusable=\"false\" data-logo=\"outlook\"><path fill=\"currentColor\" d=\"M7.88 12.04q0 .45-.11.87q-.1.41-.33.74q-.22.33-.58.52q-.37.2-.87.2t-.85-.2q-.35-.21-.57-.55q-.22-.33-.33-.75q-.1-.42-.1-.86t.1-.87t.34-.76q.22-.34.59-.54q.36-.2.87-.2t.86.2q.35.21.57.55t.31.77q.1.43.1.88M24 12v9.38q0 .46-.33.8q-.33.32-.8.32H7.13q-.46 0-.8-.33q-.32-.33-.32-.8V18H1q-.41 0-.7-.3q-.3-.29-.3-.7V7q0-.41.3-.7Q.58 6 1 6h6.5V2.55q0-.44.3-.75q.3-.3.75-.3h12.9q.44 0 .75.3q.3.3.3.75v8.3l1.24.72h.01q.1.07.18.18q.07.12.07.25m-6-8.25v3h3v-3zm0 4.5v3h3v-3zm0 4.5v1.83l3.05-1.83zm-5.25-9v3h3.75v-3zm0 4.5v3h3.75v-3zm0 4.5v2.03l2.41 1.5l1.34-.8v-2.73zM9 3.75V6h2l.13.01l.12.04v-2.3zM5.98 15.98q.9 0 1.6-.3q.7-.32 1.19-.86q.48-.55.73-1.28q.25-.74.25-1.61q0-.83-.25-1.55q-.24-.71-.71-1.24t-1.15-.83t-1.55-.3q-.92 0-1.64.3q-.71.3-1.2.85q-.5.54-.75 1.3q-.25.74-.25 1.63q0 .85.26 1.56q.26.72.74 1.23q.48.52 1.17.81q.69.3 1.56.3zM7.5 21h12.39L12 16.08V17q0 .41-.3.7q-.29.3-.7.3H7.5zm15-.13v-7.24l-5.9 3.54Z\"/></svg>"
  };
  /* icons:end */
  function ymd(s) { return s.replace(/-/g, ""); }
  function nextDay(s) {
    var p = s.split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + 1));
    return d.toISOString().slice(0, 10);
  }
  /* "-05:00" for America/Chicago on that date, so Outlook does not read a
     bare time in the visitor's own zone. Falls back to no offset. */
  function offset(date, time, tz) {
    try {
      var p = date.split("-"), t = time.split(":");
      var guess = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], +t[0] + 6, +t[1]));
      var name = new Intl.DateTimeFormat("en-US", { timeZone: tz || TZ, timeZoneName: "shortOffset" })
        .formatToParts(guess).filter(function (x) { return x.type === "timeZoneName"; })[0].value;
      var m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
      if (!m) return "";
      return m[1] + ("0" + m[2]).slice(-2) + ":" + (m[3] || "00");
    } catch (err) { return ""; }
  }
  function links(e) {
    var timed = e.ts && e.te;
    var gDates = timed
      ? ymd(e.start) + "T" + e.ts.replace(":", "") + "00/" + ymd(e.end) + "T" + e.te.replace(":", "") + "00"
      : ymd(e.start) + "/" + ymd(nextDay(e.end));
    var g = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent(e.title) + "&dates=" + gDates +
      (timed ? "&ctz=" + encodeURIComponent(e.tz) : "") +
      "&details=" + encodeURIComponent(e.details) + "&location=" + encodeURIComponent(e.location);
    var o = "https://outlook.live.com/calendar/0/action/compose?path=%2Fcalendar%2Faction%2Fcompose&rru=addevent" +
      "&subject=" + encodeURIComponent(e.title) +
      "&startdt=" + encodeURIComponent(timed ? e.start + "T" + e.ts + ":00" + offset(e.start, e.ts, e.tz) : e.start) +
      "&enddt=" + encodeURIComponent(timed ? e.end + "T" + e.te + ":00" + offset(e.end, e.te, e.tz) : nextDay(e.end)) +
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
    var e = { title: d.title, start: d.start, end: d.end || d.start, ts: d.timeStart, te: d.timeEnd, tz: d.tz || TZ,
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
