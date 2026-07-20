// chart_render.js — Spec 70 Phase 1 + Phase 2 grammar. Renders a ```chart
// fenced block (already HTML-escaped by md_render.js's renderBody) into
// email-client-safe HTML: inline styles only, <table role="presentation">
// layout, no svg/JS/classes/external anything. Zero deps, matches
// md_render.js's idiom (const STYLE strings, small functions, never touch
// already-escaped text).
//
// Grammar: leading "key: value" lines are headers (type, title, source,
// series — P2 line/scatter and stacked bar — and shade, single-series bar
// only); remaining non-empty lines are data rows split on "|". type is
// one of bar|stat|delta|heat|waterfall (P1, CSS-native) or line|scatter (P2,
// rendered to a PNG inside the Worker by chart_png.js and referenced here as
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
const HAIRLINE = "#e8e7e0"; // softened (Spec 70 P4, light only) — email + viewer share this one constant
const DELTA_NEG = "#a02d2d";
const DELTA_POS = "#006300";
const BLUE = "#2a78d6";
// Chip tints (Spec 100): the SAME reserved tint backgrounds md_render.js's
// verdict chips use for these two semantics, plus a neutral warm tint for
// unsigned context. Tints, never new hues — the palette is ratified.
const TINT_POS = "#e9f2ea";
const TINT_NEG = "#f7e9e9";
const TINT_NEUTRAL = "#f4f3ef";

// Sequential blue ramp, light -> dark, 13 stops. Used by heat cells AND by
// the opt-in bar `shade: value` encoding (exported for tests). Contrast pass
// (Spec 70 P4, 2026-07-19): the top four stops were deepened so the ramp's
// max cell reads as rich navy rather than a mid-blue plateau — lightness
// stays strictly monotone (each stop darker than the last, same blue-family
// hue, ~213-217°) so the ramp is still a valid sequential encoding, just with
// more headroom at the dark end.
export const BLUE_RAMP = [
  "#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5",
  "#2a78d6", "#256abf", "#164e98", "#0f3c7b", "#0a2b5c", "#061b3c",
];

// Categorical series palette (premium editorial set, validated 2026-07-19):
// blue, green, magenta, amber, teal, sienna. FIXED SLOT ORDER — series i
// always gets slot i, never cycled, never reordered. Slot 0 (BLUE) is the
// house anchor, unchanged since the 2026-07-18 set; slots 1-5 were deepened
// toward editorial tones (validate_palette.js, light mode, surface #ffffff —
// ALL CHECKS PASS) to read as considered rather than default-chart-library
// bright. These are category colors exclusively: status stays on
// DELTA_POS/DELTA_NEG, and the four verdict-accent colors in md_render.js's
// VERDICT_COLORS are ALSO reserved — none of the six may ever collide with
// either reserved set (tested in chart_render.test.js).
export const SERIES_COLORS = [BLUE, "#1e7a46", "#b95784", "#c98500", "#0f8a6d", "#c2542a"];

// Chrome colors chart_png.js reuses so the PNG matches the P1 HTML charts.
export const CHART_INK = INK;
export const CHART_SECONDARY = SECONDARY;
export const CHART_MUTED = MUTED;
export const CHART_HAIRLINE = HAIRLINE;

// Duplicated from md_render.js's TABLE_STYLE/CELL_STYLE (own module, zero
// deps by design) so the degrade path stays visually identical to a normal
// markdown table (Spec 100: horizontal hairline rules, no border grid).
const TABLE_STYLE = "border-collapse:collapse;width:100%;margin:12px 0;font-size:14px";
const CELL_STYLE = "border-bottom:1px solid " + HAIRLINE + ";padding:8px 12px 8px 0;text-align:left;vertical-align:top";

const BAR_LABEL_STYLE = "font-weight:600;color:" + INK + ";font-size:13px;padding:3px 8px 3px 0;white-space:nowrap";
const BAR_VALUE_STYLE = "text-align:right;color:" + SECONDARY + ";font-size:13px;padding-left:8px;white-space:nowrap";
// Stacked-bar total: INK, not SECONDARY — the total is the one number the
// bar carries (label-visibility obligation for the sub-3:1 palette slots).
const STACK_TOTAL_STYLE = "text-align:right;color:" + INK + ";font-weight:600;font-size:13px;padding-left:8px;white-space:nowrap";
// Grouped-bar value: INK for the same label-visibility obligation — each bar
// wears a sub-3:1 palette slot and its value label is the one number it
// carries (no total exists in a comparison).
const GROUP_VALUE_STYLE = "text-align:right;color:" + INK + ";font-size:13px;padding-left:8px;white-space:nowrap";
const STAT_TILE_STYLE =
  "display:inline-block;vertical-align:top;box-sizing:border-box;max-width:100%;" +
  "padding:14px 18px 14px 16px;border:1px solid " + HAIRLINE + ";border-radius:10px;" +
  "margin:0 10px 10px 0";
// Stat tile figure contract (Spec 100, dataviz hero spec): uppercase muted
// micro-label, display-weight value, delta as a tinted chip below.
const STAT_LABEL_STYLE = "font-size:11px;font-weight:600;color:" + MUTED + ";text-transform:uppercase;letter-spacing:0.06em";
const STAT_VALUE_STYLE = "font-size:28px;font-weight:700;letter-spacing:-0.02em;color:" + INK + ";padding-top:4px";
// Heat cells separate with a 2px surface gap (dataviz spacer), not a border
// grid; header/row labels lose their boxes entirely.
const HEAT_HEADER_STYLE =
  "font-size:11px;font-weight:600;color:" + MUTED + ";text-transform:uppercase;letter-spacing:0.05em;padding:0 12px 6px 0";
const HEAT_ROWLABEL_STYLE = "font-weight:600;color:" + INK + ";padding:7px 12px 7px 0";
const HEAT_VALUE_BASE = "border:2px solid #ffffff;padding:7px 12px;text-align:right";
const DELTA_CELL_STYLE = "border-bottom:1px solid " + HAIRLINE + ";padding:8px 0";

const HEADER_LINE_RE = /^[a-z_]+:\s/;
const UP = "▲ "; // ▲
const DOWN = "▼ "; // ▼

function titleLine(title) {
  // Contrast pass (Spec 70 P4): 600 weight, still ink — a considered
  // semibold reads more editorial than the previous 700 bold; source lines
  // stay MUTED, untouched.
  return `<div style="font-size:14px;font-weight:600;letter-spacing:-0.01em;color:${INK};margin:18px 0 4px">${title}</div>`;
}

function sourceLine(source) {
  return `<div style="font-size:11px;color:${MUTED};margin:6px 0 16px">Source: ${source}</div>`;
}

// A tinted pill chip around signed context/delta text (Spec 100, the
// OpenRouter "+701.8%" treatment): direction rides both the arrow prefix and
// the reserved pos/neg colors; unsigned text gets the neutral warm tint.
function deltaChip(text, color, prefix) {
  const bg = color === DELTA_POS ? TINT_POS : color === DELTA_NEG ? TINT_NEG : TINT_NEUTRAL;
  return (
    `<span style="display:inline-block;font-size:12px;font-weight:600;color:${color};` +
    `background-color:${bg};border-radius:999px;padding:2px 9px;white-space:nowrap">${prefix}${text}</span>`
  );
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

// ── bar grammar (single, stacked, grouped, shade) ────────────────────────
//
// Row forms:
//   single:  Label | value            (or Label | value | display-override)
//   stacked: Label | v1 | v2 | ...    (2-6 value columns, all numeric >= 0)
//   grouped: Label | v1 | v2 | ...    (2-4 value columns, all numeric >= 0)
// An optional "series: NameA | NameB | ..." header names stacked segments.
// Disambiguation rule (deliberate, keeps the golden-pinned single behavior):
// a block is STACKED when the series header names >= 2 series, OR when every
// row uniformly carries >= 3 numeric value columns. Bare 2-value-column rows
// without a series header stay the legacy `Label | value | display` form —
// name the series to stack two columns.
//
// "mode: grouped" (explicit, wins over the stacked disambiguation) draws the
// series SIDE BY SIDE per category — a COMPARISON, where stacking (a
// COMPOSITION) would visually sum values that must not be summed (the
// two-hurdle-rates-per-ticker case). Grouped REQUIRES a series header naming
// 2-4 series; "shade" is single-series-only and degrades here too. The
// optional "unit: %" header (grouped only for now) is a short suffix appended
// to each rendered value label — row values stay plain numbers per the
// grammar's global rule. Any other "mode:" value degrades with a named
// reason; without a mode header behavior is byte-identical to before.
//
// "shade: value" (opt-in, SINGLE-series only) tints each bar from BLUE_RAMP
// by its value — min gets the lightest stop, max the darkest, monotone in
// between (same mapping renderHeat uses). Value labels stay INK text beside
// the bar; labels never wear the series color. shade on a stacked/multi-
// series block is a grammar violation and degrades with a named reason.
//
// parseBarChart is the ONE bar grammar — renderBar (email HTML) and
// report_view.js's pageChartRenderer (interactive SVG payload) both consume
// it, so the two surfaces can never drift. Returns {ok:false, reason} or
// {ok:true, bar} where bar is
//   { stacked:false, rows:[{label, value, display}], shadeColors:[hex]|null }
//   { stacked:true,  names:[..], rows:[{label, values:[..], total}] }
//   { grouped:true,  names:[..], unit:string|null, rows:[{label, values:[..]}] }
export const BAR_MAX_SERIES = 6;
export const BAR_GROUPED_MAX_SERIES = 4;

export function parseBarChart(headers, dataLines) {
  const rows = dataLines.map(splitRow);
  if (rows.some((cells) => cells.length < 2)) return { ok: false, reason: "bar row malformed" };

  let names = null;
  if (headers && headers.series !== undefined) {
    names = String(headers.series).split("|").map((s) => s.trim());
    if (names.some((s) => s === "")) return { ok: false, reason: "series names do not match data columns" };
  }

  const width = rows[0].length;
  const uniform = rows.every((cells) => cells.length === width);
  const allNumeric = () => rows.every((cells) => cells.slice(1).every((c) => parseNumber(c) !== null));

  // "mode: grouped" is explicit and wins; everything below this block is the
  // pre-mode grammar, untouched so mode-less blocks stay byte-identical.
  const mode = headers && headers.mode !== undefined ? String(headers.mode).trim().toLowerCase() : null;
  if (mode !== null && mode !== "grouped") return { ok: false, reason: "unknown bar mode" };
  if (mode === "grouped") {
    if (headers.shade !== undefined) return { ok: false, reason: "shade requires a single-series bar" };
    if (!names || names.length < 2) return { ok: false, reason: "grouped requires a series header" };
    if (names.length > BAR_GROUPED_MAX_SERIES) {
      return { ok: false, reason: `grouped bar exceeds ${BAR_GROUPED_MAX_SERIES} series` };
    }
    if (!uniform) return { ok: false, reason: "bar ragged rows (cell count mismatch)" };
    if (names.length !== width - 1) return { ok: false, reason: "series names do not match data columns" };
    const unit = headers.unit !== undefined ? String(headers.unit).trim() : null;
    const out = [];
    for (const cells of rows) {
      const values = cells.slice(1).map(parseNumber);
      if (values.some((v) => v === null || v < 0)) {
        return { ok: false, reason: "bar value not numeric or negative" };
      }
      out.push({ label: cells[0], values });
    }
    return { ok: true, bar: { grouped: true, names, unit, rows: out } };
  }

  let stacked;
  if (names && names.length >= 2) {
    if (!uniform) return { ok: false, reason: "bar ragged rows (cell count mismatch)" };
    if (names.length !== width - 1) return { ok: false, reason: "series names do not match data columns" };
    stacked = true;
  } else {
    if (names && uniform && names.length !== width - 1) {
      return { ok: false, reason: "series names do not match data columns" };
    }
    stacked = uniform && width >= 4 && allNumeric();
  }

  const shade = headers && headers.shade !== undefined ? String(headers.shade).trim().toLowerCase() : null;
  if (shade !== null && shade !== "value") return { ok: false, reason: "unknown shade mode" };

  if (stacked) {
    if (shade) return { ok: false, reason: "shade requires a single-series bar" };
    if (width - 1 > BAR_MAX_SERIES) return { ok: false, reason: `bar exceeds ${BAR_MAX_SERIES} series` };
    if (!names) names = Array.from({ length: width - 1 }, (_v, i) => `Series ${i + 1}`);
    const out = [];
    for (const cells of rows) {
      const values = cells.slice(1).map(parseNumber);
      if (values.some((v) => v === null || v < 0)) {
        return { ok: false, reason: "bar value not numeric or negative" };
      }
      const total = Number(values.reduce((a, b) => a + b, 0).toFixed(6));
      out.push({ label: cells[0], values, total });
    }
    return { ok: true, bar: { stacked: true, names, rows: out } };
  }

  if (rows.some((cells) => cells.length > 3)) return { ok: false, reason: "bar row malformed" };
  const values = rows.map((cells) => parseNumber(cells[1]));
  if (values.some((v) => v === null || v < 0)) {
    return { ok: false, reason: "bar value not numeric or negative" };
  }
  let shadeColors = null;
  if (shade) {
    const min = Math.min(...values);
    const max = Math.max(...values);
    shadeColors = values.map((v) => BLUE_RAMP[max === min ? 6 : Math.round(((v - min) / (max - min)) * 12)]);
  }
  const out = rows.map((cells, i) => ({
    label: cells[0],
    value: values[i],
    display: cells[2] !== undefined ? cells[2] : cells[1],
  }));
  return { ok: true, bar: { stacked: false, rows: out, shadeColors } };
}

// Legend row above multi-series bars: chip cell (attribute width + nbsp, the
// same Outlook idiom as the bars) + series name, one pair per series, chips
// colored by fixed slot so they always match the marks.
function legendRowHtml(names) {
  const cells = names
    .map(
      (name, s) =>
        `<td width="10" style="background-color:${SERIES_COLORS[s]};font-size:2px;line-height:10px">&nbsp;</td>` +
        `<td style="font-size:11px;font-weight:600;color:${SECONDARY};padding:0 14px 0 5px">${name}</td>`
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:2px 0 6px"><tr>${cells}</tr></table>`;
}

function renderBar(dataLines, headers) {
  const parsed = parseBarChart(headers, dataLines);
  if (!parsed.ok) return parsed;
  const bar = parsed.bar;

  if (bar.grouped) {
    // Every bar scales against the GLOBAL max across all series — grouped is
    // a comparison, so equal values must render equal lengths everywhere.
    const max = Math.max(...bar.rows.flatMap((r) => r.values));
    const unit = bar.unit || "";
    const rowsHtml = bar.rows
      .map((row, ri) => {
        // One <tr> per series; the first carries the category label, the rest
        // an invisible &nbsp; label cell (empty <td>s collapse in Outlook).
        // Same width-attribute + &nbsp; + font-size:2px idiom as the single
        // bar, at line-height:11px — 2-4 bars per category need the thinner
        // mark to read as one group.
        const trs = row.values
          .map((v, s) => {
            const pct = max === 0 || v === 0 ? 0 : Math.max(2, Math.round((v / max) * 92));
            const barCells =
              pct === 0
                ? "<td>&nbsp;</td>"
                : `<td width="${pct}%" style="background-color:${SERIES_COLORS[s]};font-size:2px;line-height:11px;border-radius:0 4px 4px 0">&nbsp;</td><td>&nbsp;</td>`;
            const labelCell =
              s === 0
                ? `<td style="${BAR_LABEL_STYLE}">${row.label}</td>`
                : `<td style="${BAR_LABEL_STYLE}">&nbsp;</td>`;
            return (
              "<tr>" +
              labelCell +
              '<td style="width:100%">' +
              `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>` +
              barCells +
              "</tr></table>" +
              "</td>" +
              `<td style="${GROUP_VALUE_STYLE}">${v.toLocaleString("en-US")}${unit}</td>` +
              "</tr>"
            );
          })
          .join("");
        // Spacer row BETWEEN categories so groups read as groups (&nbsp; at
        // font-size:2px — an empty spacer <tr> collapses in Outlook too).
        const spacer =
          ri < bar.rows.length - 1
            ? `<tr><td colspan="3" style="font-size:2px;line-height:6px">&nbsp;</td></tr>`
            : "";
        return trs + spacer;
      })
      .join("");
    return {
      ok: true,
      html:
        legendRowHtml(bar.names) +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${rowsHtml}</table>`,
    };
  }

  if (bar.stacked) {
    const maxTotal = Math.max(...bar.rows.map((r) => r.total));
    const rowsHtml = bar.rows
      .map((row) => {
        // Same Outlook idiom as the single bar (attribute widths + &nbsp; +
        // font-size:2px/line-height:14px), plus a 2px spacer cell between
        // segments — no background, so the page's white shows through as the
        // segment gap. Zero-value segments are skipped (no mark, no gap).
        const segs = row.values.map((v, s) => ({ v, s })).filter((seg) => seg.v > 0);
        let cells = "";
        segs.forEach((seg, k) => {
          if (k > 0) cells += `<td width="2" style="font-size:2px;line-height:14px">&nbsp;</td>`;
          const pct = Math.max(1, Math.round((seg.v / maxTotal) * 92));
          const radius = k === segs.length - 1 ? ";border-radius:0 4px 4px 0" : "";
          cells += `<td width="${pct}%" style="background-color:${SERIES_COLORS[seg.s]};font-size:2px;line-height:14px${radius}">&nbsp;</td>`;
        });
        const barCells = segs.length === 0 ? "<td>&nbsp;</td>" : cells + "<td>&nbsp;</td>";
        return (
          "<tr>" +
          `<td style="${BAR_LABEL_STYLE}">${row.label}</td>` +
          '<td style="width:100%">' +
          `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>` +
          barCells +
          "</tr></table>" +
          "</td>" +
          // ONE total per bar, at the end, in INK — never a number on every
          // segment (the legend + tooltips carry per-segment values). Grouped
          // digits here only: the stacked grammar has no display-override
          // cell, so token-scale totals would otherwise render as 1450601.
          `<td style="${STACK_TOTAL_STYLE}">${row.total.toLocaleString("en-US")}</td>` +
          "</tr>"
        );
      })
      .join("");
    return {
      ok: true,
      html:
        legendRowHtml(bar.names) +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${rowsHtml}</table>`,
    };
  }

  const max = Math.max(...bar.rows.map((r) => r.value));
  const rowsHtml = bar.rows
    .map((row, idx) => {
      const pct = max === 0 || row.value === 0 ? 0 : Math.max(2, Math.round((row.value / max) * 92));
      const fill = bar.shadeColors ? bar.shadeColors[idx] : BLUE;
      // Email-kit idiom, deliberately: &nbsp; in every cell (empty <td>s
      // collapse to zero height in Outlook and some Gmail modes; font-size:2px
      // keeps the nbsp invisible while line-height:14px sets the bar height),
      // and the HTML width ATTRIBUTE on the bar cell (Outlook's Word engine
      // honors attributes, not td CSS widths).
      const barCells =
        pct === 0
          ? "<td>&nbsp;</td>"
          : `<td width="${pct}%" style="background-color:${fill};font-size:2px;line-height:14px;border-radius:0 4px 4px 0">&nbsp;</td><td>&nbsp;</td>`;
      return (
        "<tr>" +
        `<td style="${BAR_LABEL_STYLE}">${row.label}</td>` +
        '<td style="width:100%">' +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>` +
        barCells +
        "</tr></table>" +
        "</td>" +
        `<td style="${BAR_VALUE_STYLE}">${row.display}</td>` +
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
  // Mobile-first (Spec 100): tiles are inline-block divs, NOT a single-row
  // table — a rigid row wider than a phone viewport makes Gmail iOS scale the
  // whole email down (the 7/5 tiny-text hazard class; probe-proven 2026-07-20
  // at 445px on a 390px screen). Inline-block wraps to two/one columns on
  // narrow screens; Outlook's Word engine stacks them vertically — an
  // acceptable degrade (stacked, never clipped).
  const tiles = rows.map(([label, value, context]) => {
    let contextHtml = "";
    if (context !== undefined && context !== "") {
      const { color, prefix } = signDecoration(context, SECONDARY);
      contextHtml = `<div style="padding-top:6px">${deltaChip(context, color, prefix)}</div>`;
    }
    return (
      `<div style="${STAT_TILE_STYLE}">` +
      `<div style="${STAT_LABEL_STYLE}">${label}</div>` +
      `<div style="${STAT_VALUE_STYLE}">${value}</div>` +
      contextHtml +
      "</div>"
    );
  });
  return {
    ok: true,
    html: `<div style="margin:2px 0">${tiles.join("")}</div>`,
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
        `<td style="text-align:right;color:${SECONDARY};padding-left:12px;${DELTA_CELL_STYLE}">${value}</td>` +
        `<td style="text-align:right;padding-left:12px;${DELTA_CELL_STYLE}">${deltaChip(delta, color, prefix)}</td>` +
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
  const headerHtml = headerRow
    .map((c, i) => `<td style="${HEAT_HEADER_STYLE}${i > 0 ? ";text-align:right" : ""}">${c}</td>`)
    .join("");
  const bodyHtml = bodyRows
    .map((cells) => {
      const rowLabel = `<td style="${HEAT_ROWLABEL_STYLE}">${cells[0]}</td>`;
      const valueCells = cells
        .slice(1)
        .map((c) => {
          const v = parseNumber(c);
          const idx = max === min ? 6 : Math.round(((v - min) / (max - min)) * 12);
          const textColor = idx >= 8 ? "#ffffff" : INK;
          return `<td style="${HEAT_VALUE_BASE};background-color:${BLUE_RAMP[idx]};color:${textColor}">${c}</td>`;
        })
        .join("");
      return `<tr>${rowLabel}${valueCells}</tr>`;
    })
    .join("");
  return { ok: true, html: `<table style="border-collapse:collapse;font-size:13px"><tr>${headerHtml}</tr>${bodyHtml}</table>` };
}

// ── waterfall grammar (cashflow bridge) ──────────────────────────────────
//
// Row forms:
//   delta:    Label | value [| display]        -- floats on the running baseline
//   subtotal: = Label | value [| display]       -- drawn from zero; "= " prefix
//                                                   is stripped for display
// A subtotal's value is the absolute level (may be negative) and resets the
// running baseline; a delta's value is signed and moves the baseline by that
// amount. base/top on each row are the bar's start/end level (NOT sorted —
// top can be below base for a negative delta), so the renderer can tell a
// rising step from a falling one; lo/hi are the global range across every
// bar's extent, always including 0 (subtotals draw from there).
//
// parseWaterfallChart is the ONE waterfall grammar — renderWaterfall (email
// HTML) and report_view.js's pageChartRenderer (interactive SVG payload)
// both consume it, so the two surfaces can never drift.
function formatGrouped(v) {
  return v.toLocaleString("en-US");
}

function waterfallDefaultDisplay(kind, value) {
  if (kind === "total") return formatGrouped(value);
  return (value >= 0 ? "+" : "-") + formatGrouped(Math.abs(value));
}

export function parseWaterfallChart(headers, dataLines) {
  if (dataLines.length < 2) return { ok: false, reason: "waterfall needs at least 2 rows" };
  const rows = [];
  let baseline = 0;
  let lo = 0;
  let hi = 0;
  for (const line of dataLines) {
    const cells = splitRow(line);
    let label = cells[0];
    let kind = "delta";
    if (label.startsWith("= ")) {
      kind = "total";
      label = label.slice(2);
    }
    const value = parseNumber(cells[1]);
    if (value === null) return { ok: false, reason: "waterfall value not numeric" };
    let base;
    let top;
    if (kind === "total") {
      base = 0;
      top = value;
      baseline = value;
    } else {
      base = baseline;
      top = baseline + value;
      baseline = top;
    }
    const display = cells[2] !== undefined ? cells[2] : waterfallDefaultDisplay(kind, value);
    rows.push({ label, value, display, kind, base, top });
    lo = Math.min(lo, base, top);
    hi = Math.max(hi, base, top);
  }
  return { ok: true, rows, lo, hi };
}

// Email HTML: same Outlook-survival idiom as renderBar (attribute widths,
// &nbsp; in every td, font-size:2px/line-height:14px for an invisible bar
// height), extended with a leading transparent spacer td so a delta bar can
// float between its start and end level instead of always starting at the
// left edge. Scale the full [lo, hi] range (always including 0) to ~92% max,
// same as the other bar types; Math.max(1, ...) keeps every bar visible.
function renderWaterfall(dataLines, headers) {
  const parsed = parseWaterfallChart(headers, dataLines);
  if (!parsed.ok) return parsed;
  const { rows, lo, hi } = parsed;
  const range = Math.max(1, hi - lo);
  const rowsHtml = rows
    .map((row) => {
      const barLow = Math.min(row.base, row.top);
      const barHigh = Math.max(row.base, row.top);
      const spacerPct = Math.max(0, Math.round(((barLow - lo) / range) * 92));
      const barPct = Math.max(1, Math.round(((barHigh - barLow) / range) * 92));
      const fill = row.kind === "total" ? BLUE : row.value >= 0 ? DELTA_POS : DELTA_NEG;
      const spacerCell =
        spacerPct === 0 ? "" : `<td width="${spacerPct}%" style="font-size:2px;line-height:14px">&nbsp;</td>`;
      const barCells =
        spacerCell +
        `<td width="${barPct}%" style="background-color:${fill};font-size:2px;line-height:14px;border-radius:4px">&nbsp;</td>` +
        "<td>&nbsp;</td>";
      return (
        "<tr>" +
        `<td style="${BAR_LABEL_STYLE}">${row.label}</td>` +
        '<td style="width:100%">' +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse"><tr>${barCells}</tr></table>` +
        "</td>" +
        `<td style="${BAR_VALUE_STYLE}">${row.display}</td>` +
        "</tr>"
      );
    })
    .join("");
  return {
    ok: true,
    html: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse">${rowsHtml}</table>`,
  };
}

const TYPE_RENDERERS = { bar: renderBar, stat: renderStat, delta: renderDelta, heat: renderHeat, waterfall: renderWaterfall };

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
    // Mobile-first (Spec 100): the legend is HTML beside the image, not
    // pixels inside it — real text stays legible at any width while the
    // downscaled PNG carries shape (ticks live full-size on the /r/ twin).
    if (parsed.chart.series.length > 1) parts.push(legendRowHtml(parsed.chart.seriesNames));
    parts.push(renderPngImage(headers, image));
    parts.push(sourceLine(headers.source));
    return parts.join("");
  }

  if (!TYPE_RENDERERS[type]) return degrade(headers, dataLines, "unknown chart type");
  if (dataLines.length === 0) return degrade(headers, dataLines, "no data rows");

  const result = TYPE_RENDERERS[type](dataLines, headers);
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
