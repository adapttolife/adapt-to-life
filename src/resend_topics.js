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

// Resend allows 10 requests per second per team. Every admin page load asks
// for each beta tester's Topics, so requests are paced below that limit and a
// 429 is retried after the delay Resend reports.
const RESEND_MIN_INTERVAL_MS = 125;
const RESEND_MAX_RETRIES = 3;
const RESEND_MAX_RETRY_DELAY_MS = 5000;

const realSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createPacer(minIntervalMs, sleep) {
  let nextStart = 0;
  return async () => {
    const now = Date.now();
    const start = Math.max(now, nextStart);
    nextStart = start + minIntervalMs;
    if (start > now) await sleep(start - now);
  };
}

const defaultPacer = createPacer(RESEND_MIN_INTERVAL_MS, realSleep);

function retryDelayMs(response, attempt) {
  for (const name of ["retry-after", "ratelimit-reset"]) {
    const raw = response.headers.get(name);
    if (raw == null || raw.trim() === "") continue;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(Math.max(seconds * 1000, 250), RESEND_MAX_RETRY_DELAY_MS);
    }
  }
  return Math.min(500 * 2 ** attempt, RESEND_MAX_RETRY_DELAY_MS);
}

async function resend(env, path, options = {}, pacing = {}) {
  const pace = pacing.pace || defaultPacer;
  const sleep = pacing.sleep || realSleep;
  for (let attempt = 0; ; attempt += 1) {
    await pace();
    const response = await fetch(`${RESEND_API}${path}`, {
      ...options,
      headers: headers(env),
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429 && attempt < RESEND_MAX_RETRIES) {
      await response.body?.cancel();
      await sleep(retryDelayMs(response, attempt));
      continue;
    }
    const body = await response.json().catch(() => null);
    return { response, body };
  }
}

export async function listResendTopics(env, pacing) {
  const { response, body } = await resend(env, "/topics", {}, pacing);
  if (!response.ok) throw errorFor(response, "load beta tester groups", body);

  return topicEntries(body)
    .filter((topic) => topic && typeof topic.id === "string")
    .map((topic) => ({ id: topic.id, name: String(topic.name || topic.id) }));
}

export async function topicsForContact(env, email, pacing) {
  const { response, body } = await resend(
    env,
    `/contacts/${encodeURIComponent(email)}/topics`,
    {},
    pacing,
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

const MEMBERSHIP_CONCURRENCY = 4;

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export async function betaTesterTopicGroups(env, testers, pacing) {
  const topics = await listResendTopics(env, pacing);
  const emails = [
    ...new Set(testers.map((tester) => String(tester.email).toLowerCase())),
  ];
  const memberships = topics.length
    ? await mapWithConcurrency(emails, MEMBERSHIP_CONCURRENCY, async (email) => [
        email,
        await topicsForContact(env, email, pacing),
      ])
    : emails.map((email) => [email, []]);
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
