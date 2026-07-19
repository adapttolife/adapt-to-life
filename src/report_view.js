// report_view.js — Spec 70 Phase 3, first rung: the report viewer.
//
// Every agent report email is archived verbatim (messages.body_markdown in D1,
// the same store apiRead serves). This module gives each such message a
// permanent interactive twin: GET /r/<token> renders the SAME markdown +
// ```chart blocks as a clean leaf web page — bar/line/scatter become
// interactive SVG with hover tooltips, stat/delta/heat keep their P1 HTML.
//
// Capability URL: token = base64url(`${message_id}.${hmac_sha256_hex(secret, message_id)}`).
// The secret is env.REPORT_LINK_SECRET (a Worker secret; tests inject it on the
// env object). Possession of the link IS the authorization — there is no
// index, no directory, no session. ROTATING THE SECRET REVOKES EVERY LINK EVER
// ISSUED (old tokens stop verifying); that is the kill switch, by design.
// Every failure — malformed token, bad signature, unknown id, message without
// body_markdown, secret unset — is the same 404. Never a distinguishable error.
//
// Zero external requests by construction: the page inlines its CSS and the
// small hand-rolled chart script (no CDN, no fonts fetch, no analytics), and
// CSP pins that. Richer renderers (ECharts-class) are a later increment —
// the repo's zero-dep philosophy wins the v1 rung.

import { renderMarkdown } from "./md_render.js";
import {
  renderChart,
  parseChart,
  parseBarChart,
  parsePngChart,
  PNG_CHART_TYPES,
  SERIES_COLORS,
  CHART_INK,
  CHART_SECONDARY,
  CHART_MUTED,
  CHART_HAIRLINE,
} from "./chart_render.js";
import { extractChartBlocks } from "./chart_png.js";

// agent_mail.js pulls reportFooterHtml from here for the send/reply footer —
// one-directional, not circular (the ask-box that used to import ringBell
// back from agent_mail.js was retired; see the reply-line note below).

// ── token: mint + verify ─────────────────────────────────────────────────

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64urlEncode(s) {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s) {
  let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4;
  if (pad === 1) throw new Error("bad base64url");
  if (pad) t += "=".repeat(4 - pad);
  return atob(t);
}

// Constant-time comparison of two hex strings. XOR-accumulates every character
// so a mismatch at position 0 costs the same as one at position 63 — an
// attacker timing responses learns nothing about how much of a forged
// signature matched. Length mismatch returns false immediately (length is not
// a secret: every valid signature here is 64 hex chars).
export function timingSafeEqualHex(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa.length !== sb.length) return false;
  let diff = 0;
  for (let i = 0; i < sa.length; i += 1) {
    diff |= sa.charCodeAt(i) ^ sb.charCodeAt(i);
  }
  return diff === 0;
}

export async function makeReportToken(secret, messageId) {
  const sig = await hmacSha256Hex(secret, messageId);
  return b64urlEncode(`${messageId}.${sig}`);
}

// Returns the verified message id, or null on ANY failure (missing secret,
// undecodable token, malformed payload, signature mismatch).
export async function verifyReportToken(secret, token) {
  if (!secret || !token) return null;
  let decoded;
  try {
    decoded = b64urlDecode(token);
  } catch {
    return null;
  }
  // Namespace guard: a library token ("lib:<email>.<sig>") shares the same
  // hmac/base64url primitives (see makeLibraryToken below) but must never
  // verify HERE — a real message id is always a UUID, never "lib:"-prefixed.
  if (decoded.startsWith("lib:")) return null;
  const dot = decoded.lastIndexOf(".");
  if (dot <= 0) return null;
  const messageId = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = await hmacSha256Hex(secret, messageId);
  if (!timingSafeEqualHex(expected, sig)) return null;
  return messageId;
}

// Library token: base64url(`lib:${email}.${hmac_sha256_hex(secret, "lib:"+email)}`) —
// a "lib:" namespace on the SAME hmac/base64url primitives the report token
// uses (not the same verifier, so a report token can never be replayed as a
// library token or vice versa: the payload prefix is part of what's signed).
export async function makeLibraryToken(secret, email) {
  const addr = String(email || "").toLowerCase().trim();
  const payload = `lib:${addr}`;
  const sig = await hmacSha256Hex(secret, payload);
  return b64urlEncode(`${payload}.${sig}`);
}

// Returns the verified recipient email, or null on ANY failure — same
// indistinguishable-404 contract as verifyReportToken.
export async function verifyLibraryToken(secret, token) {
  if (!secret || !token) return null;
  let decoded;
  try {
    decoded = b64urlDecode(token);
  } catch {
    return null;
  }
  if (!decoded.startsWith("lib:")) return null;
  const dot = decoded.lastIndexOf(".");
  if (dot <= 4) return null; // "lib:" is 4 chars — payload must carry an address before the dot
  const payload = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = await hmacSha256Hex(secret, payload);
  if (!timingSafeEqualHex(expected, sig)) return null;
  return payload.slice(4);
}

// The absolute /lib/ permalink for a recipient's report library.
export async function libraryLink(env, email) {
  const token = await makeLibraryToken(env.REPORT_LINK_SECRET, email);
  const base = String(env.REPORT_LINK_BASE || "https://adapttolife.org").replace(/\/+$/, "");
  return `${base}/lib/${token}`;
}

// ── email footer integration ─────────────────────────────────────────────

// True when the markdown contains at least one ```chart fenced block (same
// fence walk the PNG pipeline uses — info string exactly "chart").
export function hasChartBlock(markdown) {
  if (markdown == null || !String(markdown).includes("```chart")) return false;
  return extractChartBlocks(markdown).length > 0;
}

// The absolute permalink for a message id. Base defaults to the apex custom
// domain this Worker serves; env.REPORT_LINK_BASE overrides (staging).
export async function reportLink(env, messageId) {
  const token = await makeReportToken(env.REPORT_LINK_SECRET, messageId);
  const base = String(env.REPORT_LINK_BASE || "https://adapttolife.org").replace(/\/+$/, "");
  return `${base}/r/${token}`;
}

// Footer HTML appended to the outgoing email — markdown register ONLY, and
// only when the message actually carries a chart AND the secret exists.
// Returns "" in every other case and NEVER throws: a footer is garnish, a
// failed send over garnish would be the real bug. `body` is the raw API
// request body ({body_markdown, body_html, ...}); `recipient` is the `to`
// address of THIS send — the footer's report-library link is minted for
// that recipient specifically (Spec 70 P3, Feature 1). A missing/unparseable
// recipient degrades to the single "View interactive" link, same as before.
export async function reportFooterHtml(env, body, messageId, recipient) {
  try {
    const b = body || {};
    if (!env.REPORT_LINK_SECRET) return "";
    if (b.body_markdown == null || b.body_html != null) return ""; // explicit-HTML register: untouched (Spec 53)
    if (!hasChartBlock(b.body_markdown)) return "";
    const href = await reportLink(env, messageId);
    let libHtml = "";
    const addr = String(recipient || "").toLowerCase().trim();
    if (addr) {
      const libHref = await libraryLink(env, addr);
      libHtml =
        ` &middot; Report library &#8594; <a href="${libHref}" style="color:#0b57d0">${libHref}</a>`;
    }
    return (
      `<div style="font-size:12px;color:${CHART_MUTED};margin:14px 0 0">` +
      `View interactive &#8594; <a href="${href}" style="color:#0b57d0">${href}</a>${libHtml}</div>`
    );
  } catch (err) {
    console.error("report footer failed (sending without it):", err && err.message);
    return "";
  }
}

// ── page chart rendering ─────────────────────────────────────────────────

// md_render escapes fence lines before handing them over; the interactive
// payload wants the original text (labels land in the DOM via textContent,
// which would show "&amp;" literally). This inverts exactly the five
// entities md_render.js's escapeHtml produces — nothing else.
function unescapeHtml(s) {
  return String(s)
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Bar payload for the interactive runtime — parseBarChart (the ONE bar
// grammar, shared with the email renderer) decides single vs stacked vs
// shade; anything it rejects falls back to renderChart's degrade table.
//   single:  { type:"bar", rows:[[label, value, display]], shades?:[hex] }
//   stacked: { type:"bar", stacked:true, names:[..], rows:[[label,[v..],total]] }
function barPayload(headers, dataLines) {
  if (dataLines.length === 0) return null;
  const parsed = parseBarChart(headers, dataLines);
  if (!parsed.ok) return null;
  const bar = parsed.bar;
  if (bar.stacked) {
    return { type: "bar", stacked: true, names: bar.names, rows: bar.rows.map((r) => [r.label, r.values, r.total]) };
  }
  const payload = { type: "bar", rows: bar.rows.map((r) => [r.label, r.value, r.display]) };
  if (bar.shadeColors) payload.shades = bar.shadeColors;
  return payload;
}

// The chartRenderer hook for renderMarkdown on the viewer page. bar/line/
// scatter become an .ichart host div carrying its data as embedded JSON (the
// inline runtime script draws the SVG + tooltips); everything else — stat/
// delta/heat, unknown types, invalid data, missing source — falls through to
// renderChart's P1 HTML / degrade table, so the page never shows less than
// the email did.
function pageChartRenderer(escapedLines) {
  try {
    const rawLines = escapedLines.map(unescapeHtml);
    const { headers, dataLines } = parseChart(rawLines);
    const type = String(headers.type || "").toLowerCase();
    if (!headers.source) return renderChart(escapedLines);

    let payload = null;
    if (type === "bar") {
      payload = barPayload(headers, dataLines);
    } else if (PNG_CHART_TYPES.includes(type)) {
      const parsed = parsePngChart(headers, dataLines);
      if (parsed.ok) {
        const c = parsed.chart;
        payload =
          c.type === "scatter"
            ? { type: "scatter", x: c.xValues, series: c.series, names: c.seriesNames }
            : { type: "line", labels: c.xLabels, series: c.series, names: c.seriesNames };
      }
    }
    if (!payload) return renderChart(escapedLines);

    // Chrome (title/source) uses the escaped header values — they go straight
    // into HTML. <-escaping the JSON keeps "</script>" impossible inside
    // the embedded data block.
    const esc = parseChart(escapedLines).headers;
    const json = JSON.stringify(payload).replace(/</g, "\\u003c");
    const parts = [];
    if (esc.title) {
      // Page-owned chrome (not chart_render.js's email HTML) — reads the
      // same CSS custom properties as the rest of the page, so the title
      // follows dark mode like everything else on /r/.
      // Contrast pass (Spec 70 P4): same 600-weight step as chart_render.js's
      // titleLine — the two title idioms (email HTML vs. page-owned chrome)
      // stay visually matched.
      parts.push(`<div style="font-size:14px;font-weight:600;color:var(--ink);margin:16px 0 6px">${esc.title}</div>`);
    }
    parts.push(`<div class="ichart"><script type="application/json">${json}</script></div>`);
    parts.push(`<div style="font-size:12px;color:var(--muted);margin:4px 0 12px">Source: ${esc.source}</div>`);
    return parts.join("");
  } catch {
    return renderChart(escapedLines);
  }
}

// ── the inline runtime (hand-rolled, ~2 KB, zero external requests) ──────
//
// One script per page: finds every .ichart host, parses its JSON, draws an
// SVG chart in the house palette, and wires a shared tooltip div that shows
// exact values on hover. Tooltip text is set via textContent — labels can
// contain anything. Deliberately small: this is the v1 interactivity rung.
const RUNTIME_SCRIPT = `
(function () {
  "use strict";
  var COLORS = ${JSON.stringify(SERIES_COLORS)};
  var INK = ${JSON.stringify(CHART_INK)};
  var SEC = ${JSON.stringify(CHART_SECONDARY)};
  var MUTED = ${JSON.stringify(CHART_MUTED)};
  var HAIR = ${JSON.stringify(CHART_HAIRLINE)};
  var SVGNS = "http://www.w3.org/2000/svg";

  // Dark mode (Spec 70 dark rung) + paper card (dark-fix rung): the five
  // bindings above are the LIGHT fallback baked at render time (never lost
  // even if a CSS custom-property read fails) — refreshTheme(host) overwrites
  // the SAME bindings from the LIVE --ink/--secondary/--muted/--hairline/
  // --series-N custom properties resolved AT THE CHART HOST, not
  // document.documentElement. Custom properties inherit down the DOM, so a
  // host inside .report-body (the light paper card — see REPORT_BODY_CSS)
  // resolves the card's pinned-light values regardless of page scheme, while
  // any future chart drawn OUTSIDE the card falls through the inheritance
  // chain to :root and follows the page like before. drawBar/drawStack/
  // drawXY/legendRow below never need to change — they already read these
  // variables by name.
  function cssVar(el, name, fallback) {
    if (typeof getComputedStyle !== "function") return fallback;
    var v = getComputedStyle(el).getPropertyValue(name);
    v = v && v.trim();
    return v || fallback;
  }
  function refreshTheme(host) {
    var el = host || document.documentElement;
    INK = cssVar(el, "--ink", INK);
    SEC = cssVar(el, "--secondary", SEC);
    MUTED = cssVar(el, "--muted", MUTED);
    HAIR = cssVar(el, "--hairline", HAIR);
    COLORS = [0, 1, 2, 3, 4, 5].map(function (i) { return cssVar(el, "--series-" + i, COLORS[i]); });
  }

  var tip = document.createElement("div");
  tip.id = "ctip";
  document.body.appendChild(tip);
  function moveTip(e) {
    tip.style.left = (e.pageX + 12) + "px";
    tip.style.top = (e.pageY - 10) + "px";
  }
  function showTip(e, text) {
    tip.textContent = text;
    tip.style.display = "block";
    moveTip(e);
  }
  function hideTip() { tip.style.display = "none"; }

  function elt(name, attrs, parent) {
    var el = document.createElementNS(SVGNS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  function fmt(v) {
    return Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function hover(el, label) {
    el.addEventListener("mousemove", function (e) { showTip(e, label); });
    el.addEventListener("mouseleave", hideTip);
  }
  // Nice ticks (same shape as the PNG renderer): domain snaps outward to
  // round numbers so gridlines land on speakable values.
  function niceNum(r, round) {
    var e = Math.floor(Math.log(r) / Math.LN10);
    var f = r / Math.pow(10, e);
    var nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
    return nf * Math.pow(10, e);
  }
  function ticks(min, max) {
    if (min === max) { var p = Math.abs(min) || 1; min -= p; max += p; }
    var step = niceNum(niceNum(max - min, false) / 4, true);
    var lo = Math.floor(min / step) * step;
    var hi = Math.ceil(max / step) * step;
    var out = [];
    var n = Math.round((hi - lo) / step);
    for (var i = 0; i <= n; i += 1) out.push(lo + i * step);
    return { lo: lo, hi: out[out.length - 1], ticks: out };
  }

  // Legend row (shared by stacked bars and multi-series line/scatter):
  // fixed-slot chips, so legend color always equals mark color.
  function legendRow(host, names) {
    var lg = document.createElement("div");
    lg.className = "legend";
    names.forEach(function (nm, s) {
      var item = document.createElement("span");
      var sw = document.createElement("span");
      sw.className = "sw";
      sw.style.background = COLORS[s % COLORS.length];
      item.appendChild(sw);
      item.appendChild(document.createTextNode(nm));
      lg.appendChild(item);
    });
    host.appendChild(lg);
  }

  function drawBar(host, d) {
    if (d.stacked) return drawStack(host, d);
    var W = 640, labelW = 180, valW = 76, rowH = 26;
    var rows = d.rows;
    var H = rows.length * rowH + 6;
    var svg = elt("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img" });
    var max = 0;
    rows.forEach(function (r) { if (r[1] > max) max = r[1]; });
    rows.forEach(function (r, i) {
      var yTop = 3 + i * rowH;
      var lab = elt("text", { x: labelW - 8, y: yTop + rowH / 2 + 4, "text-anchor": "end", "font-size": 13, "font-weight": 600, fill: INK }, svg);
      lab.textContent = r[0];
      var bw = max > 0 && r[1] > 0 ? Math.max(2, (r[1] / max) * (W - labelW - valW - 16)) : 0;
      // shade: value encoding rides in as a per-row fill; labels stay INK/SEC
      // text — a label never wears the series color.
      var fill = (d.shades && d.shades[i]) || COLORS[0];
      if (bw > 0) elt("rect", { x: labelW, y: yTop + 5, width: bw, height: rowH - 10, rx: 3, fill: fill }, svg);
      var val = elt("text", { x: labelW + bw + 8, y: yTop + rowH / 2 + 4, "font-size": 12, fill: SEC }, svg);
      val.textContent = r[2];
      var hot = elt("rect", { x: 0, y: yTop, width: W, height: rowH, fill: "transparent" }, svg);
      hover(hot, r[0] + ": " + r[2]);
    });
    host.appendChild(svg);
  }

  // Horizontal stacked bars: segments in fixed slot order with a 2px gap,
  // per-segment hover tooltip ("NameA: 2.4"), ONE total per bar at the end
  // in INK — never a number on every segment.
  function drawStack(host, d) {
    var W = 640, labelW = 180, valW = 76, rowH = 26, GAP = 2;
    if (d.names && d.names.length > 1) legendRow(host, d.names);
    var rows = d.rows;
    var H = rows.length * rowH + 6;
    var svg = elt("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img" });
    var maxT = 0;
    rows.forEach(function (r) { if (r[2] > maxT) maxT = r[2]; });
    var avail = W - labelW - valW - 16;
    rows.forEach(function (r, i) {
      var yTop = 3 + i * rowH;
      var lab = elt("text", { x: labelW - 8, y: yTop + rowH / 2 + 4, "text-anchor": "end", "font-size": 13, "font-weight": 600, fill: INK }, svg);
      lab.textContent = r[0];
      var x = labelW;
      r[1].forEach(function (v, s) {
        if (!(v > 0) || maxT <= 0) return;
        var w = Math.max(1, (v / maxT) * avail);
        var seg = elt("rect", { x: x, y: yTop + 5, width: w, height: rowH - 10, fill: COLORS[s % COLORS.length] }, svg);
        hover(seg, d.names[s] + ": " + fmt(v));
        x += w + GAP;
      });
      var totalX = x > labelW ? x - GAP + 8 : labelW + 8;
      var val = elt("text", { x: totalX, y: yTop + rowH / 2 + 4, "font-size": 12, "font-weight": 600, fill: INK }, svg);
      val.textContent = fmt(r[2]);
    });
    host.appendChild(svg);
  }

  function drawXY(host, d) {
    var W = 640, H = 320, padL = 52, padR = 12, padT = 12, padB = 26;
    var plotW = W - padL - padR, plotH = H - padT - padB;
    var svg = elt("svg", { viewBox: "0 0 " + W + " " + H, width: "100%", role: "img" });
    var all = [];
    d.series.forEach(function (vals) { all = all.concat(vals); });
    var y = ticks(Math.min.apply(null, all), Math.max.apply(null, all));
    function yp(v) { return padT + plotH - ((v - y.lo) / (y.hi - y.lo)) * plotH; }
    var xp, xticks;
    if (d.type === "scatter") {
      var x = ticks(Math.min.apply(null, d.x), Math.max.apply(null, d.x));
      xp = function (v) { return padL + ((v - x.lo) / (x.hi - x.lo)) * plotW; };
      xticks = x.ticks.map(function (t) { return { p: xp(t), l: fmt(t) }; });
    } else {
      var n = d.labels.length;
      xp = function (i) { return padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW); };
      var m = Math.min(6, n), idx = [];
      for (var k = 0; k < m; k += 1) {
        var ii = Math.round(k * (n - 1) / Math.max(1, m - 1));
        if (idx.indexOf(ii) < 0) idx.push(ii);
      }
      xticks = idx.map(function (i) { return { p: xp(i), l: d.labels[i] }; });
    }
    y.ticks.forEach(function (t) {
      var yy = yp(t);
      elt("line", { x1: padL, y1: yy, x2: W - padR, y2: yy, stroke: HAIR, "stroke-width": 1 }, svg);
      var lab = elt("text", { x: padL - 8, y: yy + 4, "text-anchor": "end", "font-size": 11, fill: MUTED }, svg);
      lab.textContent = fmt(t);
    });
    xticks.forEach(function (t) {
      var lab = elt("text", { x: t.p, y: H - 8, "text-anchor": "middle", "font-size": 11, fill: MUTED }, svg);
      lab.textContent = t.l;
    });
    d.series.forEach(function (vals, s) {
      var color = COLORS[s % COLORS.length];
      if (d.type === "line") {
        var pts = vals.map(function (v, i) { return xp(i) + "," + yp(v); }).join(" ");
        elt("polyline", { points: pts, fill: "none", stroke: color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, svg);
      }
      vals.forEach(function (v, i) {
        var cx = d.type === "scatter" ? xp(d.x[i]) : xp(i);
        if (d.type === "scatter" || vals.length <= 40) {
          elt("circle", { cx: cx, cy: yp(v), r: 3, fill: color }, svg);
        }
        var hot = elt("circle", { cx: cx, cy: yp(v), r: 9, fill: "transparent" }, svg);
        var name = d.names && d.names.length > 1 ? d.names[s] + " \\u2014 " : "";
        var xLabel = d.type === "scatter" ? fmt(d.x[i]) : d.labels[i];
        hover(hot, name + xLabel + ": " + fmt(v));
      });
    });
    if (d.names && d.names.length > 1) legendRow(host, d.names);
    host.appendChild(svg);
  }

  // Drill-down (Spec 70 P3, Feature 3): a "Data" toggle under every chart
  // reveals the SAME embedded JSON as a plain table, plus a client-generated
  // CSV (Blob URL — no new endpoint, no external request). Column headers
  // come straight from the chart's series/label names, so the table and the
  // SVG can never disagree about what a row means.
  function tableData(d) {
    if (d.type === "bar") {
      if (d.stacked) {
        var names = d.names || [];
        return {
          headers: ["Label"].concat(names, ["Total"]),
          rows: d.rows.map(function (r) { return [r[0]].concat(r[1], [r[2]]); }),
        };
      }
      return { headers: ["Label", "Value"], rows: d.rows.map(function (r) { return [r[0], r[1]]; }) };
    }
    var names = d.names && d.names.length ? d.names : ["Value"];
    if (d.type === "scatter") {
      return {
        headers: ["X"].concat(names),
        rows: d.x.map(function (xv, i) {
          var row = [xv];
          d.series.forEach(function (s) { row.push(s[i]); });
          return row;
        }),
      };
    }
    return {
      headers: ["Label"].concat(names),
      rows: d.labels.map(function (lab, i) {
        var row = [lab];
        d.series.forEach(function (s) { row.push(s[i]); });
        return row;
      }),
    };
  }
  function csvCell(v) {
    var s = String(v);
    return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function addDrillDown(host, d) {
    var td = tableData(d);
    var wrap = document.createElement("div");
    wrap.className = "drilldown";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "data-toggle";
    btn.textContent = "Data";

    var tableHost = document.createElement("div");
    tableHost.className = "data-table";
    tableHost.style.display = "none";
    var table = document.createElement("table");
    var thead = document.createElement("tr");
    td.headers.forEach(function (h) {
      var th = document.createElement("th");
      th.textContent = h;
      thead.appendChild(th);
    });
    table.appendChild(thead);
    td.rows.forEach(function (r) {
      var tr = document.createElement("tr");
      r.forEach(function (v) {
        var cell = document.createElement("td");
        cell.textContent = v;
        tr.appendChild(cell);
      });
      table.appendChild(tr);
    });
    tableHost.appendChild(table);

    var csvLines = [td.headers.map(csvCell).join(",")].concat(
      td.rows.map(function (r) { return r.map(csvCell).join(","); })
    );
    var blob = new Blob([csvLines.join("\\n")], { type: "text/csv" });
    var dl = document.createElement("a");
    dl.href = URL.createObjectURL(blob);
    dl.download = "chart-data.csv";
    dl.className = "csv-link";
    dl.textContent = "Download CSV";
    dl.style.display = "none";

    btn.addEventListener("click", function () {
      var showing = tableHost.style.display !== "none";
      tableHost.style.display = showing ? "none" : "block";
      dl.style.display = showing ? "none" : "inline";
    });

    wrap.appendChild(btn);
    wrap.appendChild(dl);
    wrap.appendChild(tableHost);
    host.appendChild(wrap);
  }

  // Redraw-on-change (dark rung): each host keeps its embedded JSON <script>
  // as its FIRST child forever — clearHost strips everything drawn AFTER it
  // (the previous SVG + legend + drilldown) so a redraw never duplicates
  // marks. The one stateful side effect from the first draw, the drilldown's
  // CSV Blob URL, gets revoked before the host is cleared so redraws don't
  // leak object URLs.
  function clearHost(host) {
    var oldLink = host.querySelector(".csv-link");
    if (oldLink && oldLink.href) {
      try { URL.revokeObjectURL(oldLink.href); } catch (e) { /* not a blob URL yet */ }
    }
    while (host.children.length > 1) host.removeChild(host.lastChild);
  }

  function drawAll() {
    var hosts = document.querySelectorAll(".ichart");
    for (var i = 0; i < hosts.length; i += 1) {
      var host = hosts[i];
      refreshTheme(host);
      clearHost(host);
      var data;
      try { data = JSON.parse(host.firstElementChild.textContent); } catch (e) { continue; }
      try {
        if (data.type === "bar") drawBar(host, data);
        else drawXY(host, data);
        addDrillDown(host, data);
      } catch (e) { /* a broken chart never breaks the page */ }
    }
  }

  drawAll();

  // Dark is SELECTED via prefers-color-scheme, never auto-flipped by this
  // script — but once the OS/browser flips it the CSS custom properties on
  // :root change instantly, so a full redraw (cheap: same JSON payload,
  // charts are already drawn client-side) is the simplest way to repaint
  // every mark, legend, gridline, axis label, and shade fill already on the
  // page. addListener is the pre-Safari-14 fallback for browsers without
  // MediaQueryList.addEventListener.
  if (typeof window.matchMedia === "function") {
    var darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
    var onSchemeChange = function () { drawAll(); };
    if (darkQuery.addEventListener) darkQuery.addEventListener("change", onSchemeChange);
    else if (darkQuery.addListener) darkQuery.addListener(onSchemeChange);
  }
})();
`;

// ── the page ─────────────────────────────────────────────────────────────

// Dark mode (Spec 70 dark rung): SELECTED via prefers-color-scheme, never
// auto-flipped by script. One set of CSS custom properties lives at :root —
// light values default to EXACTLY the hex chart_render.js's shared chrome
// already uses (CHART_INK/SECONDARY/MUTED/HAIRLINE) and SERIES_COLORS (the
// same 6-slot categorical set the email renderer uses); the media query
// below swaps every one of them for the validated dark palette. Every rule
// in PAGE_CSS and every inline template in this file reads a var(...)
// instead of a baked hex so the SAME markup repaints under either scheme.
// This covers report_view.js's OWN page chrome and the inline SVG runtime
// (RUNTIME_SCRIPT re-reads these via getComputedStyle at draw time) — it
// does NOT reach chart_render.js's stat/delta/heat P1 HTML or the degrade
// table, which return literal hex from the shared EMAIL renderer (untouched
// by design, see the module banner): those two block types stay light-only
// on the page too. See the branch report for that known limitation.
// Dark-surface steps of the SAME six hues as SERIES_COLORS (validated
// 2026-07-19, validate_palette.js dark mode, surface #1a1a19 — ALL CHECKS
// PASS): slot 0 unchanged from the prior dark set (already a lighter step of
// the house anchor blue); slots 1-5 lift lightness/saturation off the new
// light editorial hues just enough to clear the dark-surface contrast floor
// without leaving the same hue family.
const DARK_SERIES_COLORS = ["#3987e5", "#208f50", "#c36490", "#c08410", "#0fa17f", "#d65c2d"];

const ROOT_VARS_CSS = `
  :root {
    color-scheme: light dark;
    --ink: ${CHART_INK};
    --secondary: ${CHART_SECONDARY};
    --muted: ${CHART_MUTED};
    --hairline: ${CHART_HAIRLINE};
    --surface: #ffffff;
    --chip-bg: #f4f6f8;
    --accent: #0b57d0;
    --tooltip-bg: ${CHART_INK};
    --tooltip-text: #ffffff;
    --series-0: ${SERIES_COLORS[0]};
    --series-1: ${SERIES_COLORS[1]};
    --series-2: ${SERIES_COLORS[2]};
    --series-3: ${SERIES_COLORS[3]};
    --series-4: ${SERIES_COLORS[4]};
    --series-5: ${SERIES_COLORS[5]};
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --ink: #ffffff;
      --secondary: #c3c2b7;
      --muted: #c3c2b7;
      --hairline: #3a3936;
      --surface: #1a1a19;
      --chip-bg: #3a3936;
      --tooltip-bg: #2a2a28;
      --tooltip-text: #ffffff;
      --series-0: ${DARK_SERIES_COLORS[0]};
      --series-1: ${DARK_SERIES_COLORS[1]};
      --series-2: ${DARK_SERIES_COLORS[2]};
      --series-3: ${DARK_SERIES_COLORS[3]};
      --series-4: ${DARK_SERIES_COLORS[4]};
      --series-5: ${DARK_SERIES_COLORS[5]};
    }
  }
`;

// The "paper card" (dark-fix rung): the rendered email body on /r/ is the
// SAME HTML the email register produces — chart_render.js's stat/delta/heat
// tiles and the plain-markdown table/text elements carry baked LIGHT inline
// styles/colors (untouched by design, see the module banner) and the .ichart
// runtime draws INSIDE this container too. So .report-body pins itself light
// UNCONDITIONALLY (this rule lives OUTSIDE the dark media query — it is not
// toggled by scheme) and re-declares every custom property anything inside
// it reads, to the SAME light values ROOT_VARS_CSS's :root block defaults to
// — EXCEPT --surface/background, which is the card's own warm white
// (#fcfcfb, contrast pass, Spec 70 P4) rather than the page's pure white
// (:root's --surface stays #ffffff). That whisper of difference is
// deliberate: even in light mode the card now reads as a distinct sheet of
// paper against the page chrome, instead of the previous white-on-white
// no-op. Background/color-only change — no padding/size touched here, so
// light-mode layout never shifts by a pixel (guarded by the existing "no
// padding/border-radius outside dark" test). In dark mode the page goes dark
// but this container stays the SAME light card; the dark-only media block
// below adds padding/radius so it reads as a document card instead of a
// jarring color clash — scoped to dark so light-mode layout still never
// shifts.
const REPORT_BODY_CSS = `
  .report-body {
    background: #fcfcfb;
    color: #0b0b0b;
    --ink: ${CHART_INK};
    --secondary: ${CHART_SECONDARY};
    --muted: ${CHART_MUTED};
    --hairline: ${CHART_HAIRLINE};
    --surface: #fcfcfb;
    --chip-bg: #f4f6f8;
    --accent: #0b57d0;
    --tooltip-bg: ${CHART_INK};
    --tooltip-text: #ffffff;
    --series-0: ${SERIES_COLORS[0]};
    --series-1: ${SERIES_COLORS[1]};
    --series-2: ${SERIES_COLORS[2]};
    --series-3: ${SERIES_COLORS[3]};
    --series-4: ${SERIES_COLORS[4]};
    --series-5: ${SERIES_COLORS[5]};
  }
  @media (prefers-color-scheme: dark) {
    .report-body {
      padding: 16px 20px;
      border-radius: 8px;
    }
  }
`;

const PAGE_CSS = `
  ${ROOT_VARS_CSS}
  ${REPORT_BODY_CSS}
  body { margin: 0; background: var(--surface); color: var(--ink);
    font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1.report-subject { font-size: 24px; line-height: 1.25; margin: 0 0 4px; }
  .report-meta { font-size: 13px; color: var(--secondary); margin: 0 0 8px;
    padding-bottom: 12px; border-bottom: 1px solid var(--hairline); }
  .ichart { margin: 4px 0; }
  .ichart svg text { font-family: inherit; }
  .legend { display: flex; gap: 16px; align-items: center; font-size: 11px;
    font-weight: 600; color: var(--secondary); margin: 0 0 4px 44px; }
  .legend .sw { display: inline-block; width: 10px; height: 10px;
    border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
  #ctip { position: absolute; display: none; pointer-events: none; z-index: 10;
    background: var(--tooltip-bg); color: var(--tooltip-text); font-size: 12px; line-height: 1.4;
    padding: 4px 8px; border-radius: 4px; white-space: pre; }
  .drilldown { margin: 6px 0 0; }
  .data-toggle { font-size: 12px; font-weight: 600; color: var(--secondary);
    background: var(--chip-bg); border: 1px solid var(--hairline); border-radius: 4px;
    padding: 3px 10px; cursor: pointer; }
  .csv-link { font-size: 12px; margin-left: 10px; color: var(--accent); }
  .data-table { margin: 8px 0 0; overflow-x: auto; }
  .data-table table { border-collapse: collapse; font-size: 12px; width: 100%; }
  .data-table th, .data-table td { text-align: left; padding: 4px 10px 4px 0;
    border-bottom: 1px solid var(--hairline); white-space: nowrap; }
  .data-table th { color: var(--secondary); font-weight: 600; }
  .reply-line { margin: 24px 0 0; font-size: 13px; line-height: 1.55; color: var(--secondary); }
  .lib-filter { width: 100%; box-sizing: border-box; font-size: 14px; padding: 8px 10px;
    border: 1px solid var(--hairline); border-radius: 6px; margin: 4px 0 16px;
    background: var(--surface); color: var(--ink); }
  .lib-list { list-style: none; margin: 0; padding: 0; }
  .lib-row { display: flex; gap: 12px; align-items: baseline; padding: 8px 0;
    border-bottom: 1px solid var(--hairline); font-size: 13px; }
  .lib-date { color: var(--secondary); flex: 0 0 140px; }
  .lib-from { color: var(--secondary); flex: 0 0 200px; overflow: hidden; text-overflow: ellipsis; }
  .lib-subject { color: var(--accent); text-decoration: none; }
  .lib-subject:hover { text-decoration: underline; }
  .lib-empty { color: var(--secondary); font-size: 13px; padding: 12px 0; }
`;

// The reply line (replaces the ask-box, Spec 70 P3 rung 3): no form, no
// mailto link — the reply happens in the reader's own inbox against the
// email this page is the twin of. First-person in the agent's voice;
// agentName is a best-effort thread lookup (never user input) but escapeHtml
// costs nothing and keeps the rule ("escape everything derived") uniform.
function renderReplyLine(agentName) {
  const agent = escapeHtml(agentName || "the desk");
  return (
    '<p class="reply-line">' +
    `This report came from ${agent}. Questions, pushback, a name you want dug into ` +
    "— just reply to the email; I read every reply." +
    "</p>"
  );
}

function renderReportPage(msg, agentName) {
  const subject = escapeHtml(msg.subject || "(no subject)");
  const meta = [
    msg.from_addr ? `From ${escapeHtml(msg.from_addr)}` : null,
    msg.created_at ? `Sent ${escapeHtml(msg.created_at)} UTC` : null,
  ].filter(Boolean).join(" &middot; ");
  const bodyHtml = renderMarkdown(msg.body_markdown, { chartRenderer: pageChartRenderer });
  return (
    "<!doctype html>\n" +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    `<title>${subject}</title>` +
    `<style>${PAGE_CSS}</style>` +
    "</head><body><main>" +
    `<h1 class="report-subject">${subject}</h1>` +
    (meta ? `<p class="report-meta">${meta}</p>` : "") +
    `<div class="report-body">${bodyHtml}</div>` +
    renderReplyLine(agentName) +
    "</main>" +
    `<script>${RUNTIME_SCRIPT}</script>` +
    "</body></html>"
  );
}

// ── the route ────────────────────────────────────────────────────────────

// Indistinguishable 404 for every failure mode — an attacker probing tokens
// learns nothing about which ids exist, whether the secret is set, or why a
// guess failed. noindex rides the 404 too.
function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// GET /r/<token> — the report viewer. Reads the archived message straight from
// the D1 messages table (the SAME store apiRead serves; there is no second
// copy of report content anywhere). GET-only: the ask-box's POST /ask
// exception was retired (Spec 70 P3 rung 3) in favor of the plain reply-line
// — the reader's reply happens in their own inbox, never on this page.
export async function handleReportView(request, env, url) {
  if (request.method !== "GET") return notFound();
  const token = url.pathname.slice("/r/".length);
  if (!token || token.includes("/")) return notFound();

  const messageId = await verifyReportToken(env.REPORT_LINK_SECRET, token);
  if (!messageId) return notFound();

  let msg;
  try {
    msg = await env.AGENT_MAIL_DB
      .prepare(`SELECT id, thread_id, subject, from_addr, created_at, body_markdown FROM messages WHERE id = ?`)
      .bind(messageId)
      .first();
  } catch (err) {
    console.error("report view D1 read failed:", err && err.message);
    return notFound();
  }
  if (!msg || msg.body_markdown == null) return notFound();

  // Best-effort agent name for the reply line ("This report came from
  // charlie."). A missing/failed lookup degrades to "the desk" — never
  // blocks the page, never turns into a second 404 mode.
  let agentName = "";
  if (msg.thread_id) {
    try {
      const thread = await env.AGENT_MAIL_DB
        .prepare(`SELECT assigned_agent FROM threads WHERE id = ?`)
        .bind(msg.thread_id)
        .first();
      agentName = (thread && thread.assigned_agent) || "";
    } catch (err) {
      console.error("report view thread lookup failed (reply line degrades):", err && err.message);
    }
  }

  return new Response(renderReportPage(msg, agentName), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Liberty One confidential content behind a capability URL: never
      // indexed, never referred, never cached shared.
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Everything is inline by design; the CSP makes "zero external
      // requests" a browser-enforced invariant, not a code-review hope.
      // No form on the page anymore — default-src 'none' with no
      // form-action addition needed.
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
}

// ── report library (Feature 1) ───────────────────────────────────────────

const LIBRARY_RUNTIME_SCRIPT = `
(function () {
  "use strict";
  var input = document.getElementById("libFilter");
  var items = document.querySelectorAll(".lib-row");
  if (!input) return;
  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    for (var i = 0; i < items.length; i += 1) {
      var subj = items[i].getAttribute("data-subject") || "";
      items[i].style.display = subj.indexOf(q) >= 0 ? "" : "none";
    }
  });
})();
`;

function renderLibraryPage(email, rows) {
  const rowsHtml = rows
    .map((r) => {
      const subject = escapeHtml(r.subject || "(no subject)");
      const from = escapeHtml(r.from_addr || "");
      const date = escapeHtml(r.created_at || "");
      return (
        `<li class="lib-row" data-subject="${subject.toLowerCase()}">` +
        `<span class="lib-date">${date}</span>` +
        `<span class="lib-from">${from}</span>` +
        `<a class="lib-subject" href="${r.href}">${subject}</a>` +
        "</li>"
      );
    })
    .join("");
  return (
    "<!doctype html>\n" +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex, nofollow">' +
    "<title>Report library</title>" +
    `<style>${PAGE_CSS}</style>` +
    "</head><body><main>" +
    '<h1 class="report-subject">Report library</h1>' +
    `<p class="report-meta">${escapeHtml(email)}</p>` +
    '<input type="text" id="libFilter" class="lib-filter" placeholder="Filter by subject&#8230;" autocomplete="off">' +
    `<ul class="lib-list">${rowsHtml || '<li class="lib-empty">No reports yet.</li>'}</ul>` +
    "</main>" +
    `<script>${LIBRARY_RUNTIME_SCRIPT}</script>` +
    "</body></html>"
  );
}

// GET /lib/<token> — a recipient's report library: every report ever sent to
// that address, newest first, with a client-side subject filter. Same token
// discipline, same 404s, same security headers as /r/ (Feature 1).
export async function handleLibraryView(request, env, url) {
  if (request.method !== "GET") return notFound();
  const token = url.pathname.slice("/lib/".length);
  if (!token || token.includes("/")) return notFound();

  const email = await verifyLibraryToken(env.REPORT_LINK_SECRET, token);
  if (!email) return notFound();

  let rows;
  try {
    const { results } = await env.AGENT_MAIL_DB
      .prepare(
        `SELECT id, subject, from_addr, created_at FROM messages
         WHERE lower(to_addr) = ? AND body_markdown IS NOT NULL
         ORDER BY created_at DESC LIMIT 200`
      )
      .bind(email)
      .all();
    rows = results || [];
  } catch (err) {
    console.error("library view D1 read failed:", err && err.message);
    return notFound();
  }

  const links = await Promise.all(rows.map(async (r) => ({ ...r, href: await reportLink(env, r.id) })));

  return new Response(renderLibraryPage(email, links), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
}
