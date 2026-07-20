// scripts/preview.mjs — Spec 100: local render harness for the screenshot loop.
// Renders ONE torture fixture (every chart type + verdict lines + the full
// markdown surface) through the real production code paths and writes
// browser-openable HTML to an output dir:
//   email.html   — the email register (renderMarkdown + real PNG curves;
//                  cid: refs rewritten to local files so a browser shows them)
//   report.html  — the /r/ viewer page (handleReportView with a stub D1, the
//                  same harness shape test/report_view.test.js uses)
// Usage: node scripts/preview.mjs [outdir]   (default /tmp/mail-preview)
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolveMarkdownBody } from "../src/md_render.js";
import { initChartAssets, renderMarkdownChartPngs } from "../src/chart_png.js";
import { makeReportToken, handleReportView } from "../src/report_view.js";

const OUT = process.argv[2] || "/tmp/mail-preview";
mkdirSync(OUT, { recursive: true });

const FIXTURE_MD = [
  "# Weekly desk brief — fixture",
  "",
  "**LLY — CONFIRMING** on the pipeline readout; **T — RISK** stays flagged.",
  "",
  "This paragraph carries *italic*, **bold**, `inline code`, and a [link](https://adapttolife.org). " +
    "It exists so body type, links, and spacing are judged alongside the visuals, not in isolation.",
  "",
  "## Position snapshot",
  "",
  "```chart",
  "type: stat",
  "title: Portfolio pulse",
  "source: internal ledger, 2026-07-20",
  "Spend this week | $8.12 | +701.8% vs prior 7d",
  "AUM | $59M | +4.2%",
  "Drawdown | 2.1% | -0.4pt",
  "```",
  "",
  "```chart",
  "type: bar",
  "title: Daily spend by lane",
  "source: usage meter, 7/13-7/19",
  "series: Credits | BYOK | Batch",
  "7/17 | 2.4 | 0.2 | 0.9",
  "7/18 | 3.1 | 0.1 | 0.2",
  "7/19 | 0.3 | 0.1 | 0.2",
  "```",
  "",
  "```chart",
  "type: bar",
  "mode: grouped",
  "title: Implied growth vs consensus hurdle",
  "source: reverse-DCF grid, FMP consensus, 2026-07-20",
  "series: Implied | Consensus",
  "unit: %",
  "NVDA | 14.2 | 11.8",
  "MSFT | 9.6 | 8.1",
  "LLY | 12.4 | 13.5",
  "AVGO | 15.1 | 9.9",
  "TSM | 8.8 | 10.2",
  "KO | 3.1 | 4.0",
  "```",
  "",
  "```chart",
  "type: bar",
  "title: Top models by spend",
  "source: usage meter, last 7d",
  "shade: value",
  "Kimi K3 | 5.71 | $5.71",
  "GLM 5.2 | 1.24 | $1.24",
  "DeepSeek V4 | 0.87 | $0.87",
  "Qwen4-72B | 0.30 | $0.30",
  "```",
  "",
  "### Movement",
  "",
  "```chart",
  "type: delta",
  "title: Week over week",
  "source: internal ledger",
  "Requests | 4,210 | +18%",
  "Tokens out | 1.4M | +702%",
  "Cost per run | $0.31 | -12%",
  "```",
  "",
  "```chart",
  "type: line",
  "title: Spend curve",
  "source: usage meter, daily",
  "series: Credits | BYOK",
  "7/13 | 0.05 | 0",
  "7/14 | 0.32 | 0.02",
  "7/15 | 0.18 | 0",
  "7/16 | 0.41 | 0",
  "7/17 | 3.10 | 0.55",
  "7/18 | 3.38 | 0.04",
  "7/19 | 0.48 | 0.11",
  "```",
  "",
  "```chart",
  "type: waterfall",
  "title: Cash bridge",
  "source: underwrite.py",
  "= Gross | 1200",
  "Vacancy | -96",
  "Opex | -410",
  "Capex reserve | -60",
  "= NOI | 634",
  "```",
  "",
  "```chart",
  "type: heat",
  "title: Sensitivity (cap rate x rent growth)",
  "source: underwrite.py",
  "Cap \\ Growth | 1% | 2% | 3%",
  "5.0% | 92 | 118 | 145",
  "5.5% | 71 | 96 | 122",
  "6.0% | 54 | 78 | 103",
  "```",
  "",
  "## The read",
  "",
  "> One-line pull quote lives here so blockquote chrome gets judged too.",
  "",
  "| Ticker | Verdict | Move |",
  "|---|---|---|",
  "| LLY | Confirming | +2.1% |",
  "| T | Risk | -4.4% |",
  "| KO | Watchlist | +0.3% |",
  "",
  "Reply to this email with pushback; the desk reads every reply.",
].join("\n");

// Real PNG curves through the real engine.
await initChartAssets({
  yoga: readFileSync("node_modules/satori/yoga.wasm"),
  resvgWasm: readFileSync("node_modules/@resvg/resvg-wasm/index_bg.wasm"),
  interRegular: readFileSync("assets/fonts/Inter-Regular.ttf"),
  interSemiBold: readFileSync("assets/fonts/Inter-SemiBold.ttf"),
});
const pngs = await renderMarkdownChartPngs(FIXTURE_MD);
for (const att of pngs.attachments) {
  writeFileSync(join(OUT, `${att.contentId}.png`), Buffer.from(att.content, "base64"));
}

const { body_html } = resolveMarkdownBody({ body_markdown: FIXTURE_MD }, { chartImages: pngs.images });
// Browsers don't resolve cid:; point at the files written above. Page shell
// mimics a mail client's reading pane (neutral gray around the body).
const emailHtml =
  "<!doctype html><html><head><meta charset=\"utf-8\"><title>email register</title></head>" +
  "<body style=\"margin:0;background:#e9e9e7;padding:24px\">" +
  "<div style=\"max-width:760px;margin:0 auto;background:#ffffff;padding:20px 24px\">" +
  body_html.replace(/cid:([A-Za-z0-9._@-]+)/g, "$1.png") +
  "</div></body></html>";
writeFileSync(join(OUT, "email.html"), emailHtml);

// The /r/ page through the real route, stub D1 (test-harness shape).
const SECRET = "preview-secret";
const MSG_ID = "5b2f2a10-9d1c-4f4e-8a30-1c2d3e4f5a6b";
const row = {
  id: MSG_ID,
  subject: "Weekly desk brief — fixture",
  from_addr: "charlie@agents.adapttolife.org",
  created_at: "2026-07-20 09:00:00",
  body_markdown: FIXTURE_MD,
};
const env = {
  REPORT_LINK_SECRET: SECRET,
  AGENT_MAIL_DB: {
    prepare(sql) {
      return {
        bind() {
          return { async first() { return /FROM messages WHERE id = \?/.test(sql) ? row : null; } };
        },
      };
    },
  },
};
const token = await makeReportToken(SECRET, MSG_ID);
const request = new Request(`https://adapttolife.org/r/${token}`, { method: "GET" });
const res = await handleReportView(request, env, new URL(request.url));
writeFileSync(join(OUT, "report.html"), await res.text());

console.log(`wrote ${OUT}/email.html + report.html + ${pngs.attachments.length} png(s)`);
