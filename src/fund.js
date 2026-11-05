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
// Three campaigns since Nov 5 2026 (Alec: "it should be separate"). Each key is
// what the site asks for with /api/raised?c=<key>:
//   road    The Road: the Hustle & Heart Fund's year-round giving. No goal,
//           because it has no ceiling.
//   send-6  Send 6 to the US Open Spring 2027. Its offline figure carries what
//           was raised under Send 6 before the split (popcorn and the online
//           gifts shown as Send 6 progress then).
//   classic The Chicago Classic: free registration, transportation and hotels.
const CAMPAIGNS = {
  road: (env) => ({
    id: env.GIVEBUTTER_CAMPAIGN_ID || "683765",
    offline: Number(env.ROAD_OFFLINE_RAISED) || 0,
    fallbackGoal: 0,
  }),
  "send-6": (env) => ({
    id: env.GIVEBUTTER_SEND6_CAMPAIGN_ID || "782832",
    offline: Number(env.SEND6_OFFLINE_RAISED) || 0,
    fallbackGoal: 21000,
  }),
  classic: (env) => ({
    id: env.GIVEBUTTER_CLASSIC_CAMPAIGN_ID || "782833",
    offline: Number(env.CLASSIC_OFFLINE_RAISED) || 0,
    fallbackGoal: 0,
  }),
};
export const CAMPAIGN_KEYS = Object.keys(CAMPAIGNS);

export async function campaignPosition(env, key = "send-6") {
  const c = (CAMPAIGNS[key] || CAMPAIGNS["send-6"])(env);
  let online = 0;
  let goal = 0;
  let live = false;
  try {
    if (env.GIVEBUTTER_API_KEY) {
      const r = await fetch(`https://api.givebutter.com/v1/campaigns/${c.id}`, {
        headers: {
          Authorization: `Bearer ${env.GIVEBUTTER_API_KEY}`,
          Accept: "application/json",
        },
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
    raised: online + c.offline,
    online,
    offline: c.offline,
    // Fallback only. The live goal is Givebutter's; campaigns.json says the same.
    goal: goal || c.fallbackGoal,
    live,
  };
}

// The fund's own position: The Road. The grant receipt reads this.
export async function fundPosition(env) {
  return campaignPosition(env, "road");
}

// Whole dollars, with separators. Grant amounts and campaign goals are always
// round numbers here, and cents in a sentence read like a bank statement.
export function usd(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}
