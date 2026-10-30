const fail = { ok: false, status: 502, error: 'Sign-up is temporarily unavailable. Please try again soon.' };

function digest(value) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)).then((bytes) =>
    Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''));
}

export async function safeNewsletterSubscribe(env, input, campaign, extra = {}) {
  const db = env.AGENT_MAIL_DB;
  const segmentId = env.RESEND_SEGMENT_ID;
  if (!db || !env.RESEND_API_KEY || !segmentId) return { ...fail, status: 503 };

  const email = input.trim().toLowerCase();
  const name = typeof extra.name === 'string' ? extra.name.trim().slice(0, 60) : '';
  const headers = { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' };
  let key;

  try {
    key = await digest(`${segmentId}\\n${email}`);
    const claim = await db.prepare("INSERT OR IGNORE INTO newsletter_delivery_claims (claim_key,publication_id,state) VALUES (?,?,'creating') RETURNING claim_key")
      .bind(key, segmentId).first();
    if (!claim) return { ok: true, existing: true };

    const body = { email, unsubscribed: false, segments: [{ id: segmentId }] };
    if (name) body.first_name = name;
    const response = await fetch('https://api.resend.com/contacts', {
      method: 'POST', headers, signal: AbortSignal.timeout(10000), body: JSON.stringify(body),
    });
    let contact = null;
    if (response.ok) {
      contact = await response.json();
      if (!contact?.id) throw new Error('Invalid contact creation response');
    } else if (response.status === 409) {
      const membership = await fetch(`https://api.resend.com/contacts/${encodeURIComponent(email)}/segments/${encodeURIComponent(segmentId)}`, {
        method: 'POST', headers, signal: AbortSignal.timeout(10000),
      });
      if (!membership.ok && membership.status !== 409) throw new Error('Contact segment membership rejected');
    } else {
      throw new Error('Contact creation rejected');
    }

    await db.prepare("UPDATE newsletter_delivery_claims SET subscription_id=?,state='resend-subscribed' WHERE claim_key=?")
      .bind(contact?.id || null, key).run();
    return { ok: true, ...(contact ? {} : { existing: true }) };
  } catch (error) {
    console.error('newsletter signup failed closed', { reason: error?.name === 'TimeoutError' ? 'timeout' : 'operation-failed' });
    if (key) {
      try {
        await db.prepare("UPDATE newsletter_delivery_claims SET state='needs-review' WHERE claim_key=? AND state='creating'").bind(key).run();
      } catch { }
    }
    return fail;
  }
}
