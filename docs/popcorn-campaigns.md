# Running a popcorn campaign

`/popcorn` is a template. Every campaign after the first is a data edit, not a build.

## The one thing to understand about Double Good

There are **two different links** and they are not interchangeable.

| Link | Who it is for | What it does |
|---|---|---|
| **Pop-Up Store link** (`store_url`) | **Buyers** | Shows the flavors and takes an order. No app, no account. This is the money link. |
| **Event link** (`join_url`) + event code | **Sellers** | Recruits people onto the team. Sends them to download the app, enter the code, and create their own store. |

A buyer who lands on the event link gets an app-download screen and leaves. The page never sends a buyer there.

**The store link does not exist until someone creates a store.** The organizer creates one in the Double Good app: open the scheduled event → My Store → Share Link. Paste that into `store_url` and the whole page turns into a storefront.

## Launching the next campaign

Edit the `popcorn-data` JSON block in `public/popcorn.html`. Append one object to `campaigns`:

```json
{
  "slug": "spring-2027",
  "name": "Spring popcorn drive",
  "supports": "One sentence on what this campaign pays for.",
  "opens": "2027-03-01",
  "closes": "2027-03-08",
  "time_note": "Opens and closes at 10:00 PM CT",
  "goal": 2500,
  "raised": null,
  "store_url": "https://popup.doublegood.com/s/XXXXX",
  "join_url": "https://popup.doublegood.com/event/XXXXX",
  "event_code": "ABC DEF"
}
```

That is the whole job. Nothing else on the page needs touching.

## What the page does on its own

- **Picks the current campaign.** Open now wins; otherwise the next one opening. Every CTA on the page follows it.
- **Derives status from the dates.** `opening soon` → `open now` → `closed`, with no deploy on the day a store opens or closes.
- **Never shows a dead link.** With `store_url` set, the hero, the card, all twelve flavor bags, and both section CTAs go to the store. Without it, they go to `/subscribe` and read "Tell me when it opens."
- **Hides what it does not have.** No `goal` means no goal bar. No `raised` means the bar shows the target only. No `join_url` hides the whole team section.
- **Files closed campaigns** into the record list at the bottom. Set `raised` when the payout is known and it shows there.

## Notes

- **Flavor bags link to the store front, not to a single flavor.** Double Good pop-up stores have no per-product URL, so one click gets a buyer to the shelf and they pick from there.
- **`raised` is entered by hand.** Double Good reports totals to the organizer; there is no API to read them.
- **Prices come from Double Good** and are copied into the `flavors` list. Check them at the start of a campaign; if the lineup changes, update the list and the images in `public/images/popcorn/`.
- **Product photography is Double Good's.** Confirm use with them, or swap in assets from their organizer toolkit.

## Where a popcorn drive sits

```
Hustle & Heart Fund            the fund, open every day
   └─ Send 6 to the US Open    the goal, $21,000 (six athletes x ~$3,500)
        └─ August popcorn drive    one vehicle, Aug 6-13
        └─ future drives, tournaments, monthly popcorn
```

Set the drive's `goal` to what **that drive** can realistically raise, not to the $21,000 campaign
goal. A one-week popcorn store carrying a $21,000 bar reads as failure at $1,500. The $21,000 lives
in the "where the money goes" section, where the drive visibly moves it.

## Per-athlete cost basis (verified 2026-07-24)

| Category | About | Basis |
|---|---|---|
| Equipment | $450 | tires ~$200, competition paddle ~$250 |
| Training | $500 | shared practice facility, 6-10 wheelchair athletes weekly, year round |
| Travel | $2,300 | airfare ~$500, six nights lodging $1,200+, entry $150 credential + $45-50 per event, accessible ground transport |

US Open Pickleball Championships, Naples FL. 2026 ran April 11-18 at the USOP National Pickleball
Center; wheelchair events run double elimination with a consolation bracket. Fees above are from the
official registration page. Costs rise annually, so re-check before each campaign.

## The CTA rule

There is never a click that does nothing.

- **Store link set** → hero, card, all twelve bags, and the closing CTA open the store ("Buy popcorn").
- **No store link** → all of them go to `/donate` ("Give to the fund"), because the fund is open even
  when the store is not. Email capture is one secondary line under the closing CTA, never a button
  pretending to be a product.
