// Spec 70 P2 — the PNG chart pipeline (src/chart_png.js): satori (HTML/CSS
// object tree -> SVG, Inter fonts) + @resvg/resvg-wasm (SVG -> PNG), all
// in-process — no third party ever sees the data. Under node the engine
// assets load from disk via initChartAssets(); in the Worker the same init
// runs from wrangler-bundled modules (chart_assets_worker.js), so what these
// tests pin is the shared pipeline, grammar, ordinals, and degrade contract.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initChartAssets, renderMarkdownChartPngs, extractChartBlocks } from "../src/chart_png.js";
import { resolveMarkdownBody } from "../src/md_render.js";

before(async () => {
  await initChartAssets({
    yoga: readFileSync("node_modules/satori/yoga.wasm"),
    resvgWasm: readFileSync("node_modules/@resvg/resvg-wasm/index_bg.wasm"),
    interRegular: readFileSync("assets/fonts/Inter-Regular.ttf"),
    interSemiBold: readFileSync("assets/fonts/Inter-SemiBold.ttf"),
  });
});

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngDimensions(bytes) {
  // IHDR is always the first chunk: width/height are big-endian at 16/20.
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

function chartMd(lines) {
  return "```chart\n" + lines.join("\n") + "\n```";
}

const LINE_BLOCK = ["type: line", "title: Weekly escalations", "source: log, 2026-07-18", "series: NVDA | TSM", "Mon | 12 | 4", "Tue | 8 | 6", "Wed | 15 | 5"];
const SCATTER_BLOCK = ["type: scatter", "source: FMP", "18.5 | 12", "22.1 | 19", "35 | 41"];

test("line chart renders a real PNG: magic bytes, 2x dimensions, inline disposition + contentId", async () => {
  const res = await renderMarkdownChartPngs(chartMd(LINE_BLOCK));
  assert.equal(res.attachments.length, 1);
  const att = res.attachments[0];
  assert.equal(att.type, "image/png");
  assert.equal(att.disposition, "inline");
  assert.equal(att.filename, "chart-1.png");
  assert.deepEqual([...att.content.slice(0, 8)], PNG_MAGIC);
  // Rendered at 2x for retina; the <img> displays at 640x360.
  assert.deepEqual(pngDimensions(att.content), { width: 1280, height: 720 });
  assert.deepEqual(res.images[0], { cid: att.contentId, width: 640, height: 360 });
  assert.match(att.contentId, /^chart-0-[0-9a-f-]+@agents\.adapttolife\.org$/);
});

test("scatter renders too, and the PNG is non-trivial (drawn marks, not a blank card)", async () => {
  const res = await renderMarkdownChartPngs(chartMd(SCATTER_BLOCK));
  assert.equal(res.attachments.length, 1);
  assert.deepEqual([...res.attachments[0].content.slice(0, 8)], PNG_MAGIC);
  assert.ok(res.attachments[0].content.length > 3000, `png suspiciously small: ${res.attachments[0].content.length}`);
});

test("end-to-end: images map + resolveMarkdownBody produce cid img markup that matches the attachment", async () => {
  const md = "# Memo\n\n" + chartMd(LINE_BLOCK) + "\n\nprose after";
  const res = await renderMarkdownChartPngs(md);
  const { body_html } = resolveMarkdownBody({ body_markdown: md }, { chartImages: res.images });
  assert.match(body_html, new RegExp(`<img src="cid:${res.attachments[0].contentId}" width="640" height="360" alt="Weekly escalations"`));
  assert.equal(body_html.includes("Chart degraded"), false);
});

test("degrade: malformed line rows produce NO attachment, and the body falls back to the table", async () => {
  const md = chartMd(["type: line", "source: s", "Mon | 3", "Tue | n/a"]);
  const res = await renderMarkdownChartPngs(md);
  assert.equal(res.attachments.length, 0);
  const { body_html } = resolveMarkdownBody({ body_markdown: md }, { chartImages: res.images });
  assert.match(body_html, /Chart degraded \(line value not numeric\)/);
  assert.equal(body_html.includes("<img"), false);
});

test("P1 types are untouched: a bar block yields no attachment and keeps its CSS render", async () => {
  const md = chartMd(["type: bar", "source: s", "A | 5", "B | 3"]);
  const res = await renderMarkdownChartPngs(md);
  assert.equal(res.attachments.length, 0);
  const { body_html } = resolveMarkdownBody({ body_markdown: md }, { chartImages: res.images });
  assert.match(body_html, /<table role="presentation"/);
  assert.equal(body_html.includes("<img"), false);
  assert.equal(body_html.includes("Chart degraded"), false);
});

test("ordinals: mixed bar + line + scatter — images keyed to the right fences, bar skipped", async () => {
  const md = [chartMd(["type: bar", "source: s", "A | 1"]), chartMd(LINE_BLOCK), chartMd(SCATTER_BLOCK)].join("\n\n");
  const res = await renderMarkdownChartPngs(md);
  assert.equal(res.attachments.length, 2);
  assert.deepEqual(Object.keys(res.images).sort(), ["1", "2"]);
  const { body_html } = resolveMarkdownBody({ body_markdown: md }, { chartImages: res.images });
  assert.equal((body_html.match(/<img/g) || []).length, 2);
  assert.match(body_html, /<table role="presentation"/); // the bar
});

test("cap: at most 4 PNG charts render per message; the 5th degrades to a table", async () => {
  const md = Array.from({ length: 5 }, () => chartMd(["type: line", "source: s", "A | 1", "B | 2"])).join("\n\n");
  const res = await renderMarkdownChartPngs(md);
  assert.equal(res.attachments.length, 4);
  const { body_html } = resolveMarkdownBody({ body_markdown: md }, { chartImages: res.images });
  assert.equal((body_html.match(/<img/g) || []).length, 4);
  assert.match(body_html, /Chart degraded \(chart image not rendered\)/);
});

test("no chart blocks / missing source / empty markdown: fast empty result, never throws", async () => {
  assert.deepEqual(await renderMarkdownChartPngs("plain prose"), { images: {}, attachments: [] });
  assert.deepEqual(await renderMarkdownChartPngs(null), { images: {}, attachments: [] });
  const noSource = await renderMarkdownChartPngs(chartMd(["type: line", "A | 1", "B | 2"]));
  assert.equal(noSource.attachments.length, 0);
});

test("extractChartBlocks walks fences exactly like md_render: non-chart fences don't consume chart ordinals", () => {
  const md = ["```js", "const x = 1;", "```", "", chartMd(["type: line", "source: s", "A | 1", "B | 2"])].join("\n");
  const blocks = extractChartBlocks(md);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].ordinal, 0);
  assert.equal(blocks[0].headers.type, "line");
});
