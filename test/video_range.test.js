// iPhone Safari (and the Instagram in-app browser on iPhone) will not play a
// video whose server ignores Range. Workers Static Assets ignore it, so the
// Worker slices site video itself; these pin that contract, the routing that
// sends /videos/* through it in production, and the cache policy.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../src/index.js";
import { parseRange, serveVideo, isVideoRequest } from "../src/video_range.js";

const bytes = new Uint8Array(1000).map((_, i) => i % 256);
const env = { ASSETS: { fetch: async () => new Response(bytes, { headers: { "Content-Type": "video/mp4" } }) } };
const CLIP = "https://adapttolife.org/videos/links/rally-brickhouse.44e69db0.mp4";
const req = (range, method = "GET", url = CLIP) => new Request(url, { method, headers: range ? { Range: range } : {} });

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
  assert.equal(res.headers.get("Content-Type"), "video/mp4");
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [0, 1]);
});

test("a middle range returns exactly those bytes", async () => {
  const res = await serveVideo(req("bytes=300-309"), env);
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Length"), "10");
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [44, 45, 46, 47, 48, 49, 50, 51, 52, 53]);
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

test("fingerprinted video is cached for a year, other video for a day", async () => {
  const fp = await serveVideo(req("bytes=0-1"), env);
  assert.equal(fp.headers.get("Cache-Control"), "public, max-age=31536000, immutable");
  const plain = await serveVideo(req("bytes=0-1", "GET", "https://adapttolife.org/videos/links/clip.mp4"), env);
  assert.equal(plain.headers.get("Cache-Control"), "public, max-age=86400");
});

test("a missing video stays a 404", async () => {
  const missing = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
  const res = await serveVideo(req("bytes=0-1"), missing);
  assert.equal(res.status, 404);
});

test("only video under /videos/ takes this path", () => {
  const is = (path, method = "GET") => isVideoRequest({ method }, new URL("https://adapttolife.org" + path));
  assert.ok(is("/videos/links/a.44e69db0.mp4"));
  assert.ok(is("/videos/home/b.webm", "HEAD"));
  assert.ok(!is("/videos/links/a.mp4", "POST"));
  assert.ok(!is("/images/links/a.webp"));
  assert.ok(!is("/links"));
});

test("the Worker answers a range request for site video with a 206", async () => {
  const res = await worker.fetch(req("bytes=0-1"), env, { waitUntil() {} });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get("Content-Range"), "bytes 0-1/1000");
});

test("production sends /videos/* through the Worker, or none of this runs", () => {
  const text = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
  const block = text.slice(text.indexOf('"run_worker_first": ['), text.indexOf("]", text.indexOf('"run_worker_first": [')));
  assert.ok(block.includes('"/videos/*"'), "wrangler.jsonc run_worker_first must list /videos/*");
});
