// The /selkirk title sequence, "Center Court". A dark arena and a pickleball:
// it drops beside the lens and bounces as the first floodlight snaps on, hangs
// in the light, and is served across the net while the camera cranes up and
// over to land straight above the court, both names painted on it, one on each
// side of the net.
//
// update(t) draws the frame at time t (seconds), so the same code runs live,
// as one still frame for reduced motion, and frame by frame for recordings
// (?capture: window.__stage.seek(t) draws one exact frame).
//
// Built for clarity and a light load. Everything is drawn in one pass straight
// to the screen with the GPU's own antialiasing: no grain, no glow passes. The
// court lines are worked out per pixel, so they stay sharp up close and never
// shimmer far away, and the names are drawn from their SVGs at the size they
// land. Once the sequence has settled, drawing stops.
//
// three.js is vendored in /js/vendor/three-0.170.0 (MIT, see its LICENSE) and
// reached through the import map in selkirk.html. The folder name carries the
// version, so a newer three.js goes in a new folder, never over this one.
import * as THREE from "three";

const root = document.querySelector("[data-stage]");
const CAPTURE = new URLSearchParams(location.search).has("capture");
const REDUCED = !CAPTURE && matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE = matchMedia("(max-width: 760px)").matches;
const DURATION = 6.4; // the copy under the court comes in here
const STILL = 13; // the slow push ends here; nothing moves after it, so drawing stops

// A pickleball court in metres: 6.1 wide, 13.41 long, kitchen 2.13 from the net.
const CW = 6.1, CL = 13.41, KITCHEN = 2.13, LINE = 0.06;
const FW = 15, FL = 24; // the floor around it
const LIGHT_ON = [1.0, 1.45, 1.9, 2.3]; // nearest the camera first

// Timing ----------------------------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const smooth01 = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = {
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

// The ball's clock runs slow while it hangs in the light, then ramps back to
// full speed for the serve, the way a sports film holds a moment. Closed form,
// so any frame can be drawn on its own.
const RAMP = { a: 0.85, b: 1.12, c: 1.82, d: 2.2, slow: 0.28 };
const rampArea = (t) => {
  const { a, b, c, d } = RAMP;
  const F = (x) => x * x * x - (x * x * x * x) / 2; // the integral of smoothstep
  let s = 0;
  if (t > a) s += (b - a) * F(clamp01((t - a) / (b - a)));
  if (t > b) s += Math.min(t, c) - b;
  if (t > c) { const x = clamp01((t - c) / (d - c)); s += (d - c) * (x - F(x)); }
  return s;
};
const ballClock = (t) => t - (1 - RAMP.slow) * rampArea(t);

// The film look: a vignette, letterbox bars, the fade from black. One overlay
// drawn over the finished frame, so it costs a single extra draw.
const FilmShader = {
  uniforms: {
    uRes: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.5 },
    uBars: { value: 1 },
    uBarSize: { value: 0.1 },
    uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uVignette, uBars, uBarSize, uFade;
    uniform vec2 uRes;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float keep = uFade * (1.0 - uVignette * smoothstep(0.25, 0.9, length(d * 1.25)));
      float bar = uBars * uBarSize, edge = 1.5 / uRes.y;
      keep *= smoothstep(bar - edge, bar + edge, vUv.y) * smoothstep(bar - edge, bar + edge, 1.0 - vUv.y);
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0 - keep);
    }`,
};

// The stage: renderer and camera, sized to the section.
function createStage({ fov, exposure }) {
  const canvas = root.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: CAPTURE });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps brand colours true; ACES turns the orange pink
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x040404, 1);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);
  const filmScene = new THREE.Scene();
  const film = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ ...FilmShader, uniforms: THREE.UniformsUtils.clone(FilmShader.uniforms), transparent: true, depthTest: false, depthWrite: false }),
  );
  film.frustumCulled = false;
  filmScene.add(film);
  const filmCam = new THREE.Camera();

  const stage = {
    canvas, renderer, scene, camera, film: film.material.uniforms, width: 1, height: 1, portrait: false, onResize: null,
    draw() {
      renderer.clear();
      renderer.render(scene, camera);
      renderer.render(filmScene, filmCam);
    },
  };
  const resize = () => {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    if (w === stage.width && h === stage.height) return;
    stage.width = w; stage.height = h; stage.portrait = w / h < 0.9;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    stage.film.uRes.value.set(w * pr, h * pr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.onResize && stage.onResize();
    stage.afterResize && stage.afterResize(); // resizing clears the canvas
  };
  new ResizeObserver(resize).observe(root);
  resize();
  return stage;
}

// Running: live, one still, or seekable for recordings. Returns stop().
function run(stage, update, onSettled) {
  const render = (t) => { update(t); stage.draw(); };
  if (CAPTURE) {
    // Frame exact: the copy under the court follows t too, not the clock.
    const copy = root.querySelector(".sk-stage-copy");
    root.classList.add("is-live", "is-capture");
    window.__stage = {
      duration: DURATION,
      seek(t) {
        render(t);
        if (copy) {
          const k = ease.outCubic(clamp01(t - DURATION));
          copy.style.transition = "none";
          copy.style.opacity = String(k);
          copy.style.transform = `translateY(${(1 - k) * 12}px)`;
        }
        return true;
      },
    };
    window.__stageReady = true;
    return () => {};
  }
  if (REDUCED) {
    // One still of the final frame, drawn again whenever the stage resizes.
    stage.afterResize = () => render(DURATION + 2);
    stage.afterResize();
    onSettled();
    return () => {};
  }
  let t = 0, prev = performance.now(), settled = false, visible = true, raf = 0, stopped = false;
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    t = Math.min(STILL, t + dt);
    render(t);
    if (!settled && t >= DURATION) { settled = true; onSettled(); }
    if (t >= STILL) {
      // The last frame is up and nothing moves now: stop drawing. A resize redraws it.
      stopped = true;
      stage.afterResize = () => render(STILL);
      return;
    }
    if (visible && !stopped) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (!stopped && visible && !raf && !document.hidden) { prev = performance.now(); raf = requestAnimationFrame(frame); }
  };
  // Draw only while the stage is on screen.
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(root);
  document.addEventListener("visibilitychange", wake);
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); raf = 0; };
}

// A logo, decoded and ready to paint. It is drawn straight from the SVG at the
// size it lands on the court, so it stays sharp. The shape is fixed here, not
// read from the file: some browsers report no natural size for an SVG.
async function loadLogo(url, aspect) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, aspect };
}

// A soft round sprite: the ball's shadow, the glow round a lamp.
function softDot(size = 128) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.3, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Where the two names go, in metres on the court. Portrait: the court stands
// upright, Adapt To Life in the far half. Landscape: it lies across the screen
// with world -x up, so the near half is on the left; Adapt To Life goes there
// and each lockup turns a quarter to read upright.
//
// Each name sits in the middle of its service half. Selkirk's lockup is long
// and low and Adapt To Life's is stacked: at the same width Selkirk would carry
// a third of the ink. So Selkirk runs wider and Adapt To Life stands taller,
// and the two weigh about the same. Neither is stretched or rearranged.
const MID = (CL / 2 + KITCHEN) / 2; // the middle of each service half
const HALF = CL / 2 - KITCHEN; // a service half, kitchen line to baseline
const CLEAR = 0.24; // the gap between a name and the end of the centre line
const MIN_STUB = 0.25; // a shorter piece of centre line reads as a speck, so it goes
function nameLayout(atl, sel, portrait) {
  const place = (logo, w, cz) => {
    const h = w / logo.aspect;
    // How far the name runs along the centre line (world z): a turned name runs along it.
    return { img: logo.img, w, h, cz, turn: !portrait, reach: (portrait ? h : w) / 2 };
  };
  return portrait
    ? [place(atl, CW * 0.54, -MID), place(sel, CW * 0.84, MID)]
    : [place(atl, HALF * 0.51, MID), place(sel, HALF * 0.77, -MID)];
}

// The court's lines as rectangles (x0, z0, x1, z1) in metres. The centre lines
// run kitchen line to baseline, and each stops short of the name in its half,
// the way a court painter masks round a logo. The gap is the same in both
// halves, sized to the bigger name, so the court stays symmetrical; if the
// line left would only be a speck, it goes entirely.
const LINE_SLOTS = 10;
function courtLines(names) {
  const L = LINE / 2, out = [];
  for (const s of [-1, 1]) {
    out.push([-CW / 2 - L, s * CL / 2 - L, CW / 2 + L, s * CL / 2 + L]); // baseline
    out.push([s * CW / 2 - L, -CL / 2 - L, s * CW / 2 + L, CL / 2 + L]); // sideline
    out.push([-CW / 2, s * KITCHEN - L, CW / 2, s * KITCHEN + L]); // kitchen line
  }
  const reach = Math.max(...names.map((n) => n.reach)) + CLEAR;
  const stub = HALF / 2 - reach;
  if (stub >= MIN_STUB) {
    for (const s of [-1, 1]) {
      out.push([-L, s * MID - reach - stub, L, s * MID - reach]);
      out.push([-L, s * MID + reach, L, s * MID + reach + stub]);
    }
  }
  return out;
}

// A name, painted on a patch of court colour from its SVG at the size it
// lands, with a few pixels of court colour round it so it meets the court
// without a seam. Returns the texture and the map from the court (x, z) to it.
const COURT = "#1b2f47";
function nameTexture(n, anisotropy) {
  const PAD = 8, MAX = 4096;
  const k = Math.min(MOBILE ? 400 : 780, (MAX - 2 * PAD) / n.w); // pixels per metre
  const c = document.createElement("canvas");
  c.width = Math.round(n.w * k) + 2 * PAD;
  c.height = Math.round(n.h * k) + 2 * PAD;
  const g = c.getContext("2d");
  g.fillStyle = COURT;
  g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = 0.94;
  g.drawImage(n.img, PAD, PAD, c.width - 2 * PAD, c.height - 2 * PAD);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  // u runs along the image, v up it (three turns canvas images over).
  const ew = c.width / k, eh = c.height / k; // the patch in metres
  const map = n.turn
    ? [new THREE.Vector3(0, -1 / ew, 0.5 + n.cz / ew), new THREE.Vector3(-1 / eh, 0, 0.5)] // image right = -z, down = +x
    : [new THREE.Vector3(1 / ew, 0, 0.5), new THREE.Vector3(0, -1 / eh, 0.5 + n.cz / eh)]; // image right = +x, down = +z
  return { tex, map };
}

// The floor and the court, one plane, coloured per pixel. Each line's colour is
// how much of the pixel it covers, so the edges are clean up close and the
// lines fade evenly far away instead of breaking up.
function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.0, envMapIntensity: 0, dithering: true });
  const u = {
    uFloor: { value: new THREE.Vector3(14 / 255, 18 / 255, 22 / 255) }, // #0e1216, sRGB: the sheen mixes there
    uSheenR: { value: 0.6 * FL },
    uCourt: { value: new THREE.Color(COURT) },
    uKitchen: { value: new THREE.Color("#213a57") },
    uInk: { value: new THREE.Color("#f2efe8") },
    uCourtRect: { value: new THREE.Vector4(-CW / 2, -CL / 2, CW / 2, CL / 2) },
    uKitchenRect: { value: new THREE.Vector4(-CW / 2, -KITCHEN, CW / 2, KITCHEN) },
    uLines: { value: Array.from({ length: LINE_SLOTS }, () => new THREE.Vector4()) },
    uNameA: { value: null }, uMapA: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uNameB: { value: null }, uMapB: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = vec2(position.x, -position.y);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", /* glsl */ `#include <common>
        varying vec2 vGround;
        uniform vec3 uFloor, uCourt, uKitchen, uInk;
        uniform float uSheenR;
        uniform vec4 uCourtRect, uKitchenRect, uLines[${LINE_SLOTS}];
        uniform sampler2D uNameA, uNameB;
        uniform vec3 uMapA[2], uMapB[2];
        // How much of the pixel (centre p, half size hw) the rectangle r covers.
        float cover(vec2 p, vec2 hw, vec4 r) {
          vec2 lo = max(r.xy, p - hw), hi = min(r.zw, p + hw);
          vec2 c = clamp((hi - lo) / (2.0 * hw), 0.0, 1.0);
          return c.x * c.y;
        }
        vec3 paintName(vec3 col, sampler2D tex, vec3 m0, vec3 m1, vec2 p) {
          vec2 uv = vec2(dot(m0, vec3(p, 1.0)), dot(m1, vec3(p, 1.0)));
          vec3 s = texture2D(tex, uv).rgb;
          return mix(col, s, cover(uv, max(fwidth(uv) * 0.5, vec2(1e-6)), vec4(0.0, 0.0, 1.0, 1.0)));
        }
        vec3 groundColor(vec2 p) {
          vec2 hw = max(fwidth(p) * 0.5, vec2(1e-6));
          // The floor, with a soft sheen where the lights pool.
          vec3 col = sRGBTransferEOTF(vec4(mix(uFloor, vec3(1.0), 0.05 * max(0.0, 1.0 - length(p) / uSheenR)), 1.0)).rgb;
          col = mix(col, uCourt, cover(p, hw, uCourtRect));
          col = mix(col, uKitchen, cover(p, hw, uKitchenRect));
          col = paintName(col, uNameA, uMapA[0], uMapA[1], p);
          col = paintName(col, uNameB, uMapB[0], uMapB[1], p);
          for (int i = 0; i < ${LINE_SLOTS}; i++) col = mix(col, uInk, cover(p, hw, uLines[i]));
          return col;
        }`)
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = groundColor(vGround);");
  };
  mat.userData.u = u;
  return mat;
}

// The ball ---------------------------------------------------------------------
// A real outdoor pickleball: 74 mm across, 40 round holes about 7 mm wide,
// neon yellow. The holes go right through the shell, so you see its dark
// inside and, where two line up, out the other side.
const BALL_R = 0.037;
const HOLE_R = Math.asin(0.00355 / BALL_R); // a 7.1 mm hole, as an angle from the centre
// Rings of 5, 5 and 10 on each half, the halves mirrored and turned: spaced
// evenly and clear of the seam where the two moulded halves meet.
function holeDirections() {
  const rings = [[5, 27.06, 0], [5, 50.69, 105.39], [10, 77.29, 51.2]], twist = 18.08;
  const out = [], rad = THREE.MathUtils.degToRad;
  for (const half of [1, -1]) {
    for (const [n, lat, phase] of rings) {
      for (let i = 0; i < n; i++) {
        const th = rad(lat), ph = rad(phase + (360 * i) / n + (half < 0 ? twist : 0));
        out.push(new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th) * half, Math.sin(th) * Math.sin(ph)));
      }
    }
  }
  return out;
}
function ballMaterial() {
  // The plastic is thin enough to glow a little under floodlights: a touch of
  // its own colour, raised with the lights.
  const mat = new THREE.MeshStandardMaterial({ color: 0xe2f53e, emissive: 0xe2f53e, emissiveIntensity: 0, roughness: 0.4, metalness: 0.0, envMapIntensity: 0, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: true });
  const u = { uHoles: { value: holeDirections() }, uHoleR: { value: HOLE_R } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBall;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBall = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBall;\nuniform vec3 uHoles[40];\nuniform float uHoleR;")
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
        {
          vec3 n = normalize(vBall);
          float near = -1.0;
          for (int i = 0; i < 40; i++) near = max(near, dot(n, uHoles[i]));
          float d = acos(clamp(near, -1.0, 1.0)); // the angle to the nearest hole's centre
          // Opaque outside a hole, open inside; the GPU's antialiasing smooths the rim.
          diffuseColor.a = 0.5 + (d - uHoleR) / max(fwidth(d), 1e-4);
          if (gl_FrontFacing) {
            diffuseColor.rgb *= mix(0.8, 1.0, smoothstep(uHoleR, uHoleR * 1.4, d)); // the drilled lip
            float seam = smoothstep(0.004, 0.004 + max(fwidth(n.y), 1e-4) * 1.5, abs(n.y));
            diffuseColor.rgb *= mix(0.84, 1.0, seam); // where the two halves were joined
          } else {
            diffuseColor.rgb *= 0.24; // the inside of the shell, in its own shadow
          }
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nif (!gl_FrontFacing) roughnessFactor = 1.0;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nif (!gl_FrontFacing) totalEmissiveRadiance *= 0.5;");
  };
  return mat;
}

// The serve, in ball time (seconds), for a server at the +z end. The server,
// off camera, drops the ball behind the baseline on their right; it bounces as
// the first floodlight snaps on, rises into the light and is hit as the third
// one does, deep into the diagonal box, then bounces away into the dark.
const G = 9.81;
const DROP = { x: 1.45, y: 1.15, z: 7.25 };
const LAND = { x: -1.35, z: -5.15 };
const T_BOUNCE = 1.0, T_HIT = 1.9; // screen time
const FLIGHT = 0.95; // paddle to the far bounce: about 30 mph
function servePath() {
  const tb = ballClock(T_BOUNCE), th = ballClock(T_HIT);
  const fall = Math.sqrt((2 * (DROP.y - BALL_R)) / G);
  const up = 0.66 * G * fall; // it keeps about two thirds of its speed off the court
  const rise = th - tb;
  const hitY = BALL_R + up * rise - 0.5 * G * rise * rise;
  const flights = [
    { t: tb - fall, end: tb, p: [DROP.x, DROP.y, DROP.z], v: [0, 0, 0] },
    { t: tb, end: th, p: [DROP.x, BALL_R, DROP.z], v: [0, up, 0] },
  ];
  let f = {
    t: th, end: th + FLIGHT, p: [DROP.x, hitY, DROP.z],
    v: [(LAND.x - DROP.x) / FLIGHT, (BALL_R - hitY + 0.5 * G * FLIGHT * FLIGHT) / FLIGHT, (LAND.z - DROP.z) / FLIGHT],
  };
  flights.push(f);
  for (let i = 0; i < 3; i++) {
    const d = f.end - f.t;
    const v = [f.v[0] * 0.8, -(f.v[1] - G * d) * 0.6, f.v[2] * 0.8];
    f = { t: f.end, end: f.end + (2 * v[1]) / G, p: [f.p[0] + f.v[0] * d, BALL_R, f.p[2] + f.v[2] * d], v };
    flights.push(f);
  }
  return { flights, start: flights[0].t, hit: th, land: th + FLIGHT };
}

const settle = () => root.classList.add("is-settled");
const fail = (err) => {
  root.classList.add("is-fallback");
  if (err) console.warn("selkirk stage:", err);
};
const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), ms));

async function main() {
  // The page shows the still lockup if this never started in time.
  if (!root || root.classList.contains("is-fallback")) return;
  root.dataset.started = "1";

  const stage = createStage({ fov: 38, exposure: 1.1 });
  const { scene, camera, renderer } = stage;
  scene.fog = new THREE.Fog(0x040404, 18, 46);
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());

  const [atl, sel] = await Promise.race([
    Promise.all([
      loadLogo("/images/selkirk/stage/atl-primary-light.svg", 638.64 / 216),
      loadLogo("/images/selkirk/stage/selkirk-lockup.svg", 9464 / 1248),
    ]),
    timeout(12000),
  ]);

  // The floor and the court, with the names.
  const groundMat = groundMaterial();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FW, FL), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // The end the serve comes from: Selkirk's half, so its name is the first thing the light finds.
  let S = 1, layoutPortrait = null;
  const relayout = () => {
    if (layoutPortrait === stage.portrait) return;
    layoutPortrait = stage.portrait;
    const names = nameLayout(atl, sel, stage.portrait);
    const u = groundMat.userData.u, lines = courtLines(names);
    u.uLines.value.forEach((v, i) => (lines[i] ? v.set(...lines[i]) : v.set(0, 0, 0, 0)));
    for (const [n, key] of [[names[0], "A"], [names[1], "B"]]) {
      const { tex, map } = nameTexture(n, anisotropy);
      const old = u["uName" + key].value;
      u["uName" + key].value = tex;
      u["uMap" + key].value[0].copy(map[0]);
      u["uMap" + key].value[1].copy(map[1]);
      old && old.dispose();
    }
    S = Math.sign(names[1].cz);
  };
  relayout();
  stage.onResize = relayout;

  // The net: posts, a dark mesh, the white tape.
  const net = new THREE.Group();
  const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.3, 0.8), new THREE.MeshStandardMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.72, roughness: 1, side: THREE.DoubleSide }));
  netMesh.position.y = 0.46;
  const tape = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.3, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 }));
  tape.position.y = 0.88;
  net.add(netMesh, tape);
  for (const x of [-(CW / 2 + 0.2), CW / 2 + 0.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.92, 16), new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.4 }));
    post.position.set(x, 0.46, 0);
    net.add(post);
  }
  scene.add(net);
  // The net's soft shadow on the court, so it still reads as a net from straight above.
  const shadowTex = (() => {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 64;
    const g = c.getContext("2d");
    const img = g.createImageData(128, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const v = Math.abs(y / 63 - 0.5) * 2, u = Math.abs(x / 127 - 0.5) * 2;
      const a = Math.exp(-v * v * 5) * (1 - Math.max(0, (u - 0.9) / 0.1));
      img.data.set([0, 0, 0, Math.round(a * 255)], (y * 128 + x) * 4);
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const netShadow = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.5, 0.9), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false }));
  netShadow.rotation.x = -Math.PI / 2;
  netShadow.position.y = 0.004;
  scene.add(netShadow);

  scene.add(new THREE.AmbientLight(0xffffff, 0.015));
  // Light bounced off the court: a little navy on the underside of the ball.
  const bounce = new THREE.HemisphereLight(0x000000, 0x24405e, 0);
  scene.add(bounce);
  // Four floodlight towers, one at each corner.
  const dot = softDot();
  const towers = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
    const pos = new THREE.Vector3(sx * (CW / 2 + 3.2), 8.5, sz * (CL / 2 + 2.2));
    const target = new THREE.Vector3(sx * 0.6, 0, sz * 2.4);
    const spot = new THREE.SpotLight(0xfff1e0, 0, 40, 0.62, 0.55, 1.4);
    spot.position.copy(pos); spot.target.position.copy(target);
    scene.add(spot, spot.target);
    // The lamp head: a bright panel with a soft glow round it.
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    lamp.position.copy(pos);
    lamp.lookAt(target);
    scene.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xfff1e0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.position.copy(pos);
    glow.scale.setScalar(3.4);
    scene.add(glow);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 8.5, 12), new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.8 }));
    pole.position.set(pos.x, 4.25, pos.z);
    scene.add(pole);
    // The beam: an additive cone, brightest at the lamp.
    const dir = new THREE.Vector3().subVectors(pos, target);
    const len = dir.length();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(len * Math.tan(0.5), len, 64, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, dithering: true,
        uniforms: { uOn: { value: 0 }, uLen: { value: len } },
        vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `#include <common>
          #include <dithering_pars_fragment>
          uniform float uOn, uLen; varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ float along = clamp(vY / uLen + 0.5, 0.0, 1.0); float face = pow(abs(dot(vN, vV)), 1.6);
            float a = pow(along, 2.6) * face * 0.08 * uOn;
            gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * a * a, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            #include <dithering_fragment>
          }`,
      }),
    );
    cone.position.copy(pos).add(target).multiplyScalar(0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    scene.add(cone);
    return { sx, sz, spot, lamp, glow, cone };
  });

  // The ball and its soft shadow.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 64, 48), ballMaterial());
  scene.add(ball);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dot, color: 0x000000, transparent: true, opacity: 0, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  const serve = servePath();
  const ballPos = new THREE.Vector3();
  // Where the ball is at ball time b (+z server); false once it has bounced away.
  const ballAt = (b) => {
    const fl = serve.flights;
    let f = fl[0];
    if (b < f.t) { ballPos.set(...f.p); return true; }
    for (const g of fl) if (b >= g.t) f = g;
    if (b >= fl[fl.length - 1].end) return false;
    const d = b - f.t;
    ballPos.set(f.p[0] + f.v[0] * d, f.p[1] + f.v[1] * d - 0.5 * G * d * d, f.p[2] + f.v[2] * d);
    return Math.abs(ballPos.z) < FL / 2 && Math.abs(ballPos.x) < FW / 2;
  };
  // A slow tumble as it drops, then topspin off the paddle: about the axis
  // up x velocity, so the top of the ball rolls forward.
  const TUMBLE = new THREE.Vector3(0.35, 0.25, 1).normalize();
  const hitV = serve.flights[2].v;
  const qb = new THREE.Quaternion(), axis = new THREE.Vector3();
  const spinAt = (b, q) => {
    q.setFromAxisAngle(TUMBLE, 1.2 * (Math.min(b, serve.hit) - serve.start));
    if (b > serve.hit) {
      axis.set(hitV[2] * S, 0, -hitV[0]).normalize();
      q.premultiply(qb.setFromAxisAngle(axis, 2 * Math.PI * 6 * (b - serve.hit)));
    }
    return q;
  };
  // The serve is worked out from the +z end. From the -z end it is mirrored end
  // to end, so the camera stays on the +x side of the court, where a name
  // turned for landscape reads the right way up (the server then serves from
  // their left-hand box, which they do on an odd score).
  const toStage = (v) => v.set(v.x, v.y, v.z * S);

  // Camera: low behind the server's baseline, a metre from the drop, watching
  // the ball. Then a crane up and over that lands straight above the court,
  // looking straight down, so every line sits square to the screen. It never
  // follows a touch or the phone's tilt, so it stays square. Portrait: the far
  // baseline is up. Landscape: the court lies across the screen with its left
  // sideline (world -x) up.
  const copyEl = root.querySelector(".sk-stage-copy");
  const serveDir = new THREE.Vector3(LAND.x - DROP.x, 0, LAND.z - DROP.z).normalize();
  const serveRight = new THREE.Vector3(-serveDir.z, 0, serveDir.x);
  const camStart = new THREE.Vector3(DROP.x, 0.3, DROP.z).addScaledVector(serveDir, -1.0).addScaledVector(serveRight, 0.2);
  const UP_PORTRAIT = new THREE.Vector3(0, 0, -1), UP_LANDSCAPE = new THREE.Vector3(-1, 0, 0);
  const MID_PORTRAIT = new THREE.Vector3(6.5, 4.5, 9.5), MID_LANDSCAPE = new THREE.Vector3(8.5, 4.8, -6.5);
  const SKY = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  const endFor = () => {
    const H = stage.height, tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // The band the court fits in: clear of the top edge and above the copy.
    const top = H * 0.08;
    const copyTop = copyEl && copyEl.offsetTop > 0 ? copyEl.offsetTop : H;
    const bottom = Math.min(H * 0.94, copyTop - H * 0.035);
    const bh = Math.max(H * 0.5, bottom - top), bc = (top + bottom) / 2;
    const long = CL + 0.6, short = CW + 1.0; // the lines, the net posts, a margin
    const vh = stage.portrait
      ? Math.max((long * H) / bh, short / (0.8 * camera.aspect))
      : Math.max((short * H) / bh, long / (0.72 * camera.aspect));
    // Slide the camera toward screen down (never tilt it) so the court rides up into the band.
    const shift = ((H / 2 - bc) / H) * vh;
    const pos = stage.portrait ? new THREE.Vector3(0, vh / (2 * tan), shift) : new THREE.Vector3(shift, vh / (2 * tan), 0);
    return { pos, look: new THREE.Vector3(pos.x, 0, pos.z), up: stage.portrait ? UP_PORTRAIT : UP_LANDSCAPE };
  };
  const hang = new THREE.Vector3(), chase = new THREE.Vector3(), start = new THREE.Vector3();

  const update = (t) => {
    // Lights snap on one by one, nearest the camera first: a clean strike, no flicker.
    let lit = 0;
    for (const L of towers) {
      const order = (L.sz === S ? 0 : 2) + (L.sx === 1 ? 0 : 1);
      const on = smooth01((t - LIGHT_ON[order]) / 0.08);
      lit += on;
      L.spot.intensity = on * 55;
      L.lamp.material.color.setScalar(on * 3);
      L.glow.material.opacity = on * 0.5;
      L.cone.material.uniforms.uOn.value = on;
    }
    bounce.intensity = 0.9 * (lit / 4);
    ball.material.emissiveIntensity = 0.2 * (lit / 4);

    // The ball.
    const b = ballClock(t);
    const shown = b >= serve.start && ballAt(b);
    ball.visible = shadow.visible = shown;
    if (shown) {
      ball.position.copy(toStage(ballPos));
      spinAt(b, ball.quaternion);
      const y = ballPos.y - BALL_R;
      shadow.position.set(ballPos.x, 0.006, ballPos.z);
      shadow.scale.setScalar(BALL_R * 3.2 * (1 + y * 0.9));
      shadow.material.opacity = 0.62 * Math.max(0, 1 - y / 2.2);
    }

    // The crane: from beside the drop, out and up, then over the court.
    const end = endFor();
    const midPos = (stage.portrait ? MID_PORTRAIT : MID_LANDSCAPE).clone();
    start.copy(camStart);
    toStage(start);
    const c = ease.inOutCubic(seg(t, 1.7, 5.5));
    // A quadratic curve through a point out to the side, so it sweeps rather than slides.
    const pos = start.clone().multiplyScalar((1 - c) * (1 - c)).addScaledVector(midPos, 2 * (1 - c) * c).addScaledVector(end.pos, c * c);
    // The aim: on the ball as it drops and hangs (riding a little with it), then
    // after it as it is served, until it lands; then over to the court.
    const by = b >= serve.start && b < serve.hit ? (ballAt(b), ballPos.y) : 0.3;
    hang.set(DROP.x, 0.3 + 0.3 * Math.min(0.25, Math.max(-0.2, by - 0.3)), DROP.z);
    toStage(hang);
    // Chase the ball low, so the court it is flying over fills the frame.
    ballAt(Math.min(Math.max(b, serve.hit), serve.land));
    chase.copy(toStage(ballPos));
    chase.y = 0.3 + 0.3 * (chase.y - 0.3);
    const look = hang.clone().lerp(chase, smooth01((t - T_HIT) / 0.6));
    look.lerp(end.look, ease.inOutSine(seg(t, 2.6, 5.4)));
    // A slight drift before the lights, as if handheld.
    pos.y += Math.sin(t * 1.3) * 0.012 * (1 - c);
    // Once it lands, a slow push straight down: the court grows a touch and stays square.
    pos.y *= 1 - 0.035 * ease.inOutSine(seg(t, 5.5, STILL));
    // Hand the camera's up from the sky to the court as it tips to look straight
    // down, so it never rolls over and lands with the lines true.
    dir.subVectors(look, pos).normalize();
    const w = ease.inOutSine(clamp01((-dir.y - 0.45) / 0.5));
    camera.up.copy(SKY).multiplyScalar(1 - w).addScaledVector(end.up, w).normalize();
    camera.position.copy(pos);
    camera.lookAt(look);
    // The haze keeps the arena dark down low and thins as the camera rises, so
    // the court stays clear from overhead.
    scene.fog.near = Math.max(18, pos.y * 0.75);
    scene.fog.far = Math.max(46, pos.y * 2.0);

    stage.film.uBars.value = 1 - ease.inOutCubic(seg(t, 4.9, 6.2));
    stage.film.uFade.value = ease.outCubic(seg(t, 0, 0.5));
  };

  const stop = run(stage, update, settle);
  // A phone can drop the 3D context (low memory, long in the background): show the still.
  stage.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); fail(); });
  setTimeout(() => root.classList.add("is-live"), 50);
}

main().catch(fail);
