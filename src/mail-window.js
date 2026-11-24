// The retry window every keyed send shares (docs/EMAIL.md, "How a site sends").
//
// Resend returns the first result for a repeat of the same Idempotency-Key and
// body for 24 hours. After that the same key is a brand new send, so a retry
// past it can email someone twice. Every outbox therefore:
//   - counts from an immutable first_attempted_at, stamped before the first
//     call to the provider and never reset;
//   - refuses to send once 23 hours have passed (the hour is margin for clock
//     drift and a slow attempt), sending the row to review instead;
//   - never schedules a retry past that cutoff.
export const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;

// 10, 20, 40, 80, 160 minutes, then every 3 hours.
export const retryDelayMs = (attempts) =>
  Math.min(10 * 60e3 * 2 ** Math.max(0, attempts - 1), 3 * 60 * 60e3);

// True while a send may still go out under the same key.
export function windowOpen(firstAttemptedAt, now = Date.now()) {
  if (!firstAttemptedAt) return true;
  const start = Date.parse(firstAttemptedAt);
  return Number.isFinite(start) && now - start < RETRY_WINDOW_MS;
}

// When the next try may run, clamped a minute inside the cutoff. Null when no
// try fits any more: the caller sends the row to review.
// `delay` lets an outbox keep its own backoff (the donor table triples).
export function nextAttemptAt(
  firstAttemptedAt,
  attempts,
  { now = Date.now(), delay = retryDelayMs } = {},
) {
  const start = Date.parse(firstAttemptedAt);
  if (!Number.isFinite(start)) return null;
  const latest = start + RETRY_WINDOW_MS - 60e3;
  const next = Math.min(now + delay(attempts), latest);
  return next > now ? new Date(next).toISOString() : null;
}
