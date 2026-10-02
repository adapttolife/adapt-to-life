// Add to calendar is one tap per calendar, never a raw download. Every button
// points at a hosted .ics file, and every file agrees with the events data.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const read = (f) => readFileSync(new URL(f, pub), "utf8");
const pages = readdirSync(pub).filter((f) => f.endsWith(".html"));

test("no page hands out a data: calendar download", () => {
  for (const f of pages) assert.ok(!read(f).includes("data:text/calendar"), `${f} still embeds a data: .ics`);
});

test("every Add to calendar block names a hosted file that exists, and loads the script", () => {
  for (const f of pages) {
    const html = read(f);
    const blocks = [...html.matchAll(/<div class="atc"([^>]*)>/g)];
    if (!blocks.length) continue;
    assert.ok(html.includes('/js/add-to-calendar.js'), `${f} has .atc blocks but no script`);
    for (const [, attrs] of blocks) {
      const ics = (attrs.match(/data-ics="([^"]+)"/) || [])[1];
      assert.ok(ics && existsSync(new URL(ics.slice(1), pub)), `${f}: ${ics} missing`);
      assert.ok(/data-start="\d{4}-\d{2}-\d{2}"/.test(attrs), `${f}: data-start`);
    }
  }
});

test("each event's .ics file has the same date as campaigns.json", () => {
  const data = JSON.parse(read("data/campaigns.json"));
  for (const d of data.drives.filter((x) => x.ics)) {
    const ics = read(d.ics.slice(1));
    const start = (d.starts_at || d.opens).replace(/-/g, "");
    assert.ok(new RegExp(`DTSTART(;VALUE=DATE)?[:;][^\\r\\n]*${start}`).test(ics), `${d.ics} DTSTART != ${start}`);
    assert.ok(ics.includes("\r\n"), `${d.ics} uses CRLF line endings`);
  }
});
