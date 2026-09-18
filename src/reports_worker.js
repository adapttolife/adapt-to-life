// reports.amelioration.is — the report Worker.
//
// This is the ATL Worker with everything removed. It serves exactly two
// surfaces, /r/<token> and /lib/<token>, by calling the same handlers
// src/index.js calls; there is no second copy of the rendering code. It has no
// static assets, no forms, no waivers, no agent-mail API, no QR or signing-hub
// redirects, no email handler and no cron — so none of those can be reached
// from behind reports.amelioration.is, and the Worker's blast radius is the one
// D1 binding the report pages read.
//
// Every other path and every unsupported method gets the SAME plain 404 a
// tampered token gets. That is the point: a prober cannot tell a wrong token
// from a route that does not exist here, and cannot enumerate what this Worker
// is by watching which paths answer differently.

import { handleReportView, handleLibraryView, notFound } from "./report_view.js";

export default {
  async fetch(request, env) {
    const method = request.method;
    if (method !== "GET" && method !== "HEAD") return notFound();

    const url = new URL(request.url);
    if (url.pathname.startsWith("/r/")) return serve(handleReportView, request, env, url);
    if (url.pathname.startsWith("/lib/")) return serve(handleLibraryView, request, env, url);

    return notFound();
  },
};

// The handlers are GET-only by design (Spec 70 P3). HEAD is answered from the
// GET they produce and then stripped of its body, so a HEAD never becomes a
// second, differently-behaved code path through the token check.
async function serve(handler, request, env, url) {
  if (request.method !== "HEAD") return handler(request, env, url);
  const res = await handler(new Request(url, { method: "GET", headers: request.headers }), env, url);
  return new Response(null, { status: res.status, headers: res.headers });
}
