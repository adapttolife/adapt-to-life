// The /selkirk title sequence, "Center Court". A dark arena: floodlights snap
// on one by one, a ball crosses the net, and the camera cranes up and over to
// land straight above one court with both names painted on it, one on each
// side of the net.
//
// update(t) draws the frame at time t (seconds), so the same code runs live,
// as one still frame for reduced motion, and frame by frame for recordings
// (?capture: window.__stage.seek(t) draws one exact frame).
//
// three.js is vendored in /js/vendor/three-0.170.0 (MIT, see its LICENSE) and
// reached through the import map in selkirk.html. The folder name carries the
// version, so a newer three.js goes in a new folder, never over this one.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const root = document.querySelector("[data-stage]");
const CAPTURE = new URLSearchParams(location.search).has("capture");
const REDUCED = !CAPTURE && matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOBILE = matchMedia("(max-width: 760px)").matches;
const DURATION = 6.4;

// A pickleball court in metres: 6.1 wide, 13.41 long, kitchen 2.13 from the net.
const CW = 6.1, CL = 13.41, KITCHEN = 2.13, LINE = 0.06;
const FW = 15, FL = 24; // the floor around it
const LIGHT_ON = [1.0, 1.45, 1.9, 2.3];

// Timing ----------------------------------------------------------------------
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = {
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};
// A pulse that rises fast and decays: 0 before a, peaks at a, near 0 by a + len.
const pulse = (t, a, len) => (t < a ? 0 : Math.exp(-((t - a) / len) * 4));
// Deterministic randomness, so live and recorded frames match.
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The film look: grain, vignette, letterbox bars, a flash, a touch of
// chromatic aberration. Runs last, on display-space colour.
const CinemaShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uGrain: { value: 0.04 },
    uVignette: { value: 0.5 },
    uBars: { value: 1 },
    uBarSize: { value: 0.1 },
    uFlash: { value: 0 },
    uAberr: { value: 0.25 },
    uFade: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uGrain, uVignette, uBars, uBarSize, uFlash, uAberr, uFade;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main() {
      vec2 d = vUv - 0.5;
      vec2 off = d * uAberr * 0.01;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col = col * uFade + uFlash;
      col *= 1.0 - uVignette * smoothstep(0.25, 0.9, length(d * 1.25));
      col += (hash(floor(vUv * uRes) + fract(uTime * 7.0) * 311.0) - 0.5) * uGrain;
      float bar = uBars * uBarSize;
      float edge = 1.5 / uRes.y;
      float m = smoothstep(bar - edge, bar + edge, vUv.y) * smoothstep(bar - edge, bar + edge, 1.0 - vUv.y);
      gl_FragColor = vec4(col * m, 1.0);
    }`,
};

// The stage: renderer, camera and the post chain, sized to the section.
function createStage({ fov, bloom, exposure }) {
  const canvas = root.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: CAPTURE });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps brand colours true; ACES turns the orange pink
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), bloom[0], bloom[1], bloom[2]);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  const cinema = new ShaderPass(CinemaShader);
  composer.addPass(cinema);

  const stage = { canvas, renderer, scene, camera, composer, bloomPass, cinema, width: 1, height: 1, portrait: false, onResize: null };
  const resize = () => {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    if (w === stage.width && h === stage.height) return;
    stage.width = w; stage.height = h; stage.portrait = w / h < 0.9;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    bloomPass.resolution.set(w * pr * 0.5, h * pr * 0.5);
    cinema.uniforms.uRes.value.set(w * pr, h * pr);
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
  const render = (t, dt) => {
    update(t);
    stage.cinema.uniforms.uTime.value = t;
    stage.composer.render(dt);
  };
  if (CAPTURE) {
    // Frame exact: the copy under the court follows t too, not the clock.
    let last = 0;
    const copy = root.querySelector(".sk-stage-copy");
    root.classList.add("is-live", "is-capture");
    window.__stage = {
      duration: DURATION,
      seek(t) {
        render(t, Math.max(0, t - last) || 1 / 30);
        last = t;
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
    stage.afterResize = () => render(DURATION + 2, 1 / 60);
    stage.afterResize();
    onSettled();
    return () => {};
  }
  let t = 0, prev = performance.now(), settled = false, visible = true, raf = 0, stopped = false;
  const frame = (now) => {
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    t += dt;
    render(t, dt);
    if (!settled && t >= DURATION) { settled = true; onSettled(); }
    raf = visible && !stopped ? requestAnimationFrame(frame) : 0;
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

// An SVG drawn into a canvas, for the court paint.
async function rasterSVG(url, width) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  const h = Math.round((width * img.naturalHeight) / img.naturalWidth) || width;
  const c = document.createElement("canvas");
  c.width = width; c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, width, h);
  return c;
}

// A soft round sprite, for dust and the ball's tail.
function dotTexture(size = 64) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.65)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The court as one painted texture: canvas x is world x, canvas y is world z
// (top = far). Portrait: the court stands upright, Adapt To Life in the far
// half. Landscape: it lies across the screen with world -x up, so the near
// half is on the left; Adapt To Life goes there and each lockup turns to read
// upright.
function courtTexture(atlC, selC, portrait) {
  const W = MOBILE ? 1536 : 2048, H = Math.round((W * FL) / FW);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const k = W / FW; // px per metre
  const X = (x) => (x + FW / 2) * k, Z = (z) => (z + FL / 2) * k;
  g.fillStyle = "#0e1216"; g.fillRect(0, 0, W, H);
  // A soft sheen where the lights pool.
  const sheen = g.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, H * 0.6);
  sheen.addColorStop(0, "rgba(255,255,255,0.05)"); sheen.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = sheen; g.fillRect(0, 0, W, H);
  g.fillStyle = "#1b2f47"; g.fillRect(X(-CW / 2), Z(-CL / 2), CW * k, CL * k);
  g.fillStyle = "#213a57"; g.fillRect(X(-CW / 2), Z(-KITCHEN), CW * k, KITCHEN * 2 * k);
  g.fillStyle = "#f2efe8";
  const line = (x0, z0, x1, z1) => g.fillRect(X(Math.min(x0, x1)) - (x0 === x1 ? (LINE * k) / 2 : 0), Z(Math.min(z0, z1)) - (z0 === z1 ? (LINE * k) / 2 : 0), Math.max(LINE * k, Math.abs(x1 - x0) * k), Math.max(LINE * k, Math.abs(z1 - z0) * k));
  line(-CW / 2, -CL / 2, CW / 2, -CL / 2); line(-CW / 2, CL / 2, CW / 2, CL / 2); // baselines
  line(-CW / 2, -CL / 2, -CW / 2, CL / 2); line(CW / 2, -CL / 2, CW / 2, CL / 2); // sidelines
  line(-CW / 2, -KITCHEN, CW / 2, -KITCHEN); line(-CW / 2, KITCHEN, CW / 2, KITCHEN); // kitchen lines
  line(0, -CL / 2, 0, -KITCHEN); line(0, KITCHEN, 0, CL / 2); // centre lines
  const paint = (img, cx, cz, w) => {
    const h = (w * img.height) / img.width;
    g.save();
    g.translate(X(cx), Z(cz));
    if (!portrait) g.rotate(-Math.PI / 2);
    g.globalAlpha = 0.94;
    g.drawImage(img, (-w * k) / 2, (-h * k) / 2, w * k, h * k);
    g.restore();
  };
  const mid = (CL / 2 + KITCHEN) / 2; // the middle of each service half
  if (portrait) {
    paint(atlC, 0, -mid, CW * 0.74);
    paint(selC, 0, mid, CW * 0.86);
  } else {
    paint(atlC, 0, mid, (CL / 2 - KITCHEN) * 0.9);
    paint(selC, 0, -mid, (CL / 2 - KITCHEN) * 0.94);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
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

  const stage = createStage({ fov: 38, bloom: [0.45, 0.45, 1.0], exposure: 1.0 });
  const { scene, camera } = stage;
  scene.background = new THREE.Color(0x040404);
  scene.fog = new THREE.Fog(0x040404, 18, 46);

  const [atlC, selC] = await Promise.race([
    Promise.all([
      rasterSVG("/images/selkirk/stage/atl-primary-light.svg", 1400),
      rasterSVG("/images/selkirk/stage/selkirk-lockup.svg", 2400),
    ]),
    timeout(12000),
  ]);

  // The floor and court.
  const floorMat = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.0, envMapIntensity: 0 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FL), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  let texPortrait = null;
  const retexture = () => {
    if (texPortrait === stage.portrait) return;
    texPortrait = stage.portrait;
    const old = floorMat.map;
    floorMat.map = courtTexture(atlC, selC, stage.portrait);
    floorMat.needsUpdate = true;
    old && old.dispose();
  };
  retexture();
  stage.onResize = retexture;

  // The net: posts, a dark mesh, the white tape.
  const net = new THREE.Group();
  const netMesh = new THREE.Mesh(new THREE.PlaneGeometry(CW + 0.3, 0.8), new THREE.MeshStandardMaterial({ color: 0x0b0d10, transparent: true, opacity: 0.72, roughness: 1, side: THREE.DoubleSide }));
  netMesh.position.y = 0.46;
  const tape = new THREE.Mesh(new THREE.BoxGeometry(CW + 0.3, 0.06, 0.05), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.6 }));
  tape.position.y = 0.88;
  net.add(netMesh, tape);
  for (const x of [-(CW / 2 + 0.2), CW / 2 + 0.2]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.92, 12), new THREE.MeshStandardMaterial({ color: 0x2a2e33, metalness: 0.6, roughness: 0.4 }));
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
  // Four floodlight towers, one at each corner.
  const towers = [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => {
    const pos = new THREE.Vector3(sx * (CW / 2 + 3.2), 8.5, sz * (CL / 2 + 2.2));
    const target = new THREE.Vector3(sx * 0.6, 0, sz * 2.4);
    const spot = new THREE.SpotLight(0xfff1e0, 0, 40, 0.62, 0.55, 1.4);
    spot.position.copy(pos); spot.target.position.copy(target);
    scene.add(spot, spot.target);
    // The lamp head: a bright panel that blooms.
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.12), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    lamp.position.copy(pos);
    lamp.lookAt(target);
    scene.add(lamp);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 8.5, 8), new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.8 }));
    pole.position.set(pos.x, 4.25, pos.z);
    scene.add(pole);
    // The beam: an additive cone, brightest at the lamp.
    const dir = new THREE.Vector3().subVectors(pos, target);
    const len = dir.length();
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(len * Math.tan(0.5), len, 48, 1, true),
      new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uOn: { value: 0 }, uLen: { value: len } },
        vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ vY = position.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform float uOn, uLen; varying float vY; varying vec3 vN; varying vec3 vV;
          void main(){ float along = clamp(vY / uLen + 0.5, 0.0, 1.0); float face = pow(abs(dot(vN, vV)), 1.6);
            float a = pow(along, 2.6) * face * 0.08 * uOn; gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * a, a); }`,
      }),
    );
    cone.position.copy(pos).add(target).multiplyScalar(0.5);
    cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    scene.add(cone);
    return { spot, lamp, cone, on: LIGHT_ON[i] };
  });

  // Dust hanging in the light.
  const R = rng(5);
  const dustN = MOBILE ? 500 : 900;
  const dp = new Float32Array(dustN * 3), ds = new Float32Array(dustN);
  for (let i = 0; i < dustN; i++) { dp.set([(R() - 0.5) * 14, R() * 7, (R() - 0.5) * 20], i * 3); ds[i] = R(); }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dp.slice(), 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, map: dotTexture(), color: 0xfff0dc, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);

  // The ball, its trail, and its shadow.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.085, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf6be00, emissive: 0xf6be00, emissiveIntensity: 0.9, roughness: 0.5 }));
  scene.add(ball);
  const trailN = 26;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(trailN * 3), 3));
  const trailCol = new Float32Array(trailN * 3);
  for (let i = 0; i < trailN; i++) { const f = 1 - i / trailN; trailCol.set([1.1 * f, 0.8 * f, 0.08 * f], i * 3); }
  trailGeo.setAttribute("color", new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({ size: 0.11, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(trail);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  scene.add(shadow);
  // A serve from the near side over the net, one bounce deep in the far court.
  const B0 = 2.55, B1 = 3.55, B2 = 4.35;
  const ballAt = (t) => {
    if (t < B0) return null;
    if (t < B1) {
      const u = (t - B0) / (B1 - B0);
      return new THREE.Vector3(lerp(1.4, -0.9, u), 0.9 + Math.sin(u * Math.PI) * 2.0 - u * 0.9, lerp(5.6, -4.8, u));
    }
    if (t < B2) {
      const u = (t - B1) / (B2 - B1);
      return new THREE.Vector3(lerp(-0.9, -1.6, u), Math.sin(u * Math.PI) * 1.1, lerp(-4.8, -8.6, u));
    }
    const u = Math.min(1, (t - B2) / 0.8);
    return new THREE.Vector3(lerp(-1.6, -2.0, u), Math.sin(u * Math.PI) * 0.35, lerp(-8.6, -10.8, u));
  };

  // Camera: low at the net post in the dark, then a crane up and over that lands
  // straight above the court, looking straight down, so every line sits square
  // to the screen. It never follows a touch or the phone's tilt, so it stays
  // square. Portrait: the far baseline is up. Landscape: the court lies across
  // the screen with its left sideline (world -x) up.
  const copyEl = root.querySelector(".sk-stage-copy");
  const startPos = new THREE.Vector3(4.4, 0.7, 8.6), startLook = new THREE.Vector3(-1.2, 0.35, -1.5);
  const UP_PORTRAIT = new THREE.Vector3(0, 0, -1), UP_LANDSCAPE = new THREE.Vector3(-1, 0, 0);
  const MID_PORTRAIT = new THREE.Vector3(6.5, 4.5, 9.5), MID_LANDSCAPE = new THREE.Vector3(9.0, 5.0, 5.0);
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

  const update = (t) => {
    // Lights snap on: on, a flicker, on.
    let lit = 0;
    for (const L of towers) {
      const s = t - L.on;
      let on = s < 0 ? 0 : s < 0.07 ? 1 : s < 0.13 ? 0.25 : 1;
      if (s > 2) on *= 0.97 + 0.03 * Math.sin(t * 9 + L.on * 7);
      lit += on;
      L.spot.intensity = on * 55;
      L.lamp.material.color.setScalar(on * 3);
      L.cone.material.uniforms.uOn.value = on;
    }
    const snap = LIGHT_ON.reduce((a, o) => a + pulse(t, o, 0.18), 0);
    stage.cinema.uniforms.uFlash.value = snap * 0.04;
    stage.bloomPass.strength = 0.45 + snap * 0.2;
    dust.material.opacity = 0.22 * (lit / 4);

    // The crane: from the net post, out and up, then over the court.
    const end = endFor();
    const midPos = stage.portrait ? MID_PORTRAIT : MID_LANDSCAPE;
    const c = ease.inOutCubic(seg(t, 1.7, 5.5));
    // A quadratic curve through a point out to the side, so it sweeps rather than slides.
    const pos = startPos.clone().multiplyScalar((1 - c) * (1 - c)).addScaledVector(midPos, 2 * (1 - c) * c).addScaledVector(end.pos, c * c);
    const look = new THREE.Vector3().lerpVectors(startLook, end.look, ease.inOutSine(seg(t, 1.9, 5.4)));
    // A slight drift before the lights, as if handheld.
    pos.y += Math.sin(t * 1.3) * 0.02 * (1 - c);
    // Once it lands, a slow push straight down: the court grows a touch and stays square.
    pos.y *= 1 - 0.035 * ease.inOutSine(seg(t, 5.5, 13));
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

    // The ball, its comet tail, its shadow.
    const b = ballAt(t);
    ball.visible = trail.visible = shadow.visible = !!b && t < B2 + 1.2;
    if (b) {
      ball.position.copy(b);
      const tp = trailGeo.attributes.position;
      for (let i = 0; i < trailN; i++) {
        const q = ballAt(Math.max(B0, t - i * 0.012)) || b;
        tp.setXYZ(i, q.x, q.y, q.z);
      }
      tp.needsUpdate = true;
      shadow.position.set(b.x, 0.01, b.z);
      shadow.material.opacity = 0.45 * Math.max(0, 1 - b.y / 3);
      const fade = 1 - seg(t, B2 + 0.6, B2 + 1.2);
      ball.material.emissiveIntensity = 0.9 * fade;
      trail.material.opacity = fade;
    }

    // Dust drifts.
    const d = dustGeo.attributes.position;
    for (let i = 0; i < dustN; i++) {
      d.setY(i, (dp[i * 3 + 1] + t * (0.04 + ds[i] * 0.06)) % 7);
      d.setX(i, dp[i * 3] + Math.sin(t * 0.2 + ds[i] * 9) * 0.3);
    }
    d.needsUpdate = true;

    stage.cinema.uniforms.uBars.value = 1 - ease.inOutCubic(seg(t, 4.9, 6.2));
    stage.cinema.uniforms.uFade.value = ease.outCubic(seg(t, 0, 0.5));
  };

  const stop = run(stage, update, settle);
  // A phone can drop the 3D context (low memory, long in the background): show the still.
  stage.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); fail(); });
  setTimeout(() => root.classList.add("is-live"), 50);
}

main().catch(fail);
