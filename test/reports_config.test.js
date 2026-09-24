// Configuration is the other half of the reports boundary. src/reports_worker.js
// can be as narrow as it likes and still be wide open if the Worker also
// answers on a workers.dev URL or a version preview URL, because those are not
// behind the Cloudflare Access policy that protects the custom domain. So the
// two flags that close that bypass are pinned here, next to the bindings the
// Worker is allowed to hold.
//
// These assertions are cheap and they fail loudly the day someone flips a flag
// "just to test something".
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(name) {
  return readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
}

// Minimal JSONC reader: strips // and /* */ comments outside of strings.
// wrangler's config format allows them and this repo uses them heavily.
function parseJsonc(text) {
  let out = "";
  let inString = false, inLine = false, inBlock = false, escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i], next = text[i + 1];
    if (inLine) { if (c === "\n") { inLine = false; out += c; } continue; }
    if (inBlock) { if (c === "*" && next === "/") { inBlock = false; i += 1; } continue; }
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === "/" && next === "/") { inLine = true; continue; }
    if (c === "/" && next === "*") { inBlock = true; i += 1; continue; }
    if (c === '"') inString = true;
    out += c;
  }
  return JSON.parse(out);
}

const REPORTS_TEXT = read("wrangler.reports.jsonc");
const ATL_TEXT = read("wrangler.jsonc");
const reports = parseJsonc(REPORTS_TEXT);
const atl = parseJsonc(ATL_TEXT);
const pkg = JSON.parse(read("package.json"));

const ORIGIN = "https://reports.amelioration.is";

test("the reports Worker is its own Worker running the reports-only entrypoint", () => {
  assert.equal(reports.name, "amelioration-reports");
  assert.equal(reports.main, "src/reports_worker.js");
  assert.notEqual(reports.name, atl.name, "a shared name would overwrite the ATL Worker");
});

test("it is reachable only on the custom domain — no workers.dev, no preview URLs", () => {
  // Cloudflare Access sits in front of reports.amelioration.is.
  assert.deepEqual(reports.routes, [{ pattern: "reports.amelioration.is", custom_domain: true }]);
});

test("it holds one binding: the agent-mail D1 the report pages read", () => {
  assert.equal(reports.d1_databases.length, 1);
  const [d1] = reports.d1_databases;
  assert.equal(d1.binding, "AGENT_MAIL_DB");
  const atlD1 = atl.d1_databases.find((d) => d.binding === "AGENT_MAIL_DB");
  assert.equal(d1.database_name, atlD1.database_name, "same database, not a new one");
  assert.equal(d1.database_id, atlD1.database_id);
});

test("it holds nothing else — no assets, no R2, no outbound mail, no cron, no email", () => {
  for (const key of ["assets", "r2_buckets", "kv_namespaces", "send_email", "triggers", "queues"]) {
    assert.equal(reports[key], undefined, `reports Worker should not configure ${key}`);
  }
});

test("observability is on", () => {
  assert.equal(reports.observability.enabled, true);
});

test("the report renderer bundles its local fonts as data, without adding a runtime binding", () => {
  assert.deepEqual(reports.rules, [
    { type: "Data", globs: ["**/*.ttf"], fallthrough: true },
  ]);
});

test("links minted by the ATL Worker point at the reports origin", () => {
  assert.equal(atl.vars.REPORT_LINK_BASE, ORIGIN);
});

test("the reports Worker mints its library links on its own origin, and the two agree", () => {
  assert.equal(reports.vars.REPORT_LINK_BASE, ORIGIN);
  assert.equal(reports.vars.REPORT_LINK_BASE, atl.vars.REPORT_LINK_BASE);
});

test("the token secret is not in either config — it stays a Worker secret", () => {
  // Parsed vars are what Wrangler publishes as plaintext. Comments may name
  // the secret to document the `wrangler secret put` procedure, but no config
  // value or top-level field may carry it.
  assert.equal(reports.vars.REPORT_LINK_SECRET, undefined);
  assert.equal(atl.vars.REPORT_LINK_SECRET, undefined);
  assert.equal(reports.REPORT_LINK_SECRET, undefined);
  assert.equal(atl.REPORT_LINK_SECRET, undefined);
});

test("there is a deploy script that uses the reports config", () => {
  const script = pkg.scripts["deploy:reports"];
  assert.ok(script, "package.json needs a deploy:reports script");
  assert.match(script, /wrangler deploy/);
  assert.match(script, /--config wrangler\.reports\.jsonc/);
});

test("the ATL Worker's own domains are untouched by this slice", () => {
  assert.deepEqual(atl.routes.map((r) => r.pattern), [
    "adapttolife.org",
    "www.adapttolife.org",
    "sign.adapttolife.org",
  ]);
});

test("staging shares live services but has no cron triggers", () => {
  assert.equal(atl.env.staging.main, "src/staging.js");
  assert.equal(atl.env.staging.assets.run_worker_first, true);
  assert.deepEqual(atl.env.staging.routes, []);
  assert.deepEqual(atl.env.staging.d1_databases, atl.d1_databases);
  assert.deepEqual(atl.env.staging.r2_buckets, []);
  assert.deepEqual(atl.env.staging.send_email, atl.send_email);
  assert.deepEqual(atl.env.staging.triggers.crons, []);
  assert.deepEqual(atl.env.staging.vars, {
    ...atl.vars, ENV_NAME: "staging", STAGING: "1", TURNSTILE_MODE: "off",
  });
  assert.notEqual(atl.vars.TURNSTILE_MODE, "off", "production must not disable Turnstile");
});
