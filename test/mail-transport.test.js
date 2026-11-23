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

// Nov 23 2026 incident: the waiver receipt passed its PDF as a base64 string
// (the Cloudflare/Resend shape) and the Gmail path threw "Attachment must
// contain bytes". Both shapes now produce the same MIME part.
test("attachment content: base64 string, Uint8Array, ArrayBuffer and views give the same part", () => {
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
  assert.equal(part(Buffer.from(pdf).toString("base64")), want, "base64 string");
  assert.equal(part(pdf.buffer.slice(0)), want, "ArrayBuffer");
  const padded = new Uint8Array(pdf.length + 4);
  padded.set(pdf, 2);
  assert.equal(part(new DataView(padded.buffer, 2, pdf.length)), want, "offset view");
  assert.equal(part(padded.subarray(2, 2 + pdf.length)), want, "subarray");
});

test("attachment content: empty or non-base64 content throws before anything is sent", () => {
  for (const content of [
    new Uint8Array(0),
    new ArrayBuffer(0),
    "",
    "not base64!",
    "abc",
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
