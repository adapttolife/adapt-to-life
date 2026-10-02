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

test("every dated event has a calendar file, generated from campaigns.json and current", async () => {
  const { calendarFiles } = await import("../scripts/build-calendar.mjs");
  const data = JSON.parse(read("data/campaigns.json"));
  const files = calendarFiles(data);
  assert.ok(files.size >= 1, "at least one event has a date");
  for (const [rel, body] of files) {
    const p = rel.replace(/^public\//, "");
    assert.ok(existsSync(new URL(p, pub)), `${p} is missing; run npm run calendar`);
    assert.equal(read(p), body, `${p} is out of date; run npm run calendar`);
    assert.ok(!/[^\r]\n/.test(body), `${p} uses CRLF on every line`);
    assert.ok(body.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75), `${p} folds lines at 75 octets`);
  }
});

test("a timed event is written in UTC from its own time zone", async () => {
  const { icsFor } = await import("../scripts/build-calendar.mjs");
  const chicago = icsFor({ slug: "t", name: "T", starts_at: "2026-10-25", time_start: "12:00", time_end: "17:00" });
  assert.ok(chicago.includes("DTSTART:20261025T170000Z") && chicago.includes("DTEND:20261025T220000Z"), "noon Chicago in October is 17:00Z");
  const cincy = icsFor({ slug: "t", name: "T", starts_at: "2026-10-24", time_start: "09:00", time_end: "10:00", tz: "America/New_York" });
  assert.ok(cincy.includes("DTSTART:20261024T130000Z"), "9 am Eastern in October is 13:00Z");
  const winter = icsFor({ slug: "t", name: "T", starts_at: "2026-12-05", time_start: "12:00", time_end: "13:00" });
  assert.ok(winter.includes("DTSTART:20261205T180000Z"), "noon Chicago in December is 18:00Z");
  const allday = icsFor({ slug: "t", name: "T", starts_at: "2026-10-23", ends_at: "2026-10-25" });
  assert.ok(allday.includes("DTSTART;VALUE=DATE:20261023") && allday.includes("DTEND;VALUE=DATE:20261026"), "all day runs through the last day");
});
