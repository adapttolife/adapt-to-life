// The blog (/blog), built by scripts/build-blog.mjs from data/blog.mjs.
//
// Alec, Nov 12 2026: the story pages move out of the footer and into the blog,
// which collects them with the event stories and guides and adds new writing
// at /blog/<slug>. These tests keep the hub, the posts, the feed, the AI map
// and the sitemap in step, so a page never falls out of every list at once.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { SECTIONS, AUTHORS, LISTED, POSTS } from "../data/blog.mjs";
import { KEY, urlFor } from "../scripts/lib/indexnow.mjs";

const root = new URL("../", import.meta.url);
const pub = new URL("public/", root);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const hub = read("blog.html");
const feed = read("blog/feed.xml");
const llms = read("llms.txt");
const sitemap = read("sitemap.xml");
const ld = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap((m) => {
    const j = JSON.parse(m[1]);
    return j["@graph"] || [j];
  });

test("the blog is built from data/blog.mjs and up to date", () => {
  execFileSync(process.execPath, ["scripts/build-blog.mjs", "--check"], { cwd: root, stdio: "pipe" });
});

test("every entry is on the hub, in the feed and in llms.txt", () => {
  const hrefs = [...LISTED.map((l) => l.href), ...Object.keys(POSTS).map((s) => `/blog/${s}`)];
  for (const h of hrefs) {
    assert.ok(hub.includes(`href="${h}"`), `${h} is missing from /blog`);
    assert.ok(feed.includes(`<link>https://adapttolife.org${h}</link>`), `${h} is missing from the feed`);
    assert.ok(llms.includes(`(https://adapttolife.org${h})`), `${h} is missing from llms.txt`);
  }
  for (const l of LISTED) {
    assert.ok(SECTIONS[l.section], `${l.href}: unknown section ${l.section}`);
    assert.ok(existsSync(new URL(l.href.slice(1) + ".html", pub)), `${l.href} has no page`);
  }
});

test("each post has its card, its structured data and a sitemap entry", () => {
  for (const [slug, p] of Object.entries(POSTS)) {
    const html = read(`blog/${slug}.html`);
    const url = `https://adapttolife.org/blog/${slug}`;
    assert.ok(sitemap.includes(`<loc>${url}</loc>`), `${slug} is missing from the sitemap`);
    assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${slug}: canonical`);
    assert.ok(existsSync(new URL(`images/og/${p.og.file}`, pub)), `${slug}: share card ${p.og.file}`);
    assert.ok(html.includes(`content="https://adapttolife.org/images/og/${p.og.file}"`), `${slug}: og:image`);
    const post = ld(html).find((n) => n["@type"] === "BlogPosting");
    assert.ok(post, `${slug}: BlogPosting structured data`);
    for (const k of ["headline", "description", "datePublished", "author", "publisher", "image"])
      assert.ok(post[k], `${slug}: BlogPosting.${k}`);
    assert.ok(ld(html).some((n) => n["@type"] === "BreadcrumbList"), `${slug}: breadcrumb`);
    // The short version comes first on a phone: AI answers and search quote it.
    assert.ok(p.keyPoints.length >= 2 && html.includes('aria-label="In short"'), `${slug}: In short`);
  }
  assert.ok(sitemap.includes("<loc>https://adapttolife.org/blog</loc>"), "/blog is missing from the sitemap");
  assert.ok(hub.includes('type="application/rss+xml"'), "the hub announces its feed");
});

// Alec, Nov 12 2026: "Should we have pictures or icons? It feels sloppy." One
// real photo per entry, the same shape everywhere, and no icon tiles.
test("every entry on the hub has a photo, and none has an icon tile", () => {
  for (const e of [...LISTED, ...Object.values(POSTS)]) assert.ok(e.photo?.src, `${e.href || e.title}: no photo`);
  const items = hub.match(/<li class="bp-item[^"]*"[\s\S]*?<\/li>/g) || [];
  assert.equal(items.length, LISTED.length + Object.keys(POSTS).length, "one row per entry");
  for (const li of items) {
    assert.ok(/<img class="bp-ph" src="\/images\/blog\/[^"]+\.webp"/.test(li), `row without a photo: ${li.slice(0, 120)}`);
    assert.ok(!/<svg/.test(li), `row with an icon: ${li.slice(0, 120)}`);
  }
});

// Alec, Nov 12 2026, on a post signed "Adapt To Life" under the logo: "Should
// the author be me? A person? Use my profile picture more? Give more
// authenticity." A post names the person who wrote it and shows their face.
test("a post is signed by a person, with their face and bio", () => {
  const about = read("about.html");
  for (const [slug, p] of Object.entries(POSTS)) {
    const a = AUTHORS[p.author];
    assert.ok(a, `${slug}: author "${p.author}" is not in AUTHORS`);
    const html = read(`blog/${slug}.html`);
    const byline = html.slice(html.indexOf('<div class="bp-byline">'), html.indexOf('<button class="bp-share"'));
    assert.match(byline, /<img class="bp-avatar" src="\/images\/blog\/author-[a-z]+-160\.[0-9a-f]{8}\.webp"/, `${slug}: byline has no face`);
    assert.ok(byline.includes(`<a class="bp-by" href="${a.url}">${a.name}</a>`), `${slug}: byline does not name ${a.name}`);
    const box = html.slice(html.indexOf('<section class="bp-author" id="author"'));
    assert.ok(box.includes(a.name) && box.includes(a.bio), `${slug}: no "Written by" box for ${a.name}`);
    const post = ld(html).find((n) => n["@type"] === "BlogPosting");
    assert.equal(post.author.name, a.name, `${slug}: structured data author`);
    assert.equal(post.author["@id"], `https://adapttolife.org${a.url}`, `${slug}: author @id`);
    // A way to report a mistake, at the end of every post.
    assert.ok(html.includes(`<a href="/contact?rsn=correction&amp;page=/blog/${slug}">Tell us</a>`), `${slug}: no "Spot a mistake?" line`);
    const anchor = a.url.split("#")[1];
    if (a.url.startsWith("/about#")) assert.ok(about.includes(`id="${anchor}"`), `${a.url} has no anchor on /about`);
  }
  // The blog page itself names no author (Alec, Nov 12 2026: "Maybe for now we
  // just have nothing?"): authors sign their own posts.
  const header = hub.slice(hub.indexOf('<header class="bp-col bp-head">'), hub.indexOf("</header>", hub.indexOf('<header class="bp-col bp-head">')));
  for (const a of Object.values(AUTHORS)) assert.ok(!header.includes(a.name), `the blog's header names ${a.name}`);
});

// Alec, Nov 12 2026: "Blog should go under About in the top menu and footer
// (cleanup footer also)". The footer's groups are the top menu's groups, Blog
// sits under About in both, and the story pages live on /blog.
// Alec, Nov 12 2026, "Do 4, 5 and 6": the pages the blog collects send readers
// back into it, not only the footer.
test("every page the blog collects ends with More from the blog", () => {
  const hrefs = [...LISTED.map((l) => l.href), ...Object.keys(POSTS).map((s) => `/blog/${s}`)];
  for (const l of LISTED) {
    const html = read(l.href.slice(1) + ".html");
    const more = html.match(/<section class="more-blog"[\s\S]*?<\/section>/);
    assert.ok(more, `${l.href}: no "More from the blog"`);
    assert.ok(html.indexOf(more[0]) < html.indexOf("</main>"), `${l.href}: "More from the blog" sits outside <main>`);
    assert.ok(more[0].includes('href="/blog"'), `${l.href}: "More from the blog" has no link to /blog`);
    const links = [...more[0].matchAll(/<li><a href="([^"]+)">/g)].map((m) => m[1]);
    assert.equal(links.length, 3, `${l.href}: three to read next`);
    for (const h of links) {
      assert.notEqual(h, l.href, `${l.href} recommends itself`);
      assert.ok(hrefs.includes(h), `${l.href} recommends ${h}, which the blog doesn't list`);
    }
    for (const [, src] of more[0].matchAll(/<img src="([^"]+)"/g))
      assert.ok(existsSync(new URL(src.slice(1), pub)), `${l.href}: ${src} is missing`);
  }
});

// Search engines hear about changed pages from each release (IndexNow).
test("the IndexNow key is served and every release sends what changed", () => {
  assert.match(KEY, /^[0-9a-f]{32}$/);
  assert.equal(read(`${KEY}.txt`), KEY, "public/<key>.txt holds the key");
  assert.equal(urlFor("public/index.html"), "https://adapttolife.org/");
  assert.equal(urlFor("public/events/monster-smash-2026.html"), "https://adapttolife.org/events/monster-smash-2026");
  const release = readFileSync(new URL("scripts/release.mjs", root), "utf8");
  assert.ok(release.includes("ping(changedUrls(mainSha, mergeSha))"), "scripts/release.mjs pings IndexNow after a release");
});

test("the footer follows the top menu, with Blog under About", () => {
  const pages = readdirSync(pub).filter((f) => f.endsWith(".html"));
  for (const f of pages) {
    const s = read(f);
    if (!s.includes('<footer class="footer">')) continue;
    const footer = s.slice(s.indexOf('<footer class="footer">'), s.indexOf("</footer>"));
    const groups = [...footer.matchAll(/<div class="col[^"]*">\s*<h2>([^<]+)<\/h2>([\s\S]*?)<\/div>/g)];
    assert.deepEqual(groups.map((g) => g[1]), ["Our Work", "Get Involved", "About"], `${f}: footer groups`);
    assert.ok(groups[2][2].includes('href="/blog"'), `${f}: footer has no Blog link under About`);
    assert.ok(!footer.includes('href="/subscribe"'), `${f}: footer repeats the sign-up form as a link`);
    for (const p of ["/tim", "/karen", "/juan"])
      assert.ok(!footer.includes(`href="${p}"`), `${f}: footer lists ${p}; it belongs on /blog`);
  }
  const shell = read("events.html");
  const about = shell.match(/id="navAbout"[\s\S]*?<\/div>/);
  assert.ok(about && about[0].includes('href="/blog"'), "the top menu has Blog under About");
  assert.ok(/<span class="m-group">About<\/span>(?:\s*<a class="m-sub"[^>]*>[^<]*<\/a>)*?\s*<a class="m-sub" href="\/blog">Blog<\/a>/.test(shell), "the phone menu has Blog under About");
});

test("posts keep the house rules", () => {
  for (const slug of Object.keys(POSTS)) {
    const html = read(`blog/${slug}.html`);
    const main = html.slice(html.indexOf("<main>"), html.indexOf("</main>"));
    assert.ok(!/glasa|great lakes games/i.test(main), `${slug} names GLASA`);
    for (const phrase of ["our athletes", "our program", "our sessions", "our own tournament", "Chicago Wheelie Big Dills"])
      assert.ok(!main.includes(phrase), `${slug} says "${phrase}"`);
    assert.ok(!/\b(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)days?\b/.test(main), `${slug} names a session day`);
  }
});
