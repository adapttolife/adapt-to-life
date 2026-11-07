import assert from "node:assert/strict";
import test from "node:test";

import { localAsnmAdminOperations } from "../src/index.js";

function database(value = "0") {
  const calls = [];
  return {
    calls,
    db: {
      prepare(sql) {
        return {
          async first() {
            return { value };
          },
          bind(...values) {
            return {
              async run() {
                calls.push({ sql, values });
                return { meta: { changes: 1 } };
              },
            };
          },
        };
      },
    },
  };
}

test("ATL admin reads ASNM maintenance mode", async () => {
  const { db } = database("1");
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/maintenance-mode"),
    { ASNM_DB: db },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/maintenance-mode"),
  );
  assert.deepEqual(await response.json(), { ok: true, enabled: true });
});

test("ATL admin updates ASNM maintenance mode", async () => {
  const { db, calls } = database();
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/maintenance-mode", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }),
    { ASNM_DB: db },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/maintenance-mode"),
  );
  assert.equal(response.status, 200);
  assert.match(calls[0].sql, /INSERT INTO site_settings/i);
  assert.equal(calls[0].values[0], "1");
});
