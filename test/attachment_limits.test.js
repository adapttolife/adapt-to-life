// Outbound attachment budget. The number that matters is not arbitrary: the
// Cloudflare Email Sending platform caps TOTAL MESSAGE size at 5 MiB for
// ordinary recipients and 25 MiB when every recipient is a verified Email
// Routing destination. Decoded budgets are those caps divided by MIME base64
// inflation (~1.37x) with headroom for the body.
//
// This pins the two properties that are easy to break silently:
//   1. verified recipients earn the larger budget, unverified ones do not
//   2. the DECODED budget still fits inside the platform cap once base64'd
//      (the previous 4 MiB limit did NOT — it became ~5.5 MiB on the wire,
//      over the 5 MiB unverified cap, and would have been rejected downstream)

import { test } from "node:test";
import assert from "node:assert/strict";
import { attachmentLimitsFor } from "../src/agent_mail.js";

const MIB = 1024 * 1024;
const B64_INFLATION = 4 / 3 * 1.027; // base64 + CRLF every 76 chars
const PLATFORM_CAP_PLAIN = 5 * MIB;
const PLATFORM_CAP_VERIFIED = 25 * MIB;

test("verified destinations earn the larger budget", () => {
  const v = attachmentLimitsFor("alec@alecability.com");
  assert.equal(v.totalBytes, 17 * MIB);
  assert.equal(v.count, 10);
});

test("case and whitespace do not lose the verified budget", () => {
  const v = attachmentLimitsFor("  Alec@AlecAbility.com  ");
  assert.equal(v.totalBytes, 17 * MIB, "recipient matching must be normalised");
});

test("unverified recipients get the small budget", () => {
  const u = attachmentLimitsFor("someone@example.com");
  assert.equal(u.totalBytes, 3.5 * MIB);
  assert.equal(u.count, 4);
});

test("one unverified recipient governs the whole message", () => {
  // The platform cap applies to the MESSAGE, so a mixed audience cannot use
  // the verified budget just because most recipients are verified.
  const mixed = attachmentLimitsFor(["alec@alecability.com", "stranger@example.com"]);
  assert.equal(mixed.totalBytes, 3.5 * MIB);
});

test("all-verified recipient lists still earn the larger budget", () => {
  const all = attachmentLimitsFor(["alec@alecability.com", "stingel@alectranel.com"]);
  assert.equal(all.totalBytes, 17 * MIB);
});

test("an unknown or empty recipient falls back to the safe budget", () => {
  assert.equal(attachmentLimitsFor(null).totalBytes, 3.5 * MIB);
  assert.equal(attachmentLimitsFor([]).totalBytes, 3.5 * MIB);
  assert.equal(attachmentLimitsFor("").totalBytes, 3.5 * MIB);
});

test("both budgets still fit the platform cap AFTER base64 inflation", () => {
  // This is the assertion the old 4 MiB limit would have failed.
  const plain = attachmentLimitsFor("someone@example.com").totalBytes;
  const verified = attachmentLimitsFor("alec@alecability.com").totalBytes;

  assert.ok(
    plain * B64_INFLATION < PLATFORM_CAP_PLAIN,
    `${(plain / MIB).toFixed(1)} MiB decoded -> ${(plain * B64_INFLATION / MIB).toFixed(1)} MiB on the wire, over the 5 MiB cap`,
  );
  assert.ok(
    verified * B64_INFLATION < PLATFORM_CAP_VERIFIED,
    `${(verified / MIB).toFixed(1)} MiB decoded -> ${(verified * B64_INFLATION / MIB).toFixed(1)} MiB on the wire, over the 25 MiB cap`,
  );

  // And the old value must be recognised as unsendable, so nobody restores it.
  assert.ok(4 * MIB * B64_INFLATION > PLATFORM_CAP_PLAIN,
    "4 MiB decoded should exceed the 5 MiB plain cap once base64'd — that was the latent bug");
});

test("a full-resolution print file fits for Alec", () => {
  // The case that motivated this: a 12in 300 DPI transparent PNG is ~5.5 MB
  // and was refused for no platform reason.
  const printFile = 5.5 * 1000 * 1000;
  assert.ok(attachmentLimitsFor("alec@alecability.com").totalBytes > printFile);
  assert.ok(attachmentLimitsFor("someone@example.com").totalBytes < printFile,
    "and unverified recipients still cannot, correctly");
});
