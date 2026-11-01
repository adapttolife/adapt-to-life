import assert from "node:assert/strict";
import test from "node:test";

import { adminLoginOrigin, asnmAdminCollection, useAsnmService } from "../src/index.js";

test("admin login links use the host that requested the link", () => {
  const request = new Request(
    "https://adapt-to-life.adapt-to-life.workers.dev/admin/auth/request-link",
    {
      headers: { Host: "127.0.0.1:8787" },
    },
  );
  const url = new URL(request.url);

  assert.equal(adminLoginOrigin(request, url), "https://127.0.0.1:8787");
});

test("admin login links honor a proxy's original host", () => {
  const request = new Request(
    "https://adapt-to-life.adapt-to-life.workers.dev/admin/auth/request-link",
    {
      headers: { "X-Forwarded-Host": "staging.adapttolife.org" },
    },
  );
  const url = new URL(request.url);

  assert.equal(adminLoginOrigin(request, url), "https://staging.adapttolife.org");
});

test("admin login links preserve the browser's local development origin", () => {
  const request = new Request(
    "https://adapt-to-life.adapt-to-life.workers.dev/admin/auth/request-link",
  );
  const url = new URL(request.url);

  assert.equal(
    adminLoginOrigin(request, url, "http://127.0.0.1:8787"),
    "http://127.0.0.1:8787",
  );
});

test("admin login links reject unapproved explicit origins", () => {
  const request = new Request(
    "https://adapt-to-life.adapt-to-life.workers.dev/admin/auth/request-link",
  );
  const url = new URL(request.url);

  assert.equal(
    adminLoginOrigin(request, url, "https://untrusted.example"),
    "https://adapt-to-life.adapt-to-life.workers.dev",
  );
});

test("admin login links fall back to the request URL when the host is invalid", () => {
  const request = new Request(
    "https://adapt-to-life.adapt-to-life.workers.dev/admin/auth/request-link",
    {
      headers: { Host: "example.com/path" },
    },
  );
  const url = new URL(request.url);

  assert.equal(
    adminLoginOrigin(request, url),
    "https://adapt-to-life.adapt-to-life.workers.dev",
  );
});

test("staging always reaches the configured ASNM staging origin", () => {
  assert.equal(useAsnmService({ ENV_NAME: "staging", ASNM: { fetch() {} } }), false);
  assert.equal(useAsnmService({ ENV_NAME: "production", ASNM: { fetch() {} } }), true);
  assert.equal(useAsnmService({ ENV_NAME: "production" }), false);
});

test("the ATL dashboard reads each ASNM collection from its D1 binding", () => {
  const collections = [
    ["organizations", "organizations", "name"],
    ["programs", "programs", "name"],
    ["events", "events", "title"],
    ["grants", "grants", "name"],
    ["blog", "blog_posts", "title"],
  ];

  for (const [kind, table, name] of collections) {
    const collection = asnmAdminCollection(`/admin/api/asnm/admin-data/${kind}`);

    assert.equal(collection?.table, table);
    assert.equal(collection?.name, name);
    assert.ok(collection?.fields.length);
  }

  assert.equal(asnmAdminCollection("/admin/api/asnm/admin-data/unknown"), null);
});
