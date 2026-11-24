// Spooky Spokes 3D Court Stage (Opening + Closing)
// Built specifically for The Pickle Lodge at Lunken Landing:
// - Lit from frame 0 (no dark screen or delayed title)
// - Dedicated stacked court artwork so "The Pickle Lodge" reads clearly on 390px phones
// - Exact measured camera fit inside each art well (cached on resize, zero clipping)
// - Adjacent court markings and arena depth in Pickle Lodge navy (#2B3252 / #171C33)
// - Stops rendering cleanly at rest; matched HTML <picture> still handles first paint,
//   reduced motion, Save Data, and WebGL context loss.
import * as THREE from "three";

const CAPTURE = new URLSearchParams(location.search).has("capture");
const REDUCED = !CAPTURE && matchMedia("(prefers-reduced-motion: reduce)").matches;
const SAVE_DATA = !CAPTURE && Boolean(navigator.connection && navigator.connection.saveData);
const MOBILE = matchMedia("(max-width: 760px)").matches;

// Regulation pickleball court in metres: 6.10 wide, 13.41 long, kitchen 2.13 from net.
const CW = 6.1, CL = 13.41, KITCHEN = 2.13, LINE = 0.06;
const FW = 22, FL = 28;
const NET = { half: CW / 2 + 0.15, meshLo: 0.06, tapeLo: 0.85, tapeHi: 0.91, postX: CW / 2 + 0.2, postR: 0.035, postH: 0.92 };
const LAMP = { w: 1.1, h: 0.5, size: 0.85 };
const BALL_R = 0.04;
const HOLE_R = Math.asin(0.0038 / BALL_R);
const G = 9.81;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const smooth01 = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const ease = {
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

const LENS_GLSL = /* glsl */ `
  uniform float uFocus, uAperture, uPxPerRad;
  float blurPx(float d) { return 0.5 * uAperture * abs(1.0 / uFocus - 1.0 / max(d, 0.05)) * uPxPerRad; }
  float span(float x, float a, float b, float hw) { return clamp((min(b, x + hw) - max(a, x - hw)) / (2.0 * hw), 0.0, 1.0); }`;
const f = (x) => x.toFixed(4);

const FilmShader = {
  uniforms: {
    uVignette: { value: 0.10 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uVignette;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float keep = 1.0 - uVignette * smoothstep(0.35, 0.95, length(d * 1.25));
      gl_FragColor = vec4(0.09, 0.11, 0.20, 1.0 - keep);
    }`,
};

function createStage(root, { fov = 38, exposure = 1.08 } = {}) {
  const canvas = root.querySelector("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: CAPTURE,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x171c33, 1);
  renderer.autoClear = false;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x171c33, 24, 58);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 200);
  const filmScene = new THREE.Scene();
  const film = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({ ...FilmShader, uniforms: THREE.UniformsUtils.clone(FilmShader.uniforms), transparent: true, depthTest: false, depthWrite: false }),
  );
  film.frustumCulled = false;
  filmScene.add(film);
  const filmCam = new THREE.Camera();
  const lens = { uFocus: { value: 8 }, uAperture: { value: 0 }, uPxPerRad: { value: 1000 } };

  const stage = {
    canvas, renderer, scene, camera, lens, film: film.material.uniforms,
    width: 1, height: 1, portrait: false, onResize: null, afterResize: null,
    draw() {
      renderer.clear();
      renderer.render(scene, camera);
      renderer.render(filmScene, filmCam);
    },
  };
  const resize = () => {
    const w = Math.max(1, root.clientWidth), h = Math.max(1, root.clientHeight);
    if (w === stage.width && h === stage.height) return;
    stage.width = w;
    stage.height = h;
    stage.portrait = w / h < 0.95;
    renderer.setSize(w, h, false);
    const pr = renderer.getPixelRatio();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    lens.uPxPerRad.value = (h * pr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    stage.onResize && stage.onResize();
    stage.afterResize && stage.afterResize();
  };
  new ResizeObserver(resize).observe(root);
  resize();
  return stage;
}

async function loadLogo(url, aspect) {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, aspect };
}

let logosOnce = null;
const logos = () => (logosOnce ||= Promise.race([
  Promise.all([
    loadLogo("/images/selkirk/stage/atl-primary-light.svg", 638.64 / 216),
    loadLogo("/images/spooky-spokes/spooky-court-mark.png", 1400 / 1040),
  ]),
  new Promise((_, rej) => setTimeout(() => rej(new Error("logo decode timed out")), 12000)),
]));

// Court mark placement: center each mark inside its service half (z = +/- 4.42m).
// Portrait: Adapt To Life in far half (-z), Spooky Spokes hosted by The Pickle Lodge in near half (+z).
// Landscape: court horizontal (-x up), Adapt To Life on left (+z), Spooky Spokes on right (-z).
const MID = (CL / 2 + KITCHEN) / 2;
const HALF = CL / 2 - KITCHEN;
const CLEAR = 0.22;
const MIN_STUB = 0.22;

function nameLayout(atl, sp, portrait) {
  const place = (logo, maxW, maxH, cz) => {
    let w = maxW;
    let h = w / logo.aspect;
    if (h > maxH) {
      h = maxH;
      w = h * logo.aspect;
    }
    return { img: logo.img, w, h, cz, turn: !portrait, reach: (portrait ? h : w) / 2 };
  };
  return portrait
    ? [place(atl, 4.3, 1.85, -MID), place(sp, 5.15, 3.82, MID)]
    : [place(atl, 3.8, 1.85, MID), place(sp, 3.95, 3.15, -MID)];
}

const LINE_SLOTS = 12;
function courtLines(names) {
  const L = LINE / 2, out = [];
  for (const s of [-1, 1]) {
    out.push([-CW / 2 - L, s * CL / 2 - L, CW / 2 + L, s * CL / 2 + L]); // baseline
    out.push([s * CW / 2 - L, -CL / 2 - L, s * CW / 2 + L, CL / 2 + L]); // sideline
    out.push([-CW / 2, s * KITCHEN - L, CW / 2, s * KITCHEN + L]); // kitchen line
  }
  // Mask center line cleanly around each service-box mark independently
  for (let idx = 0; idx < names.length; idx++) {
    const n = names[idx];
    const s = Math.sign(n.cz);
    const reach = n.reach + CLEAR;
    const stub = HALF / 2 - reach;
    if (stub >= MIN_STUB) {
      out.push([-L, s * MID - reach - stub, L, s * MID - reach]);
      out.push([-L, s * MID + reach, L, s * MID + reach + stub]);
    }
  }
  return out;
}

const COURT_COLOR = "#2b3252";
function nameTexture(n, anisotropy) {
  const PAD = 10, MAX = MOBILE ? 2048 : 3072;
  const k = Math.min(MOBILE ? 360 : 520, (MAX - 2 * PAD) / Math.max(n.w, n.h));
  const c = document.createElement("canvas");
  c.width = Math.round(n.w * k) + 2 * PAD;
  c.height = Math.round(n.h * k) + 2 * PAD;
  const g = c.getContext("2d");
  g.fillStyle = COURT_COLOR;
  g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = 0.96;
  g.drawImage(n.img, PAD, PAD, c.width - 2 * PAD, c.height - 2 * PAD);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(anisotropy, 8);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  const ew = c.width / k, eh = c.height / k;
  const map = n.turn
    ? [new THREE.Vector3(0, -1 / ew, 0.5 + n.cz / ew), new THREE.Vector3(-1 / eh, 0, 0.5)]
    : [new THREE.Vector3(1 / ew, 0, 0.5), new THREE.Vector3(0, -1 / eh, 0.5 + n.cz / eh)];
  return { tex, map };
}

const SPOT_INFO = "getSpotLightInfo( spotLight, geometryPosition, directLight );";
function groundMaterial(lens) {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.78, metalness: 0.0, envMapIntensity: 0, dithering: true });
  const u = {
    uSurround: { value: new THREE.Color("#171c33") },
    uAdjCourt: { value: new THREE.Color("#202642") },
    uCourt: { value: new THREE.Color("#2b3252") },
    uKitchen: { value: new THREE.Color("#222845") },
    uInk: { value: new THREE.Color("#f9f7f2") },
    uAdjInk: { value: new THREE.Color("#3a4668") },
    uCourtRect: { value: new THREE.Vector4(-CW / 2, -CL / 2, CW / 2, CL / 2) },
    uKitchenRect: { value: new THREE.Vector4(-CW / 2, -KITCHEN, CW / 2, KITCHEN) },
    uLines: { value: Array.from({ length: LINE_SLOTS }, () => new THREE.Vector4()) },
    uNameA: { value: null }, uMapA: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uNameB: { value: null }, uMapB: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uBall: { value: new THREE.Vector4(0, -10, 0, 0) },
    uCamWorld: { value: new THREE.Matrix4() },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, lens);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vGround;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGround = vec2(position.x, -position.y);");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", /* glsl */ `#include <common>
        varying vec2 vGround;
        uniform vec3 uSurround, uAdjCourt, uCourt, uKitchen, uInk, uAdjInk;
        uniform vec4 uCourtRect, uKitchenRect, uLines[${LINE_SLOTS}];
        uniform sampler2D uNameA, uNameB;
        uniform vec3 uMapA[2], uMapB[2];
        uniform vec4 uBall;
        uniform mat4 uCamWorld;
        ${LENS_GLSL}
        float gCourt, gLine;
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
          float k = 1.0 + blurPx(distance(cameraPosition, vec3(p.x, 0.0, p.y)));
          vec2 hw = max(fwidth(p) * 0.5 * k, vec2(1e-6));
          vec3 col = uSurround;
          // Subtle adjacent Lunken Landing court surfaces and sidelines on left/right
          float adjL = cover(p, hw, vec4(-11.8, -${f(CL / 2)}, -5.7, ${f(CL / 2)}));
          float adjR = cover(p, hw, vec4(5.7, -${f(CL / 2)}, 11.8, ${f(CL / 2)}));
          col = mix(col, uAdjCourt, max(adjL, adjR));
          float adjLine = max(
            cover(p, hw, vec4(-5.73, -${f(CL / 2)}, -5.67, ${f(CL / 2)})),
            cover(p, hw, vec4(5.67, -${f(CL / 2)}, 5.73, ${f(CL / 2)}))
          );
          col = mix(col, uAdjInk, adjLine * 0.65);
          // Subtle divider curtain shadow band between courts
          float divBand = max(
            cover(p, hw, vec4(-4.62, -${f(CL / 2 + 1.2)}, -4.42, ${f(CL / 2 + 1.2)})),
            cover(p, hw, vec4(4.42, -${f(CL / 2 + 1.2)}, 4.62, ${f(CL / 2 + 1.2)}))
          );
          col = mix(col, uSurround * 0.62, divBand * 0.55);

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
        float lampReach(vec3 L) {
          vec3 p = vec3(vGround.x, 0.0, vGround.y);
          float across = step(p.z * L.z, 0.0);
          float den = p.z - L.z;
          float s = clamp(p.z / (abs(den) < 1e-3 ? 1e-3 : den), 0.0, 1.0) * across;
          float h = s * L.y, x = mix(p.x, L.x, s);
          float pen = ${f(LAMP.size)} * s;
          float wh = 0.5 * (pen + fwidth(h)) + 1e-4, wx = 0.5 * (pen + fwidth(x)) + 1e-4;
          float wide = span(x, -${f(NET.half)}, ${f(NET.half)}, wx);
          float keep = 1.0 - span(h, ${f(NET.tapeLo)}, ${f(NET.tapeHi)}, wh) * wide;
          keep *= 1.0 - 0.30 * span(h, 0.0, ${f(NET.tapeLo)}, wh) * wide;
          float posts = span(x, ${f(NET.postX - NET.postR)}, ${f(NET.postX + NET.postR)}, wx) + span(x, -${f(NET.postX + NET.postR)}, -${f(NET.postX - NET.postR)}, wx);
          keep *= 1.0 - posts * span(h, 0.0, ${f(NET.postH)}, wh);
          keep = mix(1.0, keep, across);
          vec3 toL = L - p;
          float dl = length(toL);
          vec3 dir = toL / dl, vb = uBall.xyz - p;
          float tb = dot(vb, dir);
          float tc = max(tb, 1e-3);
          float th = length(vb - tb * dir) / tc;
          float rb = ${f(BALL_R * 1.15)} / tc, rl = ${f(LAMP.size * 0.45)} / dl;
          float hide = min(1.0, (rb * rb) / (rl * rl)) * (1.0 - smoothstep(abs(rl - rb), rl + rb, th));
          // Extra grounded contact shadow directly under the ball
          float cd = length(p.xz - uBall.xz);
          float contact = (1.0 - smoothstep(0.02, 0.22 + uBall.y * 0.25, cd)) * (1.0 - smoothstep(0.0, 1.6, uBall.y)) * 0.55;
          return keep * (1.0 - max(hide * step(0.0, tb), contact) * uBall.w);
        }`)
      .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = groundColor(vGround);")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(0.90, 0.76, gCourt), 0.60, gLine);")
      .replace("#include <lights_fragment_begin>", THREE.ShaderChunk.lights_fragment_begin.replace(
        SPOT_INFO, SPOT_INFO + "\n\t\tdirectLight.color *= lampReach( ( uCamWorld * vec4( spotLight.position, 1.0 ) ).xyz );"));
  };
  mat.userData.u = u;
  return mat;
}

function netMaterial(lens) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const u = { uCord: { value: new THREE.Color(0x0d101b) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, lens);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vCard;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCard = position.xy;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", /* glsl */ `#include <common>
        varying vec2 vCard;
        uniform vec3 uCord;
        ${LENS_GLSL}
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
          float cx = cords(q.x, hw.x, 0.005, 0.042), cy = cords(q.y, hw.y, 0.005, 0.042);
          float a = wide * span(q.y, ${f(NET.meshLo)}, ${f(NET.tapeLo)}, hw.y) * (0.22 + 0.78 * (1.0 - (1.0 - cx) * (1.0 - cy)));
          diffuseColor = vec4(uCord, a);
        }`);
  };
  return mat;
}

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
  const mat = new THREE.MeshStandardMaterial({
    color: 0x74cf29,
    emissive: 0x74cf29,
    emissiveIntensity: 0.24,
    roughness: 0.36,
    metalness: 0.0,
    envMapIntensity: 0,
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    alphaToCoverage: true,
  });
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
          float d = acos(clamp(near, -1.0, 1.0));
          diffuseColor.a = 0.5 + (d - uHoleR) / max(fwidth(d), 1e-4);
          if (gl_FrontFacing) {
            diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(uHoleR, uHoleR * 1.4, d));
          } else {
            diffuseColor.rgb *= 0.25;
          }
        }`);
  };
  return mat;
}

// Compute exact measured overhead camera fit so ALL 4 baselines, net posts, and both marks
// sit cleanly inside the measured art well with >= padX/padY CSS pixel margin.
function computeRestCamera(stage) {
  const W = Math.max(1, stage.width);
  const H = Math.max(1, stage.height);
  const padX = stage.portrait ? 16 : 24;
  const padY = stage.portrait ? 16 : 24;
  // Regulation court + net post extensions + subtle breathing room
  const courtLong = CL + 0.5;
  const courtShort = CW + 0.7;
  const worldW = stage.portrait ? courtShort : courtLong;
  const worldH = stage.portrait ? courtLong : courtShort;
  const scale = Math.min((W - 2 * padX) / worldW, (H - 2 * padY) / worldH);
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(stage.camera.fov / 2));
  const dist = (H / scale) / (2 * tanHalf);
  return {
    pos: new THREE.Vector3(0, dist, 0),
    look: new THREE.Vector3(0, 0, 0),
    up: stage.portrait ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(-1, 0, 0),
  };
}

function buildArena(stage, atl, sp) {
  const { scene, camera, renderer, lens } = stage;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const groundMat = groundMaterial(lens);
  const gu = groundMat.userData.u;
  gu.uCamWorld.value = camera.matrixWorld;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(FW, FL), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Net mesh + bright cream top tape + matte dark posts
  const netMat = netMaterial(lens);
  const cardGeo = new THREE.PlaneGeometry(2 * NET.postX + 0.4, NET.postH + 0.2);
  cardGeo.translate(0, NET.postH / 2, 0);
  scene.add(new THREE.Mesh(cardGeo, netMat));

  const tape = new THREE.Mesh(
    new THREE.BoxGeometry(2 * NET.half, NET.tapeHi - NET.tapeLo, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xf9f7f2, roughness: 0.55 }),
  );
  tape.position.y = (NET.tapeLo + NET.tapeHi) / 2;
  scene.add(tape);
  for (const x of [-NET.postX, NET.postX]) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(NET.postR, NET.postR, NET.postH, 16),
      new THREE.MeshStandardMaterial({ color: 0x3b445f, metalness: 0.45, roughness: 0.4 }),
    );
    post.position.set(x, NET.postH / 2, 0);
    scene.add(post);
  }

  // Bright Lunken Landing indoor court lighting from frame 0
  scene.add(new THREE.HemisphereLight(0xf9f7f2, 0x2b3252, 0.62));
  scene.add(new THREE.AmbientLight(0xffffff, 0.28));

  const spotSpecs = [
    // Directional key lights on one side + softer fill on opposite side
    { pos: [5.8, 9.2, 4.8], target: [0, 0, 2.2], intensity: 52, color: 0xfff6e8 },
    { pos: [5.8, 9.2, -4.8], target: [0, 0, -2.2], intensity: 52, color: 0xfff6e8 },
    { pos: [-5.8, 8.8, 4.4], target: [0, 0, 2.0], intensity: 26, color: 0xdbeeff },
    { pos: [-5.8, 8.8, -4.4], target: [0, 0, -2.0], intensity: 26, color: 0xdbeeff },
  ];
  for (const s of spotSpecs) {
    const spot = new THREE.SpotLight(s.color, s.intensity, 42, 0.72, 0.62, 1.25);
    spot.position.set(...s.pos);
    spot.target.position.set(...s.target);
    scene.add(spot, spot.target);
  }

  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 48, 36), ballMaterial());
  scene.add(ball);

  const arena = {
    ball,
    gu,
    S: 1,
    rest: computeRestCamera(stage),
    ballShadow(shown) {
      gu.uBall.value.set(ball.position.x, ball.position.y, ball.position.z, shown ? 1 : 0);
    },
  };

  let layoutPortrait = null;
  const relayout = () => {
    arena.rest = computeRestCamera(stage);
    if (layoutPortrait === stage.portrait) return;
    layoutPortrait = stage.portrait;
    const names = nameLayout(atl, sp, stage.portrait);
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
    arena.S = Math.sign(names[1].cz);
  };
  relayout();
  stage.onResize = relayout;
  return arena;
}

// Parabolic arc helper between two court points (x, z) clearing the net cleanly, then settling with two soft hops
function arcBall(p0, p1, apexY, u) {
  const x = THREE.MathUtils.lerp(p0[0], p1[0], u);
  const z = THREE.MathUtils.lerp(p0[1], p1[1], u);
  const y = BALL_R + 4 * (apexY - BALL_R) * u * (1 - u);
  return { x, y, z };
}

function runSequence(root, stage, update, { duration, onDone, key }) {
  const render = (t) => {
    update(t);
    stage.draw();
  };
  if (CAPTURE) {
    render(duration);
    root.classList.add("is-live", "is-settled");
    window[key] = { duration, seek(t) { render(t); return true; } };
    window[key + "Ready"] = true;
    return { stop() {} };
  }
  if (REDUCED || SAVE_DATA) {
    stage.afterResize = () => render(duration);
    render(duration);
    root.classList.add("is-live", "is-settled");
    onDone && onDone();
    return { stop() {} };
  }

  // Draw frame 0 immediately so there is NEVER a black frame when canvas fades in
  render(0);
  root.classList.add("is-live");

  let t = 0, prev = performance.now(), stopped = false, visible = true, raf = 0;
  const frame = (now) => {
    raf = 0;
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    t = Math.min(duration, t + dt);
    render(t);
    if (t >= duration) {
      stopped = true;
      root.classList.add("is-settled");
      stage.afterResize = () => render(duration);
      onDone && onDone();
      return;
    }
    if (visible && !stopped) raf = requestAnimationFrame(frame);
  };
  const wake = () => {
    if (!stopped && visible && !raf && !document.hidden) {
      prev = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; wake(); }).observe(root);
  document.addEventListener("visibilitychange", wake);
  raf = requestAnimationFrame(frame);
  return {
    stop() { stopped = true; cancelAnimationFrame(raf); raf = 0; },
    replay() {
      t = 0;
      stopped = false;
      root.classList.remove("is-settled");
      prev = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    },
  };
}

// Opening sequence (4.0s):
// 0.0-0.4s: Lit establishing frame at court level
// 0.4-1.6s: Ball clears the net tape with shadow separating on floor
// 1.6-3.3s: Crane cleanly up into exact fitted overhead composition
// 3.3-4.0s: Ball bounces softly and settles in open court beside the host identity (clear of all lettering)
async function opening(root) {
  if (!root || REDUCED || SAVE_DATA) return;
  const [atl, sp] = await logos();
  const stage = createStage(root, { fov: 38, exposure: 1.08 });
  const arena = buildArena(stage, atl, sp);
  const { camera } = stage;
  const { ball } = arena;
  const SKY = new THREE.Vector3(0, 1, 0);
  const spinAxis = new THREE.Vector3(1, 0.2, 0.3).normalize();

  const update = (t) => {
    const S = arena.S; // +1 portrait (Spooky near), -1 landscape (Spooky right)
    const rest = arena.rest;

    // Ball path: starts on far side (-S * 5.1), crosses net at t=1.0, lands in open kitchen/corner beside Spooky mark
    // Resting ball coordinate sits in open left-kitchen corner (x=-2.15, z=S*1.25), completely clear of every letter!
    const pStart = [-1.45, -S * 5.2];
    const pLand = [-2.05, S * 0.85];
    const pRest = [-2.22, S * 1.48];
    let bx, by, bz;
    if (t < 0.4) {
      bx = pStart[0]; bz = pStart[1]; by = 0.72 + Math.sin(t * 6) * 0.04;
    } else if (t < 1.65) {
      const u = seg(t, 0.4, 1.65);
      ({ x: bx, y: by, z: bz } = arcBall(pStart, pLand, 1.85, u));
    } else if (t < 2.35) {
      const u = seg(t, 1.65, 2.35);
      const hop = arcBall(pLand, [-2.16, S * 1.22], 0.52, u);
      bx = hop.x; by = hop.y; bz = hop.z;
    } else {
      const u = ease.outCubic(seg(t, 2.35, 3.85));
      bx = THREE.MathUtils.lerp(-2.16, pRest[0], u);
      bz = THREE.MathUtils.lerp(S * 1.22, pRest[1], u);
      by = BALL_R + Math.abs(Math.sin(u * Math.PI)) * 0.09 * (1 - u);
    }
    ball.position.set(bx, by, bz);
    ball.quaternion.setFromAxisAngle(spinAxis, t * 9.5);
    arena.ballShadow(true);

    // Camera: low bright courtside establishing angle -> smooth crane to exact measured overhead rest
    const startPos = stage.portrait
      ? new THREE.Vector3(1.85, 2.35, S * 8.4)
      : new THREE.Vector3(5.6, 2.8, -S * 6.2);
    const midPos = stage.portrait
      ? new THREE.Vector3(3.6, 8.2, S * 5.2)
      : new THREE.Vector3(6.2, 9.0, -S * 2.4);
    const c = ease.inOutCubic(seg(t, 0.55, 3.35));
    const pos = startPos.clone().multiplyScalar((1 - c) * (1 - c))
      .addScaledVector(midPos, 2 * (1 - c) * c)
      .addScaledVector(rest.pos, c * c);

    const startLook = new THREE.Vector3(0, 0.42, -S * 0.6);
    const look = startLook.clone().lerp(rest.look, ease.inOutSine(seg(t, 0.9, 3.2)));
    const upMix = ease.inOutSine(seg(t, 1.5, 3.35));
    camera.up.copy(SKY).multiplyScalar(1 - upMix).addScaledVector(rest.up, upMix).normalize();
    camera.position.copy(pos);
    camera.lookAt(look);
  };

  const replayBtn = document.querySelector("[data-stage-replay]");
  const ctl = runSequence(root, stage, update, {
    duration: 4.0,
    key: "__stage",
    onDone() {
      if (replayBtn) replayBtn.hidden = false;
    },
  });
  stage.canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    ctl.stop();
    root.classList.remove("is-live");
  });
  if (replayBtn && ctl.replay) {
    replayBtn.addEventListener("click", () => {
      replayBtn.hidden = true;
      ctl.replay();
    });
  }
}

// Closing sequence (2.6s):
// Starts already lit at receiving end -> ball returns cleanly across the net (0-1.2s) ->
// cranes smoothly into exact fitted full-court composition showing both identities (1.2-2.6s) -> stops.
async function closing(root) {
  if (!root || REDUCED || SAVE_DATA) return;
  const [atl, sp] = await logos();
  const stage = createStage(root, { fov: 38, exposure: 1.08 });
  const arena = buildArena(stage, atl, sp);
  const { camera } = stage;
  const { ball } = arena;
  const SKY = new THREE.Vector3(0, 1, 0);
  const spinAxis = new THREE.Vector3(-0.8, 0.2, 0.5).normalize();

  const update = (t) => {
    const S = arena.S;
    const rest = arena.rest;
    // Return ball crosses from Spooky side back toward ATL open kitchen corner (x=2.15, z=-S*1.35)
    const pFrom = [1.55, S * 4.8];
    const pBounce = [1.95, -S * 0.95];
    const pEnd = [2.18, -S * 1.48];
    let bx, by, bz;
    if (t < 1.2) {
      const u = seg(t, 0.0, 1.2);
      ({ x: bx, y: by, z: bz } = arcBall(pFrom, pBounce, 1.75, u));
    } else if (t < 1.85) {
      const u = seg(t, 1.2, 1.85);
      ({ x: bx, y: by, z: bz } = arcBall(pBounce, [2.10, -S * 1.25], 0.44, u));
    } else {
      const u = ease.outCubic(seg(t, 1.85, 2.55));
      bx = THREE.MathUtils.lerp(2.10, pEnd[0], u);
      bz = THREE.MathUtils.lerp(-S * 1.25, pEnd[1], u);
      by = BALL_R;
    }
    ball.position.set(bx, by, bz);
    ball.quaternion.setFromAxisAngle(spinAxis, t * 10);
    arena.ballShadow(true);

    const startPos = stage.portrait
      ? new THREE.Vector3(-1.6, 3.2, S * 8.6)
      : new THREE.Vector3(5.2, 3.4, S * 5.8);
    const c = ease.inOutCubic(seg(t, 0.5, 2.5));
    const pos = startPos.clone().lerp(rest.pos, c);
    pos.y += Math.sin(Math.PI * c) * 1.4;
    const startLook = new THREE.Vector3(0, 0.35, 0);
    const look = startLook.clone().lerp(rest.look, ease.inOutSine(seg(t, 0.6, 2.4)));
    const upMix = ease.inOutSine(seg(t, 1.0, 2.5));
    camera.up.copy(SKY).multiplyScalar(1 - upMix).addScaledVector(rest.up, upMix).normalize();
    camera.position.copy(pos);
    camera.lookAt(look);
  };

  const ctl = runSequence(root, stage, update, { duration: 2.6, key: "__serve" });
  stage.canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    ctl.stop();
    root.classList.remove("is-live");
  });
}

const stageRoot = document.querySelector("[data-stage]");
if (stageRoot) opening(stageRoot).catch(() => {});

const serveRoot = document.querySelector("[data-serve]");
if (serveRoot) {
  const go = () => closing(serveRoot).catch(() => {});
  if (CAPTURE || !("IntersectionObserver" in window)) {
    go();
  } else {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        go();
      }
    }, { threshold: 0.25 });
    io.observe(serveRoot);
  }
}
