// Durable QR redirects — Spec 116, P1 + P2 + P5.
//
// The problem this solves: a QR sticker on an athlete's chair lives for years.
// Whatever URL it encodes can never change. So the code encodes a short URL on
// OUR domain, and the destination behind it is data we can edit any time.
//
//   adapttolife.org/q/chair  →  302  →  wherever we point it today
//
// That outlives every vendor, subscription, and redesign. Changing where a
// sticker goes is now a row in D1 (P2) — not a code edit, and never a reprint.
// The table is what the browser page at /admin/qr writes to, so Alec or Karen
// can repoint a printed code without asking an engineer.
//
// Three rules hold this file's shape:
//
//   1. A code in the wild NEVER 404s. Unknown, retired, or typo'd slugs land on
//      /donate. Someone holding a three-year-old sticker is a supporter, not an
//      error case.
//   2. The redirect never depends on anything that can be down. D1 unreachable
//      falls back to the seed map below; a scan that cannot be counted is
//      dropped, never retried into the response path.
//   3. Attribution rides along, because a scan count is vanity and dollars per
//      surface is the number that decides what gets printed next (P6).

// The four codes that were printed before the table existed. This is no longer
// where destinations are edited — it is the parachute for the minutes when D1
// is unreachable, and the seed the migration copied into qr_codes. Keep it in
// sync with the table only for codes that are physically in the world.
const SEED = {
  chair:   { to: "/send-6",  label: "Chair sticker", surface: "chair-sticker" },
  sign:    { to: "/send-6",  label: "Event signage", surface: "signage" },
  card:    { to: "/send-6",  label: "Hand card",     surface: "hand-card" },
  popcorn: { to: "/popcorn", label: "Popcorn drive", surface: "print" },
};

// The codes are read from D1 on EVERY redirect, deliberately.
//
// The first cut of this cached them in the isolate for 30 seconds, and it was
// wrong in a way that took a production drill to see. In a Workers isolate,
// Date.now() is frozen at the last I/O the isolate performed — it does not
// advance while the isolate sits idle. So a TTL measured with Date.now(), read
// BEFORE the request does any I/O, can compare a fresh cache against a clock
// that stopped when the cache was filled. On a quiet isolate that comparison
// never expires, and the sticker keeps pointing at the old destination
// forever, silently. Measured on production 2026-07-31: a code repointed and
// retired in D1 still served its ORIGINAL destination, and the scans it logged
// were stamped two minutes in the past by the same frozen clock.
//
// A read per scan is the right price. QR traffic is human-paced, the query is
// a primary-key table scan of a handful of rows, and the alternative is a
// wrong redirect nobody can see. The only cache kept is last-known-good, used
// solely when D1 is unreachable — it has no TTL because a stale destination
// beats no destination for someone standing in front of a sticker.
let lastGood = null;

export function _resetCaches() {
  lastGood = null;
  campaigns = null;
}

async function loadCodes(env) {
  try {
    if (!env.WAIVERS_DB) return null;
    const { results } = await env.WAIVERS_DB.prepare(
      `SELECT slug, dest, rule, label, surface, active FROM qr_codes`
    ).all();
    const map = new Map();
    for (const r of results || []) map.set(r.slug, r);
    lastGood = map;
    return map;
  } catch (err) {
    // Serving the last good answer, or the seed, is strictly better than
    // serving an error to someone standing in front of a sticker.
    console.error("qr: codes load failed, falling back:", err);
    return lastGood;
  }
}

// campaign-follow reads the same file the site's campaign band reads, so a
// drive's dates exist in exactly one place. /popcorn already works this way.
// Held for the life of the isolate rather than on a timer, for the same reason
// as above — and this one is a static asset that only changes on deploy, which
// replaces the isolate anyway.
let campaigns = null;

async function loadCampaigns(env, origin) {
  if (campaigns) return campaigns;
  try {
    if (!env.ASSETS) return null;
    const res = await env.ASSETS.fetch(new Request(`${origin}/data/campaigns.json`));
    if (!res.ok) return null;
    campaigns = await res.json();
    return campaigns;
  } catch (err) {
    console.error("qr: campaigns load failed:", err);
    return null;
  }
}

// ATL's dates, not the Worker's. A drive that runs Aug 6–13 runs on those days
// in Chicago; UTC would open it five hours early and close it five hours late.
export function chicagoToday(nowMs) {
  // en-CA formats as YYYY-MM-DD, directly comparable to the ISO dates in
  // campaigns.json without parsing either side into a Date.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(nowMs));
}

// Mirrors driveStatus() in public/js/campaigns.js: open when today is inside
// the window, and a drive with no dates at all is never "open".
export function liveDrive(campaigns, todayISO) {
  const drives = (campaigns && campaigns.drives) || [];
  for (const d of drives) {
    if (d.published === false) continue;
    const opens = d.opens || d.starts_at;
    const closes = d.closes || d.ends_at;
    if (!opens && !closes) continue;
    if (opens && todayISO < opens) continue;
    if (closes && todayISO > closes) continue;
    const to = d.page || d.cta_url || d.store_url;
    if (to) return { slug: d.slug, to };
  }
  return null;
}

export function resolveDest(entry, campaigns, todayISO) {
  if (!entry) return "/donate";
  if (entry.rule === "campaign-follow") {
    const live = liveDrive(campaigns, todayISO);
    if (live) return live.to;
  }
  return entry.dest || entry.to || "/donate";
}

// Which OS, and which browser did the scan open in? Both are coarse buckets,
// and the browser one earns its keep: a scan that opens in Instagram's or
// Facebook's in-app browser behaves very differently from one in Safari — it
// is a screenshot being scanned off a phone, not someone standing in front of
// the object. That distinction changes what a scan MEANS, and no vendor
// dashboard tells you it.
export function osOf(ua) {
  if (!ua) return "unknown";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/X11|Linux/i.test(ua)) return "Linux";
  return "other";
}

export function browserOf(ua) {
  if (!ua) return "unknown";
  if (/Instagram/i.test(ua)) return "instagram-app";
  if (/FBAN|FBAV/i.test(ua)) return "facebook-app";
  if (/Snapchat/i.test(ua)) return "snapchat-app";
  if (/TikTok|BytedanceWebview/i.test(ua)) return "tiktok-app";
  if (/LinkedInApp/i.test(ua)) return "linkedin-app";
  if (/EdgA?\//i.test(ua)) return "edge";
  if (/(FxiOS|Firefox)/i.test(ua)) return "firefox";
  if (/(CriOS|Chrome)/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

// Coarse on purpose. "Did this sticker get scanned by phones or by laptops" is
// a real question; anything finer is fingerprinting, which principle 8 forbids.
export function deviceOf(ua) {
  if (!ua) return "unknown";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Windows NT|X11|CrOS/i.test(ua)) return "desktop";
  return "other";
}

// Only the host. A full referrer URL can carry a query string someone typed
// into a search box, and we have no use for it.
export function referrerHost(ref) {
  if (!ref) return null;
  try { return new URL(ref).host || null; } catch { return null; }
}

// Attribution params. utm_* and gba_source are the ones Givebutter's embedded
// widget actually forwards into its iframe — verified against the live widget
// on 2026-07-31 with scripts/probe-givebutter-utm.mjs, which found it drops
// every param outside that allowlist. `src` is kept because it predates this
// and the site's own analytics read it.
export function attributionParams(slug, surface, known) {
  const marker = known ? `qr-${slug}` : "qr-unknown";
  return {
    src: marker,
    utm_source: "qr",
    utm_medium: surface || "print",
    utm_campaign: marker,
    gba_source: marker,
  };
}

// Kept deliberately small: a redirect that has to think is a redirect that breaks.
export async function handleQr(request, env, url, ctx) {
  const slug = url.pathname.replace(/^\/q\//, "").replace(/\/+$/, "").toLowerCase();

  const map = await loadCodes(env);
  const row = map ? map.get(slug) : null;
  const seed = SEED[slug];
  // A row that exists but is retired still redirects (D4) — it just stops being
  // minted. Only a slug we have never heard of falls through to /donate.
  const entry = row || (seed ? { dest: seed.to, label: seed.label, surface: seed.surface, active: 1 } : null);
  const known = Boolean(entry);

  // Read the clock only AFTER the D1 read above. Before any I/O, a Workers
  // isolate reports the time of its last I/O, which can be minutes stale.
  const now = Date.now();

  let dest = "/donate";
  if (entry) {
    const drives = entry.rule === "campaign-follow"
      ? await loadCampaigns(env, url.origin)
      : null;
    dest = resolveDest(entry, drives, chicagoToday(now));
  }

  const target = new URL(dest, url.origin);
  const sameSite = target.origin === url.origin;
  const params = attributionParams(slug, entry && entry.surface, known);
  for (const [k, v] of Object.entries(params)) {
    // A vendor storefront has no use for our Givebutter marker; standard utm_*
    // is the most another party could ever read.
    if (!sameSite && (k === "gba_source" || k === "src")) continue;
    target.searchParams.set(k, v);
  }

  if (ctx && typeof ctx.waitUntil === "function") {
    const kind = !known ? "unknown" : (row && row.active === 0 ? "retired" : "known");
    ctx.waitUntil(countScan(env, request, slug, kind));
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: target.toString(),
      // Never cache a redirect whose whole purpose is being changeable.
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer-when-downgrade",
    },
  });
}

async function countScan(env, request, slug, kind) {
  try {
    if (!env.WAIVERS_DB) return; // staging carries no data bindings, by design
    const cf = request && request.cf ? request.cf : {};
    // The DATABASE stamps the time, not the isolate. A Worker's Date.now() is
    // frozen at its last I/O, which put the first production scans two minutes
    // in the past; SQLite's clock is the one signal here that always moves.
    const ua = request && request.headers.get("user-agent");
    // Every field below is something Cloudflare already used to route this
    // request. Still no IP, no cookie, no cross-scan identifier.
    await env.WAIVERS_DB.prepare(
      `INSERT INTO qr_scans (slug, kind, scanned_at, country, region, city, device, referrer,
                             latitude, longitude, postal_code, continent, timezone, network, colo, os, browser)
       VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        slug,
        kind,
        cf.country || null,
        cf.region || null,
        cf.city || null,
        deviceOf(ua),
        referrerHost(request && request.headers.get("referer")),
        cf.latitude || null,
        cf.longitude || null,
        cf.postalCode || null,
        cf.continent || null,
        cf.timezone || null,
        cf.asOrganization || null,
        cf.colo || null,
        osOf(ua),
        browserOf(ua)
      )
      .run();
  } catch (err) {
    // A counter must never break a redirect. Log and move on.
    console.error("qr scan count failed:", err);
  }
}

export function listCodes() {
  return SEED;
}
