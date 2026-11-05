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
// One fund, two bars (Alec, Nov 5 2026). Every gift goes to one Givebutter
// campaign, the Hustle & Heart Fund. Donors designate it to one of two
// Givebutter funds, and each fund is a bar on the site: "One campaign bar for
// sending people to the U.S. Open. A campaign bar designated for the
// week-to-week, month-to-month, year-round support". Equipment is raised per
// athlete when one needs it, so it has no bar.
// Keys the site asks for with /api/raised?c=<key>:
//   year    Year-round support for the Chicago Wheelie Big Dills: court time
//           every week and memberships to train all year. The Givebutter fund
//           GIVEBUTTER_FUND_YEAR plus YEAR_OFFLINE_RAISED. Goal $13,500: a year
//           of nights at ACE ($3,900, 52 x $75) and ten athletes training
//           ($9,600, 10 x $960).
//   send-6  The Road to the US Open: SEND6_SET_ASIDE (what was raised under
//           Send 6: $3,004 popcorn + $1,975 online, all undesignated) plus the
//           Givebutter fund GIVEBUTTER_FUND_ROAD. Goal $21,000: six athletes at
//           about $3,500, roughly what the US Open has cost the last couple of
//           years.
//   fund    The whole campaign, designated or not. Grant receipts read this.
//   classic The Chicago Classic: a goal we talk about, not yet raising.
export const CAMPAIGN_KEYS = ["fund", "year", "send-6", "classic"];
export const YEAR_GOAL = 13500;
export const ROAD_GOAL = 21000;

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

// A Givebutter fund's designated total. Funds are labels inside the one
// campaign, so this never double counts: a gift sits in exactly one fund.
async function givebutterFund(env, id) {
  let raised = 0;
  let live = false;
  try {
    if (env.GIVEBUTTER_API_KEY && id) {
      const r = await fetch(`https://api.givebutter.com/v1/funds/${id}`, {
        headers: {
          Authorization: `Bearer ${env.GIVEBUTTER_API_KEY}`,
          Accept: "application/json",
        },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (r.ok) {
        const d = await r.json();
        raised = Number((d && d.data ? d.data : d).raised) || 0;
        live = true;
      }
    }
  } catch (err) {
    console.error("givebutter fund fetch failed:", err);
  }
  return { raised, live };
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
  if (key === "year") {
    const f = await givebutterFund(env, env.GIVEBUTTER_FUND_YEAR);
    const offline = Number(env.YEAR_OFFLINE_RAISED) || 0;
    return {
      raised: f.raised + offline,
      online: f.raised,
      offline,
      goal: YEAR_GOAL,
      live: f.live,
    };
  }
  const setAside = Number(env.SEND6_SET_ASIDE) || 0;
  const road = await givebutterFund(env, env.GIVEBUTTER_FUND_ROAD);
  return {
    raised: setAside + road.raised,
    online: road.raised,
    offline: setAside,
    goal: ROAD_GOAL,
    live: true,
  };
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
