# Giving alignment: approved direction, staged implementation

This is a release checklist and proposed external copy, not an activated policy or authorization to publish production.

## Decisions confirmed by Alec

- Disclose a campaign's fallback before accepting new gifts under that appeal. The approved destination is the Hustle & Heart Fund when the campaign is fully funded or cannot proceed. Existing gifts retain the terms under which they were received; neither a website edit nor this approval reallocates them.
- Advertise sponsorship benefits we can deliver. Substantial naming recognition and arrangements across multiple years are individually negotiated. Prices remain unchanged. The draft removes automatic quarterly reports, annual athlete stories/briefings, speaking slots and blanket naming/press promises. Existing sponsor agreements are not cancelled by changing the public offer.
- Alec covers overhead while revenue is developed through Adaptive Sports Near Me, Adapt Body Shop and future work. This confirms the funding approach, not a percentage, transfer formula, or claim that every expense is charged to Alec's personal card. Do not invent either project's monetization model.

## Staged changes

- `/promise`: concise campaign-purpose rule, explicit protection for earlier gift terms, and both revenue projects in the sustainability story.
- `/send-6`: prospective fallback before the primary donation link.
- `/donate` and `/hustle-and-heart`: campaign-terms links at giving entry points; donor page identifies the formal entity as Adapt To Life NFP.
- `/sponsorship`: simpler deliverable offer and individually agreed larger arrangements.
- `src/givebutter_webhook.js`: both future thank-you bodies no longer make a blanket allocation-percentage promise. Event processing, payment handling and official receipt behavior are unchanged. No email has been sent by this revision.

## Coordinate, do not silently activate

The real public Givebutter destination is `https://givebutter.com/hustle-heart-fund`. `IXM5DR` is an embed identifier, not its public URL. The live donor page still uses the older allocation promise. This content pass does not change that external page.

Before an approved production release:

1. Preserve the previous website, Givebutter appeal, email template, relevant donor notes and existing sponsor commitments. Keep private donor records outside public assets and this repository.
2. Confirm which historical gifts were restricted, their appeal terms, remaining balances and permitted treatment. Marketing appeals and correspondence are evidence too; the absence of a signed restriction form is not permission to repurpose a gift.
3. Align the Givebutter appeal, website donation entry points and future thank-you text in one controlled release. Record the effective time and actual donor-facing versions. Do not backdate the change or apply it to historical gifts.
4. Check the actual hosted/embedded giving path read-only, including purpose, fallback, entity and links before any new terms are treated as effective. Do not make a test donation or send a message without authorization.
5. Obtain source confirmation for remaining registration, historical donation/reconciliation and current program-payment checks. Corporate incorporation, federal exemption and state charitable registration are different records.
6. Resolve the separate remote Cloudflare build failure with actual build/log evidence. A successful staging CLI deployment is not green remote CI.
7. Obtain Alec's explicit production approval. Keep the existing review branch and staging Worker until then.

## Proposed Givebutter appeal copy (not published)

The Hustle & Heart Fund helps adaptive athletes with equipment, training, and travel. A chair, time with a coach, or help getting to an event can make it possible to keep playing.

Named for how Tim Gruensfelder played, all hustle and all heart, the fund supports athletes and the programs that help them take part.

Our current Send 6 campaign is raising $21,000 to help six athletes prepare for the US Open in Naples in spring 2027.

For new gifts to Send 6: if the campaign is fully funded or cannot go ahead, remaining campaign funds from those gifts will support the Hustle & Heart Fund. Gifts already received keep their original terms.

How Giving Works: https://adapttolife.org/promise

## Evidence status

The published IRS determination letter and the IRS Illinois Exempt Organizations extract match Adapt To Life NFP and EIN 41-3213344. The letter identifies section 501(c)(3), public-charity status and contribution deductibility. Approved Illinois incorporation records were read separately. The existing release's entity name is consistent; the release itself is not rewritten.

These checks do not establish state charitable solicitation registration, a completed financial reconciliation, or every operational claim. Detailed source observations and access failures remain in the local research evidence, not public website assets. Do not describe all launch checks as resolved.
