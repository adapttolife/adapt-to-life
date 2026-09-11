# One mission, evolving work

This revision implements Alec's source-audit direction on the existing content-review branch and staging environment. It does not authorize production publication.

## Editorial decisions

- Restore the enduring mission: We expand access to adaptive sports so athletes can find their place.
- Recover the bridge: We build more ways into adaptive sports.
- Keep the founder origin as lived context, not the organization's entire identity.
- Explain connections and support within an existing community. Do not imply ATL invented, owns, or operates all the programs it helps people find.
- Let current initiatives demonstrate the mission instead of defining its boundaries. The homepage's work section deliberately does not list brands.
- Put initiative detail on About at #our-work, with a visible distinction between available work and the forthcoming store.
- Preserve the current campaign and Tim section. Fundraising remains an example of the work, not its entire definition.
- Give Body Shop a useful, truthful coming-soon information page. No checkout, catalog claims, launch date, profit-allocation percentage, or tax-deductible purchase claim is introduced.
- Keep growth connected to community value and sustainable support. Revenue development remains a plan, not a claim of current earnings.

## Scope

Substantive copy: homepage, About, Roadmap, directory overview, fund context, How Giving Works sustainability paragraph, volunteer source data and generated pages, and the new Body Shop information page.

Shared changes: Body Shop's coming-soon route in desktop/mobile navigation and footer across current pages; source and social description of the organization's mission on the homepage. Reuse the accepted photography, fonts, color palette, page-header system, and existing share image for the new information page.

Preserved: payment methods, gift-purpose restrictions, prior-gift terms, safety requirements, grant eligibility, legal entity/IRS disclosure, sponsorship terms, campaign figures/source, the named personal stories and direct quotes, and actual separate directory/store systems.

Generated volunteer copy is changed at data/volunteer-roles.mjs, not maintained as a second hand-edited source. docs/CONTENT.md owns the revised editorial standard.

## Verification

- Unit tests cover mission breadth, future shop status, discoverability, and preservation of donor purpose/safety terms.
- Existing whole-site checker includes the new page.
- Homepage browser checks cover four widths, images, actions, reduced-motion/pause controls, and no-JavaScript content.
- Mission-cohesion browser checks cover seven connected pages at mobile/desktop sizes, shop route navigation, keyboard activation, the About anchor, staging write refusal, noindex, and submission-blocking CSP.
- Inspect captured rendered layouts rather than treating HTTP 200 as visual proof.
- Compare deployed source/digest and active bindings; preserve production and main.

Validation output and deployment receipts belong in Julia's private working evidence, not public website assets. This is staging copy for Alec's review, not a claimed conversion-tested final design.
