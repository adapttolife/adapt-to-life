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
// "When you donate, it goes to just one program": Chicago Pickleball:
// Wheelie Big Dills, through the one Givebutter campaign (the Hustle & Heart Fund). No
// donor picks a fund. "Our first priority is to raise money for the weekly
// training, then the U.S. Open. After that, Chicago Classic."
//
// So new gifts fill the parts in that order: every week first, up to its
// goal, then the road. Money raised under Send 6 before the one-goal model
// (SEND6_SET_ASIDE: $3,004 popcorn + $1,975 online) keeps its terms and sits
// on the road from the start. SEND6_ONLINE_COUNTED is the part of
// Givebutter's online total already inside that set-aside, so it is never
// counted twice. Equipment is raised per athlete and is not in the goal; the
// Chicago Classic gets its own budget once it has a date; until then, gifts past
// the road go toward it (the goal is a round $50,000, see WBD_GOAL).
//
// Named sponsorships (Alec, Nov 12 2026: "yes to both"): if a sponsor's name
// goes on a part, their money pays for that part, with one sponsor's name per
// part at a time. Captain (court time) and Train to Compete (memberships) are
// every week, which new money fills first anyway, so record them like any
// offline gift (FUND_OFFLINE_RAISED). A Champion pays for the road, so its
// money sits on the road from the start, like the Send 6 set-aside:
//   ROAD_NAMED         named road sponsorships, in dollars
//   ROAD_NAMED_ONLINE  the part of ROAD_NAMED paid through Givebutter, already
//                      inside Givebutter's online total
// Both default to 0 (no Champion yet). Set them in wrangler.jsonc when one signs.
// The road may already be partly paid for (the Send 6 set-aside sits there), so
// a named sponsorship covers only what the road still needs; the money it
// doesn't need goes to the rest of the goal like a new gift (every week first),
// as the sponsor is told before giving. Until the parts are full they add up to
// the total; past them, the total keeps counting toward the Chicago Classic.
//
// Keys the site asks for with /api/raised?c=<key>:
//   wbd     The one goal ($50,000): every week, then the road (both parts),
//           then the rest toward the Chicago Classic.
//   year    Every week: court time every week and memberships to train all
//           year. $27,180: a year of nights at ACE ($11,700, 52 x $225) and ten
//           athletes training ($15,480, 10 x $1,548).
//   send-6  The Road to the US Open (the key keeps the retired Send 6 name).
//           $21,000 for a season of tournament travel: about 21 trips at
//           about $1,000 each (Nov 11 2026). A trip is one athlete at one tournament;
//           the US Open in Naples, spring 2027, is the last stop.
//   fund    The whole campaign. Grant receipts read this.
//   classic The Chicago Classic: a goal we talk about, not yet in the total.
export const CAMPAIGN_KEYS = ["fund", "wbd", "year", "send-6", "classic"];
export const YEAR_GOAL = 27180;
export const ROAD_GOAL = 21000;
// Alec, Nov 12 2026: "Just say 50k. 48,180 is a stupid number. Just round up."
// The goal is a round $50,000. Every week and the road come first; gifts past
// them go toward the Chicago Classic.
export const WBD_GOAL = 50000;
// Court time a partner club gives toward every week (Alec, Nov 7 2026). The
// club's drop in is $15 and we pay $5, so the club gives $10 an athlete a
// night: the first gift toward every week. Counted conservatively at 10
// athletes a night (10 to 15 come) for the 52 nights of the year ahead:
// 10 x $10 x 52 = $5,200. Pages show it as court time from a partner club and
// never name the club or the rate (Alec: saying it on the page hurts more
// than it helps). New gifts fill the rest of every week, then the road.
export const YEAR_INKIND = 5200;

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

// A dollar setting from wrangler.jsonc. "21,000" or "$21,000" reads as 21000
// rather than silently turning into 0.
function dollars(v) {
  return Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0;
}

// The one goal and its parts, filled in priority order.
async function wbd(env) {
  const g = await givebutter(env, env.GIVEBUTTER_CAMPAIGN_ID || "683765");
  const send6 = dollars(env.SEND6_SET_ASIDE);
  const named = dollars(env.ROAD_NAMED);
  const namedOnRoad = Math.min(named, Math.max(0, ROAD_GOAL - send6));
  const setAside = send6 + namedOnRoad;
  const counted = dollars(env.SEND6_ONLINE_COUNTED) + dollars(env.ROAD_NAMED_ONLINE);
  const offline = dollars(env.FUND_OFFLINE_RAISED);
  const fresh = Math.max(0, g.online - counted) + offline + (named - namedOnRoad);
  const inkind = Math.min(YEAR_INKIND, YEAR_GOAL);
  const yearCash = Math.min(fresh, YEAR_GOAL - inkind);
  const road = Math.min(
    setAside + Math.max(0, fresh - (YEAR_GOAL - inkind)),
    ROAD_GOAL,
  );
  return {
    raised: setAside + fresh,
    inkind,
    online: g.online,
    offline: send6 + named - counted + offline,
    goal: WBD_GOAL,
    donors: g.donors,
    live: g.live,
    parts: {
      year: { raised: yearCash + inkind, inkind, goal: YEAR_GOAL },
      "send-6": { raised: road, goal: ROAD_GOAL },
    },
  };
}

export async function campaignPosition(env, key = "send-6") {
  if (key === "fund") {
    const g = await givebutter(env, env.GIVEBUTTER_CAMPAIGN_ID || "683765");
    // A named road sponsorship paid by check or transfer is fund money too.
    const namedOffline = Math.max(
      0,
      dollars(env.ROAD_NAMED) - dollars(env.ROAD_NAMED_ONLINE),
    );
    const offline = dollars(env.FUND_OFFLINE_RAISED) + namedOffline;
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
