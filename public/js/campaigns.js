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

    // A drive with its own page goes to that page, never straight to the
    // vendor. The page carries why half of every bag matters, and it is the
    // only surface that recruits sellers, which is the whole growth lever on
    // this platform: total raised is roughly stores times each seller's reach.
    // A vendor storefront cannot ask anyone to open a store. Sending everyone
    // direct converts one order and loses every future seller.
    //
    // The drive's own page is where the store link lives, so this is still one
    // tap from buying and there is still no click that does nothing.
    if (live && d.page) {
      return { href: d.page, label: d.cta_label || "Buy popcorn", external: false };
    }
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
      },
      /* The campaign a drive feeds, or null. A drive we only compete in feeds
         nothing and must resolve to null rather than to the nearest campaign. */
      campaignFor: function (drive) {
        if (!drive || !drive.campaign) return null;
        return campaigns.filter(function (c) { return c.slug === drive.campaign; })[0] || null;
      }
    };
  }

  /* Calls back with the shaped data, or null if the file is unreachable or
     unparseable. Callers must render something honest either way: an empty
     hub is a real state, a broken page is not. */
  /* ONE FETCH PER PAGE, NOT ONE PER CALLER. The header comment above already
     says "one data file, three consumers" — and until 2026-09-09 that meant
     three identical network requests for the same JSON. Measured on the live
     homepage: /data/campaigns.json appeared three times in a 42-request load,
     which is also what pushed the page over its own 40-request ratchet.

     The promise is cached rather than the value, so callers that arrive while
     the first request is still in flight join it instead of starting their own
     — caching the result would have deduped only the callers that ran late.
     A failure is cached as null too: three consumers should not retry a
     missing file three times, and every caller already has to render something
     honest when the data is unreachable. */
  var pending = null;
  function load(cb) {
    var settled = false;
    function finish(v) {
      if (settled) return;
      settled = true;
      try { cb(v); } catch (err) { console.error("campaign render failed:", err); }
    }
    if (typeof fetch !== "function") return finish(null);
    if (!pending) {
      pending = fetch(SRC, { credentials: "omit" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (raw) { return shape(raw); })
        .catch(function (err) {
          console.error("campaigns.json unavailable:", err);
          return null;
        });
    }
    pending.then(finish);
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

  /* The campaign band: one partial, four pages. Renders the active campaign
     into `hostId`, or renders nothing at all if there is no campaign or the
     data is unreachable. Nothing is the correct empty state here: the pages it
     sits on are complete without it, and a band that cannot name a real goal
     is worse than no band. */
  function band(hostId, opts) {
    var host = document.getElementById(hostId);
    if (!host) return;
    var lifted = (opts || {}).lifted;

    load(function (store) {
      // Release the reserved height only ONCE THE CONTENT IS IN, not on
       // arrival of the data. Removing it first collapsed the box to nothing
       // for the frame between the class going and the markup landing, so the
       // page shifted DOWN and then back UP — measured on /donate as a section
       // going 67px -> 0 -> 67 at about 1.5s, and CLS 0.247 on the page where
       // somebody is entering a card. The reservation exists precisely to
       // cover this gap; releasing it early gave the jump back.
      var c = store && store.campaigns[0];
      if (!c) { host.classList.remove("camp-pending"); return; }

      var a = el("a", "camp-band" + (lifted ? " lifted" : ""));
      a.href = c.page || "/send-6";

      var card = el("div", "camp-band-card");
      var left = el("div");
      var eyebrow = el("span", "cb-eyebrow");
      eyebrow.appendChild(el("span", "dot"));
      eyebrow.appendChild(document.createTextNode("Raising now"));
      left.appendChild(eyebrow);
      left.appendChild(el("span", "cb-name", c.name));
      if (c.blurb) left.appendChild(el("span", "cb-blurb", c.blurb));

      var side = el("div", "cb-side");
      var bar = el("span", "cb-bar");
      var fill = el("span", "cb-fill");
      bar.appendChild(fill);
      var label = el("span", "cb-label", c.goal ? money(c.goal) + " goal" : "");
      var cta = el("span", "cb-cta", "See the campaign");
      side.appendChild(bar);
      side.appendChild(label);
      side.appendChild(cta);

      card.appendChild(left);
      card.appendChild(side);
      a.appendChild(card);
      host.appendChild(a);
      host.classList.remove("camp-pending");

      // The live figure lands last. If Givebutter is unreachable the goal
      // stands on its own rather than publishing a $0 we cannot vouch for.
      raised(function (d) {
        if (!d || !d.goal) return;
        var goal = d.goal || c.goal;
        label.textContent = money(d.raised) + " of " + money(goal) + " raised";
        var pct = Math.max(0, Math.min(100, (d.raised / goal) * 100));
        requestAnimationFrame(function () {
          setTimeout(function () { fill.style.width = pct.toFixed(1) + "%"; }, 140);
        });
      });
    });
  }

  /* The result band: the counterpart to band(). band() says what we are
     raising NOW; this says what a finished drive actually brought in.

     Why this is data-driven rather than three lines of hand-written HTML:
     the August popcorn drive's $3,004 already appears on /popcorn and
     /send-6, and it is the same number the thermometer adds via
     OFFLINE_RAISED. A fourth hand-typed copy is a fourth thing to forget
     when the next drive closes. Reads the most recently CLOSED drive that
     has a real `raised` figure, and renders nothing if there is not one —
     an org with no finished drive must not claim a win.

     `raised` stays null until a number is real (see campaigns.json), so a
     drive that closed but has not been counted yet is correctly skipped. */
  function result(hostId) {
    var host = document.getElementById(hostId);
    if (!host) return;

    /* Own the empty state here rather than from a second load() in the page:
       two independent fetches have no ordering guarantee, so a page-level
       "hide if empty" check can run BEFORE this one renders and blank a band
       that was about to be correct. Hiding the enclosing section from inside
       the single callback makes that unrepresentable. */
    function hideSection() {
      var sec = host.closest && host.closest("section");
      if (sec) sec.hidden = true;
    }

    load(function (store) {
      // Same ordering rule as above: the reservation comes off after the band
      // is populated (or the section is hidden), never before.
      if (!store) { host.classList.remove("camp-pending"); return hideSection(); }

      var done = store.drives
        .filter(function (d) {
          return driveStatus(d) === "past" && typeof d.raised === "number" && d.raised > 0;
        })
        .sort(function (a, b) { return (driveCloses(b) || 0) - (driveCloses(a) || 0); });

      var d = done[0];
      if (!d) return hideSection();

      var camp = store.campaignFor(d);
      var a = el("a", "win-band");
      a.href = d.page || (camp && camp.page) || "/ways-to-give";

      var card = el("div", "win-card");

      var left = el("div");
      var eyebrow = el("span", "win-eyebrow");
      eyebrow.appendChild(el("span", "tick"));
      eyebrow.appendChild(document.createTextNode("Drive complete"));
      left.appendChild(eyebrow);
      left.appendChild(el("span", "win-name", d.name));
      if (camp) {
        left.appendChild(el("span", "win-sub",
          "Every dollar of it goes to " + camp.name + "."));
      } else if (d.summary) {
        left.appendChild(el("span", "win-sub", d.summary));
      }

      var fig = el("div", "win-figure");
      fig.appendChild(el("span", "win-amount", money(d.raised)));
      /* Percent of goal, not "of goal" — the story is that it went well past
         it. Only claimed when a goal exists and was actually beaten. */
      if (d.goal && d.raised >= d.goal) {
        fig.appendChild(el("span", "win-of",
          Math.round((d.raised / d.goal) * 100) + "% of goal"));
      } else if (d.goal) {
        fig.appendChild(el("span", "win-of", "of a " + money(d.goal) + " goal"));
      }

      card.appendChild(left);
      card.appendChild(fig);
      a.appendChild(card);
      host.appendChild(a);
      host.classList.remove("camp-pending");
    });
  }

  global.ATLCampaigns = {
    load: load,
    raised: raised,
    band: band,
    result: result,
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
