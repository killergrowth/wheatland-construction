/**
 * inject-scripts.js
 * Shared utility for injecting tracked scripts into built HTML pages.
 * Phase 2 of the KG Builder script management system.
 *
 * Usage:
 *   const { buildHeadScripts, buildBodyScripts, injectScripts } = require('.../inject-scripts');
 *   let html = injectScripts(html, siteScripts);
 */

/**
 * Generate <head> injection block from a site's scripts config.
 * Covers: GA4, GTM (head tag), Feedbucket, custom head.
 */
function buildHeadScripts(scripts) {
  if (!scripts) return '';
  const parts = [];

  if (scripts.ga4) {
    parts.push(
`<!-- Google Analytics (GA4) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${scripts.ga4}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${scripts.ga4}');
</script>
<!-- End Google Analytics -->`
    );
  }

  if (scripts.gtm) {
    parts.push(
`<!-- Google Tag Manager -->
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${scripts.gtm}');</script>
<!-- End Google Tag Manager -->`
    );
  }

  if (scripts.feedbucket) {
    parts.push(scripts.feedbucket);
  }

  if (scripts.fathom) {
    parts.push(
`<!-- Fathom Analytics -->
<script src="https://cdn.usefathom.com/script.js" data-site="${scripts.fathom}" defer></script>
<!-- End Fathom Analytics -->`
    );
  }

  if (scripts.custom && scripts.custom.head) {
    parts.push(scripts.custom.head);
  }

  return parts.join('\n');
}

/**
 * Generate pre-</body> injection block from a site's scripts config.
 * Covers: GTM noscript, custom body.
 */
function buildBodyScripts(scripts) {
  if (!scripts) return '';
  const parts = [];

  if (scripts.gtm) {
    parts.push(
`<!-- Google Tag Manager (noscript) -->
<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${scripts.gtm}"
height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>
<!-- End Google Tag Manager (noscript) -->`
    );
  }

  if (scripts.custom && scripts.custom.body) {
    parts.push(scripts.custom.body);
  }

  return parts.join('\n');
}

/**
 * Inject head and body scripts into an HTML string.
 * Inserts head scripts before </head> and body scripts before </body>.
 */
function injectScripts(html, scripts) {
  if (!scripts) return html;

  const headBlock = buildHeadScripts(scripts);
  const bodyBlock = buildBodyScripts(scripts);

  if (headBlock) {
    html = html.replace('</head>', `${headBlock}\n</head>`);
  }
  if (bodyBlock) {
    html = html.replace('</body>', `${bodyBlock}\n</body>`);
  }

  return html;
}

/**
 * Load scripts config for a given site ID from sites.json.
 */
function loadSiteScripts(siteId) {
  const fs = require('fs');
  const path = require('path');
  const SITES_JSON = process.env.KG_SITES_JSON || path.resolve(__dirname, '../../../References/sites.json');
  try {
    const data = JSON.parse(fs.readFileSync(SITES_JSON, 'utf8').replace(/^\uFEFF/, '').trim());
    const site = data.sites.find(s => s.id === siteId);
    return (site && site.scripts) ? site.scripts : null;
  } catch (e) {
    console.warn(`[inject-scripts] Could not load scripts for ${siteId}:`, e.message);
    return null;
  }
}

module.exports = { buildHeadScripts, buildBodyScripts, injectScripts, loadSiteScripts };
