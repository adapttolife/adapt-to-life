// Adapt To Life — Worker entry.
// Serves the static site (env.ASSETS) and handles form submissions at /api/contact,
// /api/apply and /api/volunteer, writing all three to ClickUp. The ClickUp token stays server-side
// (Worker secret). See src/clickup.js and docs/clickup-trackers.md.

import { handleWaiver, handleWaiverDownload, handleWaiverVerify, handleWaiverDoc, runDriveBacklog } from "./waiver.js";
import { sendContactReceipt, sendApplyReceipt, sendVolunteerReceipt } from "./receipts.js";
import { createApplication, createContact, createVolunteer } from "./clickup.js";
import { handleEmail, handleAgentMailApi } from "./agent_mail.js";
import { handleShopContact, runShopCrmBacklog } from "./shop_contact.js";
import { handleQr } from "./qr.js";
import { handleAdmin } from "./qr_admin.js";
import { syncGifts } from "./qr_gifts.js";
import { syncClickUp } from "./qr_clickup.js";
import { fundPosition } from "./fund.js";
import { handleGivebutterWebhook } from "./givebutter_webhook.js";
import { reconcileDonorJourney } from "./givebutter_reconcile.js";

const LEAD_TYPES = [
  "Funding for an athlete",
  "Giving or sponsoring",
  "A program for the directory",
  "Volunteering",
  "Something else",
];

// The volunteer board on /volunteer, verbatim. This is a closed set on purpose:
// the page's checkboxes are the only legitimate source of a role, so anything
// else arriving here is a hand-crafted POST and is dropped rather than written
// into a field people filter on. The submitter's own words always survive in
// "What would you bring", so nothing they actually said is ever lost to this.
//
// PINNED BY test/volunteer_clickup.test.js against public/volunteer.html. Adding
// a role to the page without adding it here silently drops it, which is exactly
// the kind of quiet failure that only shows up as "why does nobody tick that
// one" six months later. The test fails the build instead.
const VOLUNTEER_ROLES = [
  "Grant writer",
  "Fundraising lead",
  "Sponsorship and partnership lead",
  "Corporate matching champion",
  "Planned and major giving advisor",
  "CPA or tax preparer",
  "Bookkeeper",
  "Nonprofit attorney",
  "Trademark counsel",
  "Insurance and risk",
  "Grant reviewer",
  "Social media manager",
  "Writer or editor",
  "Photographer or videographer",
  "Graphic designer",
  "Press and media",
  "Accessibility reviewer",
  "Adaptive sports coach",
  "Event crew",
  "Equipment technician",
  "Athlete mentor",
  "Program scout",
  "Clinical referral partner",
  "Make an introduction",
  "Host something",
  "Board and advisory",
];

// Ticking every box is legitimate but a 27-item title and field is not useful,
// and an attacker padding the array is not either.
const MAX_ROLES = 12;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Signing hub: sign.adapttolife.org is the one place to sign the universal release.
    // Both site footers link here (?source=atl|asnm). Bare visits land on the release.
    if (url.hostname === "sign.adapttolife.org" && url.pathname === "/") {
      return Response.redirect(`${url.origin}/waiver${url.search}`, 302);
    }

    // Pages that merged into another one. 301, because these URLs are in the
    // wild: /ways-to-give was in the nav, the footer and 21 body links before
    // /donate absorbed it. A merged page that still answers is worse than one
    // that redirects, because the two slowly drift apart.
    const MERGED = { "/ways-to-give": "/donate", "/ways-to-give.html": "/donate" };
    if (MERGED[url.pathname]) {
      return Response.redirect(`${url.origin}${MERGED[url.pathname]}${url.search}`, 301);
    }

    // Staging-only review tour: /review walks the latest iteration. Production redirects home.
    // /photo-picks rides the same gate: it is a working surface for choosing
    // which athlete photographs land where, not a page of the site, and it must
    // never be reachable on a custom domain even though it is noindex.
    //
    // /hero-review and the three header candidates ride it for the same reason:
    // they are a working surface for choosing a header, and a candidate
    // homepage reachable on the real domain is a second front page.
    //
    // Listed without .html; the gate strips the extension so both forms are
    // covered by one entry rather than by two that can drift apart.
    const STAGING_ONLY = new Set([
      "/review", "/photo-picks",
      "/hero-review", "/hero-1", "/hero-2", "/hero-3", "/hero-4", "/hero-5", "/hero-6", "/hero-7",
    ]);
    if (STAGING_ONLY.has(url.pathname.replace(/\.html$/, "")) && env.STAGING !== "1") {
      return Response.redirect(`${url.origin}/`, 302);
    }

    // Staging-only: render a receipt so it can actually be reviewed.
    //
    // Staging has no send_email binding by design, so the most consequential
    // copy we write, the email an applicant gets after asking for equipment
    // money, was the one artifact nobody could look at before approving it.
    // Pasting the wording into the review page would have created a second copy
    // that drifts from src/receipts.js the first time either is edited. So this
    // calls the real function with a capturing stub and returns exactly what
    // would have been sent. Off in production, where it 404s with everything
    // else that is not a page.
    // Staging serves code assets uncached. Earned 2026-09-02: a markup change
    // and a CSS change shipped together, HTML is always revalidated but
    // /css/* carries max-age=300 + stale-while-revalidate=3600, so a reviewer
    // on a phone got new HTML painted with the previous deploy's CSS. Every
    // unstyled span rendered at body size and the page looked broken. The
    // _headers comment predicts exactly this ("anything structural is exactly
    // when a mismatch would show") and the answer is that the REVIEW surface
    // cannot be the one that gambles. Production keeps the cache policy and
    // never runs this branch, because /css/* is not in its run_worker_first.
    if (env.STAGING === "1" && (url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/"))) {
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      headers.set("Cache-Control", "no-store");
      return new Response(res.body, { status: res.status, headers });
    }

    if (url.pathname === "/preview/receipt") {
      if (env.STAGING !== "1") return new Response("Not found", { status: 404 });
      return previewReceipt(env, url);
    }

    if (url.pathname === "/api/contact") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleContact(request, env, ctx);
    }

    if (url.pathname === "/api/apply") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleApply(request, env, ctx);
    }

    // The Adapt Body Shop storefront is a separate Worker with no database and
    // no mail binding. Its /contact action posts here, server-to-server, gated
    // by a shared secret AND Turnstile. See src/shop_contact.js.
    if (url.pathname === "/api/shop-contact") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
      return handleShopContact(request, env, ctx);
    }

    if (url.pathname === "/api/volunteer") {
      if (request.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
      return handleVolunteer(request, env, ctx);
    }

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleSubscribe(request, env);
    }

    // Givebutter signs successful-transaction deliveries. The handler records
    // the gift before attempting ATL's follow-up. Ordinary webhook retries are
    // idempotent; the cron reclaims interrupted or transiently failed attempts
    // through a bounded delivery lease.
    if (url.pathname === "/api/givebutter-webhook") {
      return handleGivebutterWebhook(request, env, ctx);
    }

    // Public fundraising total for the site thermometer (Givebutter live + offline gifts).
    if (url.pathname === "/api/raised") {
      return handleRaised(request, env);
    }

    // Waiver e-signature: POST to sign, GET /api/waiver/:id to download the signed PDF.
    if (url.pathname === "/api/waiver") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleWaiver(request, env);
    }
    if (url.pathname === "/api/waiver/doc") {
      return handleWaiverDoc(request, env);
    }
    if (url.pathname.startsWith("/api/waiver/")) {
      const rest = url.pathname.slice("/api/waiver/".length);
      if (rest.endsWith("/verify")) {
        return handleWaiverVerify(request, env, rest.slice(0, -"/verify".length));
      }
      return handleWaiverDownload(request, env, rest);
    }

    // Spec 32 agent email: authenticated API the agentos MCP calls (list/read/reply/status).
    if (url.pathname.startsWith("/api/agent-mail/")) {
      return handleAgentMailApi(request, env, url);
    }

    // Spec 116: durable QR redirects. A sticker on a chair outlives any vendor,
    // so the code encodes our URL and the destination stays editable.
    if (url.pathname.startsWith("/q/")) {
      return handleQr(request, env, url, ctx);
    }

    // Spec 116 P2: the QR admin, behind the "ATL QR Admin" Cloudflare Access
    // application on adapttolife.org/admin.
    //
    // Production-only, and the gate has to live here rather than rely on Access
    // alone: an Access application is bound to a HOSTNAME, and the staging
    // Worker answers on workers.dev where no such application exists. Assets
    // normally serve before the Worker, so without this (and the matching
    // run_worker_first in wrangler.jsonc) the admin page would be readable by
    // anyone who guessed the staging URL. The API itself already fails closed
    // on a missing Access JWT; this closes the page too.
    if (url.pathname.startsWith("/admin")) {
      if (env.STAGING === "1") return new Response("Not found", { status: 404 });
      // Access gates the edge; src/qr_admin.js verifies the JWT again here, so
      // the API cannot be reached by deleting or re-scoping the Access app.
      if (url.pathname.startsWith("/admin/api/")) {
        return handleAdmin(request, env, url);
      }
      // Mission Control (Spec 127) is a single-page app: its client routes are
      // real URLs a person can bookmark or reload, but only /admin/app/ exists
      // on disk. Anything under it that is not a built asset serves the app
      // shell so the router can take over. Without this, reloading on
      // /admin/app/qr 404s — the classic SPA deep-link failure.
      if (url.pathname.startsWith("/admin/app") && !url.pathname.includes("/assets/")) {
        const shell = await env.ASSETS.fetch(new Request(`${url.origin}/admin/app/index.html`));
        return new Response(shell.body, {
          status: shell.status,
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      // /admin/qr — the original single-file page — is a static asset served
      // below, and keeps working untouched for the whole migration (AC1).
    }

    // Reports have moved to their own Worker on reports.amelioration.is, behind
    // Cloudflare Access. Links already sitting in inboxes still say
    // adapttolife.org, and an email cannot be edited after it is sent — so the
    // two legacy namespaces forward there instead of breaking.
    const moved = legacyReportRedirect(request, env, url);
    if (moved) return moved;

    // Anything left under /r/ or /lib/ is a report request on a host that is
    // not one of the two published ones — sign.adapttolife.org, workers.dev, a
    // preview URL. This Worker no longer renders reports, so those fail closed.
    if (LEGACY_REPORT_PATHS.some((p) => url.pathname.startsWith(p))) {
      return reportsMovedNotFound();
    }

    // Everything else: the static site.
    return env.ASSETS.fetch(request);
  },

  // Cron, every 10 minutes: archive newly signed releases to the Shared Drive
  // (compliance backlog), and pull QR-attributed gifts back from Givebutter
  // (Spec 116 P6). Two independent jobs on one schedule — each is wrapped so a
  // failure in either cannot stop the other, and the gift sync is idempotent
  // on Givebutter's own transaction id, so a repeated or overlapping run can
  // never double-count a donation.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDriveBacklog(env));
    ctx.waitUntil(runShopCrmBacklog(env).catch((err) => console.error("shop CRM sync crashed:", err)));
    ctx.waitUntil(
      syncGifts(env).then((r) => {
        if (!r.ok) console.error("qr gift sync failed:", r.error);
        else if (r.written) console.log(`qr gift sync: ${r.written} attributed gift(s) recorded`);
      })
    );
    // The webhook is only the fast path. This single scheduled owner polls every
    // successful post-activation Givebutter transaction into D1 first, then closes
    // thank-you and ClickUp work in order. A provider failure remains visible as a
    // red receipt but cannot block recovery of work already durable in D1.
    ctx.waitUntil(
      reconcileDonorJourney(env).then((r) => {
        if (!r.ok) {
          console.error("donor journey reconciliation failed:", JSON.stringify(r));
          return;
        }
        if (r.reconciliation.written || r.email.sent || r.donors.created || r.donors.updated || r.gifts.created || r.gifts.updated) {
          console.log("donor journey reconciled:", JSON.stringify(r));
        }
      }).catch((err) => console.error("donor journey reconciliation crashed:", err))
    );
    // Mirror observations into the ClickUp register once a day. Self-limiting:
    // it records the date it ran and no-ops for the rest of the day's ticks.
    ctx.waitUntil(
      syncClickUp(env).then((r) => {
        if (!r.ok) console.error("qr clickup sync failed:", r.error);
        else if (r.updated) console.log(`qr clickup sync: ${r.updated} task(s) updated`);
      })
    );
  },

  // Spec 32 agent email: inbound mail for *@agents.adapttolife.org (Cloudflare Email Routing).
  async email(message, env, ctx) {
    await handleEmail(message, env, ctx);
  },
};

// The only hostnames whose /r/ and /lib/ links were ever published to readers.
// sign.adapttolife.org and the staging / workers.dev hosts are deliberately
// absent: they never minted report links, and forwarding them would move
// traffic off a host an operator is deliberately testing on.
const LEGACY_REPORT_HOSTS = new Set(["adapttolife.org", "www.adapttolife.org"]);
const LEGACY_REPORT_PATHS = ["/r/", "/lib/"];

// Forward a legacy report link to the report Worker's origin, or null to leave
// the request alone.
//
// The destination is assembled from env.REPORT_LINK_BASE — the same configured
// origin new links are minted with — and the request's already-parsed pathname
// and search. Nothing from the request's host, and no string concatenation of
// a scheme with untrusted input, goes into it: resolving against the base URL
// means a path can only ever land under the configured origin, so this cannot
// become an open redirect no matter what a prober puts in the URL.
function legacyReportRedirect(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  if (!LEGACY_REPORT_HOSTS.has(url.hostname)) return null;
  if (!LEGACY_REPORT_PATHS.some((p) => url.pathname.startsWith(p))) return null;

  let dest;
  try {
    dest = new URL(url.pathname + url.search, String(env.REPORT_LINK_BASE || ""));
  } catch {
    return null; // unset or unparseable base: the fail-closed backstop handles it.
  }
  // A base still pointing at this host would redirect to itself forever.
  if (dest.origin === url.origin) return null;

  return new Response(null, {
    status: 302,
    headers: {
      Location: dest.toString(),
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// The backstop behind that redirect.
//
// A report token is a capability: it verifies against REPORT_LINK_SECRET, not
// against a hostname. So for as long as this Worker could render a report, a
// valid token was a working, unauthenticated way to read client-confidential
// material on every host this Worker answers on — sign.adapttolife.org, the
// workers.dev URL, any version preview URL. None of those are behind the
// Cloudflare Access policy that protects reports.amelioration.is; the policy
// was simply not on the path. Deleting the viewer from this Worker is what
// closes that, and this 404 is what a deleted route looks like.
//
// This response is intentionally local to the public router. Its exact status,
// body, cache and indexing behavior are pinned by the redirect tests so future
// report-view changes cannot accidentally reopen or fingerprint this surface.
function reportsMovedNotFound() {
  return new Response("Not found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// Run a side effect after the response goes out. Receipts must never delay a
// submission (awaiting one put a live SMTP round-trip on the critical path and
// the form visibly hung), and must never fail one either — so a missing ctx
// degrades to fire-and-forget rather than throwing on ctx.waitUntil.
function after(ctx, promise) {
  try {
    if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(promise);
    else Promise.resolve(promise).catch(() => {});
  } catch (err) {
    console.error("after() could not schedule work:", err);
  }
}

async function handleContact(request, env, ctx) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      data = await request.json();
    } else {
      const form = await request.formData();
      data = Object.fromEntries(form);
    }
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  // Honeypot — bots fill the hidden "company" field. Accept silently, store nothing.
  if (str(data.company)) return json({ ok: true });

  if (!(await verifyTurnstile(env, str(data.cf_token), request.headers.get("CF-Connecting-IP")))) {
    return json({ ok: false, error: "Verification failed. Please reload the page and try again." }, 403);
  }

  const firstName = str(data.fn);
  const lastName = str(data.ln);
  const email = str(data.em);
  const type = str(data.rsn);
  const message = str(data.msg);
  const name = `${firstName} ${lastName}`.trim();
  // Optional client-supplied attribution (e.g. an ambassador page). Capped; falls back to the default.
  const source = str(data.source).slice(0, 80);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "A valid email is required." }, 422);
  }
  if (!name && !message) {
    return json({ ok: false, error: "Please add your name or a message." }, 422);
  }

  // Contacts land in the ClickUp "Contacts" list. See src/clickup.js.
  const saved = await createContact(env, {
    name: name || "(no name given)",
    email,
    phone: "",
    type: LEAD_TYPES.includes(type) ? type : "",
    message,
    source: source || "Submitted through the contact form on adapttolife.org.",
  });

  if (!saved.ok) {
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  // The record is saved. Send the receipt AFTER responding: awaiting it here put
  // a live SMTP round-trip on the critical path and the form visibly hung for
  // seconds while the submitter watched a spinner. ctx.waitUntil keeps the
  // Worker alive until the send settles without making anyone wait for it.
  //
  // The receipt is a courtesy on top of a saved record and must never be able to
  // turn a successful submission into a failed one, or a slow one.
  after(ctx, sendContactReceipt(env, { name, email, message, type }));

  return json({ ok: true });
}

async function handleApply(request, env, ctx) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  // Honeypot — bots fill the hidden "company" field. Accept silently, store nothing.
  if (str(data.company)) return json({ ok: true });

  if (!(await verifyTurnstile(env, str(data.cf_token), request.headers.get("CF-Connecting-IP")))) {
    return json({ ok: false, error: "Verification failed. Please reload the page and try again." }, 403);
  }

  const name = `${str(data.fn)} ${str(data.ln)}`.trim();
  const email = str(data.em);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "A valid email is required." }, 422);
  }
  if (!name) {
    return json({ ok: false, error: "Please add your name." }, 422);
  }

  // Applications go to the ClickUp "Hustle & Heart — Applications" list — the
  // applicant tracker, and the list ATL actually works from. See src/clickup.js.
  const saved = await createApplication(env, {
    name,
    email,
    phone: str(data.phone),
    sport: str(data.sport),
    location: str(data.location),
    need: str(data.need),
    cost: str(data.cost),
    about: str(data.about),
  });

  if (!saved.ok) {
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  // Saved. The acknowledgement matters more here than on the contact form —
  // silence after asking for equipment money reads as "it did not go through" —
  // but it must not be able to fail the submission OR delay it. Sent after the
  // response, same as the contact receipt.
  after(ctx, sendApplyReceipt(env, { name, email, sport: str(data.sport), need: str(data.need) }));

  return json({ ok: true });
}

// Volunteer board -> the ClickUp "Volunteers" list.
//
// Deliberately its own list and its own route rather than a sixth option on the
// contact form. A CPA offering to do our first Form 990 and someone asking where
// their popcorn is are not the same workflow, and the failure this whole
// destination exists to prevent is a professional's pro bono offer aging out in a
// general inbox. They do not offer twice.
async function handleVolunteer(request, env, ctx) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  // Honeypot — bots fill the hidden "company" field. Accept silently, store nothing.
  if (str(data.company)) return json({ ok: true });

  if (!(await verifyTurnstile(env, str(data.cf_token), request.headers.get("CF-Connecting-IP")))) {
    return json({ ok: false, error: "Verification failed. Please reload the page and try again." }, 403);
  }

  // Two shapes reach here. A role page posts { name, em, role } and nothing
  // else, because applying for one role should cost a name, an email and one
  // button. The board posts { name, em, bring } for someone who did not find
  // themselves in the list. Older { fn, ln } still works.
  const name = str(data.name) || `${str(data.fn)} ${str(data.ln)}`.trim();
  const email = str(data.em);
  const bring = str(data.bring);
  const roles = normalizeRoles(data.role || data.roles);

  if (!email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) === false) {
    return json({ ok: false, error: "A valid email is required." }, 422);
  }
  if (!name) {
    return json({ ok: false, error: "Please add your name." }, 422);
  }
  // The page enforces this too. Enforced again here because the page's copy
  // promises we will come back with a real scope, and we cannot do that from a
  // name and an email alone.
  if (!roles.length && !bring) {
    return json({ ok: false, error: "Add a role, or tell us what you would want to do." }, 422);
  }

  const saved = await createVolunteer(env, {
    name,
    email,
    phone: str(data.phone),
    based: str(data.based),
    time: str(data.time),
    links: str(data.links),
    bring,
    roles,
    source: str(data.source).slice(0, 80) || "Submitted through the volunteer form on adapttolife.org.",
  });

  if (!saved.ok) {
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  // Same contract as the other two: the record is already saved, so the receipt
  // is sent after the response and can never fail or slow the submission.
  after(ctx, sendVolunteerReceipt(env, { name, email, roles, bring }));

  return json({ ok: true });
}

// Roles arrive as an array from the page and as a comma string from a plain form
// post. Anything not on the board is dropped, duplicates collapse, and the order
// of the board is preserved so two people who ticked the same boxes read the same
// way in a list view.
export function normalizeRoles(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const wanted = new Set(list.map((r) => String(r || "").trim().toLowerCase()).filter(Boolean));
  return VOLUNTEER_ROLES.filter((r) => wanted.has(r.toLowerCase())).slice(0, MAX_ROLES);
}

// Newsletter / email capture -> beehiiv. API key + publication id are Worker secrets.
async function handleSubscribe(request, env) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }

  // Honeypot — bots fill the hidden "company" field. Accept silently, do nothing.
  if (str(data.company)) return json({ ok: true });

  if (!(await verifyTurnstile(env, str(data.cf_token), request.headers.get("CF-Connecting-IP")))) {
    return json({ ok: false, error: "Verification failed. Please reload the page and try again." }, 403);
  }

  const email = str(data.em);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "Please enter a valid email." }, 422);
  }

  if (!env.BEEHIIV_API_KEY || !env.BEEHIIV_PUBLICATION_ID) {
    console.error("beehiiv not configured (missing API key or publication id)");
    return json({ ok: false, error: "Sign-up is temporarily unavailable. Please email hello@adapttolife.org." }, 503);
  }

  // Optional client attribution (e.g. "subscribe-page", "footer", an event name).
  const source = str(data.source).slice(0, 80) || "adapttolife.org";

  let res;
  try {
    res = await fetch(
      `https://api.beehiiv.com/v2/publications/${env.BEEHIIV_PUBLICATION_ID}/subscriptions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.BEEHIIV_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          reactivate_existing: true,
          send_welcome_email: true,
          utm_source: source,
          utm_medium: "website",
          referring_site: "adapttolife.org",
        }),
      }
    );
  } catch (err) {
    console.error("beehiiv request failed:", err);
    return json({ ok: false, error: "Could not sign you up right now. Please email hello@adapttolife.org." }, 502);
  }

  if (!res.ok) {
    console.error("beehiiv error", res.status, await safeText(res));
    return json({ ok: false, error: "Could not sign you up right now. Please email hello@adapttolife.org." }, 502);
  }

  return json({ ok: true });
}

// Public fundraising total for the site thermometer: Givebutter's live "raised" for the
// campaign plus an offline figure we control (in-person gifts). Cached 60s at the edge.
// The public thermometer. Reads src/fund.js, which the grant-application
// receipt also reads, so the number on the page and the number we put in
// writing to an applicant come from one place and cannot drift apart.
async function handleRaised(request, env) {
  const { raised, online, offline, goal } = await fundPosition(env);
  const body = JSON.stringify({ raised, online, offline, goal });
  return new Response(body, {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}

// Cloudflare Turnstile server-side verification. Fail-open if no secret is configured
// (so a missing binding never hard-breaks the forms); fail-closed on a bad/absent token.
async function verifyTurnstile(env, token, ip) {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || undefined }),
    });
    const data = await res.json();
    return !!data.success;
  } catch (err) {
    console.error("turnstile verify failed:", err);
    return false;
  }
}

function str(v) {
  return (typeof v === "string" ? v : "").trim().slice(0, 5000);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function safeText(res) {
  try { return await res.text(); } catch { return "(no body)"; }
}

// ---------------------------------------------------------------------------
// Staging receipt preview (see the route above). Reuses the production senders
// through a capturing SEND_EMAIL stub, so what renders here is byte-for-byte
// what an applicant receives. Never reachable in production.
// ---------------------------------------------------------------------------
async function previewReceipt(env, url) {
  const asked = url.searchParams.get("type");
  const kind = asked === "contact" || asked === "volunteer" ? asked : "apply";
  const captured = [];
  const stub = { ...env, SEND_EMAIL: { send: (msg) => (captured.push(msg), {}) } };

  if (kind === "volunteer") {
    await sendVolunteerReceipt(stub, {
      name: "Jordan Rivers",
      email: "jordan@example.com",
      roles: ["CPA or tax preparer", "Grant writer", "Make an introduction"],
      bring: "Twenty years preparing returns for small charities, and a board contact at a family foundation that funds adaptive sport.",
    });
  } else if (kind === "contact") {
    await sendContactReceipt(stub, {
      name: "Jordan Rivers",
      email: "jordan@example.com",
      message: "Is there a program near Rockford for a 12 year old who wants to try basketball?",
      type: "Funding for an athlete",
    });
  } else {
    await sendApplyReceipt(stub, {
      name: "Jordan Rivers",
      email: "jordan@example.com",
      sport: "Wheelchair basketball",
      need: "A sport chair so I can join the league season in the fall",
    });
  }

  const msg = captured[0];
  if (!msg) return new Response("Receipt did not render", { status: 500 });

  const banner =
    `<div style="font:600 13px/1.5 -apple-system,system-ui,sans-serif;background:#1c1a15;` +
    `color:#faf8f4;padding:12px 16px">Staging preview of the real send. ` +
    `Subject: ${escapeHtml(msg.subject)} &nbsp;|&nbsp; To: ${escapeHtml(String(msg.to))} ` +
    `&nbsp;|&nbsp; Bcc: ${escapeHtml(String(msg.bcc))}` +
    `<div style="font-weight:400;opacity:.75;margin-top:4px">Any dollar figure below was read live ` +
    `from Givebutter just now. If that call fails the sentence is dropped rather than estimated, so ` +
    `its absence on a future load is the safeguard working, not a bug.</div></div>`;

  return new Response(
    `<!doctype html><meta name="robots" content="noindex,nofollow">` +
      `<title>Receipt preview</title><body style="margin:0;background:#f4f2ee">` +
      banner +
      `<div style="padding:28px 16px">${msg.html}</div>` +
      `<div style="padding:0 16px 40px"><pre style="white-space:pre-wrap;font:13px/1.6 ui-monospace,` +
      `monospace;color:#3f3d38;background:#fff;border:1px solid #e3e0d9;border-radius:10px;padding:16px">` +
      `${escapeHtml(msg.text)}</pre></div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } }
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
