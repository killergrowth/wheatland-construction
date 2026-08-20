// KillerGrowth -- pages.dev crawler block
// For *.pages.dev: block all crawlers
// For live domain: pass through to the static robots.txt asset

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/robots.txt') {
      return env.ASSETS.fetch(request);
    }
    if (url.hostname.endsWith('.pages.dev')) {
      return new Response('User-agent: *\nDisallow: /\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    return env.ASSETS.fetch(request);
  }
};
