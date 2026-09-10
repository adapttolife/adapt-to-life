// scripts/build-css.mjs — ship the CSS without shipping the reasoning.
//
// WHY THIS EXISTS. This codebase explains itself in the file, which is one of
// the best things about it — but from 2026-09-09 that prose was being
// downloaded by every visitor on every page. Measured:
//
//     page-header.css   24,208 bytes — 78% comments
//     roll-band.css      8,684 bytes — 71% comments
//     site.css          59,505 bytes — 28% comments
//
// Those three load on every page. /donate crossed its own 200KB own-bytes
// budget on the back of it, and the honest fix was never "write less down".
// Source keeps every word; the deployed copy keeps none of them.
//
// SOURCE IS src/css/, OUTPUT IS public/css/, and public/css is gitignored —
// the same shape the Vite admin build already uses. If you edit public/css you
// are editing a build artefact and your change will vanish; edit src/css.
//
// A SCANNER, NOT A REGEX, and that distinction is the whole risk here. A naive
// /\/\*[\s\S]*?\*\// happily eats through string literals, and this site's CSS
// is full of `url("data:image/svg+xml,...")` grain textures. Corrupting one
// would be invisible in review and obvious on the page. So this tracks whether
// it is inside a quote or a url() before it treats /* as a comment.
//
// Whitespace is collapsed CONSERVATIVELY: runs of whitespace become one space,
// and nothing is removed around punctuation. Squeezing `a { b: c }` down to
// `a{b:c}` would save a little more and is where minifiers introduce subtle
// selector bugs. Comments are the bulk; take the safe 80%.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src", "css");
const OUT = join(ROOT, "public", "css");

export function stripCss(css) {
  let out = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    const c = css[i];
    // string literal — copy verbatim, honour backslash escapes
    if (c === '"' || c === "'") {
      const quote = c;
      out += c; i++;
      while (i < n) {
        if (css[i] === "\\") { out += css[i] + (css[i + 1] ?? ""); i += 2; continue; }
        out += css[i];
        if (css[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }
    // url(...) — ONLY the unquoted form is handled here, and that caveat is the
    // whole bug this cost. A QUOTED url("data:...") must fall through to the
    // string branch above, because this site's grain textures are inline SVG
    // containing `filter='url(%23n)'`: scanning to the first ")" lands INSIDE
    // the data URI, drops out mid-string, and the stray apostrophe that follows
    // opens a phantom string that then swallows every comment after it. The
    // first run of this script stripped 30% of page-header.css instead of 78%
    // for exactly that reason — the numbers disagreed with the measurement, and
    // that is the only reason it was caught.
    if (css.startsWith("url(", i)) {
      let j = i + 4;
      while (j < n && /\s/.test(css[j])) j++;
      if (css[j] !== '"' && css[j] !== "'") {          // unquoted: take to ")"
        const close = css.indexOf(")", i);
        if (close === -1) { out += css.slice(i); break; }
        out += css.slice(i, close + 1); i = close + 1;
        continue;
      }
      out += css.slice(i, j); i = j;                    // quoted: let the string branch run
      continue;
    }
    // comment
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";                    // keep a separator: `a/**/b` is not `ab`
      continue;
    }
    out += c; i++;
  }
  return out.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "") + "\n";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  let before = 0, after = 0;
  for (const f of readdirSync(SRC).filter((f) => f.endsWith(".css")).sort()) {
    const src = readFileSync(join(SRC, f), "utf8");
    const min = stripCss(src);
    writeFileSync(join(OUT, f), min);
    before += src.length; after += min.length;
    console.log(`  ${f.padEnd(20)} ${String(src.length).padStart(7)} -> ${String(min.length).padStart(6)}  (${Math.round((1 - min.length / src.length) * 100)}% off)`);
  }
  console.log(`  ${"TOTAL".padEnd(20)} ${String(before).padStart(7)} -> ${String(after).padStart(6)}  (${Math.round((1 - after / before) * 100)}% off)`);
}
