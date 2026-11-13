// One door for Givebutter API GETs from the cron jobs.
//
// The QR gift sync and donor journey reconciliation both page through
// /v1/transactions. Givebutter rate limits per key and answers 429 when they
// overlap (Cloudflare issues 46d3cf81 and 33a7c440, Nov 12 2026). A 429 is
// retried, honoring Retry-After when Givebutter sends it; every other response
// goes straight back to the caller, which handles it as it always has.

export const MAX_ATTEMPTS = 3;
// A single wait never exceeds this, so a long Retry-After cannot eat the
// scheduled run's time: three attempts wait at most twice, about 20 seconds.
export const MAX_WAIT_MS = 10_000;
const BASE_BACKOFF_MS = 1_000;
const JITTER_MS = 250;

export class GivebutterHttpError extends Error {
  constructor(status) {
    super(`givebutter ${status}`);
    this.name = "GivebutterHttpError";
    this.status = status;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Returns the response for anything but a 429. After the last 429 it throws
// GivebutterHttpError("givebutter 429"), the same message the callers log.
export async function givebutterFetch(url, init, opts = {}) {
  const fetcher = opts.fetch || fetch;
  const sleep = opts.sleep || defaultSleep;
  const random = opts.random || Math.random;
  const now = opts.now || Date.now;

  for (let attempt = 1; ; attempt++) {
    const response = await fetcher(url, init);
    if (response.status !== 429) return response;
    if (attempt >= MAX_ATTEMPTS) throw new GivebutterHttpError(429);
    // Free the connection before waiting.
    try {
      await response.body?.cancel();
    } catch {
      // Nothing to free.
    }
    await sleep(
      retryDelay(response.headers?.get?.("Retry-After"), attempt, random, now),
    );
  }
}

// Retry-After in seconds or as an HTTP date, capped; otherwise exponential
// backoff (1s, 2s, ...) with a little jitter so two callers do not line up.
export function retryDelay(header, attempt, random = Math.random, now = Date.now) {
  const fromHeader = parseRetryAfter(header, now);
  if (fromHeader !== null) return Math.min(fromHeader, MAX_WAIT_MS);
  const backoff =
    BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.floor(random() * JITTER_MS);
  return Math.min(backoff, MAX_WAIT_MS);
}

function parseRetryAfter(header, now) {
  if (header == null) return null;
  const value = String(header).trim();
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.ceil(Number(value) * 1000);
  const at = Date.parse(value);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, at - now());
}
