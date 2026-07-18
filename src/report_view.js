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
  parsePngChart,
  PNG_CHART_TYPES,
  SERIES_COLORS,
  CHART_INK,
  CHART_SECONDARY,
  CHART_MUTED,
  CHART_HAIRLINE,
} from "./chart_render.js";
import { extractChartBlocks } from "./chart_png.js";

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
  const dot = decoded.lastIndexOf(".");
  if (dot <= 0) return null;
  const messageId = decoded.slice(0, dot);
  const sig = decoded.slice(dot + 1);
  const expected = await hmacSha256Hex(secret, messageId);
  if (!timingSafeEqualHex(expected, sig)) return null;
  return messageId;
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
// request body ({body_markdown, body_html, ...}).
export async function reportFooterHtml(env, body, messageId) {
  try {
    const b = body || {};
    if (!env.REPORT_LINK_SECRET) return "";
    if (b.body_markdown == null || b.body_html != null) return ""; // explicit-HTML register: untouched (Spec 53)
    if (!hasChartBlock(b.body_markdown)) return "";
    const href = await reportLink(env, messageId);
    return (
      `<div style="font-size:12px;color:${CHART_MUTED};margin:14px 0 0">` +
      `View interactive &#8594; <a href="${href}" style="color:#0b57d0">${href}</a></div>`
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

const NUM_RE = /^-?\d+(\.\d+)?$/;

// bar grammar (same rules chart_render.js renderBar enforces): 2-3 cells,
// numeric non-negative value, optional display string.
function parseBarRows(dataLines) {
  const rows = [];
  for (const line of dataLines) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 2 || cells.length > 3) return null;
    if (!NUM_RE.test(cells[1])) return null;
    const value = parseFloat(cells[1]);
    if (value < 0) return null;
    rows.push([cells[0], value, cells[2] !== undefined ? cells[2] : cells[1]]);
  }
  return rows.length ? rows : null;
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
      const rows = parseBarRows(dataLines);
      if (rows) payload = { type: "bar", rows };
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
      parts.push(`<div style="font-size:14px;font-weight:700;color:${CHART_INK};margin:16px 0 6px">${esc.title}</div>`);
    }
    parts.push(`<div class="ichart"><script type="application/json">${json}</script></div>`);
    parts.push(`<div style="font-size:12px;color:${CHART_MUTED};margin:4px 0 12px">Source: ${esc.source}</div>`);
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

  function drawBar(host, d) {
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
      if (bw > 0) elt("rect", { x: labelW, y: yTop + 5, width: bw, height: rowH - 10, rx: 3, fill: COLORS[0] }, svg);
      var val = elt("text", { x: labelW + bw + 8, y: yTop + rowH / 2 + 4, "font-size": 12, fill: SEC }, svg);
      val.textContent = r[2];
      var hot = elt("rect", { x: 0, y: yTop, width: W, height: rowH, fill: "transparent" }, svg);
      hover(hot, r[0] + ": " + r[2]);
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
    if (d.names && d.names.length > 1) {
      var lg = document.createElement("div");
      lg.className = "legend";
      d.names.forEach(function (nm, s) {
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
    host.appendChild(svg);
  }

  var hosts = document.querySelectorAll(".ichart");
  for (var i = 0; i < hosts.length; i += 1) {
    var host = hosts[i];
    var data;
    try { data = JSON.parse(host.firstElementChild.textContent); } catch (e) { continue; }
    try {
      if (data.type === "bar") drawBar(host, data);
      else drawXY(host, data);
    } catch (e) { /* a broken chart never breaks the page */ }
  }
})();
`;

// ── the page ─────────────────────────────────────────────────────────────

const PAGE_CSS = `
  body { margin: 0; background: #ffffff; color: ${CHART_INK};
    font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; }
  h1.report-subject { font-size: 24px; line-height: 1.25; margin: 0 0 4px; }
  .report-meta { font-size: 13px; color: ${CHART_SECONDARY}; margin: 0 0 8px;
    padding-bottom: 12px; border-bottom: 1px solid ${CHART_HAIRLINE}; }
  .ichart { margin: 4px 0; }
  .ichart svg text { font-family: inherit; }
  .legend { display: flex; gap: 16px; align-items: center; font-size: 11px;
    font-weight: 600; color: ${CHART_SECONDARY}; margin: 0 0 4px 44px; }
  .legend .sw { display: inline-block; width: 10px; height: 10px;
    border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
  #ctip { position: absolute; display: none; pointer-events: none; z-index: 10;
    background: ${CHART_INK}; color: #ffffff; font-size: 12px; line-height: 1.4;
    padding: 4px 8px; border-radius: 4px; white-space: pre; }
`;

function renderReportPage(msg) {
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
    bodyHtml +
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
// copy of report content anywhere).
export async function handleReportView(request, env, url) {
  if (request.method !== "GET") return notFound();
  const token = url.pathname.slice("/r/".length);
  if (!token || token.includes("/")) return notFound();

  const messageId = await verifyReportToken(env.REPORT_LINK_SECRET, token);
  if (!messageId) return notFound();

  let msg;
  try {
    msg = await env.AGENT_MAIL_DB
      .prepare(`SELECT id, subject, from_addr, created_at, body_markdown FROM messages WHERE id = ?`)
      .bind(messageId)
      .first();
  } catch (err) {
    console.error("report view D1 read failed:", err && err.message);
    return notFound();
  }
  if (!msg || msg.body_markdown == null) return notFound();

  return new Response(renderReportPage(msg), {
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
      "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'",
    },
  });
}
