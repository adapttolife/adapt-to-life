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
