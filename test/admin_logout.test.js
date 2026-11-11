import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAdminSessionCookie,
  consumeLogin,
  readAdminSession,
} from "../src/asnm_admin_auth.js";
import worker from "../src/index.js";

function sessionDb() {
  const sessions = new Map();

  return {
    sessions,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM admin_login_tokens")) {
                return { id: "login-token", email: "admin@adapttolife.org" };
              }
              if (sql.includes("FROM admin_sessions")) {
                const session = sessions.get(values[0]);
                return session && !session.revoked_at ? session : null;
              }
              return null;
            },
            async run() {
              if (sql.startsWith("INSERT INTO admin_sessions")) {
                sessions.set(values[0], {
                  email: values[1],
                  expires_at: values[2],
                  revoked_at: null,
                });
              }
              if (sql.startsWith("UPDATE admin_sessions SET revoked_at")) {
                const session = sessions.get(values[1]);
                if (session && !session.revoked_at) session.revoked_at = values[0];
              }
              return { meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
}

test("admin sign out revokes the server session and clears the cookie", async () => {
  const db = sessionDb();
  const secret = "test-admin-secret";
  const issued = await consumeLogin(db, "one-time-token", secret, { secure: false });
  const request = new Request("http://127.0.0.1:8787/admin/auth/logout", {
    method: "POST",
    headers: { Cookie: issued.cookie.split(";")[0] },
  });

  assert.equal(
    (await readAdminSession(request, db, secret))?.email,
    "admin@adapttolife.org",
  );
  const response = await worker.fetch(
    request,
    { ASNM_DB: db, ADMIN_AUTH_SIGNING_KEY: secret },
    {},
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(
    response.headers.get("Set-Cookie"),
    clearAdminSessionCookie({ secure: false }),
  );
  assert.match(issued.cookie, /Max-Age=432000/);
  assert.equal(await readAdminSession(request, db, secret), null);
});
