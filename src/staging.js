// The existing staging environment is a website review surface, not a second
// operational backend. This entrypoint has only ASSETS: no production imports,
// credentials, databases, email, scheduled handlers, or outbound fetch calls.
const PAGES = new Set([
  '/', '/about', '/adaptive-sports-near-me', '/apply', '/contact', '/donate',
  '/hustle-and-heart', '/karen', '/promise', '/roadmap', '/sponsorship',
  '/subscribe', '/tim', '/volunteer', '/send-6', '/popcorn', '/waiver',
]);
const STATIC = /^\/(?:css|js|images|fonts|docs)\/[\w./-]+$/;
const DATA = new Set(['/data/campaigns.json', '/data/staging-raised.json', '/data/staging-waiver.json']);
const NOTICE = 'Content staging. Forms, payments, and outbound links are disabled. Nothing is submitted.';
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-src 'none'; form-action 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";

export function isReviewPath(path) {
  const page = path.replace(/\.html$/, '').replace(/\/$/, '') || '/';
  return PAGES.has(page) || /^\/volunteer\/[a-z0-9-]+$/.test(page) ||
    STATIC.test(path) || DATA.has(path) || path === '/build.txt';
}

function headers(extra = {}) {
  return { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Content-Security-Policy': CSP, 'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff', ...extra };
}

const CHROME = `<style>a[data-staging-disabled]{cursor:not-allowed}.staging-payment{padding:2rem;border:1px solid currentColor;border-radius:12px;font:16px/1.5 system-ui,sans-serif}.staging-payment strong{display:block;margin-bottom:.5rem}</style><script>document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();},true);document.addEventListener('click',function(e){var a=e.target.closest('a');if(a&&(a.hasAttribute('data-staging-disabled')||(a.hasAttribute('href')&&new URL(a.getAttribute('href'),location.href).origin!==location.origin))){e.preventDefault();e.stopImmediatePropagation();}},true);</script>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Refuse every write before asset handling. Even a forged direct API call
    // cannot reach production; this module cannot import or call its handlers.
    if (!['GET', 'HEAD'].includes(request.method)) {
      return Response.json({ ok: false, staging: true, error: NOTICE },
        { status: 403, headers: headers() });
    }
    if (url.pathname === '/robots.txt') {
      return new Response('User-agent: *\nDisallow: /\n', { headers: headers({ 'Content-Type': 'text/plain' }) });
    }
    const snapshots = { '/api/raised': '/data/staging-raised.json', '/api/waiver/doc': '/data/staging-waiver.json' };
    if (snapshots[url.pathname]) {
      const snapshot = new URL(snapshots[url.pathname], url);
      const response = await env.ASSETS.fetch(new Request(snapshot, { method: request.method }));
      return new Response(response.body, { status: response.status, headers: headers({ 'Content-Type': 'application/json' }) });
    }
    if (url.pathname === '/review' || url.pathname === '/review.html') {
      return new Response(null, { status: 302, headers: headers({ Location: '/#participation' }) });
    }
    if (url.pathname === '/ways-to-give' || url.pathname === '/ways-to-give.html') {
      return new Response(null, { status: 302, headers: headers({ Location: '/donate' }) });
    }
    if (!isReviewPath(url.pathname)) {
      return new Response('Not available in content staging.', { status: 404, headers: headers() });
    }
    const asset = await env.ASSETS.fetch(request);
    const merged = new Headers(asset.headers);
    for (const [key, value] of Object.entries(headers())) merged.set(key, value);
    // Do not carry asset freshness validators or content length across rewriting.
    merged.delete('ETag'); merged.delete('Content-Length');
    let response = new Response(asset.body, { status: asset.status, headers: merged });
    if (!(asset.headers.get('Content-Type') || '').includes('text/html') || request.method === 'HEAD') return response;
    return new HTMLRewriter()
      .on('body', { element(el) { el.append(CHROME, { html: true }); } })
      .on('link[href]', { element(el) {
        const rel = el.getAttribute('rel') || '';
        const href = el.getAttribute('href') || '';
        if (/preload|preconnect|dns-prefetch/.test(rel) && /^https?:\/\//.test(href) && !/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//.test(href)) el.remove();
      } })
      .on('script[src]', { element(el) {
        const src = el.getAttribute('src') || '';
        if (/^https?:\/\//.test(src) || /(?:givebutter|turnstile|subscribe)/i.test(src)) el.remove();
      } })
      .on('iframe, .cf-turnstile', { element(el) { el.remove(); } })
      .on('givebutter-giving-form', { element(el) {
        el.replace('<div class="staging-payment"><strong>Donation form paused for content review</strong>No payment can be made here. Donation copy and the surrounding layout remain available to review.</div>', { html: true });
      } })
      .on('form', { element(el) { el.setAttribute('data-staging-form', 'disabled'); el.setAttribute('aria-label', NOTICE); } })
      .on('form input, form textarea, form select, form button', { element(el) { el.setAttribute('disabled', ''); } })
      .on('a[href]', { element(el) {
        const href = el.getAttribute('href') || '';
        if (!/^(?:https?:)?\/\/|^mailto:|^tel:/i.test(href)) return;
        const target = new URL(href, url);
        if (['adapttolife.org', 'www.adapttolife.org'].includes(target.hostname)) {
          el.setAttribute('href', target.pathname + target.search + target.hash);
          return;
        }
        if (target.hostname === 'sign.adapttolife.org') {
          el.setAttribute('href', '/waiver');
          return;
        }
        el.removeAttribute('href'); el.removeAttribute('target');
        el.setAttribute('data-staging-disabled', ''); el.setAttribute('aria-disabled', 'true');
        el.setAttribute('title', 'Outbound link disabled in content staging');
      } })
      .transform(response);
  },
};
