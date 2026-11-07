import assert from "node:assert/strict";
import test from "node:test";

import { localAsnmAdminOperations } from "../src/index.js";

function featureDatabase(calls, rows = []) {
  return {
    prepare(sql) {
      const statement = {
        async all() {
          calls.push({ sql, values: [] });
          return { results: rows };
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
      return statement;
    },
  };
}

test("ASNM feature toggles save their beta tester group audience", async () => {
  const calls = [];
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/feature-toggles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Organization Dashboard",
        audienceIds: ["everyone", "coaches", "coaches"],
      }),
    }),
    { ASNM_DB: featureDatabase(calls) },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/feature-toggles"),
  );

  assert.equal(response.status, 201);
  assert.match(calls[0].sql, /INSERT INTO feature_toggles/i);
  assert.equal(calls[0].values[0], "organization-dashboard");
  assert.deepEqual(JSON.parse(calls[0].values[2]), ["everyone", "coaches"]);
});

test("ASNM feature toggle lists parse stored feature audiences", async () => {
  const calls = [];
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/feature-toggles"),
    {
      ASNM_DB: featureDatabase(calls, [
        {
          id: "organization-dashboard",
          name: "Organization Dashboard",
          audience_json: '["everyone"]',
        },
      ]),
    },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/feature-toggles"),
  );

  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).items[0].audience_ids, ["everyone"]);
});
