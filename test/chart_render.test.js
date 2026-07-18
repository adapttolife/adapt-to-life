// Spec 70 P1 — unit tests for src/chart_render.js and its wire-in to
// md_render.js's ```chart fence hook. Standalone `node --test`, no new deps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderChart, SERIES_COLORS, BLUE_RAMP } from "../src/chart_render.js";
import { renderMarkdown, resolveMarkdownBody } from "../src/md_render.js";

function chartMd(lines) {
  return "```chart\n" + lines.join("\n") + "\n```";
}

// ── existing fence behavior must be untouched ─────────────────────────────

test("plain ``` fence still renders <pre> exactly as before", () => {
  const html = renderMarkdown("```\nconst x = 1;\n```");
  assert.match(html, /<pre[^>]*>const x = 1;<\/pre>/);
});

test("```js fence still renders <pre> exactly as before (not chart)", () => {
  const html = renderMarkdown("```js\nconst x = 1;\n```");
  assert.match(html, /<pre[^>]*>const x = 1;<\/pre>/);
  assert.equal(html.includes("Chart degraded"), false);
});

// ── bar ────────────────────────────────────────────────────────────────────

test("bar: title + source render, max value gets width=92% (kit idiom: attribute + nbsp), display override honored", () => {
  const html = renderMarkdown(
    chartMd([
      "type: bar",
      "title: Escalations by ticker",
      "source: escalation log, 2026-07-11",
      "NVDA | 12 | 12 tickets",
      "TSM | 8",
      "AVGO | 5",
    ])
  );
  assert.match(html, /Escalations by ticker/);
  assert.match(html, /Source: escalation log, 2026-07-11/);
  // Kit idiom pinned on purpose: HTML width ATTRIBUTE (Outlook honors
  // attributes, not td CSS widths) and &nbsp; content (empty <td>s collapse).
  assert.match(html, /<td width="92%"[^>]*>&nbsp;<\/td>/); // NVDA is the max
  assert.match(html, />12 tickets<\/td>/); // display-override cell used
  assert.match(html, />8<\/td>/); // raw value shown when no override
  assert.equal(html.includes("Chart degraded"), false);
});

test("bar: negative value degrades to a plain table with a reason", () => {
  const html = renderChart(["type: bar", "source: s", "A | -1"]);
  assert.match(html, /Chart degraded \(bar value not numeric or negative\)/);
  assert.match(html, /<table/);
});

// ── categorical palette (validated 2026-07-18) ────────────────────────────

test("palette: SERIES_COLORS is the exact 6-slot categorical set, in order, and never touches the reserved status colors", () => {
  assert.deepEqual(SERIES_COLORS, ["#2a78d6", "#008300", "#e87ba4", "#eda100", "#1baf7a", "#eb6834"]);
  // DELTA_POS/DELTA_NEG are reserved for status; the categorical set must
  // never absorb them (green slot #008300 !== status green #006300).
  assert.ok(!SERIES_COLORS.includes("#006300"));
  assert.ok(!SERIES_COLORS.includes("#a02d2d"));
});

// ── stacked bar ────────────────────────────────────────────────────────────

const STACKED = [
  "type: bar",
  "source: s",
  "series: New | Renewal | Upsell",
  "Q1 | 4 | 2 | 1",
  "Q2 | 3 | 3 | 2",
];

test("stacked bar: fixed-slot segment colors, legend chips match marks, 2px gap idiom", () => {
  const html = renderChart(STACKED);
  assert.equal(html.includes("Chart degraded"), false);
  // Fixed slot assignment: series i wears SERIES_COLORS[i], in document order.
  const segColors = [...html.matchAll(/<td width="\d+%" style="background-color:(#[0-9a-f]{6});font-size:2px/g)].map((m) => m[1]);
  assert.deepEqual(segColors, [
    SERIES_COLORS[0], SERIES_COLORS[1], SERIES_COLORS[2],
    SERIES_COLORS[0], SERIES_COLORS[1], SERIES_COLORS[2],
  ]);
  // Legend chips carry the same slots (chip = 10px attribute-width cell).
  const chipColors = [...html.matchAll(/<td width="10" style="background-color:(#[0-9a-f]{6})/g)].map((m) => m[1]);
  assert.deepEqual(chipColors, [SERIES_COLORS[0], SERIES_COLORS[1], SERIES_COLORS[2]]);
  assert.match(html, />New<\/td>/);
  assert.match(html, />Renewal<\/td>/);
  assert.match(html, />Upsell<\/td>/);
  // Outlook gap idiom: a 2px attribute-width spacer cell BETWEEN segments —
  // (segments - 1) per bar, so 2 per row here, 4 total.
  const gaps = html.match(/<td width="2" style="font-size:2px;line-height:16px">&nbsp;<\/td>/g) || [];
  assert.equal(gaps.length, 4);
});

test("stacked bar: label-visibility obligation — total labeled at the bar end in INK, never a number on a segment", () => {
  const html = renderChart(STACKED);
  // ONE total per bar, INK, at the end (sub-3:1 palette slots are legal only
  // because of this label + the legend — do not remove either).
  assert.match(html, /color:#0b0b0b;font-weight:600;[^"]*">7<\/td>/); // Q1 total
  assert.match(html, /color:#0b0b0b;font-weight:600;[^"]*">8<\/td>/); // Q2 total
  // Segment cells carry only the invisible &nbsp;, never a value.
  for (const m of html.matchAll(/<td width="\d+%"[^>]*>([^<]*)<\/td>/g)) {
    assert.equal(m[1], "&nbsp;");
  }
});

test("stacked bar: 3+ numeric value columns stack WITHOUT a series header, with default names", () => {
  const html = renderChart(["type: bar", "source: s", "Q1 | 4 | 2 | 1", "Q2 | 3 | 3 | 2"]);
  assert.equal(html.includes("Chart degraded"), false);
  assert.match(html, />Series 1<\/td>/);
  assert.match(html, />Series 3<\/td>/);
  assert.match(html, new RegExp(`background-color:${SERIES_COLORS[2]}`));
});

test("stacked bar: 2 value columns stack only when the series header says so; bare 2-numeric-column rows keep the legacy display-override read", () => {
  // WITH the header: two segments, legend, total.
  const stacked = renderChart(["type: bar", "source: s", "series: A | B", "Q1 | 3 | 4", "Q2 | 1 | 2"]);
  assert.match(stacked, new RegExp(`background-color:${SERIES_COLORS[1]}`));
  assert.match(stacked, /color:#0b0b0b;font-weight:600;[^"]*">7<\/td>/);
  // WITHOUT the header: golden single-series behavior — value 3, display "4".
  const single = renderChart(["type: bar", "source: s", "Q1 | 3 | 4", "Q2 | 1 | 2"]);
  assert.equal(single.includes(SERIES_COLORS[1]), false);
  assert.match(single, />4<\/td>/); // third cell shown as the display string
  assert.match(single, /background-color:#2a78d6/);
});

test("stacked bar: zero-value segments are skipped (no mark, no gap), zero-total bar renders empty", () => {
  const html = renderChart(["type: bar", "source: s", "series: A | B", "Q1 | 5 | 0", "Q2 | 0 | 0"]);
  assert.equal(html.includes("Chart degraded"), false);
  const gaps = html.match(/<td width="2" style="font-size:2px/g) || [];
  assert.equal(gaps.length, 0); // one visible segment in Q1, none in Q2
  assert.match(html, /">0<\/td>/); // Q2 still shows its total
});

test("stacked bar: six series render on the six fixed slots; seven degrade with a named reason", () => {
  const six = renderChart(["type: bar", "source: s", "series: A | B | C | D | E | F", "Q1 | 1 | 2 | 3 | 4 | 5 | 6", "Q2 | 6 | 5 | 4 | 3 | 2 | 1"]);
  assert.equal(six.includes("Chart degraded"), false);
  for (const c of SERIES_COLORS) assert.ok(six.includes(`background-color:${c}`), `slot ${c} used`);
  const seven = renderChart(["type: bar", "source: s", "series: A | B | C | D | E | F | G", "Q1 | 1 | 2 | 3 | 4 | 5 | 6 | 7"]);
  assert.match(seven, /Chart degraded \(bar exceeds 6 series\)/);
});

test("stacked bar: ragged rows, series-count mismatch, and negative segments degrade with named reasons", () => {
  assert.match(
    renderChart(["type: bar", "source: s", "series: A | B", "Q1 | 1 | 2", "Q2 | 3"]),
    /Chart degraded \(bar ragged rows \(cell count mismatch\)\)/
  );
  assert.match(
    renderChart(["type: bar", "source: s", "series: A | B | C", "Q1 | 1 | 2", "Q2 | 3 | 4"]),
    /Chart degraded \(series names do not match data columns\)/
  );
  assert.match(
    renderChart(["type: bar", "source: s", "series: A | B", "Q1 | 1 | -2", "Q2 | 3 | 4"]),
    /Chart degraded \(bar value not numeric or negative\)/
  );
});

// ── shade encoding (opt-in, single-series bar only) ────────────────────────

test("shade: value — bar fills walk BLUE_RAMP monotonically with value; min lightest, max darkest; labels stay text", () => {
  const html = renderChart(["type: bar", "source: s", "shade: value", "B | 5", "A | 1", "C | 12"]);
  assert.equal(html.includes("Chart degraded"), false);
  const fills = [...html.matchAll(/background-color:(#[0-9a-f]{6});font-size:2px/g)].map((m) => m[1]);
  assert.equal(fills.length, 3);
  const idx = fills.map((c) => BLUE_RAMP.indexOf(c));
  assert.ok(idx.every((i) => i >= 0), "every fill comes from BLUE_RAMP");
  // Row order is B(5), A(1), C(12): shade must be monotone by VALUE.
  assert.equal(idx[1], 0, "min value gets the lightest stop");
  assert.equal(idx[2], BLUE_RAMP.length - 1, "max value gets the darkest stop");
  assert.ok(idx[1] < idx[0] && idx[0] < idx[2], "shade index is monotone in value");
  // Value labels remain INK-adjacent text cells, never painted series colors.
  assert.match(html, /text-align:right;color:#52514e[^"]*">12<\/td>/);
});

test("shade: equal values collapse to the ramp midpoint (still a valid, single-stop render)", () => {
  const html = renderChart(["type: bar", "source: s", "shade: value", "A | 3", "B | 3"]);
  const fills = [...html.matchAll(/background-color:(#[0-9a-f]{6});font-size:2px/g)].map((m) => m[1]);
  assert.deepEqual(fills, [BLUE_RAMP[6], BLUE_RAMP[6]]);
});

test("shade on a multi-series/stacked block is a grammar violation → degrade with the named reason", () => {
  const html = renderChart(["type: bar", "source: s", "shade: value", "series: A | B", "Q1 | 1 | 2", "Q2 | 3 | 4"]);
  assert.match(html, /Chart degraded \(shade requires a single-series bar\)/);
  assert.match(html, /<table/);
});

test("shade: any mode other than 'value' degrades with a named reason", () => {
  const html = renderChart(["type: bar", "source: s", "shade: rainbow", "A | 1", "B | 2"]);
  assert.match(html, /Chart degraded \(unknown shade mode\)/);
});

// ── stat ────────────────────────────────────────────────────────────────────

test("stat: 3 tiles render, + context green with up-arrow, - context red with down-arrow", () => {
  const html = renderChart([
    "type: stat",
    "source: s",
    "Revenue | $4.2M | +12%",
    "Churn | 2.1% | -0.4pp",
    "Headcount | 340",
  ]);
  const tileCount = (html.match(/padding:12px 14px/g) || []).length;
  assert.equal(tileCount, 3);
  assert.match(html, /color:#006300">▲ \+12%/);
  assert.match(html, /color:#a02d2d">▼ -0\.4pp/);
});

test("stat: row count out of range (1 row) degrades with a reason", () => {
  const html = renderChart(["type: stat", "source: s", "Solo | 1"]);
  assert.match(html, /Chart degraded \(stat row count out of range \(2-4\)\)/);
});

// ── delta ────────────────────────────────────────────────────────────────────

test("delta: sign coloring + arrows, signless delta is neutral (no arrow)", () => {
  const html = renderChart([
    "type: delta",
    "source: s",
    "AAPL | $180 | +3.2%",
    "MSFT | $410 | -1.1%",
    "GOOG | $170 | flat",
  ]);
  assert.match(html, /color:#006300;[^>]*>▲ \+3\.2%/);
  assert.match(html, /color:#a02d2d;[^>]*>▼ -1\.1%/);
  assert.match(html, /color:#52514e;[^>]*>flat</);
  assert.equal(html.includes("▲ flat"), false);
  assert.equal(html.includes("▼ flat"), false);
});

// ── heat ────────────────────────────────────────────────────────────────────

test("heat: min value gets lightest stop, max gets darkest, dark cells get white text", () => {
  const html = renderChart([
    "type: heat",
    "source: s",
    " | Q1 | Q2 | Q3",
    "NVDA | 1 | 6 | 12",
    "TSM | 3 | 4 | 5",
  ]);
  assert.match(html, /background-color:#cde2fb/); // value 1 == min
  assert.match(html, /background-color:#0d366b;color:#ffffff/); // value 12 == max
});

test("heat: ragged rows degrade with a reason", () => {
  const html = renderChart([
    "type: heat",
    "source: s",
    " | Q1 | Q2",
    "NVDA | 1 | 2",
    "TSM | 3", // missing a cell
  ]);
  assert.match(html, /Chart degraded \(heat ragged rows/);
});

test("heat: non-numeric value degrades with a reason", () => {
  const html = renderChart(["type: heat", "source: s", " | Q1", "NVDA | n/a"]);
  assert.match(html, /Chart degraded \(heat value not numeric\)/);
});

// ── line / scatter (Spec 70 P2 grammar; PNG delivery tested in chart_png.test.js) ──

test("line: valid data WITHOUT a rendered image degrades to the table with the named gap (never a broken img)", () => {
  const html = renderChart(["type: line", "source: s", "Mon | 3", "Tue | 5"]);
  assert.match(html, /Chart degraded \(chart image not rendered\)/);
  assert.match(html, /<table/);
  assert.equal(html.includes("<img"), false);
});

test("line: valid data WITH an image renders title + cid img (width/height attributes, alt = title) + source", () => {
  const html = renderChart(
    ["type: line", "title: Weekly escalations", "source: log, 2026-07-18", "Mon | 3", "Tue | 5"],
    { cid: "chart-0-abc@agents.adapttolife.org", width: 640, height: 360 }
  );
  assert.match(html, /Weekly escalations<\/div>/);
  assert.match(html, /<img src="cid:chart-0-abc@agents\.adapttolife\.org" width="640" height="360" alt="Weekly escalations"/);
  assert.match(html, /Source: log, 2026-07-18/);
  assert.equal(html.includes("Chart degraded"), false);
});

test("line: alt falls back to the chart type when there is no title", () => {
  const html = renderChart(["type: line", "source: s", "A | 1", "B | 2"], { cid: "x", width: 640, height: 360 });
  assert.match(html, /alt="line chart"/);
});

test("line: single data row degrades (a line needs 2 points)", () => {
  const html = renderChart(["type: line", "source: s", "Mon | 3"], { cid: "x", width: 640, height: 360 });
  assert.match(html, /Chart degraded \(line needs at least 2 data rows\)/);
});

test("line: non-numeric series value degrades even when an image is offered", () => {
  const html = renderChart(["type: line", "source: s", "Mon | 3", "Tue | n/a"], { cid: "x", width: 640, height: 360 });
  assert.match(html, /Chart degraded \(line value not numeric\)/);
  assert.equal(html.includes("<img"), false);
});

test("line: ragged rows degrade", () => {
  const html = renderChart(["type: line", "source: s", "Mon | 3 | 4", "Tue | 5"], { cid: "x", width: 640, height: 360 });
  assert.match(html, /Chart degraded \(line ragged rows/);
});

test("line: series header count mismatch degrades", () => {
  const html = renderChart(
    ["type: line", "source: s", "series: A | B | C", "Mon | 3 | 4", "Tue | 5 | 6"],
    { cid: "x", width: 640, height: 360 }
  );
  assert.match(html, /Chart degraded \(series names do not match data columns\)/);
});

test("scatter: non-numeric x degrades (scatter x is a position, not a label)", () => {
  const html = renderChart(["type: scatter", "source: s", "Mon | 3", "Tue | 5"], { cid: "x", width: 640, height: 360 });
  assert.match(html, /Chart degraded \(scatter x not numeric\)/);
});

test("scatter: valid numeric pairs with an image render the cid img", () => {
  const html = renderChart(["type: scatter", "source: s", "1.5 | 3", "2 | 5"], { cid: "c1", width: 640, height: 360 });
  assert.match(html, /<img src="cid:c1"/);
});

test("P1 types ignore the image argument — bar stays CSS-native even when an image is passed", () => {
  const html = renderChart(["type: bar", "source: s", "A | 5", "B | 3"], { cid: "x", width: 640, height: 360 });
  assert.equal(html.includes("<img"), false);
  assert.match(html, /<table role="presentation"/);
});

test("chartImages map keys by chart-fence ordinal: bar (0) stays HTML, line (1) gets its img", () => {
  const md = [
    "```chart",
    "type: bar",
    "source: s",
    "A | 5",
    "```",
    "",
    "```chart",
    "type: line",
    "source: s",
    "Mon | 1",
    "Tue | 2",
    "```",
  ].join("\n");
  const html = renderMarkdown(md, { chartImages: { 1: { cid: "c-line", width: 640, height: 360 } } });
  assert.match(html, /<img src="cid:c-line"/);
  assert.equal((html.match(/<img/g) || []).length, 1);
  assert.match(html, /<table role="presentation"/); // the bar chart
});

// ── degrade path ────────────────────────────────────────────────────────────

test("degrade: missing source produces the degraded table + reason, never throws", () => {
  const html = renderChart(["type: bar", "A | 1"]);
  assert.match(html, /Chart degraded \(missing source\)/);
  assert.match(html, /<table/);
});

test("degrade: unknown type produces the degraded table + reason", () => {
  const html = renderChart(["type: pie", "source: s", "A | 1"]);
  assert.match(html, /Chart degraded \(unknown chart type\)/);
});

test("degrade: no data rows produces the degraded reason and never throws", () => {
  const html = renderChart(["type: bar", "source: s"]);
  assert.match(html, /Chart degraded \(no data rows\)/);
});

test("renderChart never throws on adversarial input", () => {
  assert.doesNotThrow(() => renderChart([]));
  assert.doesNotThrow(() => renderChart(["garbage", "more | garbage | |||"]));
  assert.doesNotThrow(() => renderChart(["type: heat", "source: s", "", "a|b"]));
});

// ── escaping passthrough ─────────────────────────────────────────────────

test("already-escaped injection attempt in a label passes through still-escaped", () => {
  const html = renderChart(["type: bar", "source: s", "&lt;script&gt; | 5"]);
  assert.match(html, /&lt;script&gt;/);
  assert.equal(html.includes("<script>"), false);
});

// ── end-to-end via resolveMarkdownBody ────────────────────────────────────

test("end-to-end: resolveMarkdownBody renders a memo with prose + chart + markdown table", () => {
  const body_markdown = [
    "# Weekly memo",
    "",
    "Some prose before the chart.",
    "",
    "```chart",
    "type: bar",
    "title: Escalations by ticker",
    "source: escalation log, 2026-07-11",
    "NVDA | 12",
    "TSM | 8",
    "```",
    "",
    "| Col A | Col B |",
    "|---|---|",
    "| a1 | b1 |",
  ].join("\n");

  const { body_html, body_text } = resolveMarkdownBody({ body_markdown });
  assert.match(body_html, /<h1[^>]*>Weekly memo<\/h1>/);
  assert.match(body_html, /Escalations by ticker/);
  assert.match(body_html, /Source: escalation log, 2026-07-11/);
  assert.match(body_html, /<table[^>]*>[\s\S]*Col A/);
  assert.ok(body_text.includes("```chart"), "raw block preserved in the text fallback");
});
