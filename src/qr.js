// Durable QR redirects (Spec 115).
//
// The problem this solves: a QR sticker on an athlete's chair lives for years.
// Whatever URL it encodes can never change. So the code encodes a short URL on
// OUR domain, and the destination behind it is data we can edit any time.
//
//   adapttolife.org/q/chair  →  302  →  wherever we point it today
//
// That outlives every vendor, subscription, and redesign. Changing where a
// sticker goes is a one-line edit here, not a reprint.
//
// Scans are counted per code so we know which surface actually works.

const CODES = {
  // slug: { to, label, note }
  chair: {
    to: "/donate",
    label: "Chair sticker",
    note: "Stickers on athletes' chairs. Point at the live campaign page once /send-6 exists.",
  },
  sign: {
    to: "/donate",
    label: "Event signage",
    note: "Banners and table signs at tournaments.",
  },
  card: {
    to: "/donate",
    label: "Hand card",
    note: "Printed cards handed out courtside.",
  },
  popcorn: {
    to: "/popcorn",
    label: "Popcorn drive",
    note: "Anything promoting the current Double Good drive.",
  },
};

// Kept deliberately small: a redirect that has to think is a redirect that breaks.
export async function handleQr(request, env, url, ctx) {
  const slug = url.pathname.replace(/^\/q\//, "").replace(/\/+$/, "").toLowerCase();
  const entry = CODES[slug];

  // Unknown code still lands somewhere useful. A sticker in the wild must never 404.
  const dest = entry ? entry.to : "/donate";

  const target = new URL(dest, url.origin);
  // Attribution: we can see in analytics which physical surface drove a gift.
  target.searchParams.set("src", entry ? `qr-${slug}` : "qr-unknown");

  if (ctx && typeof ctx.waitUntil === "function") {
    ctx.waitUntil(countScan(env, slug, entry ? "known" : "unknown"));
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

async function countScan(env, slug, kind) {
  try {
    if (!env.WAIVERS_DB) return; // D1 binding already present on prod
    await env.WAIVERS_DB.prepare(
      `INSERT INTO qr_scans (slug, kind, scanned_at) VALUES (?, ?, ?)`
    )
      .bind(slug, kind, new Date().toISOString())
      .run();
  } catch (err) {
    // A counter must never break a redirect. Log and move on.
    console.error("qr scan count failed:", err);
  }
}

export function listCodes() {
  return CODES;
}
