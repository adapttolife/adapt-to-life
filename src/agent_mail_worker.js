// api.amelioration.is — dedicated agent-mail execution plane.
//
// The HTTP surface stays on /api/agent-mail/* during migration so callers need
// only an origin change and rollback is one configuration flip. Cloudflare
// Access authenticates the machine before this code runs; handleAgentMailApi
// still enforces the existing operator/per-agent bearer token and SQL scope.
//
// The same Worker receives *@agents.adapttolife.org Email Routing events. Email
// identity and DNS stay unchanged while runtime authority moves off the public
// nonprofit Worker.
import { handleAgentMailApi, handleEmail } from "./agent_mail.js";

const notFound = () => new Response("Not found", {
  status: 404,
  headers: {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/agent-mail/")) return notFound();
    return handleAgentMailApi(request, env, url);
  },

  async email(message, env, ctx) {
    await handleEmail(message, env, ctx);
  },
};
