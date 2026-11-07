const RESEND_API = "https://api.resend.com";

function topicEntries(body) {
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.topics)) return body.topics;
  return [];
}

export class ResendTopicsError extends Error {
  constructor(status, action, body) {
    const reason = String(body?.message || body?.error || body?.name || "").trim();
    super(`Resend could not ${action} (${status})${reason ? `: ${reason}` : "."}`);
    this.name = "ResendTopicsError";
    this.status = status;
  }
}

function errorFor(response, action, body) {
  return new ResendTopicsError(response.status, action, body);
}

function headers(env) {
  if (!env.RESEND_API_KEY) {
    throw new Error("Resend Topics are not configured.");
  }

  return {
    Authorization: `Bearer ${env.RESEND_API_KEY}`,
    "Content-Type": "application/json",
    "User-Agent": "Adapt-To-Life-ASNM-Admin/1.0",
  };
}

async function resend(env, path, options = {}) {
  const response = await fetch(`${RESEND_API}${path}`, {
    ...options,
    headers: headers(env),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

export async function listResendTopics(env) {
  const { response, body } = await resend(env, "/topics");
  if (!response.ok) throw errorFor(response, "load beta tester groups", body);

  return topicEntries(body)
    .filter((topic) => topic && typeof topic.id === "string")
    .map((topic) => ({ id: topic.id, name: String(topic.name || topic.id) }));
}

export async function topicsForContact(env, email) {
  const { response, body } = await resend(
    env,
    `/contacts/${encodeURIComponent(email)}/topics`,
  );
  if (response.status === 404) return [];
  if (!response.ok) {
    throw errorFor(response, "load beta tester group memberships", body);
  }

  return topicEntries(body)
    .filter((topic) => topic && typeof topic.id === "string")
    .filter((topic) => topic.subscription === "opt_in")
    .map((topic) => topic.id);
}

async function ensureContact(env, email, topicIds) {
  const { response, body } = await resend(env, "/contacts", {
    method: "POST",
    body: JSON.stringify({
      email,
      unsubscribed: false,
      topics: topicIds.map((id) => ({ id, subscription: "opt_in" })),
    }),
  });
  if (!response.ok && response.status !== 409) {
    throw errorFor(response, "create the beta tester contact", body);
  }
  return response.status !== 409;
}

export async function setContactTopics(env, email, topicIds) {
  const requested = [...new Set(topicIds.map(String).filter(Boolean))];
  let current = await topicsForContact(env, email);

  if (!current.length && requested.length) {
    const created = await ensureContact(env, email, requested);
    if (created) return;
    current = await topicsForContact(env, email);
  }

  const updates = [...new Set([...current, ...requested])].map((id) => ({
    id,
    subscription: requested.includes(id) ? "opt_in" : "opt_out",
  }));
  if (!updates.length) return;

  const { response, body } = await resend(
    env,
    `/contacts/${encodeURIComponent(email)}/topics`,
    {
      method: "PATCH",
      body: JSON.stringify(updates),
    },
  );
  if (!response.ok) throw errorFor(response, "update beta tester groups", body);
}

export async function betaTesterTopicGroups(env, testers) {
  const topics = await listResendTopics(env);
  const memberships = await Promise.all(
    testers.map(async (tester) => [
      String(tester.email).toLowerCase(),
      await topicsForContact(env, String(tester.email)),
    ]),
  );
  const idsByEmail = Object.fromEntries(memberships);

  return {
    groups: topics.map((topic) => ({
      ...topic,
      emails: testers
        .map((tester) => String(tester.email).toLowerCase())
        .filter((email) => idsByEmail[email]?.includes(topic.id)),
    })),
    idsByEmail,
  };
}
