# Running a popcorn campaign

`/popcorn` is a template. Every campaign after the first is a data edit, not a build.

## Which link to share

Two links exist and they are not interchangeable in public either.

| Situation | Share | Why |
|---|---|---|
| **Anything public**: social posts, the newsletter, a flyer, a QR code, a group text to people who have not heard the pitch | **`adapttolife.org/popcorn`** (print uses `adapttolife.org/q/popcorn`) | It carries why half of every bag matters, and it is the **only** surface that recruits sellers. It also survives: the Double Good URL dies when the store closes, so a printed one is dead paper. |
| **Warm and already sold**: someone replies "send me the link", you have just had the conversation in person | **the Double Good store link** | They do not need the pitch. Do not make a buyer read a page to reach a cart. |

**The reason this matters more than it looks.** On this platform total raised is roughly *number of
stores × each seller's reach*, and a Double Good storefront cannot ask anyone to open a store. Only
`/popcorn` does. Every person sent straight to the vendor converts at most one order and is a seller
you never got to ask. Traffic is not the lever here, sellers are.

Every drive CTA on the site follows this: the home calendar, `/ways-to-give` and `/send-6` all send
people to the drive's page, and the drive's page is where the store link lives.

## The one thing to understand about Double Good

There are **two different links** and they are not interchangeable.

| Link | Who it is for | What it does |
|---|---|---|
| **Pop-Up Store link** (`store_url`) | **Buyers** | Shows the flavors and takes an order. No app, no account. This is the money link. |
| **Event link** (`join_url`) + event code | **Sellers** | Recruits people onto the team. Sends them to download the app, enter the code, and create their own store. |

A buyer who lands on the event link gets an app-download screen and leaves. The page never sends a buyer there.

**The store link does not exist until someone creates a store.** The organizer creates one in the Double Good app: open the scheduled event → My Store → Share Link. Paste that into `store_url` and the whole page turns into a storefront.

## Launching the next campaign

Every drive on the site lives in **one** file, `public/data/campaigns.json` (Spec 115). `/popcorn`,
`/send-6` and `/ways-to-give` all read it, so a drive is never described in two places and a date
changed once is changed everywhere. Append one object to `drives`:

```json
{
  "slug": "spring-2027",
  "name": "Spring popcorn drive",
  "type": "fundraiser",
  "relationship": "we_fundraise",
  "campaign": "send-6-us-open",
  "published": true,
  "page": "/popcorn",
  "supports": "One sentence on what this drive pays for.",
  "summary": "One line for the campaign hub and the campaign page.",
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

That is the whole job. Nothing else on any page needs touching.

- `campaign` is the slug of the campaign this drive feeds, and it is load-bearing in three places:
  the drive appears on that campaign's page, the campaign card on `/ways-to-give` counts it, and
  `/popcorn` links the campaign straight from it. Get it wrong and the drive silently detaches from
  the story it belongs to. Omit it **only** for something that raises nothing for us, the way the
  Vlasic Classic does.
- `supports` should name the campaign the way `campaigns.json` names it, because `/popcorn` turns
  that name into the link to the campaign page. Word it differently and the card falls back to a
  standalone "Part of <campaign>" line — still correct, just a second mention of a name the sentence
  already carried.
- `published: false` keeps a verified record on file without putting it on the site. Use it for
  anything real but not yet confirmed, rather than deleting the facts you already checked.
- `public/popcorn.html` still holds the **flavor** list, because flavors are that page's own
  business and no other page renders them.

## What the page does on its own

- **Picks the current campaign.** Open now wins; otherwise the next one opening. Every CTA on the page follows it.
- **Derives status from the dates.** `opening soon` → `open now` → `closed`, with no deploy on the day a store opens or closes.
- **Never shows a dead link.** With `store_url` set, the hero, the card, all twelve flavor bags, and both section CTAs go to the store. Without it, they go to `/donate` and read "Give to the fund," because the fund is open even when the store is not.
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
   └─ Send 6 to the US Open Spring 2027    the campaign, $21,000 (six athletes x ~$3,500), page at /send-6
        └─ August popcorn drive    one drive, Aug 6-13, page at /popcorn
        └─ future drives, tournaments, monthly popcorn
```

A **drive** is a row on its campaign's page until it earns a page of its own, the way popcorn did.
The hub at `/ways-to-give` lists the campaigns first and the dated drives under them.

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

## Keep the numbers aligned across surfaces

A supporter sees two goals: ours on `/popcorn`, and the seller's inside the Double Good store.
Make them agree, or say why they differ.

- **One seller** (today): set the store's Fundraising Goal in the app to the same number as the
  drive `goal` here. Alec's store shipped at $500 while this drive is $1,000; raise the store to match.
- **Several sellers**: keep the drive `goal` as the TEAM number and expect each store to carry its
  own smaller one. Label ours "team goal" at that point.

Note the store goal counts popcorn only. The drive `goal` here counts popcorn **and** direct gifts,
which is why the card says so out loud.

The Double Good app also asks "Why are you raising funds?" Put the same sentence there as the card
carries here. Two surfaces, one message.

## The CTA rule

There is never a click that does nothing.

- **Store link set** → hero, card, all twelve bags, and the closing CTA open the store ("Buy popcorn").
- **No store link** → all of them go to `/donate` ("Give to the fund"), because the fund is open even
  when the store is not. Email capture is one secondary line under the closing CTA, never a button
  pretending to be a product.
