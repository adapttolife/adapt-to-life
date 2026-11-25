// A stateful fake of the Resend endpoints the newsletter code calls, shaped
// like https://resend.com/docs (contacts, contact Segments, contact Topics,
// emails), and the agent-mail database built from its real schema files.
import { readFileSync } from "node:fs";
import { sqliteD1 } from "./form-db.js";
import { D1_SCHEMAS } from "../../scripts/lib/d1-schema.mjs";

export const TOPIC_ATL = "40930021-28d6-4ecb-84c4-e256e3dbf60a";
export const TOPIC_SHOP = "aee5646e-9e4e-4f9c-8202-a350a22c57c0";
export const TOPIC_ASNM = "9310c098-509b-49f6-b019-426e6ab5fd11";
export const SEG_ATL = "a2640e82-34df-446d-b5f8-0ad6f31d352e";
export const SEG_SHOP = "afc10feb-f9ae-47f6-a705-997ea5204429";

export function agentMailDb() {
  return sqliteD1(
    D1_SCHEMAS["agent-mail"]
      .map((f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"))
      .join("\n"),
  );
}

export function newsletterEnv(extra = {}) {
  return {
    ENV_NAME: "production",
    AGENT_MAIL_DB: agentMailDb(),
    RESEND_API_KEY: "re_test",
    NEWSLETTER_LINK_SECRET: "link-secret-test",
    MAIL_FROM_DOMAINS: "mail.adapttolife.org,mail.adaptbodyshop.com",
    RESEND_SEGMENT_ID: SEG_ATL,
    RESEND_TOPIC_ATL: TOPIC_ATL,
    RESEND_SEGMENT_BODYSHOP: SEG_SHOP,
    RESEND_TOPIC_BODYSHOP: TOPIC_SHOP,
    WELCOME_SERIES: "on",
    NEWSLETTER_FROM: "Alec at Adapt To Life <hello@mail.adapttolife.org>",
    NEWSLETTER_REPLY_TO: "hello@adapttolife.org",
    ...extra,
  };
}

// `fail(method, path)` may return a status (or a Response) to refuse a call;
// `contacts` seeds existing contacts: { email: { unsubscribed, topics: {id: sub} } }.
// `conflictOnCreate` makes POST /contacts answer 409 for an existing contact
// (otherwise the code is expected to look first and never create a duplicate).
export function fakeResend({ contacts = {}, fail = () => null } = {}) {
  const state = new Map();
  for (const [email, c] of Object.entries(contacts))
    state.set(email, {
      id: `c-${email}`,
      unsubscribed: !!c.unsubscribed,
      segments: new Set(c.segments || []),
      topics: new Map(Object.entries(c.topics || {})),
    });
  const calls = [];
  const emails = [];
  const keys = new Map();
  const fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = init.method || "GET";
    const path = url.pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, path, search: url.search, body, headers: init.headers });
    if (url.origin !== "https://api.resend.com") throw new Error(`offline: ${url}`);
    const refusal = fail(method, path, body);
    if (refusal instanceof Response) return refusal;
    if (refusal)
      return Response.json(
        { name: refusal === 422 ? "validation_error" : "application_error" },
        { status: refusal },
      );
    if (method === "POST" && path === "/emails") {
      const key = init.headers["Idempotency-Key"];
      if (keys.has(key)) {
        if (keys.get(key).body !== init.body)
          return Response.json({ name: "invalid_idempotent_request" }, { status: 409 });
        return Response.json({ id: keys.get(key).id });
      }
      const id = `email-${emails.length + 1}`;
      keys.set(key, { body: init.body, id });
      emails.push({ ...body, idempotencyKey: key });
      return Response.json({ id });
    }
    if (method === "POST" && path === "/contacts") {
      if (state.has(body.email))
        return Response.json({ name: "conflict" }, { status: 409 });
      state.set(body.email, {
        id: `c-${body.email}`,
        unsubscribed: !!body.unsubscribed,
        segments: new Set((body.segments || []).map((s) => s.id)),
        topics: new Map((body.topics || []).map((t) => [t.id, t.subscription])),
        first_name: body.first_name,
      });
      return Response.json({ object: "contact", id: `c-${body.email}` });
    }
    const m = path.match(/^\/contacts\/([^/]+)(?:\/(segments|topics)(?:\/([^/]+))?)?$/);
    if (!m) throw new Error(`fake Resend: unexpected ${method} ${path}`);
    const email = decodeURIComponent(m[1]);
    const c = state.get(email);
    if (!c) return Response.json({ name: "not_found" }, { status: 404 });
    if (!m[2]) {
      if (method === "GET")
        return Response.json({
          object: "contact",
          id: c.id,
          email,
          unsubscribed: c.unsubscribed,
        });
      if (method === "PATCH") {
        if ("unsubscribed" in body) c.unsubscribed = body.unsubscribed;
        return Response.json({ object: "contact", id: c.id });
      }
    }
    if (m[2] === "segments" && method === "POST") {
      c.segments.add(decodeURIComponent(m[3]));
      return Response.json({ id: m[3] });
    }
    if (m[2] === "topics" && method === "GET")
      return Response.json({
        object: "list",
        has_more: false,
        data: [...c.topics].map(([id, subscription]) => ({
          id,
          name: id,
          subscription,
        })),
      });
    if (m[2] === "topics" && method === "PATCH") {
      if (!Array.isArray(body))
        return Response.json({ name: "validation_error" }, { status: 422 });
      for (const t of body) c.topics.set(t.id, t.subscription);
      return Response.json({ object: "contact_topics", id: c.id });
    }
    throw new Error(`fake Resend: unexpected ${method} ${path}`);
  };
  return { fetch, calls, emails, contacts: state };
}

export async function withFetch(fetch, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}
