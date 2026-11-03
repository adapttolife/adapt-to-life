import assert from "node:assert/strict";
import test from "node:test";

import { localAsnmAdminOperations } from "../src/index.js";

function betaTesterDb(calls) {
  return {
    prepare(sql) {
      return {
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
  };
}

test("adding an ASNM beta tester stores their details and sends an invitation", async () => {
  const calls = [];
  const messages = [];
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "tester@example.test",
        name: "Taylor Tester",
        organization: "Test Organization",
        phone: "555-0100",
        enabled: true,
        sendInvitation: true,
      }),
    }),
    {
      ASNM_DB: betaTesterDb(calls),
      ASNM_ADMIN_ORIGIN: "https://staging.adaptivesportsnearme.com",
      SEND_EMAIL: {
        async send(message) {
          messages.push(message);
          return { id: "message-1" };
        },
      },
    },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers"),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /name, organization, phone, enabled/i);
  assert.deepEqual(calls[0].values.slice(0, 5), [
    "tester@example.test",
    "Taylor Tester",
    "Test Organization",
    "555-0100",
    1,
  ]);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, "tester@example.test");
  assert.match(messages[0].text, /Taylor Tester/);
  assert.match(messages[0].text, /https:\/\/staging\.adaptivesportsnearme\.com\//);
  assert.match(messages[0].text, /tester@example\.test/);
});

test("changing a beta tester's enabled state does not resend their invitation", async () => {
  const calls = [];
  const messages = [];
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tester@example.test", enabled: false }),
    }),
    {
      ASNM_DB: betaTesterDb(calls),
      SEND_EMAIL: {
        async send(message) {
          messages.push(message);
          return { id: "message-1" };
        },
      },
    },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers"),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO beta_testers \(email, enabled/i);
  assert.deepEqual(messages, []);
});

test("editing an ASNM beta tester updates their details without another invitation", async () => {
  const calls = [];
  const messages = [];
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "tester@example.test",
        name: "Taylor Updated",
        organization: "Updated Organization",
        phone: "555-0199",
        enabled: false,
        sendInvitation: false,
      }),
    }),
    {
      ASNM_DB: betaTesterDb(calls),
      SEND_EMAIL: {
        async send(message) {
          messages.push(message);
          return { id: "message-1" };
        },
      },
    },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers"),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /name = excluded\.name/i);
  assert.deepEqual(calls[0].values.slice(0, 5), [
    "tester@example.test",
    "Taylor Updated",
    "Updated Organization",
    "555-0199",
    0,
  ]);
  assert.deepEqual(messages, []);
});

test("removing an ASNM beta tester deletes their access record", async () => {
  const calls = [];
  const response = await localAsnmAdminOperations(
    new Request("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "tester@example.test" }),
    }),
    {
      ASNM_DB: betaTesterDb(calls),
    },
    new URL("https://adapttolife.org/admin/api/asnm/admin-data/beta-testers"),
  );

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /DELETE FROM beta_testers/i);
  assert.deepEqual(calls[0].values, ["tester@example.test"]);
});
