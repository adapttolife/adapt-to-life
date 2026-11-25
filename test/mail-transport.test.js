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
// Nov 23 2026: every ATL send failed with a bare "rejected (400)" because the
// Google reply was thrown away. Name the error; never the credentials.
async function rejected(status, body, run, e = env) {
  const out = [];
  const saved = {};
  for (const k of ["log", "info", "warn", "error", "debug"]) {
    saved[k] = console[k];
    console[k] = (...a) => out.push(a.map(String).join(" "));
  }
  let err;
  try {
    await mocked(
      async () => new Response(body, { status }),
      async () => {
        await sendMail(e, message).catch((x) => (err = x));
      },
    );
  } finally {
    Object.assign(console, saved);
  }
  assert.ok(err, "sendMail must throw");
  await run(err.message, out);
}
test("OAuth rejection names Google's error and error_description", async () => {
  await rejected(
    400,
    JSON.stringify({
      error: "invalid_grant",
      error_description: "Token has been expired or revoked.",
    }),
    (msg, out) => {
      assert.equal(
        msg,
        "Gmail authorization rejected (400 invalid_grant: Token has been expired or revoked.); no mail submitted",
      );
      assert.deepEqual(out, [msg], "one log line, the same text");
    },
  );
  await rejected(401, JSON.stringify({ error: "invalid_client" }), (msg) =>
    assert.equal(
      msg,
      "Gmail authorization rejected (401 invalid_client); no mail submitted",
    ),
  );
  await rejected(
    400,
    JSON.stringify({ error: "invalid_grant", error_description: "y ".repeat(400) }),
    (msg) => {
      const desc = msg.match(/invalid_grant: (.*)\); no mail submitted$/)[1];
      assert.ok(desc.length <= 200, "description capped");
    },
  );
});
test("OAuth rejection never surfaces the refresh token or client secret, even if Google echoes them", async () => {
  const real = {
    ...env,
    GMAIL_CLIENT_ID: "123456789012-abcdefghijklmnopqrstuv.apps.googleusercontent.com",
    GMAIL_CLIENT_SECRET: "GOCSPX-Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1",
    GMAIL_REFRESH_TOKEN: "1//0gAbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGh",
  };
  const creds = [
    real.GMAIL_CLIENT_ID,
    real.GMAIL_CLIENT_SECRET,
    real.GMAIL_REFRESH_TOKEN,
  ];
  // Short fixture values, which the long-run rule alone would not catch.
  const short = { ...env, GMAIL_CLIENT_SECRET: "s3cr3t", GMAIL_REFRESH_TOKEN: "rt-42" };
  const shortCreds = [
    short.GMAIL_CLIENT_SECRET,
    short.GMAIL_REFRESH_TOKEN,
    short.GMAIL_CLIENT_ID,
  ];
  const echo = (c) => [
    {
      error: "invalid_grant",
      error_description: `bad token ${c[2]} for client ${c[0]} secret ${c[1]}`,
    },
    {
      error: "invalid_grant",
      error_description: `${c[1]}${c[2]}`,
      refresh_token: c[2],
      client_secret: c[1],
      request: `refresh_token=${c[2]}&client_secret=${c[1]}`,
    },
    { error: c[2], error_description: c[1] },
    { error: `invalid_grant ${c[1]}`, error_description: "x" },
    {
      error: "invalid_grant",
      error_description: `line1\n${c[2]}\r\nclient_secret=${c[1]}`,
    },
    { error: "invalid_grant", error_description: `${"a ".repeat(90)}${c[2]}` },
    { error: "invalid_grant", error_description: encodeURIComponent(c[2]) },
  ];
  for (const [e, c] of [
    [real, creds],
    [short, shortCreds],
  ])
    for (const body of echo(c))
      await rejected(
        400,
        JSON.stringify(body),
        (msg, out) => {
          for (const text of [msg, ...out])
            for (const v of c)
              assert.ok(!text.includes(v), `credential leaked into: ${text}`);
          assert.match(
            msg,
            /^Gmail authorization rejected \(400( invalid_grant(: [^\r\n]*)?)?\); no mail submitted$/,
          );
        },
        e,
      );
});
test("OAuth rejection redacts a partial credential echo (long token-like runs)", async () => {
  const real = {
    ...env,
    GMAIL_CLIENT_SECRET: "GOCSPX-Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1",
    GMAIL_REFRESH_TOKEN: "1//0gAbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdEfGh",
  };
  const parts = [
    real.GMAIL_REFRESH_TOKEN.slice(0, 30),
    real.GMAIL_CLIENT_SECRET.slice(0, 24),
  ];
  await rejected(
    400,
    JSON.stringify({
      error: "invalid_grant",
      error_description: `Bad token ${parts[0]}... with ${parts[1]}...`,
    }),
    (msg, out) => {
      for (const text of [msg, ...out])
        for (const p of parts)
          assert.ok(!text.includes(p), `partial credential leaked: ${text}`);
      assert.match(msg, /invalid_grant: Bad token \[redacted\]/);
    },
    real,
  );
});
test("OAuth rejection with a non-JSON or field-less body reports the status only", async () => {
  for (const body of [
    "<html>Bad Request</html>",
    "",
    "null",
    "[]",
    JSON.stringify({ message: "nope" }),
    JSON.stringify({ error: { code: 400 } }),
  ])
    await rejected(400, body, (msg, out) => {
      assert.equal(msg, "Gmail authorization rejected (400); no mail submitted");
      assert.deepEqual(out, [msg]);
    });
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

// Nov 23 2026 incident: the waiver receipt passed its PDF as a base64 string
// and the Gmail path threw "Attachment must contain bytes". Every bytes shape
// gives the same part; strings are refused with a clear message, never decoded
// (a base64 string and a plain-text body look alike).
test("attachment content: Uint8Array, ArrayBuffer and offset views give the same part", () => {
  const pdf = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55, 0, 255, 10]);
  const part = (content) => {
    const mime = buildMime(
      {
        ...message,
        attachments: [{ filename: "r.pdf", type: "application/pdf", content }],
      },
      env.GMAIL_FROM,
    );
    return mime.slice(mime.indexOf("filename*=UTF-8''r.pdf")).split("\r\n--mixed_")[0];
  };
  const want = part(pdf);
  assert.ok(want.includes(Buffer.from(pdf).toString("base64")));
  assert.equal(part(pdf.buffer.slice(0)), want, "ArrayBuffer");
  const padded = new Uint8Array(pdf.length + 4);
  padded.set(pdf, 2);
  assert.equal(part(new DataView(padded.buffer, 2, pdf.length)), want, "offset view");
  assert.equal(part(padded.subarray(2, 2 + pdf.length)), want, "subarray");
});

test("attachment content: strings, empty bytes and non-bytes throw before anything is sent", () => {
  const pdf = new Uint8Array([37, 80, 68, 70]);
  assert.throws(
    () =>
      buildMime(
        {
          ...message,
          attachments: [
            { filename: "r.pdf", content: Buffer.from(pdf).toString("base64") },
          ],
        },
        env.GMAIL_FROM,
      ),
    /must contain bytes \(got a string\)/,
  );
  assert.throws(
    () =>
      buildMime(
        {
          ...message,
          attachments: [{ filename: "r.pdf", content: new Uint8Array(0) }],
        },
        env.GMAIL_FROM,
      ),
    /must contain bytes \(got 0 bytes\)/,
  );
  for (const content of [
    new ArrayBuffer(0),
    "",
    "test",
    undefined,
    null,
    { bytes: [1] },
  ])
    assert.throws(
      () =>
        buildMime(
          { ...message, attachments: [{ filename: "x.pdf", content }] },
          env.GMAIL_FROM,
        ),
      /must contain bytes/,
      String(content),
    );
});
