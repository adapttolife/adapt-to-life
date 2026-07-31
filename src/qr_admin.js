// Spec 116 — the QR admin surface. Everything under /admin/qr.
//
// Repointing a code changes where physical objects in the world send people,
// so this module is deliberately paranoid about three things:
//
//   1. WHO. Cloudflare Access gates /admin at the edge (app "ATL QR Admin"),
//      and this file verifies the Access JWT again inside the Worker. Two
//      controls, because if the Access app is ever deleted or its path edited,
//      the edge gate silently disappears and nothing else would notice. A
//      control that vanishes quietly is not a control.
//   2. WHAT. A slug is printed matter: it can be minted and retired, never
//      reused and never deleted (D4). Destinations are validated so /q/ can
//      never be turned into an open redirect to an arbitrary scheme.
//   3. THE RECORD. Every mint, repoint, and retire writes a qr_code_events row
//      with the Access-verified email, so "who repointed the chair stickers in
//      October" has an answer.

import { syncGifts, giftsBySlug } from "./qr_gifts.js";
import { _resetCaches } from "./qr.js";

const TEAM_DOMAIN = "theateam1.cloudflareaccess.com";
// The audience tag of the "ATL QR Admin" Access application. Public, not a
// secret: it identifies which app a token was minted for, and checking it is
// what stops a token issued for a DIFFERENT app on this same team from being
// replayed here.
const ACCESS_AUD = "ca9188a0496a0b1cc0708d7b22929e134a85ea31c9cd8df5997f7985b31ab403";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

let keyCache = { at: 0, keys: null };
const KEY_TTL_MS = 60 * 60 * 1000;

function b64urlToBytes(s) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function accessKeys() {
  const now = Date.now();
  if (keyCache.keys && now - keyCache.at < KEY_TTL_MS) return keyCache.keys;
  const res = await fetch(`https://${TEAM_DOMAIN}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`access certs ${res.status}`);
  const body = await res.json();
  keyCache = { at: now, keys: body.keys || [] };
  return keyCache.keys;
}

// Returns the verified email, or null. Never throws into the request path:
// a verification failure is a 403, not a 500.
export async function verifyAccess(request) {
  try {
    let token = request.headers.get("Cf-Access-Jwt-Assertion");
    if (!token) {
      const cookie = request.headers.get("Cookie") || "";
      const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
      token = m ? m[1] : null;
    }
    if (!token) return null;

    const [h, p, s] = token.split(".");
    if (!h || !p || !s) return null;
    const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(h)));
    const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(p)));

    // Audience and expiry are checked BEFORE the signature is trusted for
    // anything, and the signature is what makes either claim meaningful.
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(ACCESS_AUD)) return null;
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    if (payload.iss && payload.iss !== `https://${TEAM_DOMAIN}`) return null;

    const jwk = (await accessKeys()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey(
      "jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", key,
      b64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`)
    );
    if (!ok) return null;
    return payload.email || payload.common_name || "unknown";
  } catch (err) {
    console.error("access verify failed:", err);
    return null;
  }
}

// A destination may be a path on our own site or a vendor's https URL, and
// nothing else. Without this, an admin field would be a way to turn
// adapttolife.org/q/<slug> into a redirect to any scheme at all.
export function validateDest(dest) {
  if (typeof dest !== "string" || !dest.trim()) return "destination is required";
  const d = dest.trim();
  if (d.startsWith("//")) return "protocol-relative URLs are not allowed";
  if (d.startsWith("/")) return null;
  let u;
  try { u = new URL(d); } catch { return "destination must be a path like /send-6 or a full https:// URL"; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return "only http(s) destinations are allowed";
  return null;
}

export function validateSlug(slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return "slug must be lowercase letters, numbers and hyphens (max 32)";
  }
  return null;
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

async function logEvent(env, slug, action, oldDest, newDest, actor, detail) {
  await env.WAIVERS_DB.prepare(
    `INSERT INTO qr_code_events (slug, action, old_dest, new_dest, actor, detail, at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(slug, action, oldDest || null, newDest || null, actor, detail || null, new Date().toISOString()).run();
}

// One query per fact, joined in JS. Three small reads on a page one or two
// people open is cheaper to read than a triple LEFT JOIN nobody can debug.
async function overview(env) {
  const codes = (await env.WAIVERS_DB.prepare(
    `SELECT slug, dest, rule, label, surface, notes, active, created_at, updated_at, retired_at
       FROM qr_codes ORDER BY active DESC, slug`
  ).all()).results || [];

  const scans = (await env.WAIVERS_DB.prepare(
    `SELECT slug,
            COUNT(*)                        AS scans,
            COUNT(DISTINCT substr(scanned_at, 1, 10)) AS days,
            SUM(CASE WHEN device = 'ios'     THEN 1 ELSE 0 END) AS ios,
            SUM(CASE WHEN device = 'android' THEN 1 ELSE 0 END) AS android,
            SUM(CASE WHEN device NOT IN ('ios','android') OR device IS NULL THEN 1 ELSE 0 END) AS other,
            MAX(scanned_at)                 AS last_scan
       FROM qr_scans GROUP BY slug`
  ).all()).results || [];

  const gifts = await giftsBySlug(env);

  const byScan = new Map(scans.map((r) => [r.slug, r]));
  const byGift = new Map(gifts.map((r) => [r.slug, r]));
  return codes.map((c) => ({
    ...c,
    active: Boolean(c.active),
    scans: byScan.get(c.slug) || { scans: 0, days: 0, ios: 0, android: 0, other: 0, last_scan: null },
    money: byGift.get(c.slug) || { gifts: 0, dollars: 0, last_gift: null },
    url: `https://adapttolife.org/q/${c.slug}`,
  }));
}

export async function handleAdmin(request, env, url) {
  const email = await verifyAccess(request);
  if (!email) {
    return json({ ok: false, error: "not authorised — reach this page through Cloudflare Access" }, 403);
  }
  if (!env.WAIVERS_DB) return json({ ok: false, error: "no database binding" }, 503);

  const path = url.pathname;

  if (path === "/admin/api/codes" && request.method === "GET") {
    return json({ ok: true, you: email, codes: await overview(env) });
  }

  // Mint. A brand-new slug only — reusing one would silently redirect every
  // sticker already carrying it (D4).
  if (path === "/admin/api/codes" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const slug = String(body.slug || "").trim().toLowerCase();
    const bad = validateSlug(slug) || validateDest(body.dest);
    if (bad) return json({ ok: false, error: bad }, 400);
    if (!String(body.label || "").trim()) return json({ ok: false, error: "label is required" }, 400);

    const existing = await env.WAIVERS_DB.prepare(`SELECT slug FROM qr_codes WHERE slug = ?`).bind(slug).first();
    if (existing) {
      return json({ ok: false, error: `"${slug}" already exists. Slugs are printed matter and are never reused — pick a new one.` }, 409);
    }

    const now = new Date().toISOString();
    await env.WAIVERS_DB.prepare(
      `INSERT INTO qr_codes (slug, dest, rule, label, surface, notes, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      slug, String(body.dest).trim(), body.rule === "campaign-follow" ? "campaign-follow" : null,
      String(body.label).trim(), (body.surface || "print").trim(), body.notes || null, now, now
    ).run();
    await logEvent(env, slug, "mint", null, String(body.dest).trim(), email, body.label);
    _resetCaches();
    return json({ ok: true, slug, url: `https://adapttolife.org/q/${slug}` }, 201);
  }

  if (path.startsWith("/admin/api/codes/") && request.method === "PATCH") {
    const slug = path.slice("/admin/api/codes/".length).toLowerCase();
    const row = await env.WAIVERS_DB.prepare(`SELECT * FROM qr_codes WHERE slug = ?`).bind(slug).first();
    if (!row) return json({ ok: false, error: "no such code" }, 404);

    const body = await request.json().catch(() => ({}));
    const fields = [];
    const binds = [];
    let action = "edit";
    let newDest = row.dest;

    if (body.dest !== undefined) {
      const bad = validateDest(body.dest);
      if (bad) return json({ ok: false, error: bad }, 400);
      newDest = String(body.dest).trim();
      if (newDest !== row.dest) action = "repoint";
      fields.push("dest = ?"); binds.push(newDest);
    }
    if (body.rule !== undefined) {
      fields.push("rule = ?"); binds.push(body.rule === "campaign-follow" ? "campaign-follow" : null);
    }
    if (body.label !== undefined)   { fields.push("label = ?");   binds.push(String(body.label).trim()); }
    if (body.surface !== undefined) { fields.push("surface = ?"); binds.push(String(body.surface).trim() || "print"); }
    if (body.notes !== undefined)   { fields.push("notes = ?");   binds.push(body.notes || null); }
    if (body.active !== undefined) {
      const active = body.active ? 1 : 0;
      action = active ? "restore" : "retire";
      fields.push("active = ?");     binds.push(active);
      fields.push("retired_at = ?"); binds.push(active ? null : new Date().toISOString());
    }
    if (!fields.length) return json({ ok: false, error: "nothing to change" }, 400);

    fields.push("updated_at = ?"); binds.push(new Date().toISOString());
    binds.push(slug);
    await env.WAIVERS_DB.prepare(`UPDATE qr_codes SET ${fields.join(", ")} WHERE slug = ?`).bind(...binds).run();
    await logEvent(env, slug, action, row.dest, newDest, email, body.reason || null);
    _resetCaches();
    return json({ ok: true, slug, action });
  }

  if (path === "/admin/api/history" && request.method === "GET") {
    const { results } = await env.WAIVERS_DB.prepare(
      `SELECT slug, action, old_dest, new_dest, actor, detail, at
         FROM qr_code_events ORDER BY at DESC LIMIT 100`
    ).all();
    return json({ ok: true, events: results || [] });
  }

  // Pull attributed gifts on demand, so proving the money chain does not mean
  // waiting for the next cron.
  if (path === "/admin/api/sync" && request.method === "POST") {
    const result = await syncGifts(env);
    return json({ ok: result.ok, result });
  }

  return json({ ok: false, error: "unknown admin route" }, 404);
}
