/* ==========================================================================
   Adapt To Life — the campaign layer (Spec 115).

   One data file (/data/campaigns.json), three consumers: /ways-to-give,
   /send-6 and /popcorn. Two content types that never merge:

     CAMPAIGN — what we are raising for and who it reaches. Has a goal and a
                beneficiary. Gets a page.
     DRIVE    — a dated way we raise it. Feeds exactly one campaign. Is a row
                on that campaign's page until it earns a page of its own.

   Status is derived from dates, never stored. A malformed record is skipped
   with a console.error; the page never breaks over one bad object.
   ========================================================================== */
(function (global) {
  "use strict";

  var SRC = "/data/campaigns.json";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ---- dates: read YYYY-MM-DD as a LOCAL date, never UTC (off-by-one) ---- */
  function localDate(s) {
    if (typeof s !== "string") return null;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function today() {
    var n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  function fmtDate(d) {
    return d ? MON[d.getMonth()] + " " + d.getDate() : "";
  }
  function span(a, b) {
    if (!a) return b ? fmtDate(b) + ", " + b.getFullYear() : "";
    if (!b) return fmtDate(a) + ", " + a.getFullYear();
    var tail = ", " + b.getFullYear();
    return a.getMonth() === b.getMonth()
      ? MON[a.getMonth()] + " " + a.getDate() + "–" + b.getDate() + tail
      : fmtDate(a) + " to " + fmtDate(b) + tail;
  }
  function money(n) {
    return "$" + Number(n).toLocaleString("en-US");
  }

  /* ---- drive shape ------------------------------------------------------- */
  function driveOpens(d) { return localDate(d.opens || d.starts_at); }
  function driveCloses(d) { return localDate(d.closes || d.ends_at); }

  function driveStatus(d) {
    var t = today(), o = driveOpens(d), x = driveCloses(d);
    if (o && t < o) return "soon";
    if (x && t > x) return "past";
    if (o || x) return "open";
    return "soon";
  }
  function driveWhen(d) {
    return span(driveOpens(d), driveCloses(d));
  }

  /* Principle 1a: say our actual relationship to an event. An event we only
     compete in has someone else's host and someone else's beneficiary, and
     copy that blurs that is a claim about another charity. */
  function relationshipLabel(d) {
    if (d.relationship === "we_host") return "We host this";
    if (d.relationship === "we_compete") return "We compete here";
    return "We fundraise with this";
  }

  /* Principle 9: no click that does nothing. With a live purchase link every
     path goes to it; without one every path goes to the fund, which is open
     every day of the year.

     store_url and join_url are NOT interchangeable. store_url is where a
     supporter BUYS, no app and no account. join_url recruits SELLERS and
     renders an app-install wall. Never hand a buyer the join link. */
  function driveCta(d) {
    var live = driveStatus(d) !== "past";
    var closed = d.register_by && today() > localDate(d.register_by);
    if (live && d.store_url) {
      return { href: d.store_url, label: d.cta_label || "Buy popcorn", external: true };
    }
    if (live && d.cta_url && !closed) {
      return { href: d.cta_url, label: d.cta_label || "Take part", external: /^https?:/.test(d.cta_url) };
    }
    if (d.page) {
      return { href: d.page, label: "See the drive", external: false };
    }
    return { href: "/donate", label: "Give to the fund", external: false };
  }

  /* ---- dom helpers ------------------------------------------------------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function wire(node, href, text) {
    if (!node) return node;
    node.href = href;
    if (text) node.textContent = text;
    if (/^https?:/.test(href)) {
      node.target = "_blank";
      node.rel = "noopener";
    } else {
      node.removeAttribute("target");
      node.removeAttribute("rel");
    }
    return node;
  }

  /* ---- load -------------------------------------------------------------- */
  function usable(kind, r) {
    if (!r || typeof r !== "object" || !r.slug || !r.name) {
      console.error("campaigns.json: skipping malformed " + kind + " record", r);
      return false;
    }
    return r.published !== false;
  }

  function shape(raw) {
    var campaigns = (Array.isArray(raw && raw.campaigns) ? raw.campaigns : [])
      .filter(function (c) { return usable("campaign", c); });
    var drives = (Array.isArray(raw && raw.drives) ? raw.drives : [])
      .filter(function (d) { return usable("drive", d); });

    return {
      campaigns: campaigns,
      drives: drives,
      /* Every drive feeding one campaign, soonest first, past ones last. */
      drivesFor: function (slug) {
        var rank = { open: 0, soon: 1, past: 2 };
        return drives
          .filter(function (d) { return !slug || d.campaign === slug; })
          .sort(function (a, b) {
            var r = rank[driveStatus(a)] - rank[driveStatus(b)];
            return r || (driveOpens(a) || 0) - (driveOpens(b) || 0);
          });
      },
      current: function (slug) {
        return this.drivesFor(slug).filter(function (d) { return driveStatus(d) !== "past"; });
      }
    };
  }

  /* Calls back with the shaped data, or null if the file is unreachable or
     unparseable. Callers must render something honest either way: an empty
     hub is a real state, a broken page is not. */
  function load(cb) {
    var settled = false;
    function finish(v) {
      if (settled) return;
      settled = true;
      try { cb(v); } catch (err) { console.error("campaign render failed:", err); }
    }
    if (typeof fetch !== "function") return finish(null);
    fetch(SRC, { credentials: "omit" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (raw) { finish(shape(raw)); })
      .catch(function (err) {
        console.error("campaigns.json unavailable:", err);
        finish(null);
      });
  }

  /* The site thermometer. Falls back to the campaign's own goal and hides the
     raised figure rather than publishing a $0 that is not true. */
  function raised(cb) {
    if (typeof fetch !== "function") return cb(null);
    fetch("/api/raised")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        cb({ raised: Number(d.raised) || 0, goal: Number(d.goal) || 0 });
      })
      .catch(function (err) {
        console.error("/api/raised unavailable:", err);
        cb(null);
      });
  }

  global.ATLCampaigns = {
    load: load,
    raised: raised,
    localDate: localDate,
    today: today,
    fmtDate: fmtDate,
    span: span,
    money: money,
    driveStatus: driveStatus,
    driveWhen: driveWhen,
    driveOpens: driveOpens,
    driveCloses: driveCloses,
    driveCta: driveCta,
    relationshipLabel: relationshipLabel,
    el: el,
    wire: wire
  };
})(window);
