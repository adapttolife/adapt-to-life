// The fund's live position: Givebutter's online total plus the offline gifts we
// track ourselves.
//
// Why this is its own module: two callers now need this number and they must
// never disagree. The site thermometer (/api/raised) has always read it, and
// the grant-application receipt now tells an applicant where the fund actually
// stands. A second hand-rolled copy of the same fetch is how two surfaces start
// quoting different totals for the same fund, which is the one thing a young
// nonprofit cannot afford to do in writing to an applicant.
//
// `live` is the part that matters for email. The thermometer can fall back to a
// hard-coded goal because a slow widget is harmless. A receipt must never print
// a number we did not actually read, so it checks `live` and stays silent about
// the fund's position rather than guessing.
export async function fundPosition(env) {
  const campaignId = env.GIVEBUTTER_CAMPAIGN_ID || "683765";
  const offline = Number(env.OFFLINE_RAISED) || 0;
  let online = 0;
  let goal = 0;
  let live = false;
  try {
    if (env.GIVEBUTTER_API_KEY) {
      const r = await fetch(`https://api.givebutter.com/v1/campaigns/${campaignId}`, {
        headers: { Authorization: `Bearer ${env.GIVEBUTTER_API_KEY}`, Accept: "application/json" },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (r.ok) {
        const d = await r.json();
        online = Number(d.raised) || 0;
        goal = Number(d.goal) || 0;
        live = true;
      }
    }
  } catch (err) {
    console.error("givebutter raised fetch failed:", err);
  }
  return {
    raised: online + offline,
    online,
    offline,
    // Fallback only. The live goal is Givebutter's (Send 6 to the US Open:
    // 6 athletes x $3,500). Change it there, not here (Spec 115 D3).
    goal: goal || Number(env.RAISED_GOAL) || 21000,
    live,
  };
}

// Whole dollars, with separators. Grant amounts and campaign goals are always
// round numbers here, and cents in a sentence read like a bank statement.
export function usd(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}
