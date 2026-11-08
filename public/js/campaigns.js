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
  var MON = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

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
      ? (a.getDate() === b.getDate()
          ? fmtDate(a)
          : MON[a.getMonth()] + " " + a.getDate() + " to " + b.getDate()) + tail
      : fmtDate(a) + " to " + fmtDate(b) + tail;
  }
  function money(n) {
    return "$" + Number(n).toLocaleString("en-US");
  }

  /* ---- drive shape ------------------------------------------------------- */
  function driveOpens(d) {
    return localDate(d.opens || d.starts_at);
  }
  function driveCloses(d) {
    return localDate(d.closes || d.ends_at);
  }

  function driveStatus(d) {
    var t = today(),
      o = driveOpens(d),
      x = driveCloses(d);
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
    if (d.relationship === "partner_event") return "With our partner";
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
      return {
        href: d.page,
        label: d.cta_label || "Buy popcorn",
        external: false,
      };
    }
    if (live && d.store_url) {
      return {
        href: d.store_url,
        label: d.cta_label || "Buy popcorn",
        external: true,
      };
    }
    if (live && d.cta_url && !closed) {
      return {
        href: d.cta_url,
        label: d.cta_label || "Take part",
        external: /^https?:/.test(d.cta_url),
      };
    }
    if (d.page) {
      // A past tournament or event links to its story page (/events/<slug>).
      return {
        href: d.page,
        label: d.type === "fundraiser" ? "See the drive" : "Read the story",
        external: false,
      };
    }
    return { href: "/donate", label: "Donate", external: false };
  }

  /* ---- events: one card, everywhere ---------------------------------------
     Home and /events render the same card from the same entry, so a monthly
     fundraiser or a tournament is one object in campaigns.json and nothing
     else. The calendar file lives at /cal/<slug>.ics (scripts/build-calendar.mjs). */
  var DAYS = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  function eventTag(d) {
    if (d.type === "tournament") return "Tournament";
    if (d.type === "fundraiser") return "Fundraiser";
    if (d.relationship === "partner_event") return "Partner event";
    if (d.relationship === "we_host") return "We host this";
    return "Event";
  }
  /* Urgency, read from the visitor's own calendar day. */
  function countdown(d) {
    var t = today(),
      o = driveOpens(d),
      x = driveCloses(d) || o;
    if (!o) return "";
    if (t >= o && t <= x) return +o === +x ? "Today" : "Happening now";
    var n = Math.round((o - t) / 864e5);
    if (n === 1) return "Tomorrow";
    if (n > 1 && n <= 45) return "In " + n + " days";
    return "";
  }
  /* Where, as one plain line: "Brick House Pickleball, Lake Forest, IL".
     Commas, not separators, so it can wrap anywhere without a stray dot. */
  function eventPlace(d) {
    return [d.venue, [d.city, d.state].filter(Boolean).join(", ")]
      .filter(Boolean)
      .join(", ");
  }
  /* Static icon markup only. Event data never reaches innerHTML. The block
     below is written by scripts/build-icons.mjs from the symbol dictionary
     (data/icons.mjs: time, place, community, event); edit the dictionary. */
  /* icons:start */
  var ICON = {
    time: '<svg width="16" height="16" class="evc-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="time" data-style="regular"><path fill="currentColor" d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88a88.1 88.1 0 0 1-88 88m64-88a8 8 0 0 1-8 8h-56a8 8 0 0 1-8-8V72a8 8 0 0 1 16 0v48h48a8 8 0 0 1 8 8"/></svg>',
    place:
      '<svg width="16" height="16" class="evc-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="place" data-style="regular"><path fill="currentColor" d="M128 64a40 40 0 1 0 40 40a40 40 0 0 0-40-40m0 64a24 24 0 1 1 24-24a24 24 0 0 1-24 24m0-112a88.1 88.1 0 0 0-88 88c0 31.4 14.51 64.68 42 96.25a254.2 254.2 0 0 0 41.45 38.3a8 8 0 0 0 9.18 0a254.2 254.2 0 0 0 41.37-38.3c27.45-31.57 42-64.85 42-96.25a88.1 88.1 0 0 0-88-88m0 206c-16.53-13-72-60.75-72-118a72 72 0 0 1 144 0c0 57.23-55.47 105-72 118"/></svg>',
    group:
      '<svg width="16" height="16" class="evc-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="community" data-style="regular"><path fill="currentColor" d="M244.8 150.4a8 8 0 0 1-11.2-1.6A51.6 51.6 0 0 0 192 128a8 8 0 0 1-7.37-4.89a8 8 0 0 1 0-6.22A8 8 0 0 1 192 112a24 24 0 1 0-23.24-30a8 8 0 1 1-15.5-4A40 40 0 1 1 219 117.51a67.94 67.94 0 0 1 27.43 21.68a8 8 0 0 1-1.63 11.21M190.92 212a8 8 0 1 1-13.84 8a57 57 0 0 0-98.16 0a8 8 0 1 1-13.84-8a72.06 72.06 0 0 1 33.74-29.92a48 48 0 1 1 58.36 0A72.06 72.06 0 0 1 190.92 212M128 176a32 32 0 1 0-32-32a32 32 0 0 0 32 32m-56-56a8 8 0 0 0-8-8a24 24 0 1 1 23.24-30a8 8 0 1 0 15.5-4A40 40 0 1 0 37 117.51a67.94 67.94 0 0 0-27.4 21.68a8 8 0 1 0 12.8 9.61A51.6 51.6 0 0 1 64 128a8 8 0 0 0 8-8"/></svg>',
    cal: '<svg width="16" height="16" class="evc-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="event" data-style="regular"><path fill="currentColor" d="M208 32h-24v-8a8 8 0 0 0-16 0v8H88v-8a8 8 0 0 0-16 0v8H48a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h160a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16M72 48v8a8 8 0 0 0 16 0v-8h80v8a8 8 0 0 0 16 0v-8h24v32H48V48Zm136 160H48V96h160zm-68-76a12 12 0 1 1-12-12a12 12 0 0 1 12 12m44 0a12 12 0 1 1-12-12a12 12 0 0 1 12 12m-88 40a12 12 0 1 1-12-12a12 12 0 0 1 12 12m44 0a12 12 0 1 1-12-12a12 12 0 0 1 12 12m44 0a12 12 0 1 1-12-12a12 12 0 0 1 12 12"/></svg>',
    arrow:
      '<svg class="ix-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="arrow" data-style="bold"><path fill="currentColor" d="m224.49 136.49l-72 72a12 12 0 0 1-17-17L187 140H40a12 12 0 0 1 0-24h147l-51.49-51.52a12 12 0 0 1 17-17l72 72a12 12 0 0 1-.02 17.01"/></svg>',
    external:
      '<svg class="ix-svg" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" data-icon="external" data-style="bold"><path fill="currentColor" d="M204 64v104a12 12 0 0 1-24 0V93L72.49 200.49a12 12 0 0 1-17-17L163 76H88a12 12 0 0 1 0-24h104a12 12 0 0 1 12 12"/></svg>',
  };
  /* icons:end */
  function icon(name) {
    var i = el("span", "evc-ico");
    i.setAttribute("aria-hidden", "true");
    /* width/height here, not only in CSS: a page that ever meets an older
       stylesheet still draws a 16px icon, never a full-width shape. */
    i.innerHTML = ICON[name];
    return i;
  }
  /* The link arrow from the dictionary: external when the link leaves the site. */
  function arrow(external) {
    var a = el("span", "arrow");
    a.setAttribute("aria-hidden", "true");
    a.innerHTML = ICON[external ? "external" : "arrow"];
    return a;
  }
  function fact(kind, text, href) {
    var li = el("li", "evc-fact is-" + kind);
    li.appendChild(icon(kind));
    if (href) {
      var a = el("a");
      wire(a, href, text);
      li.appendChild(a);
    } else li.appendChild(el("span", null, text));
    return li;
  }
  /* Every child is a direct child of the card, placed by named grid areas
     (site.css), so phones and desktops rearrange without wrappers. */
  function eventCard(d, opts) {
    opts = opts || {};
    var media = !!(opts.media && d.image);
    var card = el("article", "evc" + (media ? " has-media" : ""));
    var box = el("div", "evc-in");
    card.appendChild(box);
    if (media) {
      var fig = el("a", "evc-media");
      fig.href = driveCta(d).href;
      fig.setAttribute("tabindex", "-1");
      fig.setAttribute("aria-hidden", "true");
      var img = el("img");
      img.src = d.image;
      img.alt = "";
      img.decoding = "async";
      fig.appendChild(img);
      box.appendChild(fig);
    }
    var o = driveOpens(d),
      x = driveCloses(d) || o;
    var date = el("div", "evc-date");
    if (o) {
      date.appendChild(el("span", "evc-mon", MON[o.getMonth()]));
      date.appendChild(el("span", "evc-day", String(o.getDate())));
      date.appendChild(
        el(
          "span",
          "evc-sub",
          +o === +x
            ? DAYS[o.getDay()]
            : "to " + (x.getMonth() === o.getMonth() ? x.getDate() : fmtDate(x)),
        ),
      );
    }
    box.appendChild(date);
    var meta = el("p", "evc-meta");
    meta.appendChild(el("span", "evc-tag", eventTag(d)));
    var soon = countdown(d);
    if (soon) {
      // Coming up carries the clock; on the day it is a live dot, in green.
      var live = soon === "Today" || soon === "Happening now";
      var chip = el("span", "evc-soon" + (live ? " is-live" : ""), soon);
      var mark = live ? el("span", "live-dot") : sym("time");
      if (live) mark.setAttribute("aria-hidden", "true");
      chip.insertBefore(mark, chip.firstChild);
      meta.appendChild(chip);
    }
    box.appendChild(meta);
    box.appendChild(el(opts.heading || "h3", "evc-name", d.name));
    var facts = el("ul", "evc-facts");
    if (d.time_note)
      facts.appendChild(
        fact("time", d.time_note.charAt(0).toUpperCase() + d.time_note.slice(1)),
      );
    if (eventPlace(d)) facts.appendChild(fact("place", eventPlace(d)));
    if (d.group_url)
      facts.appendChild(fact("group", d.group_label || "Group", d.group_url));
    if (facts.children.length) box.appendChild(facts);
    if (d.summary) box.appendChild(el("p", "evc-sum", d.summary));
    var acts = el("div", "evc-acts");
    var cta = driveCta(d),
      go = el("a", "evc-btn is-primary");
    wire(go, cta.href, cta.label);
    go.appendChild(el("span", "arrow", " →"));
    acts.appendChild(go);
    var start = d.starts_at || d.opens;
    if (start && global.ATLCalendar) {
      var atc = el("div", "atc");
      atc.dataset.title = d.calendar_title || d.name;
      atc.dataset.start = start;
      atc.dataset.end = d.ends_at || d.closes || start;
      if (d.time_start && d.time_end) {
        atc.dataset.timeStart = d.time_start;
        atc.dataset.timeEnd = d.time_end;
      }
      if (d.tz) atc.dataset.tz = d.tz;
      atc.dataset.location = [d.venue, d.address].filter(Boolean).join(", ");
      atc.dataset.details = [d.summary, d.page ? "adapttolife.org" + d.page : d.cta_url]
        .filter(Boolean)
        .join(" ");
      atc.dataset.ics = d.ics || "/cal/" + d.slug + ".ics";
      var cal = el("a", "evc-btn is-alt");
      cal.href = atc.dataset.ics;
      cal.appendChild(icon("cal"));
      cal.appendChild(document.createTextNode("Add to calendar"));
      atc.appendChild(cal);
      acts.appendChild(atc);
      global.ATLCalendar.mount(atc);
    }
    box.appendChild(acts);
    return card;
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
    var campaigns = (Array.isArray(raw && raw.campaigns) ? raw.campaigns : []).filter(
      function (c) {
        return usable("campaign", c);
      },
    );
    var drives = (Array.isArray(raw && raw.drives) ? raw.drives : []).filter(
      function (d) {
        return usable("drive", d);
      },
    );

    return {
      campaigns: campaigns,
      drives: drives,
      /* Every drive feeding one campaign, soonest first, past ones last. */
      drivesFor: function (slug) {
        var rank = { open: 0, soon: 1, past: 2 };
        return drives
          .filter(function (d) {
            return !slug || d.campaign === slug;
          })
          .sort(function (a, b) {
            var r = rank[driveStatus(a)] - rank[driveStatus(b)];
            return r || (driveOpens(a) || 0) - (driveOpens(b) || 0);
          });
      },
      current: function (slug) {
        return this.drivesFor(slug).filter(function (d) {
          return driveStatus(d) !== "past";
        });
      },
      /* The campaign a drive feeds, or null. A drive we only compete in feeds
         nothing and must resolve to null rather than to the nearest campaign. */
      campaignFor: function (drive) {
        if (!drive || !drive.campaign) return null;
        return (
          campaigns.filter(function (c) {
            return c.slug === drive.campaign;
          })[0] || null
        );
      },
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
      try {
        cb(v);
      } catch (err) {
        console.error("campaign render failed:", err);
      }
    }
    if (typeof fetch !== "function") return finish(null);
    if (!pending) {
      pending = fetch(SRC, { credentials: "omit" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (raw) {
          return shape(raw);
        })
        .catch(function (err) {
          console.error("campaigns.json unavailable:", err);
          return null;
        });
    }
    pending.then(finish);
  }

  /* The site thermometer. Falls back to the campaign's own goal and hides the
     raised figure rather than publishing a $0 that is not true. */
  var raisedCache = {};
  function raised(cb, key) {
    if (typeof fetch !== "function") return cb(null);
    // One total per key: wbd (the one goal, with its parts), year, send-6 or
    // classic. No key means the Road (send-6). One request per key per page:
    // the module and the /numbers bars share it.
    var k = key || "";
    if (!raisedCache[k])
      raisedCache[k] = fetch(
        "/api/raised" + (key ? "?c=" + encodeURIComponent(key) : ""),
      ).then(function (r) {
        return r.json();
      });
    raisedCache[k]
      .then(function (d) {
        cb({
          raised: Number(d.raised) || 0,
          // Court time a partner club gives toward every week (wbd only).
          inkind: Number(d.inkind) || 0,
          goal: Number(d.goal) || 0,
          parts: d.parts || null,
          donors: Number(d.donors) || 0,
        });
      })
      .catch(function (err) {
        console.error("/api/raised unavailable:", err);
        cb(null);
      });
  }

  /* The result band: the counterpart to the campaign module. The module says
     what we are raising NOW; this says what a finished drive actually brought
     in.

     Why this is data-driven rather than three lines of hand-written HTML:
     the August popcorn drive's $3,004 already appears on /popcorn and
     /send-6, and it is the same number the thermometer adds via
     SEND6_OFFLINE_RAISED. A fourth hand-typed copy is a fourth thing to forget
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
      if (!store) {
        host.classList.remove("camp-pending");
        return hideSection();
      }

      var done = store.drives
        .filter(function (d) {
          return (
            driveStatus(d) === "past" && typeof d.raised === "number" && d.raised > 0
          );
        })
        .sort(function (a, b) {
          return (driveCloses(b) || 0) - (driveCloses(a) || 0);
        });

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
        left.appendChild(
          el("span", "win-sub", "This drive supports " + camp.name + "."),
        );
      } else if (d.summary) {
        left.appendChild(el("span", "win-sub", d.summary));
      }

      var fig = el("div", "win-figure");
      fig.appendChild(el("span", "win-amount", money(d.raised)));
      /* Percent of goal, not "of goal" — the story is that it went well past
         it. Only claimed when a goal exists and was actually beaten. */
      if (d.goal && d.raised >= d.goal) {
        fig.appendChild(
          el("span", "win-of", Math.round((d.raised / d.goal) * 100) + "% of goal"),
        );
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

  /* The campaign module (src/partials/campaign-module.html, stamped into
     pages by scripts/build-module.mjs). The markup ships complete with the
     goal, so a page without data still reads true: "$48,180, our goal for the
     year ahead". When the live total lands it counts up from $0 as the card
     comes into view, each part fills on its own, an empty part shows a pulse
     where the next gift lands, and the donor count joins the trust line.
     Never a $0 we cannot vouch for: no raised figure, no change. */
  var GIFTS = {
    // Every line is a verified unit cost: $15 a night at ACE (15 for $225), $129
    // a month for a membership ($1,548 for 12 months), about $3,500 for a US
    // Open the last couple of years. A month of nights is four nights, so the
    // math needs no calculator: $60 is 4 x $15 and $900 is 4 x $225 (Alec,
    // Nov 7: "How did you get 65? 15 x 4 is $60?"). The membership line sells
    // the unlimited sessions, one line on a desktop card ("Let's shorten it
    // up"), and no line names the club's membership ("Just say membership").
    // Each line says what the gift buys, how often and for whom, never the
    // amount: the button and the Monthly/One time toggle already show it
    // (Alec, Nov 7: "Should we add monthly? ... Is there a shorter and better
    // way to articulate this?"). /donate and /numbers use these same lines.
    monthly: [
      {
        a: 60,
        t: "Four nights on court every month for one athlete.",
      },
      {
        a: 129,
        t: "Unlimited sessions every month for one athlete to compete.",
      },
      {
        a: 900,
        t: "Four nights on court every month for up to 15 athletes.",
      },
    ],
    once: [
      { a: 15, t: "One night on court for one athlete." },
      { a: 60, t: "Four nights on court for one athlete." },
      { a: 225, t: "One night on court for up to 15 athletes." },
      {
        a: 1548,
        t: "A year of unlimited sessions for one athlete.",
      },
      { a: 3500, t: "About one athlete’s US Open: entry, travel and a room." },
    ],
  };
  // $60 a month is selected first, the gift closest to what people give (Alec, Nov 8 2026:
  // "select $60 a month instead of $129, and add a one time $60 button").
  var GIFT_DEFAULT = { monthly: 60, once: 225 };

  function reduced() {
    return !!(
      global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function whenSeen(node, fn) {
    if (!("IntersectionObserver" in global)) return fn();
    var io = new IntersectionObserver(
      function (entries) {
        if (
          entries.some(function (e) {
            return e.isIntersecting;
          })
        ) {
          io.disconnect();
          fn();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(node);
  }

  // The faded athlete behind the module is decoration: paint it only when the
  // module is within a screen of view, so a visit that never scrolls there
  // never downloads it.
  function near(node) {
    if (!("IntersectionObserver" in global)) return node.classList.add("is-near");
    var io = new IntersectionObserver(
      function (entries) {
        if (
          entries.some(function (e) {
            return e.isIntersecting;
          })
        ) {
          io.disconnect();
          node.classList.add("is-near");
        }
      },
      { rootMargin: "200px 0px" },
    );
    io.observe(node);
  }

  function countUp(node, to) {
    if (reduced() || typeof requestAnimationFrame !== "function") {
      node.textContent = money(Math.round(to));
      return;
    }
    var t0 = null;
    var dur = 1400;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min(1, (t - t0) / dur);
      node.textContent = money(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function each(root, sel, fn) {
    Array.prototype.forEach.call(root.querySelectorAll(sel), fn);
  }

  function picker(card) {
    var box = card.querySelector("[data-give]");
    var link = card.querySelector("[data-give-link]");
    if (!box || !link) return;
    var amts = box.querySelector("[data-amts]");
    var impact = box.querySelector("[data-impact]");
    var freq = "monthly";
    function choose(opt) {
      Array.prototype.forEach.call(amts.children, function (b) {
        b.setAttribute(
          "aria-checked",
          String(Number(b.getAttribute("data-a")) === opt.a),
        );
      });
      impact.textContent = opt.t;
      link.href =
        "/donate?amount=" + opt.a + (freq === "monthly" ? "&frequency=monthly" : "");
    }
    function draw() {
      amts.innerHTML = "";
      amts.classList.toggle("is-3", GIFTS[freq].length === 3);
      GIFTS[freq].forEach(function (opt) {
        var label = "$" + opt.a.toLocaleString("en-US");
        var b = el("button", null, label);
        b.type = "button";
        b.setAttribute("role", "radio");
        b.setAttribute("data-a", String(opt.a));
        b.setAttribute(
          "aria-label",
          label + (freq === "monthly" ? " a month" : " once"),
        );
        b.addEventListener("click", function () {
          choose(opt);
        });
        amts.appendChild(b);
      });
      choose(
        GIFTS[freq].filter(function (o) {
          return o.a === GIFT_DEFAULT[freq];
        })[0],
      );
    }
    each(box, "[data-freq]", function (b) {
      b.addEventListener("click", function () {
        freq = b.getAttribute("data-freq");
        each(box, "[data-freq]", function (x) {
          x.setAttribute("aria-checked", String(x === b));
        });
        draw();
      });
    });
    // The static buttons are monthly with $129 chosen; rebuilding them binds
    // the clicks without changing what is on screen.
    draw();
  }

  /* /numbers: how much of each part is covered so far, in the module's
     colours (green gifts, blue striped court time), and one bar for the whole
     goal with its key and what is left to raise. Hidden until real numbers
     arrive, so the page never shows a $0 that is not true. */
  function pctW(a, b) {
    return Math.max(0, Math.min(100, (a / b) * 100)).toFixed(1) + "%";
  }
  /* Symbols (site.css, "symbols"): one class each, drawn by the stylesheet
     from the dictionary. Decorative: the words beside them say it too. */
  function sym(name, cls) {
    var i = document.createElement("i");
    i.className = "sym sym--" + name + (cls ? " " + cls : "");
    i.setAttribute("aria-hidden", "true");
    return i;
  }
  function numbersBars() {
    // The six faces paint once their row is near view (site.css, .face).
    Array.prototype.forEach.call(document.querySelectorAll(".nb-crew"), near);
    if (!document.querySelector("[data-nb-row], [data-nb-total]")) return;
    raised(function (d) {
      if (!d || !d.raised) return;
      var parts = d.parts || {};
      Object.keys(parts).forEach(function (k) {
        var p = parts[k] || {};
        var pr = Number(p.raised) || 0;
        var pg = Number(p.goal) || 0;
        var pk = Math.min(Number(p.inkind) || 0, pr);
        if (!pg || !pr) return;
        each(document, '[data-nb-row="' + k + '"]', function (n) {
          n.hidden = false;
          n.classList.toggle("has-gifts", pr - pk > 0 && pk > 0);
          n.classList.toggle("is-done", pr >= pg);
        });
        each(document, '[data-nb-fig="' + k + '"]', function (n) {
          n.textContent = money(pr) + " of " + money(pg);
        });
        each(document, '[data-nb-pct="' + k + '"]', function (n) {
          n.textContent = Math.round((pr / pg) * 100) + "%";
        });

        each(document, '[data-nb-kind="' + k + '"]', function (n) {
          whenSeen(n, function () {
            n.style.width = pctW(pk, pg);
          });
        });
        each(document, '[data-nb-fill="' + k + '"]', function (n) {
          whenSeen(n, function () {
            n.style.width = pctW(pr - pk, pg);
          });
        });
      });
      var goal = Number(d.goal) || 0;
      var gifts = Number(d.raised) || 0;
      var kind = Number(d.inkind) || 0;
      if (!goal) return;
      each(document, "[data-nb-total]", function (n) {
        n.hidden = false;
        n.classList.toggle("has-gifts", gifts > 0 && kind > 0);
        n.classList.toggle("is-done", gifts + kind >= goal);
      });
      // The finish station on the route turns yellow when the goal is met.
      each(document, ".nb-stop--finish", function (n) {
        n.classList.toggle("is-done", gifts + kind >= goal);
      });
      each(document, '[data-nb-kind="total"]', function (n) {
        whenSeen(n, function () {
          n.style.width = pctW(kind, goal);
        });
      });
      each(document, '[data-nb-fill="total"]', function (n) {
        whenSeen(n, function () {
          n.style.width = pctW(gifts, goal);
        });
      });
      // Who gave: Givebutter's donors online, and the popcorn drive's
      // supporters (stamped from campaigns.json), side by side and never
      // added up, because some people did both.
      if (d.donors)
        each(document, "[data-nb-people]", function (n) {
          each(n, "[data-nb-donors]", function (x) {
            x.textContent = d.donors + (d.donors === 1 ? " donor" : " donors");
          });
          n.hidden = false;
        });
      // The ledger under the bar: each part, then so far and to go.
      var sums = {
        kind: kind,
        gifts: gifts,
        so: gifts + kind,
        left: Math.max(0, goal - gifts - kind),
      };
      Object.keys(sums).forEach(function (s) {
        each(document, '[data-nb-sum="' + s + '"]', function (n) {
          n.textContent = money(sums[s]);
        });
      });
      each(document, '[data-nb-part="kind"]', function (n) {
        n.hidden = !kind;
      });
    }, "wbd");
  }

  function module(root) {
    numbersBars();
    var scope = root || document;
    var mods = scope.querySelectorAll("[data-cm]");
    if (!mods.length) return;
    Array.prototype.forEach.call(mods, function (m) {
      var card = m.querySelector(".cm-card");
      if (card) picker(card);
      var bg = m.querySelector(".cm-bg");
      if (bg) near(bg);
      var faces = m.querySelector(".cm-faces");
      if (faces) near(faces);
    });
    raised(function (d) {
      if (!d || !d.raised) return;
      var parts = d.parts || {};
      Array.prototype.forEach.call(mods, function (m) {
        // Court time a partner club gives counts toward the goal beside the
        // gifts: one total, and a line under it that keeps the two apart.
        var kind = Number(d.inkind) || 0;
        if (d.goal)
          each(m, "[data-cm-sub]", function (n) {
            n.textContent =
              (kind ? "toward our " : "raised toward our ") +
              money(d.goal) +
              " goal for the year ahead";
          });
        each(m, "[data-cm-total]", function (n) {
          n.textContent = "$0";
          whenSeen(n, function () {
            countUp(n, (Number(d.raised) || 0) + kind);
          });
        });
        // Each part: what is covered so far as one fill (the partner club's
        // court time included; /numbers keeps the two apart with a key), the
        // amount with the raised figure in bold, and the share where the bar
        // ends. Alec, Nov 7: "where to look and what to care about".
        Object.keys(parts).forEach(function (k) {
          var p = parts[k] || {};
          var pr = Number(p.raised) || 0;
          var pg = Number(p.goal) || 0;
          if (!pg) return;
          each(m, '[data-part-fig="' + k + '"]', function (n) {
            if (!pr) {
              n.textContent = money(pg) + (k === "year" ? " a year" : "");
              return;
            }
            n.textContent = "";
            n.appendChild(el("b", null, money(pr)));
            n.appendChild(document.createTextNode(" of " + money(pg)));
          });
          each(m, '[data-part-row="' + k + '"]', function (n) {
            n.classList.toggle("is-empty", !pr);
            n.classList.toggle("is-done", pr >= pg);
          });
          each(m, '[data-part-pct="' + k + '"]', function (n) {
            if (!pr) return;
            n.textContent = Math.round((pr / pg) * 100) + "%";
            n.hidden = false;
          });
          each(m, '[data-part-fill="' + k + '"]', function (n) {
            whenSeen(n, function () {
              n.style.width =
                Math.max(0, Math.min(100, (pr / pg) * 100)).toFixed(1) + "%";
            });
          });
        });
      });
    }, "wbd");
  }

  /* The Givebutter form on the off-white (see the matching block at the end
     of site.css). The form's frame lives two shadow roots down; once it is
     there and has a height, its .gb-card gets .gb-ready and the blend turns
     on. No frame within 20 seconds, no change: the form stays white. */
  function gbOffWhite() {
    var cards = document.querySelectorAll(".gb-card");
    Array.prototype.forEach.call(cards, function (card) {
      var tries = 0;
      (function check() {
        var gb = card.querySelector("givebutter-giving-form");
        var host =
          gb && gb.shadowRoot && gb.shadowRoot.querySelector("givebutter-iframe");
        var frame = host && host.shadowRoot && host.shadowRoot.querySelector("iframe");
        if (frame && frame.getBoundingClientRect().height > 120) {
          card.classList.add("gb-ready");
          return;
        }
        if (++tries < 80) setTimeout(check, 250);
      })();
    });
  }
  gbOffWhite();

  global.ATLCampaigns = {
    load: load,
    raised: raised,
    module: module,
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
    eventTag: eventTag,
    eventCard: eventCard,
    countdown: countdown,
    el: el,
    sym: sym,
    arrow: arrow,
    wire: wire,
  };
})(window);
