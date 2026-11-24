import test from "node:test";
import assert from "node:assert/strict";
import { sendMail, buildMime, mailConfigured } from "../src/mail-transport.js";
const env = {
  MAIL_TRANSPORT: "gmail",
  GMAIL_FROM: "hello@adapttolife.org",
  GMAIL_CLIENT_ID: "test-client",
  GMAIL_CLIENT_SECRET: "test-secret",
  GMAIL_REFRESH_TOKEN: "test-refresh",
};
const message = {
  from: "Adaptive Sports Near Me <hello@adapttolife.org>",
  to: "recipient@example.test",
  replyTo: "hello@adapttolife.org",
  subject: "Welcome — Zoë",
  text: "Hello Zoë",
  html: "<p>Hello Zoë</p>",
};
async function mocked(fn, run) {
  const old = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    await run();
  } finally {
    globalThis.fetch = old;
  }
}

test("Gmail refresh + send uses expected endpoints, MIME and records provider acceptance", async () => {
  const calls = [];
  await mocked(
    async (url, init) => {
      calls.push([url, init]);
      return Response.json(
        calls.length === 1
          ? { access_token: "ephemeral", token_type: "Bearer" }
          : { id: "gmail-accepted", threadId: "thread" },
      );
    },
    async () => {
      const result = await sendMail(env, message);
      assert.deepEqual(result, {
        id: "gmail-accepted",
        messageId: "gmail-accepted",
        threadId: "thread",
        provider: "gmail",
        accepted: true,
      });
      assert.equal(calls.length, 2);
      assert.equal(calls[0][0], "https://oauth2.googleapis.com/token");
      assert.equal(
        new URLSearchParams(calls[0][1].body).get("grant_type"),
        "refresh_token",
      );
      assert.equal(
        calls[1][0],
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      );
      const mime = Buffer.from(
        JSON.parse(calls[1][1].body).raw,
        "base64url",
      ).toString();
      assert.match(mime, /From: =\?UTF-8\?B\?.+ <hello@adapttolife.org>/);
      assert.match(mime, /multipart\/alternative/);
      assert.ok(mime.includes(Buffer.from("Hello Zoë").toString("base64")));
    },
  );
});
test("Gmail failure never retries or falls through to Cloudflare", async () => {
  let sends = 0,
    legacy = 0;
  await mocked(
    async () => {
      sends++;
      return sends === 1
        ? Response.json({ access_token: "x", token_type: "Bearer" })
        : new Response("private provider detail", { status: 503 });
    },
    async () => {
      await assert.rejects(
        sendMail(
          {
            ...env,
            SEND_EMAIL: {
              send() {
                legacy++;
              },
            },
          },
          message,
        ),
        /review before retry/,
      );
    },
  );
  assert.equal(sends, 2);
  assert.equal(legacy, 0);
});
test("OAuth rejection exposes no provider body or credential", async () => {
  await mocked(
    async () => new Response("SECRET SENSITIVE", { status: 401 }),
    async () => {
      await assert.rejects(
        sendMail(env, message),
        (e) => e.message === "Gmail authorization rejected (401); no mail submitted",
      );
    },
  );
});
test("accepted HTTP without a Gmail message ID is ambiguous and must not be marked sent", async () => {
  let n = 0;
  await mocked(
    async () =>
      Response.json(++n === 1 ? { access_token: "x", token_type: "Bearer" } : {}),
    async () => {
      await assert.rejects(sendMail(env, message), /no message ID/);
    },
  );
});
test("missing Gmail credentials cannot silently use another sender or provider", async () => {
  let calls = 0;
  await mocked(
    async () => {
      calls++;
      throw Error("unexpected");
    },
    async () => {
      await assert.rejects(
        sendMail(
          {
            ...env,
            GMAIL_REFRESH_TOKEN: "",
            SEND_EMAIL: {
              send() {
                calls++;
              },
            },
          },
          message,
        ),
        /not configured/,
      );
    },
  );
  assert.equal(calls, 0);
});
test("unapproved From, header injection and unknown transport fail before network", async () => {
  let calls = 0;
  await mocked(
    async () => {
      calls++;
      throw Error("unexpected");
    },
    async () => {
      await assert.rejects(
        sendMail(env, { ...message, from: "alec@example.test" }),
        /configured authorized identity/,
      );
      await assert.rejects(
        sendMail(env, {
          ...message,
          to: "person@example.test\r\nBcc: other@example.test",
        }),
        /Unsafe mail header/,
      );
      await assert.rejects(
        sendMail(env, { ...message, headers: { To: "other@example.test" } }),
        /Unsupported custom/,
      );
      await assert.rejects(
        sendMail({ ...env, MAIL_TRANSPORT: "typo" }, message),
        /not configured/,
      );
    },
  );
  assert.equal(calls, 0);
});
test("legacy provider retains existing structured fields until explicitly migrated", async () => {
  let captured;
  const e = {
    SEND_EMAIL: {
      send(m) {
        captured = m;
        return { id: "legacy" };
      },
    },
  };
  assert.equal(mailConfigured(e), true);
  assert.equal(mailConfigured({ MAIL_TRANSPORT: "gmail" }), false);
  assert.equal((await sendMail(e, message)).id, "legacy");
  assert.deepEqual(captured, message);
});
test("MIME carries binary attachments and inline content IDs", () => {
  const mime = buildMime(
    {
      ...message,
      cc: "cc@example.test",
      bcc: "bcc@example.test",
      attachments: [
        {
          filename: "waiver.pdf",
          type: "application/pdf",
          content: new Uint8Array([0, 255, 12]),
        },
        {
          filename: "logo.png",
          type: "image/png",
          disposition: "inline",
          contentId: "logo",
          content: new Uint8Array([137, 80]),
        },
      ],
    },
    env.GMAIL_FROM,
  );
  assert.match(mime, /multipart\/mixed/);
  assert.match(mime, /Content-ID: <logo>/);
  assert.match(mime, /Content-Disposition: inline/);
  assert.match(mime, /AP8M/);
  assert.throws(
    () =>
      buildMime(
        {
          ...message,
          attachments: [{ filename: "bad.pdf", content: "already-base64" }],
        },
        env.GMAIL_FROM,
      ),
    /must contain bytes/,
  );
});

// ---------------------------------------------------------------------------
// Resend transport: docs/EMAIL.md, "The send contract (both repos)".
// ---------------------------------------------------------------------------
import { mailAllowed, resendPayload, keyHash } from "../src/mail-transport.js";
const resendEnv = {
  MAIL_TRANSPORT: "resend",
  RESEND_API_KEY: "re_test",
  MAIL_FROM_DOMAINS: "mail.adapttolife.org, mail.adaptbodyshop.com",
  ENV_NAME: "production",
};
const resendMessage = {
  from: "Adapt To Life <hello@mail.adapttolife.org>",
  to: "Person <person@example.test>",
  cc: ["cc@example.test"],
  bcc: "hello@adapttolife.org",
  replyTo: "hello@adapttolife.org",
  subject: "Welcome — Zoë",
  text: "Hello Zoë",
  html: "<p>Hello Zoë</p>",
  headers: {
    "List-Unsubscribe": "<https://adapttolife.org/unsubscribe?t=x>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    "Auto-Submitted": "auto-generated",
    "X-ATL-Form": "contact",
  },
  attachments: [
    { filename: "waiver.pdf", type: "application/pdf", content: new Uint8Array([0, 255, 12]) },
    {
      filename: "logo.png",
      type: "image/png",
      contentId: "logo",
      content: new Uint8Array([137, 80]).buffer,
    },
  ],
  idempotencyKey: "receipt-contact-1234",
  tags: { brand: "adapttolife", kind: "receipt-contact" },
};
async function noNetwork(run) {
  let calls = 0;
  await mocked(async () => {
    calls++;
    throw Error("unexpected network");
  }, run);
  assert.equal(calls, 0, "refused before the network");
}

test("resend: one POST with the key, tags (env added), arrays, headers and base64 attachments", async () => {
  const calls = [];
  await mocked(
    async (url, init) => {
      calls.push([url, init]);
      return Response.json({ id: "re-msg-1" });
    },
    async () => {
      const result = await sendMail(resendEnv, resendMessage);
      assert.deepEqual(result, {
        id: "re-msg-1",
        messageId: "re-msg-1",
        provider: "resend",
        accepted: true,
      });
    },
  );
  assert.equal(calls.length, 1);
  const [url, init] = calls[0];
  assert.equal(url, "https://api.resend.com/emails");
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer re_test");
  assert.equal(init.headers["Idempotency-Key"], "receipt-contact-1234");
  const body = JSON.parse(init.body);
  assert.equal(body.from, "Adapt To Life <hello@mail.adapttolife.org>");
  assert.deepEqual(body.to, ["Person <person@example.test>"]);
  assert.deepEqual(body.cc, ["cc@example.test"]);
  assert.deepEqual(body.bcc, ["hello@adapttolife.org"]);
  assert.deepEqual(body.reply_to, ["hello@adapttolife.org"]);
  assert.equal(body.subject, "Welcome — Zoë");
  assert.equal(body.text, "Hello Zoë");
  assert.equal(body.html, "<p>Hello Zoë</p>");
  assert.deepEqual(body.headers, resendMessage.headers);
  assert.deepEqual(body.tags, [
    { name: "brand", value: "adapttolife" },
    { name: "kind", value: "receipt-contact" },
    { name: "env", value: "production" },
  ]);
  assert.deepEqual(body.attachments, [
    { filename: "waiver.pdf", content: "AP8M", content_type: "application/pdf" },
    { filename: "logo.png", content: "iVA=", content_type: "image/png", content_id: "logo" },
  ]);
  assert.equal(body.idempotencyKey, undefined);
});

test("resend: a send without a key or both tags throws before the network", async () => {
  await noNetwork(async () => {
    const { idempotencyKey, ...noKey } = resendMessage;
    for (const m of [
      noKey,
      { ...resendMessage, idempotencyKey: "" },
      { ...resendMessage, idempotencyKey: "a\r\nb" },
      { ...resendMessage, tags: undefined },
      { ...resendMessage, tags: { brand: "adapttolife" } },
      { ...resendMessage, tags: { kind: "receipt-contact" } },
      { ...resendMessage, tags: { brand: "adapt to life", kind: "x" } },
    ])
      await assert.rejects(sendMail(resendEnv, m), (e) => e.retryable === false);
  });
});

test("resend: From off MAIL_FROM_DOMAINS, line breaks and unknown headers are refused", async () => {
  await noNetwork(async () => {
    const cases = [
      [{ from: "Adapt To Life <hello@adapttolife.org>" }, /sending domain/],
      [{ from: "x@evil.example" }, /sending domain/],
      [{ subject: "Hi\r\nBcc: a@b.test" }, /Unsafe mail header/],
      [{ to: "a@b.test\r\nBcc: c@d.test" }, /Unsafe mail header/],
      [{ replyTo: "a@b.test\nX: y" }, /Unsafe mail header/],
      [{ headers: { "List-Unsubscribe": "<x>\r\nBcc: a@b.test" } }, /Unsafe mail header/],
      [{ headers: { To: "other@example.test" } }, /Unsupported custom/],
      [{ headers: { "Reply-To": "other@example.test" } }, /Unsupported custom/],
      [{ attachments: [{ filename: "a.pdf", content: "QUJD" }] }, /must contain bytes/],
      [{ to: [] }, /no recipient/],
    ];
    for (const [change, why] of cases)
      await assert.rejects(
        sendMail(resendEnv, { ...resendMessage, ...change }),
        (e) => why.test(e.message) && e.retryable === false,
        why.source,
      );
  });
});

test("resend outside production: only MAIL_ALLOW addresses; anything else is dropped, not sent", async () => {
  const staging = {
    ...resendEnv,
    ENV_NAME: "staging",
    MAIL_ALLOW: "hello@adapttolife.org,@adapttolife.org,@faisaln.com,alec@alecability.com",
  };
  assert.equal(mailAllowed("someone@adapttolife.org", staging.MAIL_ALLOW), true);
  assert.equal(mailAllowed("Alec@AlecAbility.com", staging.MAIL_ALLOW), true);
  assert.equal(mailAllowed("x@mail.adapttolife.org", staging.MAIL_ALLOW), false);
  assert.equal(mailAllowed("adapttolife.org@evil.test", staging.MAIL_ALLOW), false);
  await noNetwork(async () => {
    // One outside address anywhere (to, cc or bcc) drops the whole send.
    for (const change of [
      { to: "applicant@example.com" },
      { to: "hello@adapttolife.org", cc: "donor@example.com" },
      { to: "hello@adapttolife.org", bcc: "donor@example.com" },
    ])
      assert.deepEqual(
        await sendMail(staging, { ...resendMessage, cc: undefined, bcc: undefined, ...change }),
        { dropped: true, reason: "not-allowed" },
      );
    // No allow list at all outside production: nothing goes.
    assert.deepEqual(
      await sendMail(
        { ...resendEnv, ENV_NAME: "preview" },
        { ...resendMessage, to: "hello@adapttolife.org", cc: undefined, bcc: undefined },
      ),
      { dropped: true, reason: "not-allowed" },
    );
  });
  let sent = 0;
  await mocked(
    async (url, init) => {
      sent++;
      assert.ok(JSON.parse(init.body).tags.some((t) => t.name === "env" && t.value === "staging"));
      return Response.json({ id: "ok" });
    },
    async () => {
      await sendMail(staging, {
        ...resendMessage,
        to: "someone@faisaln.com",
        cc: undefined,
        bcc: "hello@adapttolife.org",
      });
    },
  );
  assert.equal(sent, 1);
});

test("resend errors say whether a retry is safe, keep no provider text and never fall back", async () => {
  let legacy = 0;
  const env = { ...resendEnv, SEND_EMAIL: { send: () => legacy++ } };
  const cases = [
    [429, true],
    [500, true],
    [503, true],
    [409, false],
    [422, false],
    [403, false],
    [400, false],
  ];
  for (const [status, retryable] of cases)
    await mocked(
      async () =>
        Response.json({ name: "some_error", message: "SECRET person@example.test" }, { status }),
      async () => {
        await assert.rejects(sendMail(env, resendMessage), (e) => {
          assert.equal(e.retryable, retryable, String(status));
          assert.equal(e.status, status);
          assert.doesNotMatch(e.message, /SECRET|person@/);
          assert.match(e.message, new RegExp(`\\(${status} some_error\\)`));
          return true;
        });
      },
    );
  // A timeout or dropped connection is ambiguous: retryable (same key, same body).
  await mocked(
    async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    },
    async () => {
      await assert.rejects(sendMail(env, resendMessage), (e) => e.retryable === true);
    },
  );
  // Accepted without an id: never recorded as sent; retryable under the same key.
  await mocked(
    async () => Response.json({}),
    async () => {
      await assert.rejects(sendMail(env, resendMessage), (e) => e.retryable === true);
    },
  );
  assert.equal(legacy, 0);
});

test("resend is configured only with its key, its sending domains and ENV_NAME", () => {
  assert.equal(mailConfigured(resendEnv), true);
  assert.equal(mailConfigured({ ...resendEnv, RESEND_API_KEY: "" }), false);
  assert.equal(mailConfigured({ ...resendEnv, MAIL_FROM_DOMAINS: "" }), false);
  assert.equal(mailConfigured({ ...resendEnv, ENV_NAME: "" }), false);
});

test("the older transports get the message without the Resend-only fields", async () => {
  let captured;
  await sendMail(
    { SEND_EMAIL: { send: (m) => (captured = m) } },
    { ...message, idempotencyKey: "k", tags: { brand: "adapttolife", kind: "x" } },
  );
  assert.deepEqual(captured, message);
});

test("resendPayload and keyHash are stable", async () => {
  const a = resendPayload(resendEnv, resendMessage);
  const b = resendPayload(resendEnv, resendMessage);
  assert.deepEqual(a, b);
  assert.equal(await keyHash(" Alec@Example.org "), await keyHash("alec@example.org"));
  assert.match(await keyHash("x"), /^[0-9a-f]{64}$/);
});
