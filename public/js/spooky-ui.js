(function () {
  // 1. Pause any other playing video before a new one starts
  function pauseOthers(active) {
    document.querySelectorAll("video").forEach(function (v) {
      if (v !== active && !v.paused) {
        try {
          v.pause();
        } catch (e) {}
      }
    });
  }

  // 2. Poster-to-native-player enhancer (hero, archive clips, coverage reel, lessons, spotlight deck)
  document.querySelectorAll("[data-player-box]").forEach(function (box) {
    var trigger = box.querySelector("[data-play-trigger]");
    var frame = box.querySelector(".sp-film-image, .sp-exp-clip-frame, .sp-lesson-916");
    if (!trigger || !frame) return;
    var defaultLabel = trigger.querySelector(".sp-play-label");
    var defaultText = defaultLabel ? defaultLabel.textContent : "Watch video";

    function launch(e) {
      if (e) e.preventDefault();
      var src = box.getAttribute("data-src") || trigger.getAttribute("href");
      var poster = box.getAttribute("data-poster") || "";
      var title = box.getAttribute("data-title") || "Video player";
      if (box.getAttribute("data-ratio") === "9/16") frame.classList.add("is-native-916");

      var existing = frame.querySelector("video");
      if (existing) {
        if (existing.getAttribute("data-loaded-src") !== src) {
          existing.src = src;
          existing.poster = poster;
          existing.setAttribute("data-loaded-src", src);
        }
        pauseOthers(existing);
        var p0 = existing.play();
        if (p0 && p0.catch) p0.catch(function () { frame.classList.add("is-playing"); });
        return;
      }

      var v = document.createElement("video");
      v.controls = true;
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.preload = "auto";
      v.poster = poster;
      v.src = src;
      v.setAttribute("data-loaded-src", src);
      v.setAttribute("aria-label", title);

      v.addEventListener("playing", function () {
        frame.classList.add("is-playing");
        pauseOthers(v);
      });
      v.addEventListener("ended", function () {
        frame.classList.remove("is-playing");
        if (defaultLabel) defaultLabel.textContent = "Replay: " + defaultText;
        if (document.activeElement === v) trigger.focus();
      });
      v.addEventListener("error", function () {
        frame.classList.remove("is-playing");
      });

      frame.appendChild(v);
      pauseOthers(v);
      var p = v.play();
      if (p && p.catch) {
        p.catch(function () {
          frame.classList.add("is-playing");
        });
      }
    }

    trigger.addEventListener("click", launch);
  });

  // 3. Inline lesson cue toggle on /spooky-spokes #going
  document.querySelectorAll("[data-lesson-cue]").forEach(function (cue) {
    var btn = cue.querySelector("[data-cue-trigger]");
    var wrap = cue.querySelector(".sp-lesson-cue-frame");
    if (!btn || !wrap) return;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      wrap.classList.add("is-open");
      var src = btn.getAttribute("href");
      var v = wrap.querySelector("video");
      if (!v) {
        v = document.createElement("video");
        v.controls = true;
        v.playsInline = true;
        v.setAttribute("playsinline", "");
        v.poster = cue.getAttribute("data-poster") || "";
        v.src = src;
        v.setAttribute("aria-label", "Hybrid doubles return lesson, 80 seconds");
        wrap.appendChild(v);
      }
      pauseOthers(v);
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
    });
  });

  // 4. Corrected interactive Hybrid Doubles SVG court (incoming path with numbered bounces ON path + outgoing return arrow)
  document.querySelectorAll("[data-hybrid-court]").forEach(function (widget) {
    var stage = widget.querySelector("[data-court-stage]");
    var capEl = widget.querySelector("[data-court-cap]");
    var modeEl = widget.querySelector("[data-court-mode-label]");
    var btns = widget.querySelectorAll("[data-court-mode]");
    var prefix = widget.getAttribute("data-hybrid-court") || "c1";
    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!stage) return;

    function buildSvg(mode) {
      var isChair = mode === "wheelchair";
      var arrId = prefix + "-arr-" + mode;
      var inPath = isChair
        ? "M 250 56 Q 178 96 106 112 Q 90 116 76 118 L 58 118"
        : "M 225 110 Q 178 66 132 54 L 106 52";
      var outPath = isChair
        ? "M 56 116 Q 152 38 258 54"
        : "M 106 52 Q 178 106 258 112";
      var inColor = isChair ? "#74cf29" : "#73c0d2";
      var bounces = isChair
        ? '<circle cx="106" cy="112" r="9.5" fill="#171c33" stroke="#74cf29" stroke-width="2"/><text x="106" y="116" text-anchor="middle" fill="#74cf29" font-family="system-ui,sans-serif" font-size="10" font-weight="800">1</text>' +
          '<circle cx="78" cy="118" r="9.5" fill="#171c33" stroke="#74cf29" stroke-width="2"/><text x="78" y="122" text-anchor="middle" fill="#74cf29" font-family="system-ui,sans-serif" font-size="10" font-weight="800">2</text>'
        : '<circle cx="132" cy="54" r="9.5" fill="#171c33" stroke="#73c0d2" stroke-width="2"/><text x="132" y="58" text-anchor="middle" fill="#73c0d2" font-family="system-ui,sans-serif" font-size="10" font-weight="800">1</text>';
      var aria = isChair
        ? "Scaled hybrid doubles court showing an incoming shot taking two bounces to the wheelchair player and returning across the net."
        : "Scaled hybrid doubles court showing an incoming shot taking one bounce to the standing player and returning across the net.";
      return (
        '<svg viewBox="0 0 320 168" role="img" aria-label="' + aria + '">' +
        '<defs><marker id="' + arrId + '" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 1 1.5 L 8.5 5 L 1 8.5 z" fill="#ff5c39"/></marker></defs>' +
        '<rect width="320" height="168" rx="14" fill="#171c33"/>' +
        '<rect x="28" y="24" width="264" height="120" rx="3" fill="#2b3252" stroke="#f9f7f2" stroke-width="2"/>' +
        '<rect x="118" y="24" width="84" height="120" fill="#171c33" fill-opacity="0.52" stroke="#f9f7f2" stroke-width="1.5"/>' +
        '<line x1="28" y1="84" x2="118" y2="84" stroke="#f9f7f2" stroke-width="1.4"/>' +
        '<line x1="202" y1="84" x2="292" y2="84" stroke="#f9f7f2" stroke-width="1.4"/>' +
        '<line x1="160" y1="16" x2="160" y2="152" stroke="#73c0d2" stroke-width="2.5" stroke-dasharray="5 4"/>' +
        '<circle cx="258" cy="54" r="8" fill="#f9f7f2" fill-opacity="0.28" stroke="#f9f7f2" stroke-width="1.5"/>' +
        '<rect x="218" y="104" width="14" height="14" rx="3" fill="#f9f7f2" fill-opacity="0.28" stroke="#f9f7f2" stroke-width="1.5"/>' +
        '<path d="' + inPath + '" fill="none" stroke="' + inColor + '" stroke-width="2.4" stroke-dasharray="4 4" stroke-linecap="round"/>' +
        bounces +
        '<path class="sp-ret-arc" d="' + outPath + '" fill="none" stroke="#ff5c39" stroke-width="3" stroke-linecap="round" marker-end="url(#' + arrId + ')"/>' +
        '<circle cx="52" cy="118" r="9" fill="#74cf29" fill-opacity="' + (isChair ? "1" : "0.42") + '" stroke="#f9f7f2" stroke-width="2"/>' +
        '<rect x="90" y="44" width="16" height="16" rx="3" fill="#73c0d2" fill-opacity="' + (!isChair ? "1" : "0.42") + '" stroke="#f9f7f2" stroke-width="2"/>' +
        "</svg>"
      );
    }

    function render(mode, animate) {
      stage.innerHTML = buildSvg(mode);
      btns.forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-court-mode") === mode ? "true" : "false");
      });
      if (modeEl) {
        modeEl.textContent = mode === "wheelchair" ? "Wheelchair receiver" : "Standing receiver";
      }
      if (capEl) {
        capEl.textContent =
          mode === "wheelchair"
            ? "The wheelchair player may use a second bounce."
            : "The standing player may use one bounce.";
      }
      if (animate && !reduced) {
        var path = stage.querySelector(".sp-ret-arc");
        if (path && path.getTotalLength) {
          var len = path.getTotalLength();
          path.style.strokeDasharray = len;
          path.style.strokeDashoffset = len;
          path.getBoundingClientRect();
          path.style.transition = "stroke-dashoffset 0.75s cubic-bezier(.2,.7,.3,1)";
          path.style.strokeDashoffset = "0";
        }
      }
    }

    var initMode = widget.getAttribute("data-initial-mode") || "wheelchair";
    render(initMode, false);
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        render(b.getAttribute("data-court-mode"), true);
      });
    });
  });

  // 5. Proposal lesson switcher (For players / For hosts)
  document.querySelectorAll("[data-lesson-switcher]").forEach(function (sw) {
    var box = sw.querySelector("[data-player-box]");
    var frame = sw.querySelector(".sp-lesson-916");
    var img = frame && frame.querySelector("img");
    var titleEl = sw.querySelector("[data-lsw-title]");
    var subEl = sw.querySelector("[data-lsw-sub]");
    var trig = sw.querySelector("[data-play-trigger]");
    var trigLbl = trig && trig.querySelector(".sp-play-label");
    var trigDur = trig && trig.querySelector(".sp-play-dur");
    var btns = sw.querySelectorAll("[data-lsw]");
    var items = {
      players: {
        title: "Your return sets up your partner",
        sub: "Player lesson \u00b7 Hybrid doubles \u00b7 1:20",
        src: "/videos/spooky-spokes/hybrid-return-neutral.mp4",
        poster: "/videos/spooky-spokes/hybrid-return-neutral.webp",
        btn: "Watch player lesson",
        dur: "1:20",
        alt: "Hybrid doubles diagram showing wide crosscourt return targets.",
      },
      hosts: {
        title: "Add wheelchair and hybrid divisions to a tournament",
        sub: "Host lesson \u00b7 For club pros and directors \u00b7 0:57",
        src: "/videos/spooky-spokes/tournament-divisions-neutral.mp4",
        poster: "/videos/spooky-spokes/tournament-divisions-neutral.webp",
        btn: "Watch host lesson",
        dur: "0:57",
        alt: "Tournament division chart showing wheelchair singles, wheelchair doubles, and hybrid doubles.",
      },
    };
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-lsw");
        var item = items[k];
        if (!item || !box || !frame) return;
        var existing = frame.querySelector("video");
        if (existing) {
          try {
            existing.pause();
          } catch (e) {}
          existing.remove();
        }
        frame.classList.remove("is-playing");
        box.setAttribute("data-src", item.src);
        box.setAttribute("data-poster", item.poster);
        box.setAttribute("data-title", item.title);
        if (img) {
          img.src = item.poster;
          img.alt = item.alt;
        }
        if (titleEl) titleEl.textContent = item.title;
        if (subEl) subEl.textContent = item.sub;
        if (trig) trig.href = item.src;
        if (trigLbl) trigLbl.textContent = item.btn;
        if (trigDur) trigDur.textContent = item.dur;
        btns.forEach(function (x) {
          x.setAttribute("aria-pressed", x === b ? "true" : "false");
        });
      });
    });
  });

  // 6. Proposal Section 05 interactive Athlete Spotlight Card Deck (Brian / Amanda / Juan)
  document.querySelectorAll("[data-spotlight-deck]").forEach(function (deck) {
    var btns = deck.querySelectorAll("[data-spot-id]");
    var cards = deck.querySelectorAll("[data-spot-card]");
    var nameEl = deck.querySelector("[data-spot-name]");
    var resEl = deck.querySelector("[data-spot-res]");
    var storyEl = deck.querySelector("[data-spot-story]");
    var clipWrap = deck.querySelector("[data-spot-clip-wrap]");
    var clipLink = deck.querySelector("[data-spot-clip-link]");
    var clipLbl = deck.querySelector("[data-spot-clip-label]");
    var data = {
      brian: {
        name: "Brian Liss",
        res: "Competed at Monster Smash 2026",
        story: "Brian did not have to win a medal to earn a spotlight. His custom Monster Smash card celebrated his trip to Cincinnati and gave him something real to share with family and teammates.",
        clipHref: "",
        clipText: "",
      },
      amanda: {
        name: "Amanda Tworek",
        res: "Doubles bronze with Kasey Stelter",
        story: "Amanda went home with a custom doubles bronze card, courtside video in her Halloween skeleton shirt, and a portrait under the Lunken Landing banner.",
        clipHref: "/videos/spooky-spokes/clip-amanda.mp4",
        clipText: "Watch Amanda's 2026 court clip (0:06)",
      },
      juan: {
        name: "Juan Ortiz",
        res: "Wheelchair singles gold",
        story: "Juan received a custom gold card and 4K court footage from Lunken Landing that helped introduce wheelchair pickleball to thousands of new viewers.",
        clipHref: "/videos/spooky-spokes/clip-juan.mp4",
        clipText: "Watch Juan's 2026 court clip (0:06)",
      },
    };
    var order = ["brian", "amanda", "juan"];

    function select(id) {
      var item = data[id];
      if (!item) return;
      btns.forEach(function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-spot-id") === id ? "true" : "false");
      });
      var activeIdx = order.indexOf(id);
      cards.forEach(function (c) {
        var cid = c.getAttribute("data-spot-card");
        var idx = order.indexOf(cid);
        var rel = (idx - activeIdx + order.length) % order.length; // 0=front, 1=right, 2=left
        c.setAttribute("data-pos", rel === 0 ? "front" : rel === 1 ? "right" : "left");
        c.setAttribute("aria-hidden", rel === 0 ? "false" : "true");
      });
      if (nameEl) nameEl.textContent = item.name;
      if (resEl) resEl.textContent = item.res;
      if (storyEl) storyEl.textContent = item.story;
      if (clipWrap && clipLink && clipLbl) {
        if (item.clipHref) {
          clipWrap.hidden = false;
          clipLink.href = item.clipHref;
          clipLbl.textContent = item.clipText;
        } else {
          clipWrap.hidden = true;
        }
      }
    }

    select("brian");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        select(b.getAttribute("data-spot-id"));
      });
    });
    cards.forEach(function (c) {
      c.addEventListener("click", function () {
        select(c.getAttribute("data-spot-card"));
      });
    });
  });
})();
