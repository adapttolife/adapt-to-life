// Spec 127 — build-output guards for Mission Control.
//
// These assert properties of the BUILT app that cannot be caught by running it
// locally, because the thing that breaks them only exists in production.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const SHELL = "public/admin/app/index.html";

test("the built shell carries no crossorigin attribute", { skip: !existsSync(SHELL) && "app not built" }, () => {
  // `crossorigin` (no value) means `anonymous`: the browser fetches the module
  // and stylesheet WITHOUT cookies. Behind Cloudflare Access that returns a
  // login redirect instead of JavaScript, and the console shows a parse error
  // rather than anything mentioning auth. You sign in and get a blank page.
  //
  // wrangler dev has no Access in front of it, so this is invisible until it
  // is in front of a real person. Vite adds the attribute by default and a
  // plugin strips it; this is the guard that the plugin still runs.
  const html = readFileSync(SHELL, "utf8");
  assert.ok(!/crossorigin/.test(html),
    "Vite re-added crossorigin — behind Access this silently serves a login page instead of the app");
});

test("the shell loads its assets same-origin and absolute", { skip: !existsSync(SHELL) && "app not built" }, () => {
  const html = readFileSync(SHELL, "utf8");
  const srcs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => u.startsWith("/admin/app/"));
  assert.ok(srcs.length >= 2, "expected the module and stylesheet to be served from /admin/app/");
  // A relative path would resolve differently on /admin/app/qr than on
  // /admin/app/ — the deep-link break, one layer down.
  assert.ok(srcs.every((u) => u.startsWith("/")), "asset URLs must be absolute for client routes to work");
});
