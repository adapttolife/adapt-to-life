// iPhone Safari will not play a video whose server ignores Range. The Worker
// slices site .mp4 files itself; these pin the contract.
import test from "node:test";
import assert from "node:assert/strict";
import { parseRange, serveVideo } from "../src/video_range.js";

const bytes = new Uint8Array(1000).map((_, i) => i % 256);
const env = { ASSETS: { fetch: async () => new Response(bytes, { headers: { "Content-Type": "video/mp4" } }) } };
const req = (range, method = "GET") => new Request("https://adapttolife.org/images/ace/on-court.mp4", { method, headers: range ? { Range: range } : {} });

test("parseRange reads open, closed, suffix and bad ranges", () => {
  assert.deepEqual(parseRange("bytes=0-1", 1000), { start: 0, end: 1 });
  assert.deepEqual(parseRange("bytes=500-", 1000), { start: 500, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=990-5000", 1000), { start: 990, end: 999 });
  assert.equal(parseRange("bytes=1000-", 1000), "unsatisfiable");
  assert.equal(parseRange("items=0-1", 1000), null);
  assert.equal(parseRange(null, 1000), null);
});

test("Safari's probe gets a 206 with exactly two bytes", async () => {
  const res = await serveVideo(req("bytes=0-1"), env);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), "bytes 0-1/1000");
  assert.equal(res.headers.get("Accept-Ranges"), "bytes");
  assert.equal((await res.arrayBuffer()).byteLength, 2);
});

test("no Range gets the whole file and advertises ranges", async () => {
  const res = await serveVideo(req(null), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("Accept-Ranges"), "bytes");
  assert.equal((await res.arrayBuffer()).byteLength, 1000);
});

test("a range past the end is 416", async () => {
  const res = await serveVideo(req("bytes=2000-"), env);
  assert.equal(res.status, 416);
  assert.equal(res.headers.get("Content-Range"), "bytes */1000");
});

test("HEAD answers headers with no body", async () => {
  const res = await serveVideo(req("bytes=0-99", "HEAD"), env);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Length"), "100");
});
