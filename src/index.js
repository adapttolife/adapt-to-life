// Adapt To Life — Worker entry.
// Serves the static site (env.ASSETS) and handles form submissions at /api/contact,
// writing leads to Airtable. The Airtable token stays server-side (Worker secret).

import { handleWaiver, handleWaiverDownload, handleWaiverVerify, handleWaiverDoc, runDriveBacklog } from "./waiver.js";
import { sendContactReceipt, sendApplyReceipt } from "./receipts.js";
import { handleEmail, handleAgentMailApi } from "./agent_mail.js";
import { handleQr } from "./qr.js";

const LEAD_TYPES = [
  "Funding for an athlete",
  "Giving or sponsoring",
  "A program for the directory",
  "Volunteering",
  "Something else",
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Signing hub: sign.adapttolife.org is the one place to sign the universal release.
    // Both site footers link here (?source=atl|asnm). Bare visits land on the release.
    if (url.hostname === "sign.adapttolife.org" && url.pathname === "/") {
      return Response.redirect(`${url.origin}/waiver${url.search}`, 302);
    }

    // Staging-only review tour: /review walks the latest iteration. Production redirects home.
    if ((url.pathname === "/review" || url.pathname === "/review.html") && env.STAGING !== "1") {
      return Response.redirect(`${url.origin}/`, 302);
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

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleSubscribe(request, env);
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

    // Spec 115: durable QR redirects. A sticker on a chair outlives any vendor,
    // so the code encodes our URL and the destination stays editable.
    if (url.pathname.startsWith("/q/")) {
      return handleQr(request, env, url, ctx);
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

  // Cron: archive newly signed releases to the Shared Drive (compliance backlog).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDriveBacklog(env));
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

  const fields = {
    Name: name || "(no name given)",
    Email: email,
    Message: message,
    Status: "New",
    Source: source || "Website — contact form",
  };
  if (LEAD_TYPES.includes(type)) fields.Type = type;

  let res;
  try {
    res = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      }
    );
  } catch (err) {
    console.error("Airtable request failed:", err);
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  if (!res.ok) {
    console.error("Airtable error", res.status, await safeText(res));
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

  const fields = {
    Name: name,
    Email: email,
    Phone: str(data.phone),
    Sport: str(data.sport),
    Location: str(data.location),
    Need: str(data.need),
    "Estimated Cost": str(data.cost),
    About: str(data.about),
    Status: "New",
    Source: "Website — apply form",
  };

  let res;
  try {
    res = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_APPLICATIONS_TABLE_ID}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ records: [{ fields }], typecast: true }),
      }
    );
  } catch (err) {
    console.error("Airtable apply request failed:", err);
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  if (!res.ok) {
    console.error("Airtable apply error", res.status, await safeText(res));
    return json({ ok: false, error: "Could not save right now. Please email hello@adapttolife.org." }, 502);
  }

  // Saved. The acknowledgement matters more here than on the contact form —
  // silence after asking for equipment money reads as "it did not go through" —
  // but it must not be able to fail the submission OR delay it. Sent after the
  // response, same as the contact receipt.
  after(ctx, sendApplyReceipt(env, { name, email, sport: str(data.sport), need: str(data.need) }));

  return json({ ok: true });
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
async function handleRaised(request, env) {
  const campaignId = env.GIVEBUTTER_CAMPAIGN_ID || "683765";
  const offline = Number(env.OFFLINE_RAISED) || 0;
  let online = 0;
  let goal = 0;
  try {
    if (env.GIVEBUTTER_API_KEY) {
      const r = await fetch(`https://api.givebutter.com/v1/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${env.GIVEBUTTER_API_KEY}`, Accept: "application/json" },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (r.ok) {
        const d = await r.json();
        online = Number(d.raised) || 0;
        goal = Number(d.goal) || 0;
      }
    }
  } catch (err) {
    console.error("givebutter raised fetch failed:", err);
  }
  const body = JSON.stringify({
    raised: online + offline,
    online,
    offline,
    // Fallback only. The live goal is Givebutter's (Send 6 to the US Open:
    // 6 athletes x $3,500). Change it there, not here (Spec 115 D3).
    goal: goal || Number(env.RAISED_GOAL) || 21000,
  });
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
