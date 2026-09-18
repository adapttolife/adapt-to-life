# Contributing

ATL, ASNM and Adapt Body Shop's Hydrogen storefront use the same standing integration method, authorized by Alec and following Faisal's staging workflow. Agents consume the existing shared `Tranel-Labs/agentos:skills/github-publication-review/SKILL.md`; its source promotion is proposed in [AgentOS #742](https://github.com/Tranel-Labs/agentos/pull/742), not yet a claim of merged/runtime adoption. Do not create per-bot variants.

1. Fetch origin and start every feature/fix branch from current `origin/staging`, not main.
2. Open the feature/fix PR **into staging**. Keep one current review for a repair in this repository; link a companion in another repo when relevant.
3. Preserve teammates' work. Verify staging ancestry, run the full test suite, and resolve conflicts before review.
4. After staging review and acceptance, the project lead opens a separate **staging → main** release PR. Feature branches must not target main. Main changes can trigger production deployment and need explicit release approval.
5. Never deploy production or write production databases merely to test a PR. Git staging and Wrangler staging are different objects; the current Wrangler staging Worker is frontend-only. Use isolated configurations for runtime/data checks.

```sh
git fetch origin
git switch -c fix/your-change origin/staging
npm ci --ignore-scripts
npm test
git merge-base --is-ancestor origin/staging HEAD
# Open the PR with base=staging.
```

The read-only test workflow checks PR routing, staging ancestry and the full suite. It has no deployment job or runtime secrets. GitHub reports that this private repository's current plan does not support branch protection/rulesets: these checks are not a guaranteed merge lock. Do not change visibility or purchase a plan to hide that limitation.

ATL Cloudflare Builds validate non-main branches with the app build, CSS generation and tests only; they no longer attempt production-config version uploads. The guarded main release trigger is unchanged. Previously generated versions can inherit production bindings: they are not isolated test sandboxes. Keep production-backed preview URLs disabled and verify active deployment versions after publishing.

Do not commit credentials, `.env`, vault output, customer fixtures or local bundle-check configs. Preserve actual provider receipts separately from mocked tests; a successful build is not live form-delivery acceptance.
