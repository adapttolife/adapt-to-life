// Staging runs the same HTTP application with live production service bindings.
// Export fetch only: scheduled work and email events remain production-owned.
import application from "./index.js";

// Routes that must never run on staging, because staging shares production
// data and Worker credentials and these reach real people or outside systems
// directly from the request:
// - /api/givebutter-webhook: a replayed signed payload would write a real donor
//   row and send a real thank-you. Givebutter only posts to production.
// - /api/subscribe: adds a real contact to the Resend segment and starts the
//   welcome series to that address.
// - /api/waiver: signing writes a real release into the production waiver
//   record and uploads it to the production Google Shared Drive archive.
// - /unsubscribe: changes the real contact in the production Resend team.
// - /api/shop-contact: the storefront posts only to production; a staging row
//   (message or footer sign-up) would be filed to the CRM sheet by production's
//   cron, since the tables are shared.
// - /api/contact, /api/apply, /api/volunteer: their outbox rows go into the
//   shared form tables. This branch tags each row with its environment and
//   sends only its own, but the code on main (production) sweeps every pending
//   row, so a staging submission could be mailed and filed to the CRM by
//   production. They stay closed here until main filters by env; reopen them
//   in a later PR (docs/EMAIL.md, "Testing before it counts").
const PRODUCTION_ONLY = new Set([
  "/api/givebutter-webhook",
  "/api/subscribe",
  "/api/waiver",
  "/unsubscribe",
  "/api/shop-contact",
  "/api/contact",
  "/api/apply",
  "/api/volunteer",
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (PRODUCTION_ONLY.has(url.pathname.replace(/\/+$/, ""))) {
      return new Response("Not found", {
        status: 404,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, nofollow, noarchive",
        },
      });
    }
    if (url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {
        headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" },
      });
    }
    const response = await application.fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
