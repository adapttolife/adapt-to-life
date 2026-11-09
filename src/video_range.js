// Byte-range responses for site video (/videos/*).
//
// Workers Static Assets answer every request with a full 200, and iPhone
// Safari (the Instagram in-app browser too) will not play a <video> whose
// server ignores Range: it asks for bytes=0-1, expects a 206, and otherwise
// shows only the poster. Most of /links' visitors arrive from Instagram on an
// iPhone, so site video comes through the Worker and is sliced here. One range
// per request; anything fancier gets the whole file.
//
// History: the same fix shipped for one ACE clip on Oct 31 2026 (300b2963) and
// was reverted with that clip. Measured again Nov 8 2026 on production:
// `curl -r 0-1 /videos/links/rally-brickhouse.44e69db0.mp4` answered 200 with
// all 1,294,575 bytes, so the /links hero only played on Android and desktop.

export const VIDEO_PATH = /^\/videos\/.+\.(mp4|m4v|webm|mov)$/i;

// Fingerprinted names (name.<8 hex>.mp4) never change content, so browsers can
// keep them for a year. Anything else revalidates daily.
const FINGERPRINTED = /\.[0-9a-f]{8}\.(mp4|m4v|webm|mov)$/i;
const TYPES = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm", mov: "video/quicktime" };

export function isVideoRequest(request, url) {
  return (request.method === "GET" || request.method === "HEAD") && VIDEO_PATH.test(url.pathname);
}

export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") {
    // suffix: the last N bytes
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export async function serveVideo(request, env) {
  const url = new URL(request.url);
  const plain = new Request(url.origin + url.pathname, { method: "GET", headers: { "Accept-Encoding": "identity" } });
  const res = await env.ASSETS.fetch(plain);
  if (!res.ok) return res;
  const body = await res.arrayBuffer();
  const size = body.byteLength;
  const headers = new Headers(res.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.delete("Content-Encoding");
  const ext = url.pathname.split(".").pop().toLowerCase();
  if (!headers.get("Content-Type")) headers.set("Content-Type", TYPES[ext] || "application/octet-stream");
  headers.set(
    "Cache-Control",
    FINGERPRINTED.test(url.pathname) ? "public, max-age=31536000, immutable" : "public, max-age=86400",
  );
  const range = parseRange(request.headers.get("Range"), size);
  const head = request.method === "HEAD";
  if (range === "unsatisfiable") {
    headers.set("Content-Range", `bytes */${size}`);
    headers.set("Content-Length", "0");
    return new Response(null, { status: 416, headers });
  }
  if (!range) {
    headers.set("Content-Length", String(size));
    return new Response(head ? null : body, { status: 200, headers });
  }
  const { start, end } = range;
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(end - start + 1));
  return new Response(head ? null : body.slice(start, end + 1), { status: 206, headers });
}
