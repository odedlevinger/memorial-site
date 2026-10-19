// Serves the web frontend on the custom domain by proxying every request to its
// Cloud Run URL. The browser stays on the custom domain (no redirect to *.run.app);
// www.<domain> 301-redirects to the apex, and /donate redirects to the Cardcom
// donation page. Free alternative to a GCP load balancer.

const ORIGIN_HOST = 'memorial-site-web-377tsqfr6a-zf.a.run.app';
const DONATE_URL = 'https://secure.cardcom.solutions/EA/EA5/l3cc6okCo0iMoXVlXVOgQ/PaymentSP';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const publicHost = url.hostname;

    if (publicHost.startsWith('www.')) {
      url.hostname = publicHost.slice('www.'.length);
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/donate' || url.pathname === '/donate/') {
      return Response.redirect(DONATE_URL, 302);
    }

    url.protocol = 'https:';
    url.hostname = ORIGIN_HOST;
    url.port = '';

    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', publicHost);

    const upstream = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: request.body,
      redirect: 'manual',
    });

    // Keep any origin redirect on the custom domain.
    const location = upstream.headers.get('Location');
    if (location === null || !location.includes(ORIGIN_HOST)) {
      return upstream;
    }
    const response = new Response(upstream.body, upstream);
    response.headers.set('Location', location.replaceAll(ORIGIN_HOST, publicHost));
    return response;
  },
};
