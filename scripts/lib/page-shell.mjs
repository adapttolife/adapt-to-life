// scripts/lib/page-shell.mjs: the site's shared page furniture, for pages a
// script writes (event stories, guides). Taken from public/events.html on
// every run, so a generated page always carries the current header, footer,
// nav script and asset stamps.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function pageShell(root) {
  const shell = readFileSync(join(root, "public/events.html"), "utf8");
  const pick = (re) => {
    const m = shell.match(re);
    if (!m) throw new Error(`events.html is missing ${re}`);
    return m[0];
  };
  return {
    header: pick(/<header class="nav[\s\S]*?<\/header>/),
    footer: pick(/<footer class="footer">[\s\S]*?<\/footer>/),
    navJs: shell.slice(shell.indexOf("</footer>")).match(/<script>[\s\S]*?<\/script>/)[0],
    head: pick(/<link rel="icon"[\s\S]*?<script src="\/js\/attribution\.js[^>]*><\/script>/).replace(
      /<meta property="og:[\s\S]*?<meta name="twitter:image:alt"[^>]*>\n/,
      "",
    ),
    tail: pick(/<script src="\/js\/subscribe\.js[^>]*><\/script>\s*<script src="\/js\/turnstile-lazy\.js[^>]*><\/script>/),
  };
}

// The <head> meta block every generated page carries.
export function metaBlock({ title, desc, url, og, ogAlt, type = "website", published }) {
  return `<meta property="og:type" content="${type}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${ogAlt}">
<meta property="og:url" content="${url}">
${published ? `<meta property="article:published_time" content="${published}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${og}">
<meta name="twitter:image:alt" content="${ogAlt}">`;
}

export const esc = (s) => String(s).replace(/&(?![a-z]+;|#\d+;)/g, "&amp;").replace(/"/g, "&quot;");
export const text = (s) =>
  String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&rsquo;/g, "’")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
