// Cloudflare Turnstile, server side. One copy, imported by every handler that
// gates a public form, so the policy cannot drift between them.
//
// FAILS CLOSED. The old copy returned true when TURNSTILE_SECRET_KEY was unset,
// which meant a lane that silently lost its secret accepted every bot. A lane
// that genuinely has no widget (a dev sandbox) says so out loud with
// TURNSTILE_MODE="off" in its vars — an explicit, greppable decision rather than
// an absence nobody notices.
export async function verifyTurnstile(env, token, ip) {
  if (!env || !env.TURNSTILE_SECRET_KEY) {
    if (env && env.TURNSTILE_MODE === "off") return true;
    console.error('turnstile: TURNSTILE_SECRET_KEY is unset and TURNSTILE_MODE is not "off" — refusing the submission');
    return false;
  }
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip || undefined }),
    });
    const out = await res.json();
    return !!out.success;
  } catch (err) {
    console.error("turnstile verify failed:", err);
    return false;
  }
}

// Per-network rate limit on form POSTs, defence in depth behind Turnstile. The
// zone rule (100 requests / 10 s) only stops floods; this stops a patient
// spammer. Keyed on the connecting IP. Returns true when the caller should be
// refused. A missing binding is a configuration bug, logged on every request
// so it cannot hide, but it never blocks a real person: Turnstile is the gate,
// this is the fence.
export async function overFormLimit(env, request) {
  if (!env || !env.FORM_LIMITER) {
    console.error("FORM_LIMITER binding missing — form rate limit is not running");
    return false;
  }
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  try {
    const { success } = await env.FORM_LIMITER.limit({ key });
    return !success;
  } catch (err) {
    console.error("form rate limiter failed:", err);
    return false;
  }
}

export const RATE_LIMITED = { ok: false, error: "Too many submissions from your network. Please wait a minute and try again." };
