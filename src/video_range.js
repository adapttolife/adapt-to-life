// Byte-range responses for site video. Workers Static Assets answer every
// request with a full 200, and iPhone Safari will not play an <video> whose
// server ignores Range: it asks for bytes=0-1, expects a 206, and gives up on
// anything else. So .mp4 requests under /images/ come through the Worker and
// get sliced here. One file, one range; multipart ranges get the whole file.

export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") { // suffix: the last N bytes
    const n = Number(m[2]);
    if (n === 0) return "unsatisfiable";
    start = Math.max(0, size - n); end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "unsatisfiable";
  return { start, end };
}

export async function serveVideo(request, env) {
  const plain = new Request(request.url, { method: "GET", headers: { "Accept-Encoding": "identity" } });
  const res = await env.ASSETS.fetch(plain);
  if (!res.ok) return res;
  const body = await res.arrayBuffer();
  const size = body.byteLength;
  const headers = new Headers(res.headers);
  headers.set("Accept-Ranges", "bytes");
  headers.delete("Content-Encoding");
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
