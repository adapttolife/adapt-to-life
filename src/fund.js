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
// One fund, several stories (Alec, Nov 5 2026: "we tell the story with
// different campaigns, but at the end of the day, it all goes to one fund").
// Every gift goes to one Givebutter campaign, the Hustle & Heart Fund. The fund
// pays for week-to-week training first, then travel on the road to the US Open.
// Keys the site asks for with /api/raised?c=<key>:
//   fund    The whole fund: Givebutter's online total plus FUND_OFFLINE_RAISED.
//           No goal, because week-to-week has no ceiling.
//   send-6  The Road to the US Open: money set aside for travel and the six
//           seats. SEND6_SET_ASIDE starts with what was raised under Send 6
//           ($3,004 popcorn + $1,975 online) and is raised as the fund sets
//           more aside. Goal $21,000.
//   classic The Chicago Classic: a goal we talk about, not yet a fund.
export const CAMPAIGN_KEYS = ["fund", "send-6", "classic"];

async function givebutter(env, id) {
  let online = 0;
  let goal = 0;
  let live = false;
  try {
    if (env.GIVEBUTTER_API_KEY) {
      const r = await fetch(`https://api.givebutter.com/v1/campaigns/${id}`, {
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
  return { online, goal, live };
}

export async function campaignPosition(env, key = "send-6") {
  if (key === "fund") {
    const g = await givebutter(env, env.GIVEBUTTER_CAMPAIGN_ID || "683765");
    const offline = Number(env.FUND_OFFLINE_RAISED) || 0;
    return { raised: g.online + offline, online: g.online, offline, goal: 0, live: g.live };
  }
  if (key === "classic") return { raised: 0, online: 0, offline: 0, goal: 0, live: true };
  const setAside = Number(env.SEND6_SET_ASIDE) || 0;
  return { raised: setAside, online: 0, offline: setAside, goal: 21000, live: true };
}

// The fund's own position. The grant receipt reads this; with no goal it
// quotes no figure, which is the honest answer for an open-ended fund.
export async function fundPosition(env) {
  return campaignPosition(env, "fund");
}

// Whole dollars, with separators. Grant amounts and campaign goals are always
// round numbers here, and cents in a sentence read like a bank statement.
export function usd(n) {
  return `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
}
