# Hustle & Heart Fund — Grant Review Rubric

Internal document. Not published. This is the spine behind the public "How we decide" copy: it lets us make consistent, defensible award decisions and protect the "100% reaches the athlete" promise as volume grows.

Modeled on the Kelly Brush Foundation Active Fund, adapted for our stage. KBF rations scarce money across 50 states with heavy up-front paperwork. We are a young fund whose job right now is to learn who needs help and what it costs, so we keep the **front door light** and move the diligence to the **approval step**, once someone is a finalist.

## 1. Scoring rubric (applied to every application)

Score each 1–3. This is a guide for consistency, not a cutoff.

| Criterion | 1 | 2 | 3 |
|---|---|---|---|
| **Need** — is cost the real barrier? | Nice-to-have; other funding exists | Real cost, some other options | Cost is the only thing keeping them out |
| **Use** — will the gear/trip actually get used? | Unclear intent or readiness | Willing, some plan | Ready now, clear place to compete/train |
| **Cost reasonableness** — is the ask honest? | No sense of cost, or inflated | Ballpark, unverified | Real quote or tight estimate |
| **Fit to mission** — adaptive sport | Not a sport need | Adjacent | Squarely adaptive-sport |

**Reach:** no geographic limit. We fund adaptive athletes wherever they are (Alec, 2026-07-16). Location is captured for our own map of demand, never as a filter.

## 2. Approval-stage checklist (finalists only)

Do NOT ask for these at application. Collect only once we intend to fund:

- [ ] **One real vendor quote** (or invoice/entry-fee page) confirming the actual cost
- [ ] **Need confirmed** in one sentence: what this unlocks and why cost is the barrier
- [ ] **Payment routed** per policy below
- [ ] **Logged** in the ClickUp "Grants Awarded" list: amount, vendor paid, funded from (general fund vs Send 6, so restricted gifts stay separable), quote on file, application URL

## 3. Payment policy — DECIDED (Alec, adopts KBF exactly)

**We pay the vendor or program directly. We do not send money to the athlete, and we do not reimburse gear already purchased.** This mirrors the Kelly Brush Foundation model verbatim, chosen as the safe, defensible starting position. It is our strongest fraud and stewardship control and it lets us say "100% reaches the athlete" without an asterisk.

- Applicants apply *before* buying. If someone already bought the gear, it is a case-by-case exception, not the rule.
- Stated publicly on `/about#promise`, `/hustle-and-heart` ("How we decide" + FAQ), and `/apply` ("What happens next").
- We can loosen later if a real case demands it. Starting strict and relaxing is safer than the reverse.

## 4. What we don't fund — PUBLISHED (positive-framing clarity, not exclusion)

Live on `/hustle-and-heart` as the "What the fund is for" section, paired with what we DO fund. Framed as clarity that invites people in ("if you're unsure, apply anyway and ask"), which reads as professional and premium rather than gatekeeping.

- Everyday medical or mobility equipment not tied to a sport
- Costs already covered by an existing program or insurance
- Gear bought before applying (we pay the vendor directly, so apply first)

Kept deliberately short and warm. Tighten only if volume forces it.

## 5. What we tell an applicant, and when (added 2026-07-29)

The review rubric decides who gets funded. This section decides what someone hears while they wait,
which at this stage matters more, because **as of 2026-07-29 the fund has made zero grants and holds
a few hundred dollars.** Every applicant right now is applying to a fund that is still filling.

- **State the stage, in the receipt, with the real number.** The application receipt reads the live
  fund position from `src/fund.js` and says it plainly. If Givebutter is unreachable the sentence is
  dropped rather than estimated.
- **Promise only what we control.** A person reads it, and you hear where it stands. No timeline: we
  cannot hold one yet, and "within X days" is the promise that turns a slow month into a broken word.
- **The invitation to help is optional and severed.** Applicants may be invited to share the fund.
  They are never told, or allowed to infer, that doing so improves their chances. Money they help
  raise goes to the fund, never earmarked as their grant. Earmarking would create donor-restricted
  funds and make the accounting and the fairness story much harder, and it is the natural instinct to
  resist here.
- **Applicant data is not general correspondence.** Applications carry disability detail and
  financial need. The internal copy is routed by the `GRANTS_INBOX` Worker var so it can be moved off
  the shared `hello@` seat to a restricted mailbox without a code change.

## 6. Track from grant #1

KBF's "1,900 athletes across 50 states" is proof the machine works. We start counting now: athletes funded, dollars to athletes, sports and towns reached. Every application is the dataset. The moment we can show it, we do.
