// Deployment-boundary tests for api.amelioration.is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(name) {
  return readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
}

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

const agentMail = parseJsonc(read("wrangler.agent-mail.jsonc"));
const atl = parseJsonc(read("wrangler.jsonc"));
const pkg = JSON.parse(read("package.json"));

const expectedD1 = atl.d1_databases.find((b) => b.binding === "AGENT_MAIL_DB");
const expectedR2 = atl.r2_buckets.find((b) => b.binding === "AGENT_MAIL_BUCKET");

// Config establishes the edge boundary. Access protects only the custom domain;
// alternate Worker hostnames would bypass it.
test("agent-mail is a distinct Worker on its private custom domain only", () => {
  assert.equal(agentMail.name, "amelioration-agent-mail");
  assert.equal(agentMail.main, "src/agent_mail_worker.js");
  assert.notEqual(agentMail.name, atl.name);
  assert.deepEqual(agentMail.routes, [{ pattern: "api.amelioration.is", custom_domain: true }]);
  assert.equal(agentMail.workers_dev, false);
  assert.equal(agentMail.preview_urls, false);
});

test("agent-mail holds its mail stores, outbound binding, and lifecycle consumer", () => {
  assert.deepEqual(agentMail.d1_databases, [expectedD1]);
  assert.deepEqual(agentMail.r2_buckets, [expectedR2]);
  assert.deepEqual(agentMail.send_email, [{ name: "SEND_EMAIL" }]);
  assert.deepEqual(agentMail.queues, { consumers: [{
    queue: "agent-mail-email-events",
    max_batch_size: 10,
    max_retries: 5,
    dead_letter_queue: "agent-mail-email-events-dlq",
  }] });
  for (const key of ["assets", "kv_namespaces", "triggers"])
    assert.equal(agentMail[key], undefined, `agent-mail must not configure ${key}`);
});

test("agent-mail keeps only non-secret mail/report configuration", () => {
  assert.deepEqual(agentMail.vars, {
    AGENT_MAIL_DOMAIN: atl.vars.AGENT_MAIL_DOMAIN,
    REPORT_LINK_BASE: atl.vars.REPORT_LINK_BASE,
  });
  for (const secret of ["AGENT_MAIL_TOKEN", "MAIL_BELL_SECRETS", "REPORT_LINK_SECRET"])
    assert.equal(agentMail.vars[secret], undefined, `${secret} must remain a Worker secret`);
});

test("agent-mail observability and local font bundling are enabled", () => {
  assert.equal(agentMail.observability.enabled, true);
  assert.deepEqual(agentMail.rules, [
    { type: "Data", globs: ["**/*.ttf"], fallthrough: true },
  ]);
});

test("package exposes an explicit deploy command for the dedicated Worker", () => {
  assert.match(pkg.scripts["deploy:agent-mail"] || "", /wrangler deploy --config wrangler\.agent-mail\.jsonc/);
});
