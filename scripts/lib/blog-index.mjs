// scripts/lib/blog-index.mjs: what the blog lists, in one place.
//
// scripts/build-blog.mjs writes the blog from this. The pages the blog collects
// (people pages, event stories, guides, /numbers) end with a "More from the
// blog" section made here, so a reader who lands on one finds the rest (Alec,
// Nov 12 2026, "Do 4, 5 and 6": today only the footer links back). Event
// stories and guides are written whole by their own scripts, which call
// moreFromBlog(); the other pages keep the section between two markers that
// npm run blog refreshes:
//
//   <!-- more-from-blog -->
//   <!-- /more-from-blog -->
//
// Nothing here makes images: build-blog.mjs cuts them under the same names.
import { createHash } from "node:crypto";
import { SECTIONS, LISTED, POSTS } from "../../data/blog.mjs";
import { STORIES } from "../../data/event-stories.mjs";
import { GUIDES } from "../../data/guides.mjs";
import { text } from "./page-shell.mjs";

export const plainTitle = (h) => text(h).replace(/\.$/, "");
export const keyOf = (href) => href.replace(/^\/(blog\/|events\/)?/, "").replace(/[^a-z0-9-]/g, "-");

// One width of an entry's photo. The name carries a hash of the crop, so a new
// crop is a new file.
export const photoName = (key, { src, x, y, w, h }, width) =>
  `${key}-${width}.${createHash("sha256").update(JSON.stringify({ src, x, y, w, h, width, q: 72 })).digest("hex").slice(0, 8)}.webp`;

// Every entry, newest first: the posts, and the pages that live at their own
// URL (their titles and dates come from the data that owns those pages).
export function blogIndex() {
  const out = [];
  for (const [slug, p] of Object.entries(POSTS)) {
    if (!SECTIONS[p.section]) throw new Error(`${slug}: no section ${p.section}`);
    out.push({
      href: `/blog/${slug}`,
      slug,
      post: p,
      section: p.section,
      title: p.short || plainTitle(p.h1),
      seoTitle: p.title,
      dek: p.dek,
      description: p.description,
      published: p.published,
      modified: p.modified || p.published,
      showDate: true,
      key: keyOf(`/blog/${slug}`),
      spec: p.photo,
    });
  }
  for (const l of LISTED) {
    if (!SECTIONS[l.section]) throw new Error(`${l.href}: no section ${l.section}`);
    const story = l.story ? STORIES[l.story] : null;
    const guide = l.guide ? GUIDES[l.guide] : null;
    if (l.story && !story) throw new Error(`${l.href}: no story ${l.story} in data/event-stories.mjs`);
    if (l.guide && !guide) throw new Error(`${l.href}: no guide ${l.guide} in data/guides.mjs`);
    const src = story || guide;
    out.push({
      href: l.href,
      section: l.section,
      title: l.title || plainTitle(src.h1),
      seoTitle: l.title || text(src.title),
      dek: l.dek,
      description: src ? text(src.description) : l.dek,
      published: src ? src.published : l.published,
      modified: src ? src.modified || src.published : l.published,
      showDate: Boolean(src),
      label: l.label,
      key: keyOf(l.href),
      spec: l.photo,
    });
  }
  return out.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0));
}

// What to read next after `href`: the same section first, then the newest.
export function relatedTo(href, all = blogIndex(), n = 3) {
  const self = all.find((e) => e.href === href);
  const others = all.filter((e) => e.href !== href);
  if (!self) return others.slice(0, n);
  return [...others.filter((e) => e.section === self.section), ...others.filter((e) => e.section !== self.section)].slice(0, n);
}

export const MORE_START = "<!-- more-from-blog -->";
export const MORE_END = "<!-- /more-from-blog -->";

// The "More from the blog" section for a page the blog collects, markers
// included; "" for a page it doesn't. Styles: .more-blog in src/css/site.css.
export function moreFromBlog(href) {
  const all = blogIndex();
  if (!all.some((e) => e.href === href)) return "";
  const items = relatedTo(href, all);
  return `${MORE_START}
  <!-- Written by scripts/lib/blog-index.mjs from data/blog.mjs; npm run blog
       keeps it current. -->
  <section class="more-blog" aria-labelledby="moreBlogTitle">
    <div class="wrap">
      <div class="more-blog-head">
        <h2 id="moreBlogTitle">More from the blog</h2>
        <a href="/blog">All posts</a>
      </div>
      <ul class="more-blog-list">
${items
  .map(
    (e) =>
      `        <li><a href="${e.href}"><img src="/images/blog/${photoName(e.key, e.spec, 480)}" alt="" width="480" height="320" loading="lazy" decoding="async"><span class="more-blog-s">${SECTIONS[e.section].name}</span><span class="more-blog-t">${e.title}</span></a></li>`,
  )
  .join("\n")}
      </ul>
    </div>
  </section>
  ${MORE_END}`;
}
