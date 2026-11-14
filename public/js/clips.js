/* ==========================================================================
   Adapt To Life: muted video clips (Nov 11 2026).

   Alec: "We also have a bunch of videos that we can do a better job at
   incorporating to show how big we are." Every clip on the site works the
   same way:

     <figure class="clip" data-clip>
       <video muted loop playsinline preload="none" poster="...webp"
              data-src="...mp4" aria-hidden="true"></video>
       <button type="button" class="clip-btn" data-state="paused"
               aria-label="Play the video">(pause and play icons)</button>
     </figure>

   - The script starts a clip (there is no autoplay attribute), so Save-Data
     and reduced motion keep the poster, and a visit that never scrolls to a
     clip never downloads it.
   - A clip plays only while at least half of it is on screen.
   - Every clip can be paused, and a clip the viewer paused stays paused.
   - Clips are muted: several carry licensed music, and the site plays none.
   - Recognized video cards link to their original Instagram posts. Links are
     siblings of playback controls, so play/pause never opens Instagram.
   ========================================================================== */
(function () {
  // Original reel permalinks from the media-library handoff. Match without
  // the asset hash so re-encoding a clip does not lose its source post.
  var posts = {
    "/videos/road/arrival.mp4": ["De4NJ9TNJGR", "The crew arrives at Monster Smash"],
    "/videos/road/juan-gold.mp4": ["De5I8l7tqFr", "Juan’s gold"],
    "/videos/road/bob-gold.mp4": ["De7Qd_UPlUr", "Bob’s gold"],
    "/videos/road/robby-bronze.mp4": ["De9sG0St6Ep", "Robby’s bronze"],
    "/videos/road/amanda-bronze.mp4": ["DfDx2bUNKlz", "Amanda’s bronze"],
    "/videos/road/app-court.mp4": ["Db3q5eZN7Wf", "APP court 29"],
    "/videos/crew/full-house.mp4": ["DeaKsfmNZZ8", "A practice night at Brick House"],
    "/videos/brickhouse/rally.mp4": ["DeQFw1fNPb_", "The Brick House rally"],
    "/videos/links/rally-brickhouse.mp4": ["DeQFw1fNPb_", "The Brick House rally"],
  };
  document.querySelectorAll("[data-clip], .bh-film, .lx-hero").forEach(function (el) {
    var video = el.querySelector("video");
    if (!video || el.querySelector(".clip-link")) return;
    var src = video.getAttribute("data-src") || video.getAttribute("src") || "";
    var path = new URL(src, document.baseURI).pathname.replace(
      /\.[0-9a-f]{8}(?=\.mp4$)/,
      "",
    );
    var post = posts[path];
    if (!post) return;
    var link = document.createElement("a");
    link.className = "clip-link";
    link.href = "https://www.instagram.com/reel/" + post[0] + "/";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute(
      "aria-label",
      "Watch " + post[1] + " on Instagram (opens in a new tab)",
    );
    video.insertAdjacentElement("afterend", link);
  });

  var clips = document.querySelectorAll("[data-clip]");
  if (!clips.length) return;
  var reduced =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var saver = navigator.connection && navigator.connection.saveData;
  var still = reduced || saver;

  function setState(btn, playing) {
    if (!btn) return;
    btn.setAttribute("data-state", playing ? "playing" : "paused");
    btn.setAttribute("aria-label", playing ? "Pause the video" : "Play the video");
  }

  function play(c) {
    var v = c.video;
    if (!v.getAttribute("src")) v.src = v.getAttribute("data-src");
    v.muted = true;
    var p = v.play();
    setState(c.btn, true);
    if (p && p.catch)
      p.catch(function () {
        setState(c.btn, false);
      });
  }

  function pause(c) {
    c.video.pause();
    setState(c.btn, false);
  }

  var list = Array.prototype.map
    .call(clips, function (el) {
      var c = {
        el: el,
        video: el.querySelector("video"),
        btn: el.querySelector(".clip-btn"),
        held: false,
        seen: false,
      };
      if (!c.video) return null;
      setState(c.btn, false);
      if (c.btn)
        c.btn.addEventListener("click", function () {
          if (c.video.paused) {
            c.held = false;
            play(c);
          } else {
            c.held = true;
            pause(c);
          }
        });
      return c;
    })
    .filter(Boolean);

  if (still) return;

  if (!("IntersectionObserver" in window)) {
    list.forEach(play);
    return;
  }
  var io = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        var c = list.filter(function (x) {
          return x.el === e.target;
        })[0];
        if (!c) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (!c.held) play(c);
        } else if (!c.video.paused) {
          c.video.pause();
          setState(c.btn, false);
        }
      });
    },
    { threshold: [0, 0.5] },
  );
  list.forEach(function (c) {
    io.observe(c.el);
  });
})();
