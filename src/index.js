import { safeNewsletterSubscribe } from "./newsletter.js";
import { acceptForm, sweepForms } from "./forms.js";
import { sendMail } from "./mail-transport.js";
// Adapt To Life — Worker entry.
// Serves the static site (env.ASSETS) and handles form submissions at /api/contact,
// /api/apply and /api/volunteer through the durable form outbox (src/forms.js): a
// receipt to the submitter and one shared intake record, which notifies hello@ and
// feeds the Google Sheet CRM. ClickUp was retired 2026-10-02.

import {
  handleWaiver,
  handleWaiverDownload,
  handleWaiverVerify,
  handleWaiverDoc,
  runDriveBacklog,
} from "./waiver.js";
import {
  sendContactReceipt,
  sendApplyReceipt,
  sendVolunteerReceipt,
} from "./receipts.js";
import { verifyTurnstile, overFormLimit, RATE_LIMITED } from "./turnstile.js";
import { handleEmail, handleAgentMailApi } from "./agent_mail.js";
import {
  handleShopContact,
  runShopCrmBacklog,
  runShopNewsletterBacklog,
} from "./shop_contact.js";
import { handleQr } from "./qr.js";
import { handleAdmin } from "./qr_admin.js";
import {
  adminEmail,
  consumeLogin,
  readAdminSession,
  requestLogin,
  sendAdminLink,
} from "./asnm_admin_auth.js";
import { syncGifts } from "./qr_gifts.js";
import { fundPosition } from "./fund.js";
import { handleGivebutterWebhook } from "./givebutter_webhook.js";
import { reconcileDonorJourney } from "./givebutter_reconcile.js";
import {
  recordIntake,
  notifyIntake,
  sweepIntake,
  runIntakeCanary,
  canaryIsFresh,
} from "./intake.js";

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
// PINNED BY test/volunteer_roles.test.js against public/volunteer/. Adding
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

const ADMIN_CACHE = "private, no-store";

function adminSecret(env) {
  return env.ADMIN_AUTH_SIGNING_KEY;
}

function approvedAdminOrigin(value) {
  try {
    const origin = new URL(value).origin;
    const parsed = new URL(origin);
    const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
    const hosted =
      parsed.hostname === "adapttolife.org" ||
      parsed.hostname.endsWith(".adapttolife.org") ||
      parsed.hostname.endsWith(".adapt-to-life.workers.dev");

    if (
      (local && ["http:", "https:"].includes(parsed.protocol)) ||
      (hosted && parsed.protocol === "https:")
    ) {
      return origin;
    }
  } catch {
    return null;
  }

  return null;
}

export function adminLoginOrigin(request, url, requestedOrigin = "") {
  const explicitOrigin = approvedAdminOrigin(requestedOrigin);
  if (explicitOrigin) {
    return explicitOrigin;
  }

  const forwardedHost = String(request.headers.get("X-Forwarded-Host") || "")
    .split(",")[0]
    .trim();
  const host = forwardedHost || String(request.headers.get("Host") || "").trim();

  if (!host) {
    return url.origin;
  }

  try {
    const origin = new URL(`${url.protocol}//${host}`).origin;
    return new URL(origin).host === host.toLowerCase()
      ? approvedAdminOrigin(origin) || url.origin
      : url.origin;
  } catch {
    return url.origin;
  }
}

export function useAsnmService(env) {
  return env.ENV_NAME !== "staging" && Boolean(env.ASNM);
}

const ASNM_ADMIN_COLLECTIONS = {
  organizations: {
    table: "organizations",
    name: "name",
    fields: [
      "name",
      "org_type",
      "sport",
      "sport_key",
      "sports_json",
      "website_url",
      "email",
      "claim_email",
      "phone",
      "city",
      "state",
      "state_name",
      "zip",
      "address",
      "country",
      "lat",
      "lng",
      "geo_precision",
      "description",
      "cost_note",
      "equipment_provided",
      "ages",
      "data_quality_rating",
      "primary_data_source",
      "verification_status",
      "verification_method",
      "status",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
      "last_ok_at",
    ],
    booleans: [
      "equipment_provided",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
    ],
    numbers: ["lat", "lng"],
  },
  programs: {
    table: "programs",
    name: "name",
    fields: [
      "organization_id",
      "name",
      "sport",
      "sport_key",
      "sports_json",
      "website_url",
      "email",
      "phone",
      "city",
      "state",
      "state_name",
      "zip",
      "address",
      "country",
      "lat",
      "lng",
      "geo_precision",
      "description",
      "cost_note",
      "equipment_provided",
      "ages",
      "verification_status",
      "verification_method",
      "status",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
      "last_ok_at",
      "kind",
      "listing",
      "seasons_json",
      "usual_month",
      "first_year",
      "slug",
    ],
    booleans: [
      "equipment_provided",
      "is_public",
      "publicity_consent",
      "address_publicity_consent",
    ],
    numbers: ["lat", "lng", "usual_month", "first_year"],
  },
  events: {
    table: "events",
    name: "title",
    fields: [
      "title",
      "description",
      "org_id",
      "program_id",
      "sport_key",
      "venue",
      "city",
      "state",
      "url",
      "recap_url",
      "starts_at",
      "ends_at",
      "all_day",
      "status",
      "is_public",
      "source",
    ],
    booleans: ["all_day", "is_public"],
    numbers: [],
  },
  grants: {
    table: "grants",
    name: "name",
    fields: [
      "name",
      "source",
      "type",
      "audience",
      "amount_min_cents",
      "amount_max_cents",
      "amount_display",
      "deadline_display",
      "deadline_next",
      "description",
      "eligibility_criteria",
      "how_to_apply",
      "application_url",
      "source_url",
      "email",
      "phone",
      "sports_json",
      "is_open",
      "is_renewable",
      "is_public",
      "status",
    ],
    booleans: ["is_open", "is_renewable", "is_public"],
    numbers: ["amount_min_cents", "amount_max_cents"],
  },
  blog: {
    table: "blog_posts",
    name: "title",
    fields: [
      "title",
      "slug",
      "subtitle",
      "publish_at",
      "thumbnail_data_url",
      "content_markdown",
      "status",
      "is_public",
    ],
    booleans: ["is_public"],
    numbers: [],
  },
};

export function asnmAdminCollection(pathname) {
  const match = pathname.match(
    /^\/admin\/api\/asnm\/admin-data\/(organizations|programs|events|grants|blog)(?:\/([0-9a-f-]{36}))?$/i,
  );
  return match ? ASNM_ADMIN_COLLECTIONS[match[1]] : null;
}

async function localAsnmAdminCollection(request, env, url) {
  const match = url.pathname.match(
    /^\/admin\/api\/asnm\/admin-data\/(organizations|programs|events|grants|blog)(?:\/([0-9a-f-]{36}))?$/i,
  );
  const collection = asnmAdminCollection(url.pathname);
  const id = match?.[2];
  if (!collection || !["GET", "POST", "PATCH"].includes(request.method)) {
    return null;
  }

  const query = String(url.searchParams.get("q") || "")
    .trim()
    .slice(0, 120);
  const where = query ? ` WHERE ${collection.name} LIKE ? COLLATE NOCASE` : "";
  const binds = query ? [`%${query}%`] : [];

  try {
    if (!id && request.method === "POST") {
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return json(
          { ok: false, error: "Could not read the new item." },
          400,
          ADMIN_CACHE,
        );
      }

      const values = collection.fields.map((field) => {
        const raw = input[field];
        if (collection.booleans.includes(field)) {
          return [field, [true, 1, "1", "true", "on"].includes(raw) ? 1 : 0];
        }
        if (collection.numbers.includes(field)) {
          return [field, raw === "" || raw == null ? null : Number(raw)];
        }
        return [field, raw == null || raw === "" ? null : String(raw).trim()];
      });
      const record = Object.fromEntries(values);
      const required =
        collection.table === "events"
          ? ["title", "starts_at"]
          : collection.table === "programs"
            ? ["name", "organization_id"]
            : [collection.name];
      if (required.some((field) => !record[field])) {
        return json(
          {
            ok: false,
            error: "Complete the required fields before creating this item.",
          },
          422,
          ADMIN_CACHE,
        );
      }
      if (collection.table === "blog_posts") {
        record.subtitle ??= "";
        record.content_markdown ??= "";
        record.status ||= "draft";
        record.slug ||= String(record.title)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.slug)) {
          return json(
            { ok: false, error: "Enter a valid blog post title or slug." },
            422,
            ADMIN_CACHE,
          );
        }
      }
      if (collection.table === "events") {
        record.description ??= "";
        record.status ||= "scheduled";
        record.source ||= "admin";
      }
      if (collection.table === "grants") {
        record.audience ||= "athlete";
        record.status ||= "active";
      }
      if (["organizations", "programs"].includes(collection.table)) {
        record.status ||= "active";
        record.verification_status ||= "unverified";
      }
      if (collection.table === "programs") {
        record.kind ||= "program";
        record.listing ||= "own";
      }
      const timestamp = new Date().toISOString();
      const itemId = crypto.randomUUID();
      await env.ASNM_DB.prepare(
        `INSERT INTO ${collection.table} (id, ${collection.fields.join(", ")}, created_at, updated_at) VALUES (?, ${collection.fields.map(() => "?").join(", ")}, ?, ?)`,
      )
        .bind(
          itemId,
          ...collection.fields.map((field) => record[field]),
          timestamp,
          timestamp,
        )
        .run();
      const item = await env.ASNM_DB.prepare(
        `SELECT id, ${collection.fields.join(", ")}, created_at, updated_at FROM ${collection.table} WHERE id = ?`,
      )
        .bind(itemId)
        .first();
      return json({ ok: true, item }, 201, ADMIN_CACHE);
    }

    if (id && request.method === "GET") {
      const item = await env.ASNM_DB.prepare(
        `SELECT id, ${collection.fields.join(", ")}, created_at, updated_at FROM ${collection.table} WHERE id = ?`,
      )
        .bind(id)
        .first();
      return item
        ? json({ ok: true, item }, 200, ADMIN_CACHE)
        : json({ ok: false, error: "Not found." }, 404, ADMIN_CACHE);
    }

    if (id && request.method === "PATCH") {
      const input = await request.json().catch(() => null);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return json(
          { ok: false, error: "Could not read your changes." },
          400,
          ADMIN_CACHE,
        );
      }
      if (
        collection.table === "programs" &&
        Object.hasOwn(input, "first_year") &&
        input.first_year !== ""
      ) {
        const firstYear = Number(input.first_year);
        const currentYear = new Date().getUTCFullYear();
        if (
          !Number.isInteger(firstYear) ||
          firstYear < 1950 ||
          firstYear > currentYear
        ) {
          return json(
            { ok: false, error: `First year must be between 1950 and ${currentYear}.` },
            422,
            ADMIN_CACHE,
          );
        }
      }
      const values = collection.fields
        .filter((field) => Object.hasOwn(input, field))
        .map((field) => {
          const raw = input[field];
          if (collection.booleans.includes(field))
            return [field, [true, 1, "1", "true", "on"].includes(raw) ? 1 : 0];
          if (collection.numbers.includes(field))
            return [field, raw === "" || raw == null ? null : Number(raw)];
          return [field, raw == null || raw === "" ? null : String(raw).trim()];
        });
      if (!values.length)
        return json(
          { ok: false, error: "No changes were provided." },
          400,
          ADMIN_CACHE,
        );
      const assignments = values.map(([field]) => `${field} = ?`).join(", ");
      const result = await env.ASNM_DB.prepare(
        `UPDATE ${collection.table} SET ${assignments}, updated_at = datetime('now') WHERE id = ?`,
      )
        .bind(...values.map(([, value]) => value), id)
        .run();
      if (!Number(result.meta?.changes || 0))
        return json({ ok: false, error: "Not found." }, 404, ADMIN_CACHE);
      const item = await env.ASNM_DB.prepare(
        `SELECT id, ${collection.fields.join(", ")}, created_at, updated_at FROM ${collection.table} WHERE id = ?`,
      )
        .bind(id)
        .first();
      return json({ ok: true, item }, 200, ADMIN_CACHE);
    }

    if (id) return null;
    if (url.searchParams.get("counts") === "1") {
      const count = await env.ASNM_DB.prepare(
        `SELECT count(*) AS total FROM ${collection.table}`,
      ).first();
      return json(
        { ok: true, total: Number(count?.total || 0), items: [] },
        200,
        ADMIN_CACHE,
      );
    }
    const [count, rows] = await Promise.all([
      env.ASNM_DB.prepare(`SELECT count(*) AS total FROM ${collection.table}${where}`)
        .bind(...binds)
        .first(),
      env.ASNM_DB.prepare(
        `SELECT id, ${collection.name} AS name, is_public, status, updated_at FROM ${collection.table}${where} ORDER BY ${collection.name} COLLATE NOCASE LIMIT 5000`,
      )
        .bind(...binds)
        .all(),
    ]);

    return json(
      {
        ok: true,
        total: Number(count?.total || 0),
        items: rows.results || [],
      },
      200,
      ADMIN_CACHE,
    );
  } catch (error) {
    console.error("ASNM admin collection request failed", error);
    return json(
      { ok: false, error: "Could not load the Adaptive Sports Near Me directory." },
      503,
      ADMIN_CACHE,
    );
  }
}

export async function localAsnmAdminOperations(request, env, url) {
  if (url.pathname === "/admin/api/asnm/admin-data/beta-testers") {
    try {
      if (request.method === "GET") {
        const rows = await env.ASNM_DB.prepare(
          `SELECT email, name, organization, phone, enabled, created_at, updated_at
           FROM beta_testers
           ORDER BY email COLLATE NOCASE`,
        ).all();
        return json({ ok: true, items: rows.results || [] }, 200, ADMIN_CACHE);
      }
      if (request.method === "DELETE") {
        const body = await request.json().catch(() => null);
        const email = String(body?.email || "")
          .trim()
          .toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json(
            { ok: false, error: "Enter a valid email address." },
            422,
            ADMIN_CACHE,
          );
        }
        const result = await env.ASNM_DB.prepare(
          "DELETE FROM beta_testers WHERE email = ? COLLATE NOCASE",
        )
          .bind(email)
          .run();
        if (!Number(result.meta?.changes || 0)) {
          return json({ ok: false, error: "Beta tester not found." }, 404, ADMIN_CACHE);
        }
        return json({ ok: true }, 200, ADMIN_CACHE);
      }
      if (request.method === "POST") {
        const body = await request.json().catch(() => null);
        const email = String(body?.email || "")
          .trim()
          .toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return json(
            { ok: false, error: "Enter a valid email address." },
            422,
            ADMIN_CACHE,
          );
        }
        const enabled =
          body?.enabled === false || body?.enabled === 0 || body?.enabled === "0"
            ? 0
            : 1;
        const timestamp = new Date().toISOString();
        const addingTester = Object.hasOwn(body || {}, "name");
        if (addingTester) {
          const name = String(body?.name || "").trim();
          const organization = String(body?.organization || "").trim();
          const phone = String(body?.phone || "").trim();
          if (!name) {
            return json(
              { ok: false, error: "Enter the beta tester's name." },
              422,
              ADMIN_CACHE,
            );
          }
          if (name.length > 160 || organization.length > 240 || phone.length > 60) {
            return json(
              { ok: false, error: "One or more beta tester details are too long." },
              422,
              ADMIN_CACHE,
            );
          }
          await env.ASNM_DB.prepare(
            `INSERT INTO beta_testers (email, name, organization, phone, enabled, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET
               name = excluded.name,
               organization = excluded.organization,
               phone = excluded.phone,
               enabled = excluded.enabled,
               updated_at = excluded.updated_at`,
          )
            .bind(
              email,
              name,
              organization || null,
              phone || null,
              enabled,
              timestamp,
              timestamp,
            )
            .run();
          if (enabled && body?.sendInvitation === true) {
            const siteUrl = new URL(
              "/",
              env.ASNM_ADMIN_ORIGIN || "https://adaptivesportsnearme.com",
            ).toString();
            await sendBetaTesterInvitation(env, {
              email,
              name,
              siteUrl,
            });
          }
        } else {
          await env.ASNM_DB.prepare(
            `INSERT INTO beta_testers (email, enabled, created_at, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(email) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
          )
            .bind(email, enabled, timestamp, timestamp)
            .run();
        }
        return json({ ok: true }, 200, ADMIN_CACHE);
      }
    } catch (error) {
      console.error("ASNM beta tester request failed", error);
      return json(
        { ok: false, error: "Beta testers are temporarily unavailable." },
        503,
        ADMIN_CACHE,
      );
    }
  }

  const queueMatch = url.pathname.match(
    /^\/admin\/api\/asnm\/admin-data\/queue(?:\/(\d+))?$/,
  );
  if (queueMatch && request.method === "POST") {
    const submissionId = Number(queueMatch[1]);
    if (!Number.isInteger(submissionId) || submissionId < 1)
      return json({ ok: false, error: "Not found." }, 404, ADMIN_CACHE);
    try {
      const submission = await env.ASNM_DB.prepare(
        "SELECT submission_id, kind, payload FROM submissions WHERE submission_id = ? AND status = 'new'",
      )
        .bind(submissionId)
        .first();
      if (!submission)
        return json(
          { ok: false, error: "This submission is no longer awaiting review." },
          404,
          ADMIN_CACHE,
        );
      let payload = {};
      try {
        payload = JSON.parse(String(submission.payload || "{}"));
      } catch {
        payload = {};
      }
      const timestamp = new Date().toISOString();
      let recordId = null;
      if (["new_organization", "new_program"].includes(String(submission.kind))) {
        const entity =
          submission.kind === "new_organization" ? "organization" : "program";
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(
            `draft-${entity}\n${String(payload.intake_id || "")}`,
          ),
        );
        const hex = Array.from(new Uint8Array(digest), (value) =>
          value.toString(16).padStart(2, "0"),
        ).join("");
        recordId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 3) | 8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
        const table = entity === "organization" ? "organizations" : "programs";
        const result = await env.ASNM_DB.prepare(
          `UPDATE ${table} SET is_public = 1, verification_status = 'verified', verification_method = 'admin-accepted', updated_at = ? WHERE id = ? AND is_public = 0`,
        )
          .bind(timestamp, recordId)
          .run();
        if (!Number(result.meta?.changes || 0))
          return json(
            { ok: false, error: "The submitted draft could not be found." },
            422,
            ADMIN_CACHE,
          );
      } else if (submission.kind === "new_event") {
        const date = String(payload.date || "");
        const time = String(payload.time || "00:00");
        const startsAt = new Date(`${date}T${time}`).toISOString();
        if (Number.isNaN(new Date(startsAt).getTime()))
          return json(
            { ok: false, error: "The event date is invalid." },
            422,
            ADMIN_CACHE,
          );
        recordId = crypto.randomUUID();
        await env.ASNM_DB.prepare(
          `INSERT INTO events (id, title, description, sport_key, venue, city, state, url, starts_at, all_day, status, is_public, source, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'scheduled', 1, 'submission', ?, ?)`,
        )
          .bind(
            recordId,
            String(payload.event || "Untitled event"),
            String(payload.notes || ""),
            payload.sport || null,
            payload.org || null,
            payload.city || null,
            payload.state || null,
            payload.url || null,
            startsAt,
            timestamp,
            timestamp,
          )
          .run();
      }
      await env.ASNM_DB.prepare(
        "UPDATE submissions SET status = 'accepted' WHERE submission_id = ?",
      )
        .bind(submissionId)
        .run();
      return json({ ok: true, record_id: recordId }, 200, ADMIN_CACHE);
    } catch (error) {
      console.error("ASNM submission acceptance failed", error);
      return json(
        { ok: false, error: "Could not accept this submission." },
        503,
        ADMIN_CACHE,
      );
    }
  }

  if (queueMatch && !queueMatch[1] && request.method === "GET") {
    try {
      const rows = await env.ASNM_DB.prepare(
        `SELECT submission_id, kind, payload, contact_email, created_at
         FROM submissions
         WHERE status = 'new' AND kind IN ('new_organization', 'new_program', 'new_event', 'listing_update')
         ORDER BY created_at ASC`,
      ).all();
      const items = (rows.results || []).map((row) => {
        let payload = {};
        try {
          payload = JSON.parse(String(row.payload || "{}"));
        } catch {
          payload = {};
        }
        return {
          id: row.submission_id,
          kind: row.kind,
          contact_email: row.contact_email,
          created_at: row.created_at,
          payload,
          title:
            payload.organization || payload.program || payload.event || "Submission",
        };
      });
      return json({ ok: true, items }, 200, ADMIN_CACHE);
    } catch (error) {
      console.error("ASNM submission queue request failed", error);
      return json(
        { ok: false, error: "The submission queue is temporarily unavailable." },
        503,
        ADMIN_CACHE,
      );
    }
  }

  return null;
}

export async function sendBetaTesterInvitation(env, { email, name, siteUrl }) {
  const greeting = `Hi ${name},`;
  const text =
    `${greeting}\n\n` +
    "You have been added to the Adaptive Sports Near Me beta. " +
    `Visit the website to get started:\n\n${siteUrl}\n\n` +
    "When the beta sign-in form asks for your email address, use:\n" +
    `${email}\n\nWe will send a one-time sign-in link to that address.`;
  const html =
    `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;` +
    `font-size:16px;line-height:1.6;color:#1c1a15;max-width:560px">` +
    `<p>${escapeHtml(greeting)}</p>` +
    `<p>You have been added to the Adaptive Sports Near Me beta.</p>` +
    `<p><a href="${escapeHtml(siteUrl)}">Visit Adaptive Sports Near Me</a></p>` +
    `<p>When the beta sign-in form asks for your email address, use:</p>` +
    `<p><strong>${escapeHtml(email)}</strong></p>` +
    `<p>We will send a one-time sign-in link to that address.</p>` +
    `<p style="margin-top:28px;color:#6b6b70;font-size:14px">` +
    `Adapt To Life<br>501(c)(3) nonprofit &middot; EIN 41-3213344</p></div>`;
  return sendMail(env, {
    from: `Adapt To Life <${env.GMAIL_FROM || "hello@adapttolife.org"}>`,
    to: email,
    replyTo: env.GMAIL_FROM || "hello@adapttolife.org",
    subject: "You are invited to the Adaptive Sports Near Me beta",
    text,
    html,
  });
}

async function localAsnmAdminActivity(request, env, url, session) {
  const match = url.pathname.match(
    /^\/admin\/api\/asnm\/admin-data\/organizations\/([0-9a-f-]{36})\/activity(?:\/([0-9a-f-]{36}))?$/i,
  );
  if (!match || !["GET", "POST", "DELETE"].includes(request.method)) return null;

  const organizationId = match[1];
  const activityId = match[2];
  try {
    if (request.method === "DELETE") {
      if (!activityId)
        return json({ ok: false, error: "Not found." }, 404, ADMIN_CACHE);
      const result = await env.ASNM_DB.prepare(
        "DELETE FROM organization_activity WHERE id = ? AND organization_id = ? AND kind = 'note'",
      )
        .bind(activityId, organizationId)
        .run();
      if (!Number(result.meta?.changes || 0)) {
        return json(
          { ok: false, error: "Only team notes can be deleted." },
          404,
          ADMIN_CACHE,
        );
      }
      return json({ ok: true }, 200, ADMIN_CACHE);
    }

    if (request.method === "GET") {
      const rows = await env.ASNM_DB.prepare(
        `SELECT id, kind, summary, actor, ref, created_at
         FROM organization_activity
         WHERE organization_id = ?
         ORDER BY created_at DESC, rowid DESC
         LIMIT 100`,
      )
        .bind(organizationId)
        .all();
      return json({ ok: true, items: rows.results || [] }, 200, ADMIN_CACHE);
    }

    const body = await request.json().catch(() => null);
    const note = String(body?.note || "")
      .trim()
      .slice(0, 500);
    if (!note)
      return json({ ok: false, error: "Write the note first." }, 422, ADMIN_CACHE);

    const organization = await env.ASNM_DB.prepare(
      "SELECT id FROM organizations WHERE id = ?",
    )
      .bind(organizationId)
      .first();
    if (!organization)
      return json({ ok: false, error: "Not found." }, 404, ADMIN_CACHE);

    await env.ASNM_DB.prepare(
      `INSERT INTO organization_activity
       (id, organization_id, kind, summary, actor, ref, created_at)
       VALUES (?, ?, 'note', ?, ?, NULL, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        organizationId,
        note,
        session.email,
        new Date().toISOString(),
      )
      .run();

    const rows = await env.ASNM_DB.prepare(
      `SELECT id, kind, summary, actor, ref, created_at
       FROM organization_activity
       WHERE organization_id = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT 100`,
    )
      .bind(organizationId)
      .all();
    return json({ ok: true, items: rows.results || [] }, 201, ADMIN_CACHE);
  } catch (error) {
    console.error("ASNM organization activity request failed", error);
    return json(
      { ok: false, error: "Could not load this organization's activity right now." },
      503,
      ADMIN_CACHE,
    );
  }
}

async function adminSession(request, env) {
  if (!env.ASNM_DB || !adminSecret(env)) return null;
  return readAdminSession(request, env.ASNM_DB, adminSecret(env));
}

async function adminRequestLink(request, env, url) {
  if (!env.ASNM_DB || !adminSecret(env))
    return json(
      { ok: false, error: "Admin sign-in is not configured." },
      503,
      ADMIN_CACHE,
    );
  const body = await request.json().catch(() => null);
  const email = adminEmail(body?.email);
  if (!email)
    return json(
      {
        ok: false,
        error:
          "Use an @adapttolife.org, @adaptivesportsnearme.com, or @faisaln.com email address.",
      },
      403,
      ADMIN_CACHE,
    );
  try {
    const token = await requestLogin(env.ASNM_DB, email);
    const origin = adminLoginOrigin(request, url, body?.origin);
    const link = new URL("/admin/auth/verify", origin);
    link.searchParams.set("token", token);
    link.searchParams.set("origin", origin);
    await sendAdminLink(env, email, link.toString());
    return json({ ok: true }, 200, ADMIN_CACHE);
  } catch (error) {
    console.error("admin login link failed", error);
    return json(
      { ok: false, error: "We could not send a sign-in link. Please try again." },
      503,
      ADMIN_CACHE,
    );
  }
}

async function adminVerifyLink(request, env, url) {
  if (!env.ASNM_DB || !adminSecret(env))
    return json(
      { ok: false, error: "Admin sign-in is not configured." },
      503,
      ADMIN_CACHE,
    );
  const origin = adminLoginOrigin(request, url, url.searchParams.get("origin") || "");
  const session = await consumeLogin(
    env.ASNM_DB,
    url.searchParams.get("token") || "",
    adminSecret(env),
    { secure: origin.startsWith("https:") },
  );
  if (!session)
    return json(
      { ok: false, error: "This sign-in link has expired or was already used." },
      401,
      ADMIN_CACHE,
    );
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/admin", origin).toString(),
      "Set-Cookie": session.cookie,
      "Cache-Control": "no-store",
    },
  });
}

async function proxyAsnmAdmin(request, env, url, session) {
  const path = url.pathname.slice("/admin/api/asnm".length) || "/";
  const origin = env.ASNM_ADMIN_ORIGIN || "https://adaptivesportsnearme.com";
  const target = new URL(`/api${path}${url.search}`, origin);
  const headers = new Headers(request.headers);
  headers.set("Cookie", session.cookie);
  headers.delete("host");
  const forwarded = new Request(target, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
  });

  return useAsnmService(env) ? env.ASNM.fetch(forwarded) : fetch(forwarded);
}

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
      return Response.redirect(
        `${url.origin}${MERGED[url.pathname]}${url.search}`,
        301,
      );
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
      "/review",
      "/photo-picks",
      "/hero-review",
      "/hero-1",
      "/hero-2",
      "/hero-3",
      "/hero-4",
      "/hero-5",
      "/hero-6",
      "/hero-7",
      "/hero-9",
    ]);
    if (STAGING_ONLY.has(url.pathname.replace(/\.html$/, "")) && env.STAGING !== "1") {
      return Response.redirect(`${url.origin}/`, 302);
    }

    // Staging-only: render a receipt so it can actually be reviewed.
    //
    // Staging has no send_email binding and sends no mail (MAIL_TRANSPORT
    // "none") by design, so the most consequential
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
    if (
      env.STAGING === "1" &&
      (url.pathname.startsWith("/css/") || url.pathname.startsWith("/js/"))
    ) {
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
      if (await overFormLimit(env, request)) return json(RATE_LIMITED, 429);
      return handleContact(request, env, ctx);
    }

    if (url.pathname === "/api/apply") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      if (await overFormLimit(env, request)) return json(RATE_LIMITED, 429);
      return handleApply(request, env, ctx);
    }

    // The Adapt Body Shop storefront is a separate Worker with no database and
    // no mail binding. Its /contact action posts here, server-to-server, gated
    // by a shared secret AND Turnstile. See src/shop_contact.js.
    if (url.pathname === "/api/shop-contact") {
      if (request.method !== "POST")
        return json({ ok: false, error: "Method not allowed" }, 405);
      if (await overFormLimit(env, request)) return json(RATE_LIMITED, 429);
      return handleShopContact(request, env, ctx);
    }

    if (url.pathname === "/api/volunteer") {
      if (request.method !== "POST")
        return json({ ok: false, error: "Method not allowed." }, 405);
      if (await overFormLimit(env, request)) return json(RATE_LIMITED, 429);
      return handleVolunteer(request, env, ctx);
    }

    if (url.pathname === "/api/subscribe") {
      if (request.method !== "POST") {
        return json({ ok: false, error: "Method not allowed" }, 405);
      }
      if (await overFormLimit(env, request)) return json(RATE_LIMITED, 429);
      return handleSubscribe(request, env, ctx);
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
      if (await overFormLimit(env, request)) return json(RATE_LIMITED, 429);
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

    if (url.pathname.startsWith("/admin")) {
      if (url.pathname === "/admin/auth/request-link" && request.method === "POST")
        return adminRequestLink(request, env, url);
      if (url.pathname === "/admin/auth/verify")
        return adminVerifyLink(request, env, url);
      const session = await adminSession(request, env);
      if (url.pathname === "/admin/auth/session")
        return json(
          { ok: !!session, email: session?.email || null },
          session ? 200 : 401,
        );
      if (url.pathname.startsWith("/admin/api/")) {
        if (!session) return json({ ok: false, error: "Sign in required." }, 401);
        if (url.pathname.startsWith("/admin/api/asnm")) {
          const localOperations = await localAsnmAdminOperations(request, env, url);
          if (localOperations) return localOperations;
          const localActivity = await localAsnmAdminActivity(
            request,
            env,
            url,
            session,
          );
          if (localActivity) return localActivity;
          const localCollection = await localAsnmAdminCollection(request, env, url);
          return localCollection || proxyAsnmAdmin(request, env, url, session);
        }
        return handleAdmin(request, env, url, session.email);
      }
      if (!url.pathname.includes("/assets/")) {
        const shell = await env.ASSETS.fetch(
          new Request(`${url.origin}/admin/app/index.html`),
        );
        return new Response(shell.body, {
          status: shell.status,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      }
    }

    // Reports have moved to their own Worker on reports.amelioration.is, behind
    // Cloudflare Access. Links already sitting in inboxes still say
    // adapttolife.org, and an email cannot be edited after it is sent — so the
    // two legacy namespaces forward there instead of breaking.
    const moved = legacyReportRedirect(request, env, url);
    if (moved) return moved;

    // Anything left under /r/ or /lib/ is a report request on a host that is
    // not a published or staging host — sign.adapttolife.org, workers.dev, a
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
    ctx.waitUntil(
      sweepForms(env).catch((err) => console.error("form outbox failed:", err)),
    );
    // Tell hello@ about every intake record still waiting for its notification.
    // This Worker owns the sweep: the separate intake Worker never moved to the
    // live Cloudflare account, so form notifications sat pending from 2026-09-14
    // until this ran. Each row is claimed before sending, so a row is never
    // mailed twice.
    ctx.waitUntil(
      sweepIntake(env).catch((err) =>
        console.error("intake notification sweep failed:", err),
      ),
    );

    ctx.waitUntil(runDriveBacklog(env));
    ctx.waitUntil(
      runShopCrmBacklog(env).catch((err) =>
        console.error("shop CRM sync crashed:", err),
      ),
    );
    ctx.waitUntil(
      runShopNewsletterBacklog(env).catch((err) =>
        console.error("shop newsletter CRM sync crashed:", err),
      ),
    );
    ctx.waitUntil(
      syncGifts(env).then((r) => {
        if (!r.ok) console.error("qr gift sync failed:", r.error);
        else if (r.written)
          console.log(`qr gift sync: ${r.written} attributed gift(s) recorded`);
      }),
    );
    // The webhook is only the fast path. This single scheduled owner polls every
    // successful post-activation Givebutter transaction into D1 first, then closes
    // thank-you work. A provider failure remains visible as a red receipt but
    // cannot block recovery of work already durable in D1.
    ctx.waitUntil(
      reconcileDonorJourney(env)
        .then((r) => {
          if (!r.ok) {
            console.error("donor journey reconciliation failed:", JSON.stringify(r));
            return;
          }
          if (r.reconciliation.written || r.email.sent) {
            console.log("donor journey reconciled:", JSON.stringify(r));
          }
        })
        .catch((err) => console.error("donor journey reconciliation crashed:", err)),
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
  if (!LEGACY_REPORT_HOSTS.has(url.hostname) && env.STAGING !== "1") return null;
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

/* One line at every call site, one place for the contract. Records the
   submission durably, then notifies. Returns a promise the caller hands to
   after(), so notification never sits on the response path.

   Deliberately swallows its own failures: for every form here the primary store
   is elsewhere (the D1 form outbox, beehiiv, Drive, Givebutter) and the submission has
   already succeeded by the time this runs. An intake hiccup must never turn a
   saved submission into a failed one — and it cannot lose anything either, because
   an unnotified row is picked up by the sweep cron. */
async function tellAlec(env, entry) {
  try {
    const rec = await recordIntake(env, entry);
    if (rec.ok) await notifyIntake(env, rec.id);
  } catch (err) {
    console.error("intake failed (submission itself already saved):", err);
  }
}

const INTAKE_SITE = "adapttolife.org";
const INTAKE_SITE_SHOP = "adaptbodyshop.com";
const INTAKE_CANARY_MAX_AGE_H = 6;

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

  if (
    !(await verifyTurnstile(
      env,
      str(data.cf_token),
      request.headers.get("CF-Connecting-IP"),
    ))
  ) {
    return json(
      {
        ok: false,
        error: "Verification failed. Please reload the page and try again.",
      },
      403,
    );
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

  // Contacts land in the durable form outbox (src/forms.js): a receipt, the
  // shared intake record, and the original message to hello@.
  const sub = {
    name: name || "(no name given)",
    email,
    phone: "",
    type: LEAD_TYPES.includes(type) ? type : "",
    message,
    source: source || "Submitted through the contact form on adapttolife.org.",
  };
  if (data.sponsor_tier) {
    sub.tier = str(data.sponsor_tier).slice(0, 80);
    sub.amount = Number(data.sponsor_amount) || 0;
  }
  const result = await acceptForm(env, "contact", sub, data.submission_id, ctx);
  return json(
    result.ok ? { ok: true, receipt: result.id } : { ok: false, error: result.error },
    result.status,
  );
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

  if (
    !(await verifyTurnstile(
      env,
      str(data.cf_token),
      request.headers.get("CF-Connecting-IP"),
    ))
  ) {
    return json(
      {
        ok: false,
        error: "Verification failed. Please reload the page and try again.",
      },
      403,
    );
  }

  const name = `${str(data.fn)} ${str(data.ln)}`.trim();
  const email = str(data.em);

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "A valid email is required." }, 422);
  }
  if (!name) {
    return json({ ok: false, error: "Please add your name." }, 422);
  }

  // Applications land in the durable form outbox (src/forms.js): the applicant's
  // receipt and the shared intake record. The full answers stay in the restricted
  // D1 record, never in shared intake.
  const sub = {
    name,
    email,
    phone: str(data.phone),
    sport: str(data.sport),
    location: str(data.location),
    need: str(data.need),
    cost: str(data.cost),
    about: str(data.about),
  };
  const result = await acceptForm(env, "apply", sub, data.submission_id, ctx);
  return json(
    result.ok ? { ok: true, receipt: result.id } : { ok: false, error: result.error },
    result.status,
  );
}

// Volunteer board -> the durable form outbox (src/forms.js).
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

  if (
    !(await verifyTurnstile(
      env,
      str(data.cf_token),
      request.headers.get("CF-Connecting-IP"),
    ))
  ) {
    return json(
      {
        ok: false,
        error: "Verification failed. Please reload the page and try again.",
      },
      403,
    );
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
    return json(
      { ok: false, error: "Add a role, or tell us what you would want to do." },
      422,
    );
  }

  const sub = {
    name,
    email,
    phone: str(data.phone),
    based: str(data.based),
    time: str(data.time),
    links: str(data.links),
    bring,
    roles,
    source:
      str(data.source).slice(0, 80) ||
      "Submitted through the volunteer form on adapttolife.org.",
  };
  const result = await acceptForm(env, "volunteer", sub, data.submission_id, ctx);
  return json(
    result.ok ? { ok: true, receipt: result.id } : { ok: false, error: result.error },
    result.status,
  );
}

// Roles arrive as an array from the page and as a comma string from a plain form
// post. Anything not on the board is dropped, duplicates collapse, and the order
// of the board is preserved so two people who ticked the same boxes read the same
// way in a list view.
export function normalizeRoles(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(",");
  const wanted = new Set(
    list
      .map((r) =>
        String(r || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  return VOLUNTEER_ROLES.filter((r) => wanted.has(r.toLowerCase())).slice(0, MAX_ROLES);
}

// Newsletter / email capture -> Resend. API key and segment ID are Worker secrets.
async function handleSubscribe(request, env, ctx) {
  let data;
  try {
    const ct = request.headers.get("content-type") || "";
    data = ct.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
  } catch {
    return json({ ok: false, error: "Could not read your submission." }, 400);
  }
  if (str(data.company)) return json({ ok: true });
  if (
    !(await verifyTurnstile(
      env,
      str(data.cf_token),
      request.headers.get("CF-Connecting-IP"),
    ))
  ) {
    return json(
      {
        ok: false,
        error: "Verification failed. Please reload the page and try again.",
      },
      403,
    );
  }
  const email = str(data.em);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ ok: false, error: "Please enter a valid email." }, 422);
  }
  if (!env.RESEND_API_KEY || !env.RESEND_SEGMENT_ID) {
    console.error("resend not configured (missing API key or segment ID)");
    return json(
      {
        ok: false,
        error:
          "Sign-up is temporarily unavailable. Please email hello@adapttolife.org.",
      },
      503,
    );
  }
  const source = str(data.source).slice(0, 80) || "adapttolife.org";
  const result = await safeNewsletterSubscribe(env, email, source);
  if (!result.ok) return json({ ok: false, error: result.error }, result.status);
  after(
    ctx,
    tellAlec(env, {
      site: INTAKE_SITE,
      kind: "newsletter",
      email,
      summary: `New newsletter signup: ${email}`,
      source,
      payload: { consent: "Explicit newsletter signup; not inferred from other forms" },
    }),
  );
  return json({ ok: true, ...(result.existing ? { existing: true } : {}) });
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
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  });
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
  try {
    return await res.text();
  } catch {
    return "(no body)";
  }
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
  // Force the capturing binding as the transport. Staging's own transport is
  // "none" and the Worker shares production mail credentials, so inheriting
  // env.MAIL_TRANSPORT would either capture nothing or send for real.
  const stub = {
    ...env,
    MAIL_TRANSPORT: "cloudflare",
    SEND_EMAIL: { send: (msg) => (captured.push(msg), {}) },
  };

  if (kind === "volunteer") {
    await sendVolunteerReceipt(stub, {
      name: "Jordan Rivers",
      email: "jordan@example.com",
      roles: ["CPA or tax preparer", "Grant writer", "Make an introduction"],
      bring:
        "Twenty years preparing returns for small charities, and a board contact at a family foundation that funds adaptive sport.",
    });
  } else if (kind === "contact") {
    await sendContactReceipt(stub, {
      name: "Jordan Rivers",
      email: "jordan@example.com",
      message:
        "Is there a program near Rockford for a 12 year old who wants to try basketball?",
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
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
}
