// chart_render.js — Spec 70 Phase 1 + Phase 2 grammar. Renders a ```chart
// fenced block (already HTML-escaped by md_render.js's renderBody) into
// email-client-safe HTML: inline styles only, <table role="presentation">
// layout, no svg/JS/classes/external anything. Zero deps, matches
// md_render.js's idiom (const STYLE strings, small functions, never touch
// already-escaped text).
//
// Grammar: leading "key: value" lines are headers (type, title, source, and —
// P2 — series); remaining non-empty lines are data rows split on "|". type is
// one of bar|stat|delta|heat (P1, CSS-native) or line|scatter (P2, rendered
// to a PNG inside the Worker by chart_png.js and referenced here as
// <img src="cid:...">). source is REQUIRED (Spec 70's reliability line).
//
// P2 split of responsibilities: this module owns the grammar (parsePngChart
// validates line/scatter rows) and the HTML; chart_png.js owns pixels. When
// the send path has rendered a PNG it passes {cid,width,height} as the second
// renderChart argument and the block becomes an inline image; without one
// (PNG render failed, or a caller renders HTML outside the send path) the
// block degrades to the plain data table with a named gap — never a broken
// <img>, never a throw.

// ── shared chrome / palette ─────────────────────────────────────────────
const INK = "#0b0b0b";
const SECONDARY = "#52514e";
const MUTED = "#898781";
const HAIRLINE = "#e1e0d9";
const HEADER_BG = "#f9f9f7";
const DELTA_NEG = "#a02d2d";
const DELTA_POS = "#006300";
const BLUE = "#2a78d6";

// Sequential blue ramp, light -> dark, 13 stops.
const HEAT_RAMP = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
  "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b",
];

// P2 series palette for line/scatter PNGs. Email-kit doctrine: ONE hue for
// magnitude marks — more series get labeled, never rainbowed — so extra
// series are widely-spaced stops of the same blue ramp above.
export const SERIES_COLORS = [BLUE, "#0d366b", "#86b6ef", "#184f95"];

// Chrome colors chart_png.js reuses so the PNG matches the P1 HTML charts.
export const CHART_INK = INK;
export const CHART_SECONDARY = SECONDARY;
export const CHART_MUTED = MUTED;
export const CHART_HAIRLINE = HAIRLINE;

// Duplicated from md_render.js's TABLE_STYLE/CELL_STYLE (own module, zero
// deps by design) so the degrade path stays visually identical to a normal
// markdown table.
const TABLE_STYLE = "border-collapse:collapse;width:100%;margin:10px 0;font-size:14px";
const CELL_STYLE = "border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top";

const BAR_LABEL_STYLE = "font-weight:600;color:" + INK + ";font-size:13px;padding:3px 8px 3px 0;white-space:nowrap";
const BAR_VALUE_STYLE = "text-align:right;color:" + SECONDARY + ";font-size:13px;padding-left:8px;white-space:nowrap";
const STAT_TILE_STYLE = "padding:12px 14px;border:1px solid " + HAIRLINE + ";border-radius:8px;vertical-align:top";
const HEAT_HEADER_STYLE = "background-color:" + HEADER_BG + ";font-weight:700;color:" + INK + ";border:1px solid " + HAIRLINE + ";padding:6px 10px";
const HEAT_ROWLABEL_STYLE = "font-weight:600;color:" + INK + ";border:1px solid " + HAIRLINE + ";padding:6px 10px";
const HEAT_VALUE_BASE = "border:1px solid " + HAIRLINE + ";padding:6px 10px;text-align:right";
const DELTA_CELL_STYLE = "border-bottom:1px solid " + HAIRLINE + ";padding:6px 10px";

const HEADER_LINE_RE = /^[a-z_]+:\s/;
const UP = "▲ "; // ▲
const DOWN = "▼ "; // ▼

function titleLine(title) {
  return `<div style="font-size:14px;font-weight:700;color:${INK};margin:16px 0 2px">${title}</div>`;
}

function sourceLine(source) {
  return `<div style="font-size:12px;color:${MUTED};margin:4px 0 12px">Source: ${source}</div>`;
}

function splitRow(line) {
  return line.split("|").map((c) => c.trim());
}

// Numeric check against already-escaped text — escaping never touches digits,
// signs, or dots, so this is safe to run directly on the escaped cell.
function parseNumber(s) {
  if (typeof s !== "string" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return parseFloat(s);
}

// Leading-sign decoration shared by stat context and delta cells: "+..." ->
// green with an up arrow, "-..."/"−..." -> red with a down arrow, kept
// text unchanged (the sign stays in the visible string).
function signDecoration(text, defaultColor) {
  if (text.startsWith("+")) return { color: DELTA_POS, prefix: UP };
  if (text.startsWith("-") || text.startsWith("−")) return { color: DELTA_NEG, prefix: DOWN };
  return { color: defaultColor, prefix: "" };
}

// Splits header lines ("type: bar", "title: ...", "source: ...") from data
// rows. Headers are a strictly leading run; the first non-matching line ends
// the header section, and every non-empty line from there on is a data row.
// Exported for chart_png.js, which parses the same grammar from the RAW
// markdown (escaping never changes header/row structure).
export function parseChart(escapedLines) {
  const n = escapedLines.length;
  let i = 0;
  const headers = {};
  while (i < n && HEADER_LINE_RE.test(escapedLines[i].trim())) {
    const line = escapedLines[i].trim();
    const idx = line.indexOf(":");
    headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    i += 1;
  }
  const dataLines = [];
  for (; i < n; i += 1) {
    const t = escapedLines[i].trim();
    if (t !== "") dataLines.push(t);
  }
  return { headers, dataLines };
}

// ── type renderers: each returns {ok:true, html} or {ok:false, reason} ───

function renderBar(dataLines) {
  const rows = dataLines.map(splitRow);
  if (rows.some((cells) => cells.length < 2 || cells.length > 3)) {
    return { ok: false, reason: "bar row malformed" };
  }
  const values = rows.map((cells) => parseNumber(cells[1]));
  if (values.some((v) => v === null || v < 0)) {
    return { ok: false, reason: "bar value not numeric or negative" };
  }
  const max = Math.max(...values);
  const rowsHtml = rows
    .map((cells, idx) => {
      const value = values[idx];
      const display = cells[2] !== undefined ? cells[2] : cells[1];
      const pct = max === 0 || value === 0 ? 0 : Math.max(2, Math.round((value / max) * 92));
      // Email-kit idiom, deliberately: &nbsp; in every cell (empty <td>s
      // collapse to zero height in Outlook and some Gmail modes; font-size:2px
      // keeps the nbsp invisible while line-height:16px sets the bar height),
      // and the HTML width ATTRIBUTE on the bar cell (Outlook's Word engine
      // honors attributes, not td CSS widths).
      const barCells =
        pct === 0
          ? "<td>&nbsp;</td>"
          : `<td width="${pct}%" style="background-color:${BLUE};font-size:2px;line-height:16px;border-radius:0 4px 4px 0">&nbsp;</td><td>&nbsp;</td>`;
      return (
        "<tr>" +
        `<td style="${BAR_LABEL_STYLE}">${cells[0]}</td>` +
        '<td style="width:100%">' +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>` +
        barCells +
        "</tr></table>" +
        "</td>" +
        `<td style="${BAR_VALUE_STYLE}">${display}</td>` +
        "</tr>"
      );
    })
    .join("");
  return {
    ok: true,
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${rowsHtml}</table>`,
  };
}

function renderStat(dataLines) {
  if (dataLines.length < 2 || dataLines.length > 4) {
    return { ok: false, reason: "stat row count out of range (2-4)" };
  }
  const rows = dataLines.map(splitRow);
  if (rows.some((cells) => cells.length < 2 || cells.length > 3)) {
    return { ok: false, reason: "stat row malformed" };
  }
  const tiles = rows.map(([label, value, context]) => {
    let contextHtml = "";
    if (context !== undefined && context !== "") {
      const { color, prefix } = signDecoration(context, MUTED);
      contextHtml = `<div style="font-size:12px;color:${color}">${prefix}${context}</div>`;
    }
    return (
      `<td style="${STAT_TILE_STYLE}">` +
      `<div style="font-size:12px;color:${SECONDARY}">${label}</div>` +
      `<div style="font-size:22px;font-weight:600;color:${INK};padding-top:2px">${value}</div>` +
      contextHtml +
      "</td>"
    );
  });
  // Kit idiom: attribute width + &nbsp; so the spacer survives Outlook.
  const spacer = '<td width="12" style="font-size:0">&nbsp;</td>';
  return {
    ok: true,
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse"><tr>${tiles.join(spacer)}</tr></table>`,
  };
}

function renderDelta(dataLines) {
  const rows = dataLines.map(splitRow);
  if (rows.some((cells) => cells.length !== 3)) {
    return { ok: false, reason: "delta row malformed" };
  }
  const rowsHtml = rows
    .map(([label, value, delta]) => {
      const { color, prefix } = signDecoration(delta, SECONDARY);
      return (
        "<tr>" +
        `<td style="color:${INK};${DELTA_CELL_STYLE}">${label}</td>` +
        `<td style="text-align:right;color:${SECONDARY};${DELTA_CELL_STYLE}">${value}</td>` +
        `<td style="text-align:right;font-weight:700;color:${color};${DELTA_CELL_STYLE}">${prefix}${delta}</td>` +
        "</tr>"
      );
    })
    .join("");
  return { ok: true, html: `<table style="border-collapse:collapse;width:100%;font-size:13px">${rowsHtml}</table>` };
}

function renderHeat(dataLines) {
  if (dataLines.length < 2) {
    return { ok: false, reason: "heat needs a header row and at least one data row" };
  }
  const rows = dataLines.map(splitRow);
  const headerRow = rows[0];
  const bodyRows = rows.slice(1);
  const width = headerRow.length;
  const values = [];
  for (const cells of bodyRows) {
    if (cells.length !== width) return { ok: false, reason: "heat ragged rows (cell count mismatch)" };
    for (let i = 1; i < cells.length; i += 1) {
      const v = parseNumber(cells[i]);
      if (v === null) return { ok: false, reason: "heat value not numeric" };
      values.push(v);
    }
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const headerHtml = headerRow.map((c) => `<td style="${HEAT_HEADER_STYLE}">${c}</td>`).join("");
  const bodyHtml = bodyRows
    .map((cells) => {
      const rowLabel = `<td style="${HEAT_ROWLABEL_STYLE}">${cells[0]}</td>`;
      const valueCells = cells
        .slice(1)
        .map((c) => {
          const v = parseNumber(c);
          const idx = max === min ? 6 : Math.round(((v - min) / (max - min)) * 12);
          const textColor = idx >= 8 ? "#ffffff" : INK;
          return `<td style="${HEAT_VALUE_BASE};background-color:${HEAT_RAMP[idx]};color:${textColor}">${c}</td>`;
        })
        .join("");
      return `<tr>${rowLabel}${valueCells}</tr>`;
    })
    .join("");
  return { ok: true, html: `<table style="border-collapse:collapse;font-size:13px"><tr>${headerHtml}</tr>${bodyHtml}</table>` };
}

const TYPE_RENDERERS = { bar: renderBar, stat: renderStat, delta: renderDelta, heat: renderHeat };

// ── P2: line/scatter (PNG-rendered) grammar ─────────────────────────────
//
// Row format (Spec 70 P2): x | y  or  x | series1 | series2 ...
//   line:    x is a category label (any text); every series value numeric.
//   scatter: x must ALSO be numeric (it's a position, not a label).
// Optional "series: Name A | Name B" header names the series; when present
// its count must match the data columns. Limits keep the PNG legible and the
// render cheap: 2..200 rows, 1..4 series.

export const PNG_CHART_TYPES = ["line", "scatter"];
const PNG_MAX_SERIES = 4;
const PNG_MAX_ROWS = 200;

// Validates a line/scatter block and extracts plot-ready data. Works on raw
// OR escaped lines (numbers are never touched by HTML escaping; labels pass
// through untouched either way). Returns {ok:true, chart} or {ok:false, reason}.
export function parsePngChart(headers, dataLines) {
  const type = String(headers.type || "").toLowerCase();
  if (!PNG_CHART_TYPES.includes(type)) return { ok: false, reason: "unknown chart type" };
  if (dataLines.length < 2) return { ok: false, reason: `${type} needs at least 2 data rows` };
  if (dataLines.length > PNG_MAX_ROWS) return { ok: false, reason: `${type} exceeds ${PNG_MAX_ROWS} rows` };
  const rows = dataLines.map(splitRow);
  const width = rows[0].length;
  if (width < 2) return { ok: false, reason: `${type} rows need x | value` };
  if (rows.some((r) => r.length !== width)) return { ok: false, reason: `${type} ragged rows (cell count mismatch)` };
  const seriesCount = width - 1;
  if (seriesCount > PNG_MAX_SERIES) return { ok: false, reason: `${type} exceeds ${PNG_MAX_SERIES} series` };

  let seriesNames;
  if (headers.series) {
    seriesNames = headers.series.split("|").map((s) => s.trim());
    if (seriesNames.length !== seriesCount || seriesNames.some((s) => s === "")) {
      return { ok: false, reason: "series names do not match data columns" };
    }
  } else {
    seriesNames = Array.from({ length: seriesCount }, (_v, i) => `Series ${i + 1}`);
  }

  const xLabels = rows.map((r) => r[0]);
  let xValues = null;
  if (type === "scatter") {
    xValues = xLabels.map(parseNumber);
    if (xValues.some((v) => v === null)) return { ok: false, reason: "scatter x not numeric" };
  }
  const series = [];
  for (let s = 0; s < seriesCount; s += 1) {
    const values = rows.map((r) => parseNumber(r[s + 1]));
    if (values.some((v) => v === null)) return { ok: false, reason: `${type} value not numeric` };
    series.push(values);
  }
  return { ok: true, chart: { type, xLabels, xValues, series, seriesNames } };
}

// The HTML side of a PNG chart: title + <img src="cid:..."> + source. width/
// height are display px ATTRIBUTES (Outlook's Word engine ignores CSS sizing
// on images); alt names the chart so image-blocking clients still say what
// the attachment is. The style keeps it responsive elsewhere.
function renderPngImage(headers, image) {
  const alt = headers.title || `${String(headers.type || "").toLowerCase()} chart`;
  return (
    `<img src="cid:${image.cid}" width="${image.width}" height="${image.height}" alt="${alt}" ` +
    `style="display:block;width:100%;max-width:${image.width}px;height:auto;border:0">`
  );
}

// Data-row fallback: the same plain-table idiom md_render.js's renderTable
// uses, so a degraded chart still reads cleanly in any client.
function degradeTable(dataLines) {
  if (dataLines.length === 0) return "";
  const rowsHtml = dataLines
    .map((line) => {
      const cellsHtml = splitRow(line)
        .map((c) => `<td style="${CELL_STYLE}">${c}</td>`)
        .join("");
      return `<tr>${cellsHtml}</tr>`;
    })
    .join("");
  return `<table style="${TABLE_STYLE}">${rowsHtml}</table>`;
}

function degrade(headers, dataLines, reason) {
  const caption = `<div style="font-size:12px;color:${MUTED};margin:12px 0 2px">Chart degraded (${reason}) — data shown as table.</div>`;
  const table = degradeTable(dataLines);
  const source = headers && headers.source ? sourceLine(headers.source) : "";
  return caption + table + source;
}

function renderChartUnsafe(escapedLines, image) {
  const { headers, dataLines } = parseChart(escapedLines);
  const type = (headers.type || "").toLowerCase();

  if (!headers.source) return degrade(headers, dataLines, "missing source");

  // P2 PNG types: validate with the same grammar the PNG pipeline uses, then
  // either reference the rendered image or degrade to the table (named gap).
  if (PNG_CHART_TYPES.includes(type)) {
    const parsed = parsePngChart(headers, dataLines);
    if (!parsed.ok) return degrade(headers, dataLines, parsed.reason);
    if (!image || !image.cid) return degrade(headers, dataLines, "chart image not rendered");
    const parts = [];
    if (headers.title) parts.push(titleLine(headers.title));
    parts.push(renderPngImage(headers, image));
    parts.push(sourceLine(headers.source));
    return parts.join("");
  }

  if (!TYPE_RENDERERS[type]) return degrade(headers, dataLines, "unknown chart type");
  if (dataLines.length === 0) return degrade(headers, dataLines, "no data rows");

  const result = TYPE_RENDERERS[type](dataLines);
  if (!result.ok) return degrade(headers, dataLines, result.reason);

  const parts = [];
  if (headers.title) parts.push(titleLine(headers.title));
  parts.push(result.html);
  parts.push(sourceLine(headers.source));
  return parts.join("");
}

// Entry point. escapedLines are the already-HTML-escaped lines collected
// between a ```chart fence's open/close by md_render.js's renderBody — never
// unescape them. `image` ({cid,width,height}, optional) is the send path's
// proof that a PNG for THIS block is attached (P2 line/scatter only; P1
// types ignore it — they stay CSS-native). Never throws: any unexpected
// failure degrades with reason "render error" by construction.
export function renderChart(escapedLines, image) {
  try {
    return renderChartUnsafe(escapedLines, image);
  } catch (err) {
    return degrade({}, [], "render error");
  }
}
