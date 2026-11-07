import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { smarten } from "../scripts/smart-quotes.mjs";

// The Nov 6 2026 design review (Alec: "Fix everything you recommended. Take
// your time. Let's get this right.").
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const PAGES = [
  ...readdirSync(join(ROOT, "public"))
    .filter(
      (f) =>
        f.endsWith(".html") && !/^(hero-|campaign-concepts|review|photo-picks)/.test(f),
    )
    .map((f) => `public/${f}`),
  ...readdirSync(join(ROOT, "public/volunteer"))
    .filter((f) => f.endsWith(".html"))
    .map((f) => `public/volunteer/${f}`),
];

test("every image reserves its shape: width and height on every <img>", () => {
  for (const f of PAGES)
    for (const [tag] of read(f).matchAll(/<img [^>]*>/g))
      assert.ok(
        /\bwidth="\d+"/.test(tag) && /\bheight="\d+"/.test(tag),
        `${f}: ${tag.slice(0, 90)}`,
      );
  // Attributes give the shape, CSS keeps the size: a framed photo never stretches.
  assert.ok(/\.photo-frame img \{[^}]*height: auto;/.test(read("src/css/site.css")));
});

test("no page skips a heading level (the footer's titles are h2)", () => {
  for (const f of PAGES) {
    const html = read(f).replace(/<script[\s\S]*?<\/script>/g, "");
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map((m) => +m[1]);
    for (let i = 1; i < levels.length; i++)
      assert.ok(
        levels[i] <= levels[i - 1] + 1,
        `${f}: h${levels[i - 1]} then h${levels[i]}`,
      );
    assert.ok(
      !/<h4>(Organization|Get involved)<\/h4>/.test(html),
      `${f}: footer titles are h4`,
    );
  }
});

test("the copy uses typographer's quotes, not typewriter ones", () => {
  // Nov 6 2026 design review: "We're", "Juan's" and "The chair didn't fix me"
  // were set with straight marks beside pages already using &rsquo;. Every
  // page a visitor can reach is checked; `node scripts/smart-quotes.mjs`
  // fixes a failure. Generated pages (volunteer, the campaign module) run
  // their output through the same function, so they pass by construction.
  execFileSync(process.execPath, ["scripts/smart-quotes.mjs", "--check"], {
    cwd: ROOT,
    stdio: "pipe",
  });
  // The converter itself: apostrophes, pairs, decades, and nothing inside
  // tags, comments or scripts.
  const s = (h) => smarten(h);
  assert.equal(s("<p>We're here</p>"), "<p>We&rsquo;re here</p>");
  assert.equal(
    s('<p>Why "Hustle &amp; Heart"</p>'),
    "<p>Why &ldquo;Hustle &amp; Heart&rdquo;</p>",
  );
  assert.equal(s("<p>the athletes' chairs</p>"), "<p>the athletes&rsquo; chairs</p>");
  assert.equal(s("<p>since '26</p>"), "<p>since &rsquo;26</p>");
  assert.equal(s("<p>'Go,' she said</p>"), "<p>&lsquo;Go,&rsquo; she said</p>");
  assert.equal(
    s('<p>"<em>Option C</em> is awesome"</p>'),
    "<p>&ldquo;<em>Option C</em> is awesome&rdquo;</p>",
  );
  assert.equal(s("<p>Wait...</p>"), "<p>Wait&hellip;</p>");
  const raw =
    '<a title="Tim\'s" href="/x">x</a><!-- m {"a":"b"} --><script>var a = "it\'s";</script><code>a\'b</code>';
  assert.equal(s(raw), raw);
  // User-facing strings in the scripts that write onto the page.
  const js = (p) => readFileSync(join(ROOT, p), "utf8");
  assert.ok(js("public/js/subscribe.js").includes("You’re in. Watch your inbox."));
  assert.ok(
    !/'(?:Sending|Joining|Submitting)\.\.\.'|"Sending\.\.\."/.test(
      [
        "public/js/sponsor-sheet.js",
        "public/contact.html",
        "public/apply.html",
        "public/waiver.html",
        "public/subscribe.html",
      ]
        .map(js)
        .join("\n"),
    ),
  );
});

test("donate: more ways to give is a ledger beside the advisor's card", () => {
  // Alec, Nov 6 2026, on replacing the 2x2 grid of icon cards: "I love that
  // idea." The four ways are hairline rows, and the facts an advisor asks for
  // sit beside them in one dark card instead of a section further down.
  const html = read("public/donate.html");
  const a = html.indexOf('<section class="band give-more"');
  const sec = html.slice(a, html.indexOf("</section>", a));
  assert.ok(a > 0, "the section is there");
  assert.equal((sec.match(/class="gm-way"/g) || []).length, 4);
  assert.ok(!sec.includes("ix-tile"), "no icon tiles");
  assert.ok(sec.includes('id="details"'), "the advisor card keeps the #details anchor");
  assert.ok(sec.includes('<span class="give-fact-v">41-3213344</span>'));
  assert.equal((html.match(/id="details"/g) || []).length, 1, "one details block");
  // Alec, Nov 7: /donate and /numbers complement each other. The monthly
  // gifts lead "What your gift does" above (the form opens on Monthly), so the
  // fourth way is a sport chair: the one gift the form can't take, raised one
  // athlete at a time.
  assert.ok(
    sec.includes('<h3 class="gm-t">A sport chair</h3>'),
    "the chair is a way to give",
  );
  assert.ok(sec.includes("$4,000 to $6,000"));
  assert.ok(!sec.includes("Every month"), "monthly lives in the impact list now");
  // Nov 7: Givebutter's dedication option is on, so the line names the
  // form's own words instead of the free-text note.
  assert.ok(sec.includes("Choose &ldquo;Give in honor/memory&rdquo; on the form."));
  assert.ok(!sec.includes("donation note"));
});
