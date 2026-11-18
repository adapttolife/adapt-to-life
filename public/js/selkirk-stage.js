// The /selkirk title sequence, "Center Court". A dark arena and a pickleball:
// it drops beside the lens and bounces as the first floodlight snaps on, then
// hangs in slow motion while the floodlight straight ahead comes on, soft,
// behind it. It is served across the net, the focus follows it, and the camera
// cranes up and over to land straight above the court, both names painted on
// it, one on each side of the net.
//
// update(t) draws the frame at time t (seconds), so the same code runs live,
// as one still frame for reduced motion, and frame by frame for recordings
// (?capture: window.__stage.seek(t) draws one exact frame).
//
// Built like a film camera under real light, for clarity and a light load.
// Everything is drawn in one pass straight to the screen with the GPU's own
// antialiasing: no grain, no glow passes. The lens is worked out per surface
// rather than blurred afterwards: the court, the net and the lamps each soften
// by as much as a real lens would at their distance, so the ball stays razor
// sharp while the focus follows it. The court lines are worked out per pixel,
// so they stay sharp up close and never shimmer far away; the names are drawn
// from their SVGs at the size they land; and each lamp lays its own soft
// shadows of the ball, the net and the posts on the court. Once the sequence
// has settled, drawing stops.
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
const LIGHT_ON = [1.0, 1.45, 1.9, 2.3]; // in the order the lamps strike (see strikeOrder)
// The net in metres: the mesh, the tape along its top, and the posts just outside the sidelines.
const NET = { half: CW / 2 + 0.15, meshLo: 0.06, tapeLo: 0.85, tapeHi: 0.91, postX: CW / 2 + 0.2, postR: 0.035, postH: 0.92 };
// A floodlight's face in metres, and how wide it is as a light (that sets how soft its shadows are).
const LAMP = { w: 1.1, h: 0.5, size: 0.8 };
// The lens wide open for the close up: the width of its opening in metres, about f/1.5.
const APERTURE = 0.03;

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

// The lens, shared by every surface that softens with it. blurPx is a thin
// lens: nothing in the plane of focus, more in front of it and behind it, and
// nothing at all once the aperture shuts.
const LENS_GLSL = /* glsl */ `
  uniform float uFocus, uAperture, uPxPerRad;
  float blurPx(float d) { return 0.5 * uAperture * abs(1.0 / uFocus - 1.0 / max(d, 0.05)) * uPxPerRad; }
  // How much of the window [x - hw, x + hw] lies inside [a, b].
  float span(float x, float a, float b, float hw) { return clamp((min(b, x + hw) - max(a, x - hw)) / (2.0 * hw), 0.0, 1.0); }`;
const f = (x) => x.toFixed(4); // a number written into a shader

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
  // Focus distance and aperture in metres; pixels per radian across the frame.
  const lens = { uFocus: { value: 1 }, uAperture: { value: 0 }, uPxPerRad: { value: 1000 } };

  const stage = {
    canvas, renderer, scene, camera, lens, film: film.material.uniforms, width: 1, height: 1, portrait: false, onResize: null,
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
    lens.uPxPerRad.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    stage.onResize && stage.onResize();
    stage.afterResize && stage.afterResize(); // resizing clears the canvas
  };
  new ResizeObserver(resize).observe(root);
  resize();
  return stage;
}

// Running: live, one still, or seekable for recordings. Returns stop(), and
// replay(clock) when it runs live: from the top again, on the soundtrack's
// clock when one is given, so picture and sound stay locked.
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
    return { stop() {} };
  }
  if (REDUCED) {
    // One still of the final frame, drawn again whenever the stage resizes.
    stage.afterResize = () => render(DURATION + 2);
    stage.afterResize();
    onSettled();
    return { stop() {} };
  }
  let t = 0, prev = performance.now(), settled = false, visible = true, raf = 0, stopped = false, clock = null;
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    t = Math.min(STILL, clock ? clock() : t + dt);
    render(t);
    if (!settled && t >= DURATION) { settled = true; onSettled(); }
    if (t >= STILL) {
      // The last frame is up and nothing moves now: stop drawing. A resize redraws it.
      stopped = true;
      clock = null;
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
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); raf = 0; },
    replay(soundClock) {
      t = 0; clock = soundClock || null; settled = false; stopped = false;
      root.classList.remove("is-settled");
      prev = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    },
  };
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

// A soft round sprite: the glow round a lamp.
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
// lines fade evenly far away instead of breaking up. The lens widens that same
// window, so a line out of focus softens exactly as much as the lens says.
//
// Each lamp's light is cut by what stands between it and the floor: the net's
// tape, mesh and posts, and the ball, all worked out exactly, with edges as
// soft as a lamp that size makes them. The court has a satin finish and the
// paint a little more, so the lamps glance off them as the camera moves.
const SPOT_INFO = "getSpotLightInfo( spotLight, geometryPosition, directLight );";
function groundMaterial(lens) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.0, envMapIntensity: 0, dithering: true });
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
    uBall: { value: new THREE.Vector4(0, -10, 0, 0) }, // centre, and 1 while it is in play
    uCamWorld: { value: new THREE.Matrix4() }, // set to the camera's own matrix in main
  };
  if (!THREE.ShaderChunk.lights_fragment_begin.includes(SPOT_INFO)) console.warn("selkirk stage: the court will draw without shadows");
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, lens);
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
        uniform vec4 uBall;
        uniform mat4 uCamWorld;
        ${LENS_GLSL}
        float gCourt, gLine; // how much of this pixel is court, and line paint
        // How much of the pixel (centre p, half size hw) the rectangle r covers.
        float cover(vec2 p, vec2 hw, vec4 r) {
          vec2 lo = max(r.xy, p - hw), hi = min(r.zw, p + hw);
          vec2 c = clamp((hi - lo) / (2.0 * hw), 0.0, 1.0);
          return c.x * c.y;
        }
        vec3 paintName(vec3 col, sampler2D tex, vec3 m0, vec3 m1, vec2 p, float k) {
          vec2 uv = vec2(dot(m0, vec3(p, 1.0)), dot(m1, vec3(p, 1.0)));
          vec2 gx = dFdx(uv) * k, gy = dFdy(uv) * k;
          vec3 s = textureGrad(tex, uv, gx, gy).rgb;
          return mix(col, s, cover(uv, max((abs(gx) + abs(gy)) * 0.5, vec2(1e-6)), vec4(0.0, 0.0, 1.0, 1.0)));
        }
        vec3 groundColor(vec2 p) {
          // The pixel's footprint on the floor, widened by however far the lens blurs here.
          float k = 1.0 + blurPx(distance(cameraPosition, vec3(p.x, 0.0, p.y)));
          vec2 hw = max(fwidth(p) * 0.5 * k, vec2(1e-6));
          // The floor, with a soft sheen where the lights pool.
          vec3 col = sRGBTransferEOTF(vec4(mix(uFloor, vec3(1.0), 0.05 * max(0.0, 1.0 - length(p) / uSheenR)), 1.0)).rgb;
          gCourt = cover(p, hw, uCourtRect);
          col = mix(col, uCourt, gCourt);
          col = mix(col, uKitchen, cover(p, hw, uKitchenRect));
          col = paintName(col, uNameA, uMapA[0], uMapA[1], p, k);
          col = paintName(col, uNameB, uMapB[0], uMapB[1], p, k);
          gLine = 0.0;
          for (int i = 0; i < ${LINE_SLOTS}; i++) {
            float c = cover(p, hw, uLines[i]);
            col = mix(col, uInk, c);
            gLine = max(gLine, c);
          }
          return col;
        }
        // How much of the lamp at L reaches this point of the floor, 0 to 1.
        float lampReach(vec3 L) {
          vec3 p = vec3(vGround.x, 0.0, vGround.y);
          // The net: where the line from here to the lamp crosses the net's plane
          // (z = 0), and whether the tape, the mesh or a post is there. The
          // shadow's edge softens with distance from the net, as a wide lamp's does.
          float across = step(p.z * L.z, 0.0);
          float den = p.z - L.z;
          float s = clamp(p.z / (abs(den) < 1e-3 ? 1e-3 : den), 0.0, 1.0) * across;
          float h = s * L.y, x = mix(p.x, L.x, s);
          float pen = ${f(LAMP.size)} * s;
          float wh = 0.5 * (pen + fwidth(h)) + 1e-4, wx = 0.5 * (pen + fwidth(x)) + 1e-4;
          float wide = span(x, -${f(NET.half)}, ${f(NET.half)}, wx);
          float keep = 1.0 - span(h, ${f(NET.tapeLo)}, ${f(NET.tapeHi)}, wh) * wide;
          keep *= 1.0 - 0.32 * span(h, 0.0, ${f(NET.tapeLo)}, wh) * wide;
          float posts = span(x, ${f(NET.postX - NET.postR)}, ${f(NET.postX + NET.postR)}, wx) + span(x, -${f(NET.postX + NET.postR)}, -${f(NET.postX - NET.postR)}, wx);
          keep *= 1.0 - posts * span(h, 0.0, ${f(NET.postH)}, wh);
          keep = mix(1.0, keep, across);
          // The ball: how much of the lamp's disc it hides, seen from here.
          vec3 toL = L - p;
          float dl = length(toL);
          vec3 dir = toL / dl, vb = uBall.xyz - p;
          float tb = dot(vb, dir);
          float tc = max(tb, 1e-3);
          float th = length(vb - tb * dir) / tc; // the angle between the ball and the lamp
          float rb = ${f(BALL_R)} / tc, rl = ${f(LAMP.size * 0.5)} / dl;
          float hide = min(1.0, (rb * rb) / (rl * rl)) * (1.0 - smoothstep(abs(rl - rb), rl + rb, th));
          return keep * (1.0 - hide * uBall.w * step(0.0, tb));
        }`)
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = groundColor(vGround);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(0.92, 0.78, gCourt), 0.62, gLine);")
      .replace("#include <lights_fragment_begin>", THREE.ShaderChunk.lights_fragment_begin.replace(
        SPOT_INFO, SPOT_INFO + "\n\t\tdirectLight.color *= lampReach( ( uCamWorld * vec4( spotLight.position, 1.0 ) ).xyz );"));
  };
  mat.userData.u = u;
  return mat;
}

// The net, as a card standing on the centre line: the mesh in a 4 cm grid
// worked out per pixel (so it never shimmers), and, while the lens is open,
// the tape and the posts too, softened by the lens. Once it shuts the solid
// tape and posts take over; at that point the two look the same.
function netMaterial(lens) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const u = {
    uLens: { value: 1 }, // 1: the card draws the tape and posts as well
    uCord: { value: new THREE.Color(0x0b0d10) },
    uTape: { value: new THREE.Color(0xf2efe8) },
    uPost: { value: new THREE.Color(0x2a2e33) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, lens);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCard;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCard = position.xy;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", /* glsl */ `#include <common>
        varying vec2 vCard;
        uniform float uLens;
        uniform vec3 uCord, uTape, uPost;
        ${LENS_GLSL}
        float netRough;
        // The share of [x - hw, x + hw] covered by cords c wide every P.
        float cords(float x, float hw, float c, float P) {
          float lo = x - hw, hi = x + hw;
          float a = floor(lo / P) * c + min(fract(lo / P) * P, c);
          float b = floor(hi / P) * c + min(fract(hi / P) * P, c);
          return (b - a) / (2.0 * hw);
        }`)
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
        {
          vec2 q = vCard;
          vec2 hw = max(fwidth(q) * 0.5 * (1.0 + blurPx(length(vViewPosition))), vec2(1e-6));
          float wide = span(q.x, -${f(NET.half)}, ${f(NET.half)}, hw.x);
          float cx = cords(q.x, hw.x, 0.004, 0.04), cy = cords(q.y, hw.y, 0.004, 0.04);
          float a = wide * span(q.y, ${f(NET.meshLo)}, ${f(NET.tapeLo)}, hw.y) * (0.16 + 0.84 * (1.0 - (1.0 - cx) * (1.0 - cy)));
          vec3 col = uCord;
          float tape = uLens * wide * span(q.y, ${f(NET.tapeLo)}, ${f(NET.tapeHi)}, hw.y);
          float posts = uLens * span(q.y, 0.0, ${f(NET.postH)}, hw.y) * (span(q.x, ${f(NET.postX - NET.postR)}, ${f(NET.postX + NET.postR)}, hw.x) + span(q.x, -${f(NET.postX + NET.postR)}, -${f(NET.postX - NET.postR)}, hw.x));
          col = mix(col, uPost, posts); a += posts * (1.0 - a);
          col = mix(col, uTape, tape); a += tape * (1.0 - a);
          diffuseColor = vec4(col, a);
          netRough = mix(1.0, 0.6, tape);
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = netRough;");
  };
  mat.userData.u = u;
  return mat;
}

// A floodlight's face: rows of LED panels in a frame. The lens softens it like
// everything else, so out of focus it becomes a soft, rounded block of light,
// as a real lamp does; the light it spreads is the same, so it dims as it grows.
function lampMaterial(lens) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { ...lens, uOn: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vQ; varying float vD;
      void main() { vQ = position.xy; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform float uOn;
      varying vec2 vQ; varying float vD;
      ${LENS_GLSL}
      float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      // The share of [x - hw, x + hw] lit by panels P wide with gaps g between.
      float panels(float x, float hw, float g, float P) {
        float lo = x - hw, hi = x + hw;
        float a = floor(lo / P) * (P - g) + max(fract(lo / P) * P - g, 0.0);
        float b = floor(hi / P) * (P - g) + max(fract(hi / P) * P - g, 0.0);
        return (b - a) / (2.0 * hw);
      }
      void main() {
        vec2 fw = fwidth(vQ);
        // The lens's blur here in metres, and a little more: a lamp this bright
        // flares past its own edge in the glass.
        float blur = 1.8 * blurPx(vD) * max(fw.x, fw.y);
        float w = 0.5 * max(fw.x, fw.y) + blur;
        vec2 hs = vec2(${f(LAMP.w / 2 - 0.1)}, ${f(LAMP.h / 2 - 0.07)}); // the lit face, inside its frame
        float face = 1.0 - smoothstep(-w, w, box(vQ, hs, 0.06));
        float leds = panels(vQ.x + hs.x, w, 0.02, ${f((LAMP.w - 0.2) / 6)}) * panels(vQ.y + hs.y, w, 0.02, ${f((LAMP.h - 0.14) / 2)});
        float spread = (hs.x * hs.y) / ((hs.x + blur) * (hs.y + blur));
        float I = uOn * face * mix(0.3, 1.0, leds) * spread * 7.0;
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * I, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// A tower's pole: a card that turns to face the camera, its edges softened by
// the lens like the net's, so it never cuts a hard line through a soft lamp.
function poleMaterial(lens) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x07080a, transparent: true, depthWrite: false });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, lens);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vQ;\nvarying float vD;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvQ = position.xy;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvD = -mvPosition.z;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vQ;\nvarying float vD;\n${LENS_GLSL}`)
      .replace("#include <color_fragment>", /* glsl */ `#include <color_fragment>
        float r = mix(0.08, 0.06, clamp(vQ.y / ${f(POLE_H)} + 0.5, 0.0, 1.0)); // it tapers as it rises
        diffuseColor.a *= span(vQ.x, -r, r, max(fwidth(vQ.x) * 0.5 * (1.0 + blurPx(vD)), 1e-5));`);
  };
  return mat;
}
const POLE_H = 8.15; // up to just under the lamp head

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
  const { scene, camera, renderer, lens } = stage;
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
  const groundMat = groundMaterial(lens);
  const gu = groundMat.userData.u;
  gu.uCamWorld.value = camera.matrixWorld;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FW, FL), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  // The end the serve comes from: Selkirk's half, so its name is the first thing the light finds.
  let S = 1, layoutPortrait = null;
  const relayout = () => {
    if (layoutPortrait === stage.portrait) return;
    layoutPortrait = stage.portrait;
    const names = nameLayout(atl, sel, stage.portrait);
    const lines = courtLines(names);
    gu.uLines.value.forEach((v, i) => (lines[i] ? v.set(...lines[i]) : v.set(0, 0, 0, 0)));
    for (const [n, key] of [[names[0], "A"], [names[1], "B"]]) {
      const { tex, map } = nameTexture(n, anisotropy);
      const old = gu["uName" + key].value;
      gu["uName" + key].value = tex;
      gu["uMap" + key].value[0].copy(map[0]);
      gu["uMap" + key].value[1].copy(map[1]);
      old && old.dispose();
    }
    S = Math.sign(names[1].cz);
  };
  relayout();
  stage.onResize = relayout;

  // The net: the card (mesh, and the soft tape and posts while the lens is
  // open), then the solid tape and posts for when it shuts.
  const netMat = netMaterial(lens);
  // The card's own coordinates are metres from the middle of the net at floor
  // level, with room round the net for the lens to spread it.
  const cardGeo = new THREE.PlaneGeometry(2 * NET.postX + 0.8, NET.postH + 0.8);
  cardGeo.translate(0, NET.postH / 2, 0);
  const card = new THREE.Mesh(cardGeo, netMat);
  scene.add(card);
  const solid = new THREE.Group();
  const tape = new THREE.Mesh(new THREE.BoxGeometry(2 * NET.half, NET.tapeHi - NET.tapeLo, 0.05), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 }));
  tape.position.y = (NET.tapeLo + NET.tapeHi) / 2;
  solid.add(tape);
  for (const x of [-NET.postX, NET.postX]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(NET.postR, NET.postR, NET.postH, 16), new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.4 }));
    post.position.set(x, NET.postH / 2, 0);
    solid.add(post);
  }
  scene.add(solid);

  scene.add(new THREE.AmbientLight(0xffffff, 0.015));
  // Light bounced off the court: a little navy on the underside of the ball.
  const bounce = new THREE.HemisphereLight(0x000000, 0x24405e, 0);
  scene.add(bounce);
  // Four floodlight towers, one at each corner.
  const dot = softDot();
  const poleGeo = new THREE.PlaneGeometry(1.6, POLE_H), poleMat = poleMaterial(lens);
  const towers = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => {
    const pos = new THREE.Vector3(sx * (CW / 2 + 3.2), 8.5, sz * (CL / 2 + 2.2));
    const target = new THREE.Vector3(sx * 0.6, 0, sz * 2.4);
    const spot = new THREE.SpotLight(0xfff1e0, 0, 40, 0.62, 0.55, 1.4);
    spot.position.copy(pos); spot.target.position.copy(target);
    scene.add(spot, spot.target);
    // The lamp head: its lit face, turned to the court. The housing behind it
    // is lost in the dark, so it isn't drawn.
    const face = new THREE.Mesh(new THREE.PlaneGeometry(LAMP.w + 1.4, LAMP.h + 1.4), lampMaterial(lens));
    face.position.copy(pos);
    face.lookAt(target);
    scene.add(face);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: 0xfff1e0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.position.copy(pos);
    glow.scale.setScalar(3.4);
    scene.add(glow);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(pos.x, POLE_H / 2, pos.z);
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
    return { sx, sz, spot, face, glow, cone, pole };
  });
  // The order the lamps strike: the one behind the camera first, as the ball
  // bounces; then the one straight ahead, so it comes on in frame, soft behind
  // the hanging ball; then the other two.
  const strikeOrder = (L) => (L.sz === S ? (L.sx === 1 ? 0 : 2) : (L.sx === 1 ? 3 : 1));

  // The ball. Its shadows are the court's work: each lamp throws its own.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 64, 48), ballMaterial());
  scene.add(ball);
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
    // Lights snap on one by one: a clean strike, no flicker.
    let lit = 0;
    for (const L of towers) {
      const on = smooth01((t - LIGHT_ON[strikeOrder(L)]) / 0.08);
      lit += on;
      L.spot.intensity = on * 55;
      L.face.material.uniforms.uOn.value = on;
      L.glow.material.opacity = on * 0.4;
      L.cone.material.uniforms.uOn.value = on;
    }
    bounce.intensity = 0.9 * (lit / 4);
    ball.material.emissiveIntensity = 0.2 * (lit / 4);

    // The ball.
    const b = ballClock(t);
    const shown = b >= serve.start && ballAt(b);
    ball.visible = shown;
    if (shown) {
      ball.position.copy(toStage(ballPos));
      spinAt(b, ball.quaternion);
    }
    gu.uBall.value.set(ball.position.x, ball.position.y, ball.position.z, shown ? 1 : 0);

    // The crane: from beside the drop, out and up, then over the court.
    const end = endFor();
    const midPos = (stage.portrait ? MID_PORTRAIT : MID_LANDSCAPE).clone();
    start.copy(camStart);
    toStage(start);
    const c = ease.inOutCubic(seg(t, 1.7, 5.5));
    // A quadratic curve through a point out to the side, so it sweeps rather than slides.
    const pos = start.clone().multiplyScalar((1 - c) * (1 - c)).addScaledVector(midPos, 2 * (1 - c) * c).addScaledVector(end.pos, c * c);
    // The aim: on the ball as it drops; then, as it rises into the light,
    // tilting up with it, so the lamp straight ahead comes into the top of the
    // frame; then after it as it is served, until it lands; then over to the court.
    const by = b >= serve.start && b < serve.hit ? (ballAt(b), ballPos.y) : 0.3;
    const low = 0.3 + 0.3 * Math.min(0.25, Math.max(-0.2, by - 0.3));
    hang.set(DROP.x, low + (0.52 - low) * ease.inOutSine(seg(t, T_BOUNCE + 0.1, T_BOUNCE + 0.75)), DROP.z);
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

    for (const L of towers) L.pole.rotation.y = Math.atan2(pos.x - L.pole.position.x, pos.z - L.pole.position.z);

    // The lens: wide open on the ball for the close up, its focus following
    // the ball once it is served, shutting down as the camera rises, so the
    // whole court comes up sharp.
    const A = APERTURE * (1 - smooth01(seg(t, T_HIT + 0.3, T_HIT + 1.4)));
    lens.uAperture.value = A;
    lens.uFocus.value = Math.max(0.3, pos.distanceTo(shown ? ball.position : hang));
    const sharp = A < 0.0012;
    netMat.userData.u.uLens.value = sharp ? 0 : 1;
    solid.visible = sharp;

    stage.film.uBars.value = 1 - ease.inOutCubic(seg(t, 4.9, 6.2));
    stage.film.uFade.value = ease.outCubic(seg(t, 0, 0.5));
  };

  const ctl = run(stage, update, settle);
  // A phone can drop the 3D context (low memory, long in the background): show the still.
  stage.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); ctl.stop(); fail(); });

  // Replay with sound. The soundtrack (13 s, about 160 KB) loads only when
  // asked for. It plays through a media element, so a phone on silent still
  // plays it, and the picture runs on its clock. If it can't start within a
  // few seconds, the sequence plays again without it.
  const replayBtn = root.querySelector(".sk-stage-replay");
  if (replayBtn && ctl.replay) {
    replayBtn.hidden = false;
    let audio = null;
    replayBtn.addEventListener("click", () => {
      if (replayBtn.getAttribute("aria-busy") === "true") return;
      replayBtn.setAttribute("aria-busy", "true");
      if (!audio) { audio = new Audio(replayBtn.dataset.sound); audio.preload = "auto"; }
      try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) { /* older browsers */ }
      let begun = false;
      const begin = (withSound) => {
        if (begun) return;
        begun = true;
        replayBtn.removeAttribute("aria-busy");
        ctl.replay(withSound ? () => audio.currentTime : null);
      };
      audio.currentTime = 0;
      audio.addEventListener("playing", () => begin(true), { once: true });
      audio.play().catch(() => begin(false));
      setTimeout(() => { if (!begun) { audio.pause(); begin(false); } }, 3000);
    });
  }
  setTimeout(() => root.classList.add("is-live"), 50);
}

main().catch(fail);
