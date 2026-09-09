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
// data-band-vars is not decoration. It is the only thing that tells the
// replacement in apply-page-headers.mjs which <style> elements are ITS OWN and
// which belong to the page — see VARS_RE there for what went wrong without it.
export const PAGE_HEADER_VARS =
  "<style data-band-vars>:root{" +
  `--pg-band-wide:url('${url("pg-band-wide.webp")}');` +
  `--pg-band-tall:url('${url("pg-band-tall.webp")}');` +
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
