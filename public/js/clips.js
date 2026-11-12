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
   ========================================================================== */
(function () {
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
