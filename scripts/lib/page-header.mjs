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
export const PAGE_HEADER_VARS =
  "<style>:root{" +
  `--pg-band-wide:url('${url("pg-band-wide.webp")}');` +
  `--pg-band-tall:url('${url("pg-band-tall.webp")}');` +
  "}</style>";
