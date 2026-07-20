// md_render.js — Spec 53 (email house style). ES-module port of
// scripts/send-spec-mail.py's render_markdown() for the agent-mail Worker.
//
// Same constructs as the Python renderer: h1-h3, **bold**, *italic*, `inline
// code`, fenced ``` blocks, "- " and "N. " lists, tables, "> " blockquotes,
// "---" hr, [text](url) links — same inline styles, same outer wrapping div.
//
// Difference from the Python version: NO relative-link resolution. Agents
// compose with absolute URLs only (they have no repo/spec directory context);
// hrefs are left untouched.
//
// Two exports:
//   renderMarkdown(md) -> reading-view HTML (wrapped in the outer div)
//   deriveText(md)     -> plain-ish text fallback (the raw markdown, trimmed —
//                          acceptable per Spec 53's contract)
//
// Spec 70 P1: a ```chart fence (info string exactly "chart") renders via
// chart_render.js's renderChart() instead of <pre> — every other fence
// (empty info, "js", anything else) keeps the stock <pre> behavior.

import { renderChart } from "./chart_render.js";

// Spec 100 (premium pass): every gray below sits on the ONE warm ink family
// chart_render.js already uses (INK #0b0b0b / SECONDARY #52514e / MUTED
// #898781 / HAIRLINE #e8e7e0) — the cool GitHub grays (#ddd/#ccc/#555/
// #f6f8fa) are gone so email prose and charts read as one system.
const CODE_BLOCK_STYLE =
  "font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.45;" +
  "background:#f6f6f3;padding:12px 14px;border-radius:8px;overflow-x:auto";
const INLINE_CODE_STYLE = "background:#f6f6f3;padding:1px 5px;border-radius:4px;font-size:13px";
const HR_STYLE = "border:none;border-top:1px solid #e8e7e0;margin:24px 0";
const H1_STYLE = "font-size:26px;font-weight:700;letter-spacing:-0.02em;margin:24px 0 8px";
const H2_STYLE =
  "font-size:18px;font-weight:700;letter-spacing:-0.01em;border-bottom:1px solid #e8e7e0;" +
  "padding-bottom:6px;margin:28px 0 10px";
const H3_STYLE = "font-size:15px;font-weight:700;margin:24px 0 8px";
// Tables: horizontal rules only (the full border grid is the loudest
// "default HTML" tell) — hairline row rules, a slightly firmer rule under an
// uppercase micro-label header row, no fills, no vertical ink.
const TABLE_STYLE = "border-collapse:collapse;width:100%;margin:12px 0;font-size:14px";
const CELL_STYLE = "border-bottom:1px solid #e8e7e0;padding:8px 12px 8px 0;text-align:left;vertical-align:top";
const TH_STYLE =
  "border-bottom:1px solid #d6d4cb;padding:0 12px 6px 0;text-align:left;vertical-align:bottom;" +
  "font-size:11px;font-weight:600;color:#898781;text-transform:uppercase;letter-spacing:0.06em";
const LIST_STYLE = "margin:8px 0 8px 22px";
const LI_STYLE = "margin:4px 0";
const BLOCKQUOTE_STYLE = "border-left:3px solid #d6d4cb;margin:12px 0;padding:4px 14px;color:#52514e";
const PARAGRAPH_STYLE = "margin:10px 0;line-height:1.55";
const LINK_STYLE = "color:#256abf";

const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;
const ITALIC_RE = /(?<!\*)\*([^*\n]+?)\*(?!\*)/g;
const CODE_RE = /`([^`]+?)`/g;
const ORDERED_RE = /^\d+\.\s/;
const ORDERED_STRIP_RE = /^\d+\.\s+/;
// Task-list bullets ("- [x] done" / "- [ ] open"). The vault register leaks
// these into email otherwise -- a raw "[x]" token is exactly the "straight up
// markdown" Spec 53 exists to prevent (Alec, 2026-07-12).
const TASK_RE = /^\[( |x|X)\]\s+/;
const TASK_DONE_MARK = '<span style="color:#006300">\u2713</span> ';
const TASK_OPEN_MARK = '<span style="color:#898781">\u2610</span> ';

// Verdict accents (Spec 70 P4): the house report style pins a verdict line as
// bold text ending "\u2014 VERDICT" (e.g. "**NVDA \u2014 RISK**"). When a **bold** run's
// text matches VERDICT_RE, the <strong> gets a semantic accent \u2014 a 3px left
// border + tinted background chip \u2014 while the text itself STAYS ink (only the
// chip's frame carries the color; never repaint the letters). No match =
// plain <strong>, the ordinary degrade. Both email and the /r/ viewer share
// this ONE render path (report_view.js's pageChartRenderer only intercepts
// ```chart fences \u2014 everything else, including this inline() call, runs
// through renderMarkdown unmodified), so the accent is a single source of
// truth. Colors here are RESERVED: chart_render.js's SERIES_COLORS categorical
// palette must never reuse one (tested in chart_render.test.js).
const VERDICT_RE = /\u2014\s*(RISK|CONFIRMING|BUY|WATCHLIST|PASS|NOTHING MATERIAL)\b/;
export const VERDICT_COLORS = {
  RISK: { border: "#a02d2d", bg: "#f7e9e9" },
  CONFIRMING: { border: "#006300", bg: "#e9f2ea" },
  BUY: { border: "#006300", bg: "#e9f2ea" },
  WATCHLIST: { border: "#9a6b00", bg: "#f7f0dd" },
  PASS: { border: "#667085", bg: "#eef0f3" },
  "NOTHING MATERIAL": { border: "#667085", bg: "#eef0f3" },
};

// Renders one <strong> run. Email-safe idiom: inline border-left + inline
// background-color (the same "style attribute, no classes" discipline every
// other kit color in this file already uses) \u2014 no new dependency on a
// stylesheet or a table-cell bgcolor trick, so it survives clipped-CSS email
// clients same as everything else in this renderer.
function strongTag(content) {
  const m = content.match(VERDICT_RE);
  if (!m) return `<strong>${content}</strong>`;
  const { border, bg } = VERDICT_COLORS[m[1]];
  const style =
    `border-left:3px solid ${border};background-color:${bg};` +
    "padding:2px 9px;border-radius:4px;display:inline-block";
  return `<strong style="${style}">${content}</strong>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// Apply inline markdown formatting to an already-html-escaped fragment. Links
// are extracted to placeholders first so bold/italic/code regexes never touch
// URLs (protects underscores/asterisks inside hrefs), then bold, then
// italic, then code, then placeholders are restored. hrefs are used as-is —
// no relative-link resolution (agents pass absolute URLs only).
function inline(text) {
  const placeholders = [];
  text = text.replace(LINK_RE, (_m, label, url) => {
    const token = "\x00LINK" + placeholders.length + "\x00";
    placeholders.push(`<a href="${url}" style="${LINK_STYLE}">${label}</a>`);
    return token;
  });
  text = text.replace(BOLD_RE, (_m, content) => strongTag(content));
  text = text.replace(ITALIC_RE, "<em>$1</em>");
  text = text.replace(CODE_RE, `<code style="${INLINE_CODE_STYLE}">$1</code>`);
  placeholders.forEach((linkHtml, idx) => {
    text = text.replace("\x00LINK" + idx + "\x00", linkHtml);
  });
  return text;
}

function splitTableRow(line) {
  line = line.trim();
  if (line.startsWith("|")) line = line.slice(1);
  if (line.endsWith("|")) line = line.slice(0, -1);
  return line.split("|").map((c) => c.trim());
}

function renderTable(tableLines) {
  const rowsHtml = [];
  tableLines.forEach((line, idx) => {
    if (idx === 1) return; // the |---|---| separator row
    const cells = splitTableRow(line);
    const tag = idx === 0 ? "th" : "td";
    const style = idx === 0 ? TH_STYLE : CELL_STYLE;
    const cellsHtml = cells.map((c) => `<${tag} style="${style}">${inline(c)}</${tag}>`).join("");
    rowsHtml.push(`<tr>${cellsHtml}</tr>`);
  });
  return `<table style="${TABLE_STYLE}">${rowsHtml.join("")}</table>`;
}

function renderBody(mdText, opts) {
  const lines = mdText.split("\n");
  const escLines = lines.map(escapeHtml);
  const n = escLines.length;
  const out = [];
  let i = 0;
  // Spec 70 P2: ```chart fences are numbered in document order; the send path
  // passes opts.chartImages = { <ordinal>: {cid,width,height} } for the
  // blocks it rendered to PNG. chart_png.js scans fences with the same walk,
  // so ordinals line up by construction.
  let chartIndex = 0;

  while (i < n) {
    const stripped = escLines[i].trim();

    if (stripped.startsWith("```")) {
      const fenceInfo = stripped.slice(3).trim().toLowerCase();
      i += 1;
      const codeBuf = [];
      while (i < n && !escLines[i].trim().startsWith("```")) {
        codeBuf.push(escLines[i]);
        i += 1;
      }
      if (i < n) i += 1; // consume closing fence
      if (fenceInfo === "chart") {
        // Spec 70 P3: opts.chartRenderer lets another surface (the report
        // viewer page) render chart blocks its own way while reusing THIS
        // walk — one markdown parser, per-surface chart output.
        const custom = opts && opts.chartRenderer;
        if (custom) {
          out.push(custom(codeBuf, chartIndex));
        } else {
          const image = opts && opts.chartImages ? opts.chartImages[chartIndex] : undefined;
          out.push(renderChart(codeBuf, image));
        }
        chartIndex += 1;
      } else {
        out.push(`<pre style="${CODE_BLOCK_STYLE}">${codeBuf.join("\n")}</pre>`);
      }
      continue;
    }

    if (stripped === "") {
      i += 1;
      continue;
    }

    if (stripped === "---") {
      out.push(`<hr style="${HR_STYLE}">`);
      i += 1;
      continue;
    }

    if (stripped.startsWith("### ")) {
      out.push(`<h3 style="${H3_STYLE}">${inline(stripped.slice(4))}</h3>`);
      i += 1;
      continue;
    }

    if (stripped.startsWith("## ")) {
      out.push(`<h2 style="${H2_STYLE}">${inline(stripped.slice(3))}</h2>`);
      i += 1;
      continue;
    }

    if (stripped.startsWith("# ")) {
      out.push(`<h1 style="${H1_STYLE}">${inline(stripped.slice(2))}</h1>`);
      i += 1;
      continue;
    }

    if (stripped.startsWith("|")) {
      const tableLines = [];
      while (i < n && escLines[i].trim().startsWith("|")) {
        tableLines.push(escLines[i].trim());
        i += 1;
      }
      out.push(renderTable(tableLines));
      continue;
    }

    if (stripped.startsWith("- ")) {
      const items = [];
      while (i < n && escLines[i].trim().startsWith("- ")) {
        let body = escLines[i].trim().slice(2);
        const task = body.match(TASK_RE);
        if (task) body = body.replace(TASK_RE, "");
        const mark = task ? (task[1] === " " ? TASK_OPEN_MARK : TASK_DONE_MARK) : "";
        items.push(mark + inline(body));
        i += 1;
      }
      out.push(`<ul style="${LIST_STYLE}">${items.map((it) => `<li style="${LI_STYLE}">${it}</li>`).join("")}</ul>`);
      continue;
    }

    if (ORDERED_RE.test(stripped)) {
      const items = [];
      while (i < n && ORDERED_RE.test(escLines[i].trim())) {
        const content = escLines[i].trim().replace(ORDERED_STRIP_RE, "");
        items.push(inline(content));
        i += 1;
      }
      out.push(`<ol style="${LIST_STYLE}">${items.map((it) => `<li style="${LI_STYLE}">${it}</li>`).join("")}</ol>`);
      continue;
    }

    if (stripped.startsWith("&gt; ")) {
      const quoteLines = [];
      while (i < n && escLines[i].trim().startsWith("&gt; ")) {
        quoteLines.push(inline(escLines[i].trim().slice(5)));
        i += 1;
      }
      out.push(`<blockquote style="${BLOCKQUOTE_STYLE}">${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    out.push(`<p style="${PARAGRAPH_STYLE}">${inline(stripped)}</p>`);
    i += 1;
  }

  return out.join("\n");
}

// Render markdown to reading-view HTML, wrapped in the same outer div
// send-spec-mail.py uses for its email bodies. opts (optional):
// { chartImages } — see renderBody; omitted everywhere except the send path.
export function renderMarkdown(md, opts) {
  const rendered = renderBody(String(md == null ? "" : md), opts);
  return (
    // Explicit background (2026-07-05): dark-mode clients auto-invert emails that
    // declare none — keeps the reading-view card white deterministically.
    '<div style="font-family:-apple-system,\'Segoe UI\',Helvetica,Arial,sans-serif;' +
    'font-size:15px;color:#0b0b0b;background:#ffffff;max-width:720px;padding:4px 2px">' +
    rendered +
    "</div>"
  );
}

// Plain-ish text fallback. The raw markdown is an acceptable fallback per
// Spec 53's contract — most mail clients render it legibly enough, and the
// archive already keeps the markdown verbatim alongside the HTML.
export function deriveText(md) {
  return String(md == null ? "" : md).trim();
}

// Every outbound email renders by construction (Alec, 2026-07-05 hardening):
// no explicit body_html -> the standard render applies to whatever body exists
// (markdown preferred, plain text otherwise — plain text is valid markdown).
// Explicit body_html (the report register) always wins, unchanged.
export function resolveMarkdownBody({ body_text, body_html, body_markdown }, opts) {
  const source = body_markdown != null ? body_markdown : body_text;
  const html = body_html != null ? body_html : (source ? renderMarkdown(source, opts) : undefined);
  const text = body_text != null ? body_text : (body_markdown ? deriveText(body_markdown) : undefined);
  return { body_text: text, body_html: html };
}
