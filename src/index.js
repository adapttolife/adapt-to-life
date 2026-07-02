// Adapt To Life — Worker entry.
// Serves the static site (env.ASSETS) and handles form submissions at /api/contact,
// writing leads to Airtable. The Airtable token stays server-side (Worker secret).

import { handleWaiver, handleWaiverDownload, handleWaiverVerify, handleWaiverDoc, runDriveBacklog } from "./waiver.js";
import { handleEmail, handleAgentMailApi } from "./agent_mail.js";

const LEAD_TYPES = [
  "An athlete interested in funding",
  "A program or organization",
  "A potential donor or sponsor",
  "Media or press",
  "A volunteer",
  "Something else",
];

export default {
  async fetch(request, env) {
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
      return handleContact(request, env);
    }

    if (url.pathname === "/api/apply") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      return handleApply(request, env);
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

async function handleContact(request, env) {
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

  return json({ ok: true });
}

async function handleApply(request, env) {
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
    goal: goal || Number(env.RAISED_GOAL) || 17500,
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
