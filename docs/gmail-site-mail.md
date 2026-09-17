# Gmail site-mail candidate

This branch prepares Gmail sending for the existing site-mail paths. It is not deployed and does not provision any credential. The repository has no git branch named `staging`; the existing Wrangler `env.staging` is a separate, front-end-only Worker. Do not create a git branch or modify the integration process to hide that distinction. Confirm the intended review base with the project lead before opening/merging a release PR.

## Scope

`cfSend` retains its existing caller interface and chooses Gmail only when `MAIL_TRANSPORT=gmail` is explicitly configured. The default legacy provider is retained for unrelated Workers until deliberately migrated. Once Gmail is selected, missing credentials, sender mismatch, auth failure or ambiguous acceptance never fall back to Cloudflare or a personal sender.

The same transport now reaches contact/application/volunteer receipts, original-contact records, waiver attachments, shop-contact messages, donation thank-yous and intake notifications. The receipt helpers recognize configured Gmail without requiring a SEND_EMAIL binding. Stored receipts identify Gmail rather than falsely calling its response Cloudflare.

Raw MIME is constructed server-side with UTF-8 text/HTML, binary attachments, inline Content-ID, recipient/Reply-To/BCC and bounded supported headers. Tests parse it with the existing independent postal-mime dependency, including waiver-like PDF bytes. Sender is restricted to the explicit authorized `GMAIL_FROM`; changing that variable does not authorize an alias in Google.

Donation send claims are conservative under Gmail: old retry/stale-sending claims are not replayed, and a failed/uncertain new attempt becomes terminal review (`failed` in the existing schema), rather than sending a second thank-you after a lost response. Existing Cloudflare behavior is unchanged until the transport is deliberately switched. Review historical donation debt individually before cutover.

## Authorization gate

Required Worker secrets: `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`.

Non-secret selection: `MAIL_TRANSPORT=gmail`, `GMAIL_FROM=hello@adapttolife.org`.

Use a dedicated OAuth refresh token with the Gmail send scope for the actual hello@ mailbox, or a mailbox already authorized to send as hello@. Enable Gmail API for the owning OAuth project if required. A generic Workspace API key cannot send Gmail. An existing Sheets/Drive service account does not automatically have delegated Gmail rights. Do not give the site a personal all-mail token or authorize broad domain-wide delegation just to avoid owner consent. Keep secrets in the approved vault and Worker secret bindings, never in this repo, a PR, or chat.

The authorization gate is still open. No Gmail send, recipient delivery, provider configuration, DNS/MX change, or production activation has been performed by this candidate.

## Verification

```sh
npm ci --ignore-scripts
npm run css
npm test
npm run build:app
```

The normal staging dry-run build was exercised, including app build, CSS generation, full tests and build stamp. Its frontend-only `src/staging.js` entry does NOT prove compilation of site-mail code. `src/index.js` was separately bundled with Wrangler in a local, no-routes, no-bindings dry-run configuration. No Worker was uploaded or deployed.

Automated tests use explicit local fixtures: one token refresh + one send, no cross-provider fallback/retry, missing IDs, invalid sender/header rejection, binary MIME roundtrip, actual contact receipt with Gmail/house BCC, and real SQLite donor claims under ambiguous send outcomes. They are not fake delivery receipts and must never be cited as inbox-delivery evidence.

## Release acceptance

1. Resolve the correct integration base/review process and review the exact candidate.
2. Authorize the actual sender, securely provision only that dedicated credential, and verify the account/send-as identity.
3. Inspect current delivery debt before activating Gmail. Preserve captured forms and original content; do not auto-replay ambiguous historical claims.
4. Use explicitly approved recipient-controlled checks for contact, waiver attachment, donation and ASNM welcome/notification. Verify both provider acceptance ID and actual recipient receipt; check BCC/Reply-To and privacy boundaries.
5. Deploy through the existing guarded main-release path, capture old/new version IDs, and leave MX and unrelated Workers untouched.
6. If validation fails, stop promotion. Rollback to captured code versions does not itself repair the previously broken sender. Preserve all delivery evidence and do not resend without review.
