// scripts/build-calendar.mjs: one calendar file per event, from the data.
//
// Adding an event is one entry in public/data/campaigns.json. From that one
// object come the event card (home and /events), the Add to calendar links
// (Google, Outlook), the Event JSON-LD, and, here, the hosted .ics file that
// Apple Calendar opens as its own "Add Event" screen: public/cal/<slug>.ics.
//
// Deterministic on purpose. DTSTAMP comes from the entry's `updated` date, not
// the clock, so the same data always writes the same bytes and a build never
// dirties the tree (the -dirty stamp this repo already paid for once).
// test/calendar.test.js fails if a file on disk differs from this output.
//
// Times: `time_start`/`time_end` are local to the entry's `tz` (default
// America/Chicago) and are written in UTC. No times means an all day event.
// `calendar_sequence` goes up when a published time changes, so calendars
// that saved the old version update it.
//
// Usage: npm run calendar
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://adapttolife.org";
const DEFAULT_TZ = "America/Chicago";

function pad(n) { return String(n).padStart(2, "0"); }

// Offset of `tz` at a UTC instant, in minutes (Chicago in October: -300).
function offsetMinutes(utcMs, tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(new Date(utcMs)).map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - utcMs) / 60000);
}

// "2026-10-25" + "12:00" in America/Chicago -> 20261025T170000Z
function toUtc(date, time, tz) {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let t = guess - offsetMinutes(guess, tz) * 60000;
  t = guess - offsetMinutes(t, tz) * 60000; // settle across a DST edge
  const u = new Date(t);
  return `${u.getUTCFullYear()}${pad(u.getUTCMonth() + 1)}${pad(u.getUTCDate())}T${pad(u.getUTCHours())}${pad(u.getUTCMinutes())}00Z`;
}

function nextDay(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// RFC 5545 text escaping, then folding at 75 octets.
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
function fold(line) {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0, limit = 75;
  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--; // never split a character
    while (end < bytes.length && end - 1 > start && bytes[end - 1] === 0x5c) end--; // never split an escape like \,
    out.push(bytes.slice(start, end).toString("utf8"));
    start = end; limit = 74; // continuation lines start with one space
  }
  return out.join("\r\n ");
}

export function icsFor(d) {
  const start = d.starts_at || d.opens;
  const end = d.ends_at || d.closes || start;
  const tz = d.tz || DEFAULT_TZ;
  const url = d.page ? SITE + d.page : d.cta_url || SITE + "/events";
  const description = [d.time_note ? d.time_note.replace(/^./, (c) => c.toUpperCase()) + "." : "", d.summary || "", url]
    .filter(Boolean).join(" ");
  const stamp = (d.updated || start).replace(/-/g, "") + "T120000Z";
  const when = d.time_start && d.time_end
    ? [`DTSTART:${toUtc(start, d.time_start, tz)}`, `DTEND:${toUtc(end, d.time_end, tz)}`]
    : [`DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${nextDay(end).replace(/-/g, "")}`];
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Adapt To Life//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${d.slug}@adapttolife.org`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${esc(d.calendar_title || d.name)}`,
    `LOCATION:${esc([d.venue, d.address || [d.city, d.state].filter(Boolean).join(", ")].filter(Boolean).join(", "))}`,
    `DESCRIPTION:${esc(description)}`,
    `URL:${url}`,
    `SEQUENCE:${d.calendar_sequence || 0}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// Every published entry with a start date gets a file at /cal/<slug>.ics.
export function calendarFiles(data) {
  const files = new Map();
  for (const d of data.drives || []) {
    if (d.published === false || !(d.starts_at || d.opens)) continue;
    files.set(`public/cal/${d.slug}.ics`, icsFor(d));
  }
  return files;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(readFileSync(join(ROOT, "public/data/campaigns.json"), "utf8"));
  mkdirSync(join(ROOT, "public/cal"), { recursive: true });
  const files = calendarFiles(data);
  for (const [rel, body] of files) writeFileSync(join(ROOT, rel), body);
  console.log(`wrote ${files.size} calendar files: ${[...files.keys()].map((f) => f.split("/").pop()).join(", ")}`);
}
