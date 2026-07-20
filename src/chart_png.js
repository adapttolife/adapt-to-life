// chart_png.js — Spec 70 Phase 2. Renders `line` and `scatter` ```chart
// blocks to PNG *inside the Worker* (Liberty One data never transits a third
// party): satori lays out the chart card (flex + absolutely-positioned axis
// text, Inter fonts) into SVG, @resvg/resvg-wasm rasterizes that SVG to PNG
// at 2x for retina. The send path (agent_mail.js) attaches each PNG inline
// (disposition:"inline" + contentId) and passes {cid,width,height} into the
// markdown render so the HTML body carries <img src="cid:...">.
//
// Failure contract (same as P1): NOTHING here throws out of
// renderMarkdownChartPngs. A chart that fails to render simply gets no image
// entry, and chart_render.js degrades that block to the plain data table
// with a named gap. Never a broken <img>, never a failed send.
//
// Engine assets (yoga wasm, resvg wasm, Inter TTFs) load one of two ways:
//   - Worker: lazy dynamic import of ./chart_assets_worker.js, whose static
//     .wasm/.ttf imports wrangler resolves via module rules. Plain node never
//     evaluates that module, so `node --test` stays green.
//   - Tests: initChartAssets({...}) with bytes read from disk.

import satori, { init as initYoga } from "satori/standalone";
import { initWasm as initResvg, Resvg } from "@resvg/resvg-wasm";
import {
  parseChart,
  parsePngChart,
  PNG_CHART_TYPES,
  SERIES_COLORS,
  CHART_SECONDARY,
  CHART_MUTED,
  CHART_HAIRLINE,
} from "./chart_render.js";

// ── geometry (logical px; PNG ships at SCALE x) ─────────────────────────
const WIDTH = 640;
const HEIGHT = 360;
const SCALE = 2;
const PAD = 20;
const Y_AXIS_W = 48;
const AXIS_GAP = 8;
const X_AXIS_H = 18;
const ZERO_LINE = "#c7c5bd"; // between hairline and secondary — visible, not loud
// Marks at the domain edge (first/last point, min/max value) would be half-
// clipped by the plot svg's viewBox without a small inset on both scales.
const PLOT_INSET = 4;

// At most this many PNG charts render per message; later chart blocks (and
// any failures) degrade to tables. Keeps inline weight far under the 5 MiB
// message cap alongside the 4 MiB caller-attachment budget.
const MAX_PNG_CHARTS = 4;

// ── engine init ─────────────────────────────────────────────────────────
let engineFonts = null; // satori font list once initialized
let initStarted = null; // promise guarding one-time wasm init

async function initEngines({ yoga, resvgWasm, interRegular, interSemiBold }) {
  // Both wasm engines are init-once per isolate (resvg throws on a second
  // initWasm), hence the module-level guard in ensureInit/initChartAssets.
  await initYoga(yoga);
  await initResvg(resvgWasm);
  engineFonts = [
    { name: "Inter", data: interRegular, weight: 400, style: "normal" },
    { name: "Inter", data: interSemiBold, weight: 600, style: "normal" },
  ];
}

// Test/tooling entry: supply engine bytes directly (node reads them from
// node_modules + assets/fonts). Idempotent.
export function initChartAssets(assets) {
  if (!initStarted) initStarted = initEngines(assets);
  return initStarted;
}

// Worker entry: first PNG chart of the isolate's life dynamic-imports the
// asset module (bundled by wrangler; never resolvable under plain node —
// which is fine, because node callers either initChartAssets first or get
// the degrade path).
function ensureInit() {
  if (!initStarted) {
    initStarted = import("./chart_assets_worker.js").then((mod) =>
      initEngines({
        yoga: mod.yogaWasm,
        resvgWasm: mod.resvgWasm,
        interRegular: mod.interRegular,
        interSemiBold: mod.interSemiBold,
      })
    );
  }
  return initStarted;
}

// ── scales ──────────────────────────────────────────────────────────────

function niceNum(range, round) {
  const exp = Math.floor(Math.log10(range));
  const f = range / 10 ** exp;
  let nf;
  if (round) nf = f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10;
  else nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * 10 ** exp;
}

// Tableau-style "nice" ticks: the domain snaps outward to round numbers so
// gridlines land on values a reader can say out loud.
function niceTicks(min, max, count = 5) {
  if (min === max) {
    const pad = Math.abs(min) || 1;
    min -= pad;
    max += pad;
  }
  const step = niceNum(niceNum(max - min, false) / (count - 1), true);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  // Rounding guard: accumulate by index, not by adding floats.
  const n = Math.round((hi - lo) / step);
  for (let i = 0; i <= n; i += 1) ticks.push(lo + i * step);
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return { lo, hi: ticks[ticks.length - 1], ticks, decimals };
}

function fmtTick(v, decimals) {
  return v.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

// ── satori tree ─────────────────────────────────────────────────────────

function el(type, style, children) {
  return { type, props: { style, children } };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

// Builds the satori object tree for one parsed chart (chart_render.js
// parsePngChart output). Pure function of the data — all text is drawn by
// satori (which owns the fonts); all geometry lives in one embedded <svg>
// that satori serializes into the card.
function buildTree(chart) {
  const { type, xLabels, xValues, series, seriesNames } = chart;
  const legendH = 0;
  const plotW = WIDTH - PAD * 2 - Y_AXIS_W - AXIS_GAP;
  const plotH = HEIGHT - PAD * 2 - legendH - X_AXIS_H;

  const allY = series.flat();
  const y = niceTicks(Math.min(...allY), Math.max(...allY), 5);
  const innerH = plotH - PLOT_INSET * 2;
  const innerW = plotW - PLOT_INSET * 2;
  const yPix = (v) => PLOT_INSET + innerH - ((v - y.lo) / (y.hi - y.lo)) * innerH;

  let xPix; // data index/value -> plot x
  let xTicks; // [{pix, label}]
  if (type === "scatter") {
    const x = niceTicks(Math.min(...xValues), Math.max(...xValues), 6);
    xPix = (v) => PLOT_INSET + ((v - x.lo) / (x.hi - x.lo)) * innerW;
    xTicks = x.ticks.map((t) => ({ pix: xPix(t), label: fmtTick(t, x.decimals) }));
  } else {
    const n = xLabels.length;
    xPix = (i) => PLOT_INSET + (i / (n - 1)) * innerW;
    const maxLabels = Math.min(6, n);
    const idxs = [...new Set(Array.from({ length: maxLabels }, (_v, k) => Math.round((k * (n - 1)) / (maxLabels - 1))))];
    xTicks = idxs.map((i) => ({ pix: xPix(i), label: xLabels[i] }));
  }

  // Geometry: gridlines + series marks in one nested svg.
  const shapes = [];
  for (const t of y.ticks) {
    const isZero = t === 0 && y.lo < 0 && y.hi > 0;
    shapes.push({
      type: "line",
      props: { x1: 0, y1: round2(yPix(t)), x2: plotW, y2: round2(yPix(t)), stroke: isZero ? ZERO_LINE : CHART_HAIRLINE, strokeWidth: 1 },
    });
  }
  series.forEach((values, s) => {
    const color = SERIES_COLORS[s];
    if (type === "line") {
      const pts = values.map((v, i) => `${round2(xPix(i))},${round2(yPix(v))}`).join(" ");
      shapes.push({
        type: "polyline",
        props: { points: pts, fill: "none", stroke: color, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" },
      });
      if (values.length <= 20) {
        // Spec 100: markers wear a 2px surface ring (dataviz spec) so dots
        // stay legible where they cross a line or another series.
        values.forEach((v, i) => {
          shapes.push({
            type: "circle",
            props: { cx: round2(xPix(i)), cy: round2(yPix(v)), r: 4, fill: color, stroke: "#ffffff", strokeWidth: 2 },
          });
        });
      }
    } else {
      values.forEach((v, i) => {
        shapes.push({
          type: "circle",
          props: { cx: round2(xPix(xValues[i])), cy: round2(yPix(v)), r: 4.5, fill: color, fillOpacity: 0.9, stroke: "#ffffff", strokeWidth: 2 },
        });
      });
    }
  });

  // Text: y tick labels (right-aligned, centered on their gridline) and x
  // tick labels — absolutely positioned so they align with the geometry.
  const yLabelEls = y.ticks.map((t) =>
    el(
      "div",
      { position: "absolute", top: round2(yPix(t) - 7), left: 0, width: Y_AXIS_W - AXIS_GAP, display: "flex", justifyContent: "flex-end", fontSize: 12, color: CHART_MUTED },
      fmtTick(t, y.decimals)
    )
  );
  const xLabelEls = xTicks.map(({ pix, label }, i) => {
    const first = i === 0;
    const last = i === xTicks.length - 1;
    return el(
      "div",
      {
        position: "absolute",
        top: 4,
        left: round2(first ? pix : last ? pix - 100 : pix - 50),
        width: 100,
        display: "flex",
        justifyContent: first ? "flex-start" : last ? "flex-end" : "center",
        fontSize: 11,
        color: CHART_MUTED,
      },
      String(label)
    );
  });

  // Spec 100 mobile-first: no in-image legend — chart_render.js emits the
  // HTML legend row beside the <img>, so legend text never downscales.
  const children = [];
  children.push(
    el("div", { display: "flex", flexDirection: "row", height: plotH }, [
      el("div", { position: "relative", width: Y_AXIS_W, height: plotH, display: "flex" }, yLabelEls),
      {
        type: "svg",
        props: { width: plotW, height: plotH, viewBox: `0 0 ${plotW} ${plotH}`, children: shapes },
      },
    ])
  );
  children.push(el("div", { position: "relative", height: X_AXIS_H, width: plotW, marginLeft: Y_AXIS_W + AXIS_GAP, display: "flex" }, xLabelEls));

  return el(
    "div",
    { display: "flex", flexDirection: "column", width: WIDTH, height: HEIGHT, backgroundColor: "#ffffff", fontFamily: "Inter", padding: PAD },
    children
  );
}

// Renders one parsed chart to PNG bytes. Throws on engine failure — callers
// catch and degrade. Returns display + raster dimensions for the <img> tag.
export async function renderChartPng(chart) {
  const svg = await satori(buildTree(chart), { width: WIDTH, height: HEIGHT, fonts: engineFonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH * SCALE } }).render().asPng();
  return { png, width: WIDTH, height: HEIGHT, pngWidth: WIDTH * SCALE, pngHeight: HEIGHT * SCALE };
}

// ── markdown scan + send-path entry ─────────────────────────────────────

// Walks ```-fences exactly like md_render.js renderBody does (same trim +
// startsWith logic, same "info string is exactly chart" test) so the ordinal
// of each chart block here matches the ordinal renderBody assigns. Escaping
// cannot create or destroy a fence line, so walking the RAW markdown yields
// the same ordinals as renderBody's walk over escaped lines.
export function extractChartBlocks(markdown) {
  const lines = String(markdown).split("\n");
  const n = lines.length;
  const blocks = [];
  let i = 0;
  let ordinal = 0;
  while (i < n) {
    const stripped = lines[i].trim();
    if (stripped.startsWith("```")) {
      const fenceInfo = stripped.slice(3).trim().toLowerCase();
      i += 1;
      const buf = [];
      while (i < n && !lines[i].trim().startsWith("```")) {
        buf.push(lines[i]);
        i += 1;
      }
      if (i < n) i += 1; // closing fence
      if (fenceInfo === "chart") {
        const { headers, dataLines } = parseChart(buf);
        blocks.push({ ordinal, headers, dataLines });
        ordinal += 1;
      }
      continue;
    }
    i += 1;
  }
  return blocks;
}

// THE send-path entry (agent_mail.js /send + /reply). Returns
//   images:      { <chart ordinal>: {cid, width, height} } for renderMarkdown
//   attachments: cfSend-shaped inline PNG parts ({... disposition:"inline",
//                contentId}) to append to the outgoing message
// Never throws; every failure just leaves a block image-less (table degrade).
export async function renderMarkdownChartPngs(markdown) {
  const out = { images: {}, attachments: [] };
  try {
    if (!markdown || !String(markdown).includes("```chart")) return out;
    const blocks = extractChartBlocks(markdown);
    for (const { ordinal, headers, dataLines } of blocks) {
      if (out.attachments.length >= MAX_PNG_CHARTS) break;
      const type = String(headers.type || "").toLowerCase();
      if (!PNG_CHART_TYPES.includes(type)) continue; // P1 types stay CSS-native
      if (!headers.source) continue; // renderChart degrades it with the P1 reason
      const parsed = parsePngChart(headers, dataLines);
      if (!parsed.ok) continue; // renderChart degrades with the same reason
      try {
        await ensureInit();
        const r = await renderChartPng(parsed.chart);
        const cid = `chart-${ordinal}-${crypto.randomUUID()}@agents.adapttolife.org`;
        out.images[ordinal] = { cid, width: r.width, height: r.height };
        out.attachments.push({
          filename: `chart-${ordinal + 1}.png`,
          content: r.png,
          type: "image/png",
          disposition: "inline",
          contentId: cid,
        });
      } catch (err) {
        console.error("chart png render failed (degrading to table):", err && err.message);
      }
    }
  } catch (err) {
    console.error("chart png scan failed (degrading all charts):", err && err.message);
  }
  return out;
}
