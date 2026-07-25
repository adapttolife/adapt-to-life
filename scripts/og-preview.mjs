// scripts/og-preview.mjs — the review surface for share cards.
//
// A share card is never seen at 1200px. It is seen inside a chat bubble at
// roughly 300px, with a title and a domain stacked under it. Reviewing the
// full-size JPEG is how the June card shipped with a third line nobody could
// read. This renders every card into that chrome, at that size, so the review
// happens against the thing a supporter actually sees.
//
// Usage: node scripts/og-preview.mjs <dir-of-jpgs> [out.png]
import { chromium } from "/home/agentos/pw/node_modules/playwright/index.mjs";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";

const dir = process.argv[2] || "/tmp/og-cand";
const out = process.argv[3] || join(dir, "_review.png");
const TITLE = process.env.OG_TITLE || "Adapt To Life | Your Place in Adaptive Sports";

const files = readdirSync(dir).filter((f) => /\.(jpg|png)$/.test(f) && !f.startsWith("_")
  && !/canvas|wide/.test(f)).sort();

const cards = files.map((f) => ({
  name: basename(f).replace(/\.\w+$/, ""),
  uri: `data:image/${f.endsWith(".png") ? "png" : "jpeg"};base64,${readFileSync(join(dir, f)).toString("base64")}`,
}));

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{ margin:0; padding:36px; background:#0b0b0c; font-family:-apple-system,"SF Pro Text",system-ui,sans-serif;
        display:flex; flex-wrap:wrap; gap:34px; width:${cards.length > 3 ? 1180 : 1180}px; }
  figure{ margin:0; width:340px; }
  figcaption{ font:600 12px "SF Mono",monospace; color:#8a8f98; letter-spacing:0.06em;
              text-transform:uppercase; margin-bottom:10px; }
  /* the chat-card chrome: iMessage/Telegram render an image, then a title and
     the bare domain, on a dark sheet with rounded corners */
  .bubble{ width:300px; border-radius:15px; overflow:hidden; background:#1c1c1e; }
  .bubble img{ display:block; width:300px; height:157px; object-fit:cover; }
  .meta{ padding:11px 13px 13px; }
  .t{ font-size:14.5px; font-weight:600; color:#f2f2f7; line-height:1.25;
      display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .d{ font-size:13px; color:#8e8e93; margin-top:2px; }
</style></head><body>
${cards.map((c) => `<figure>
  <figcaption>${c.name}</figcaption>
  <div class="bubble"><img src="${c.uri}">
    <div class="meta"><div class="t">${TITLE}</div><div class="d">adapttolife.org</div></div>
  </div>
</figure>`).join("\n")}
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 600 }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: "load" });
await page.waitForTimeout(200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(`review sheet: ${out} (${cards.length} cards at 300px, chat chrome)`);
