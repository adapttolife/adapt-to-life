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

// True while a send may still go out under the same key. Fails closed: with
// no clock (or an unreadable one) nobody can say when the first send went out,
// so nothing is sent.
export function windowOpen(firstAttemptedAt, now = Date.now()) {
  if (!firstAttemptedAt) return false;
  const start = Date.parse(firstAttemptedAt);
  return Number.isFinite(start) && now - start < RETRY_WINDOW_MS;
}

// Why a send must not go out now, or null when it may. Callers send the row to
// review with this message and alert.
export function windowRefusal(firstAttemptedAt, now = Date.now()) {
  if (windowOpen(firstAttemptedAt, now)) return null;
  return firstAttemptedAt && Number.isFinite(Date.parse(firstAttemptedAt))
    ? "Retry window closed (23 hours from the first attempt); check Resend's log by tag before resending"
    : "No retry clock (first_attempted_at missing); check Resend's log by tag before resending";
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
