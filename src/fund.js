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
// One goal, one bar (Alec, Nov 5 2026): "one campaign bar... puts together
// all of the initiatives into one big number... Then it shows how much of
// this pays for the year and how much of this pays for the U.S. Open." And
// "When you donate, it goes to just one program": the Chicago Wheelie Big
// Dills, through the one Givebutter campaign (the Hustle & Heart Fund). No
// donor picks a fund. "Our first priority is to raise money for the weekly
// training, then the U.S. Open. After that, Chicago Classic."
//
// So new gifts fill the parts in that order: every week first, up to its
// goal, then the road. Money raised under Send 6 before the one-goal model
// (SEND6_SET_ASIDE: $3,004 popcorn + $1,975 online) keeps its terms and sits
// on the road from the start. SEND6_ONLINE_COUNTED is the part of
// Givebutter's online total already inside that set-aside, so it is never
// counted twice. Equipment is raised per athlete and is not in the goal; the
// Chicago Classic joins the goal once it has a date and a budget.
//
// Keys the site asks for with /api/raised?c=<key>:
//   wbd     The one goal: every week + the road, with both parts.
//   year    Every week: court time every week and memberships to train all
//           year. $13,500: a year of nights at ACE ($3,900, 52 x $75) and ten
//           athletes training ($9,600, 10 x $960).
//   send-6  The Road to the US Open. $21,000: six athletes at about $3,500,
//           roughly what the US Open has cost the last couple of years.
//   fund    The whole campaign. Grant receipts read this.
//   classic The Chicago Classic: a goal we talk about, not yet in the total.
export const CAMPAIGN_KEYS = ["fund", "wbd", "year", "send-6", "classic"];
export const YEAR_GOAL = 13500;
export const ROAD_GOAL = 21000;
export const WBD_GOAL = YEAR_GOAL + ROAD_GOAL;

async function givebutter(env, id) {
  let online = 0;
  let goal = 0;
  let donors = 0;
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
        donors = Number(d.donors) || 0;
        live = true;
      }
    }
  } catch (err) {
    console.error("givebutter raised fetch failed:", err);
  }
  return { online, goal, donors, live };
}

// The one goal and its parts, filled in priority order.
async function wbd(env) {
  const g = await givebutter(env, env.GIVEBUTTER_CAMPAIGN_ID || "683765");
  const setAside = Number(env.SEND6_SET_ASIDE) || 0;
  const counted = Number(env.SEND6_ONLINE_COUNTED) || 0;
  const offline = Number(env.FUND_OFFLINE_RAISED) || 0;
  const fresh = Math.max(0, g.online - counted) + offline;
  const year = Math.min(fresh, YEAR_GOAL);
  const road = Math.min(setAside + Math.max(0, fresh - YEAR_GOAL), ROAD_GOAL);
  return {
    raised: setAside + fresh,
    online: g.online,
    offline: setAside - counted + offline,
    goal: WBD_GOAL,
    donors: g.donors,
    live: g.live,
    parts: {
      year: { raised: year, goal: YEAR_GOAL },
      "send-6": { raised: road, goal: ROAD_GOAL },
    },
  };
}

export async function campaignPosition(env, key = "send-6") {
  if (key === "fund") {
    const g = await givebutter(env, env.GIVEBUTTER_CAMPAIGN_ID || "683765");
    const offline = Number(env.FUND_OFFLINE_RAISED) || 0;
    return {
      raised: g.online + offline,
      online: g.online,
      offline,
      goal: 0,
      live: g.live,
    };
  }
  if (key === "classic")
    return { raised: 0, online: 0, offline: 0, goal: 0, live: true };
  const w = await wbd(env);
  if (key === "wbd") return w;
  const part = w.parts[key === "year" ? "year" : "send-6"];
  return { raised: part.raised, online: 0, offline: 0, goal: part.goal, live: w.live };
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
