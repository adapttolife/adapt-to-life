// scripts/lib/page-header.mjs — the interior page header band, shared.
//
// One definition, two consumers: apply-page-headers.mjs marks the hand-written
// pages, and build-volunteer.mjs marks the page it generates. It lives here
// because volunteer.html is GENERATED — the first cut of the rollout edited it
// directly, which put it out of sync with its own generator and failed
// `build-volunteer --check` immediately. That test was right: a hand edit to a
// generated file is a change the next build silently deletes.
//
// There is no markup. The band, its veil and its grain are all pseudo-elements
// on the section, driven by one pre-composed image (see compose_band() in
// build-hero-panels.py). Applying the header to a page is therefore adding one
// class and one stylesheet link, and there is nothing inside anybody's HTML to
// keep in sync.
export const PAGE_HEADER_SHEET = '<link rel="stylesheet" href="/css/page-header.css">';
export const PAGE_HEADER_CLASS = "pg-band";

// The band's URL lives in CSS, which cannot read a manifest — so it is injected
// per page as custom properties. HTML is not long-cached, so a deploy always
// delivers the current URLs. This is the fix for the bug that wasted four
// review rounds: the band was overwritten in place under a 30-day cache and
// Alec's phone kept serving the first version of it.
import { readFileSync } from "node:fs";
const HASH = JSON.parse(readFileSync(
  new URL("../../public/images/hero/panels/hashes.json", import.meta.url), "utf8"));
const url = (f) => `/images/hero/panels/${HASH[f] || f}`;
// FOUR bands, not one. Alec, 2026-09-10: "four pages that all have the exact
// same pictures ... we have really good pictures, let's leverage them." The
// sets are built in build-hero-panels.py (see BANDS there) and share no
// photograph, so no two of these pages open on the same face.
//
// The CUSTOM PROPERTY NAMES do not change — page-header.css still reads
// --pg-band-wide/--pg-band-tall — so this is only ever which file each page
// points them at. A page still loads exactly one band; only the deploy carries
// the extra files.
//
//   1  the room and the people in it        2  competition
//   3  faces                                4  the story
const BAND_OF = {
  "volunteer.html":               "1", // your place on this team
  "adaptive-sports-near-me.html": "1", // the question is where do I go, so show the place
  "subscribe.html":               "1",
  "sponsorship.html":             "2", // sponsor an adaptive athlete
  "roadmap.html":                 "2",
  "promise.html":                 "3", // 100% to the community
  "contact.html":                 "3",
  "about.html":                   "4", // built by the community it serves
  "waiver.html":                  "4",
};
// A page not in the list gets 3. Every page that actually paints a band is
// named above — a hero without pg-band (the role pages, /apply's single
// photograph, /donate's mosaic) is emitted these variables and ignores them —
// so the default is only ever the starting point for a page that does not
// exist yet.
export const bandOf = (page) => BAND_OF[page] || "3";

// data-band-vars is not decoration. It is the only thing that tells the
// replacement in apply-page-headers.mjs which <style> elements are ITS OWN and
// which belong to the page — see VARS_RE there for what went wrong without it.
//
// `page` is the path under public/ — "about.html", "volunteer/grant-writer.html".
export const bandVars = (page) =>
  "<style data-band-vars>:root{" +
  `--pg-band-wide:url('${url(`pg-band-${bandOf(page)}-wide.webp`)}');` +
  `--pg-band-tall:url('${url(`pg-band-${bandOf(page)}-tall.webp`)}');` +
  // /donate's own mosaic — see compose_give(). Shipped in the same block so a
  // page never has to know which header art it uses; the class decides.
  `--pg-give-wide:url('${url("pg-give-wide.webp")}');` +
  `--pg-give-tall:url('${url("pg-give-tall.webp")}');` +
  "}</style>";

// Pages whose header is ONE photograph rather than the column band. The value
// is the asset name; the URL is resolved and hashed like everything else.
export const PAGE_PHOTOS = { "apply.html": "pg-apply.webp" };
export const photoVars = (file) =>
  `<style data-band-vars>:root{--pg-photo:url('${url(file)}');}</style>`;

// ==========================================================================
// THE TIER MAP — which header height each page gets, and why.
//
// Alec, 2026-09-08: "there should be a clear number, a clear rule on the height
// ... We should not have to guess." And, on not flattening everything: "I do
// not need each one to be all of the same ... if we were too rigid and we had
// one size fits all, it would end up hurting us more than helping us."
//
// So the tier is a property of what the page IS, decided once, here — not a
// consequence of how long somebody's headline turned out to be. The heights
// themselves live in page-header.css as --pg-h-*; this file only says which
// page is which.
//
//   lg    the door into a section of the site. These pages have to make
//         somebody feel something before they read anything.
//   md    a standard interior page: it explains, it is read, it hands off.
//   sm    utility. A form, a legal page, a short ask. Nobody came here to
//         look at a photograph, and a big header is in the way.
//   give  /donate only. It carries an embedded Givebutter panel, so its
//         height is set by that panel rather than by prose — Alec: "we want
//         to make sure that Givebutter has the proper spacing to make sure
//         that it looks good on desktop."
export const PAGE_TIERS = {
  "hustle-and-heart.html":        "lg",
  "adaptive-sports-near-me.html": "lg",
  "volunteer.html":               "lg",
  "sponsorship.html":             "lg",
  "promise.html":                 "md",
  // /apply sits in lg deliberately: it is a top-level nav item and the page an
  // athlete converts on, so it is a door into the site rather than a page you
  // arrive at from one. It also carries a single photograph instead of the
  // band, which wants the room.
  "about.html":                   "md",
  "adapt-body-shop.html":         "md",
  "apply.html":                   "lg",
  "roadmap.html":                 "md",
  "karen.html":                   "md",
  "popcorn.html":                 "md",
  "send-6.html":                  "md",
  "contact.html":                 "sm",
  "waiver.html":                  "sm",
  "subscribe.html":               "sm",
  "donate.html":                  "give",
};
export const TIER_CLASS = (file) => `pg-head--${PAGE_TIERS[file] || "md"}`;
