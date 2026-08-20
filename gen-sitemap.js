/**
 * gen-sitemap.js — KillerGrowth Shared Sitemap Generator
 * kg-site-builder/lib/gen-sitemap.js
 *
 * Exports generateSitemap({ distDir, siteRoot, domain, excludeSlugs })
 * Scans dist/ and generates sitemap.xml from actual built pages.
 *
 * Blog entries are placed under a <!-- Blog --> marker so any future
 * blog injection logic can detect they're already present.
 *
 * Usage — from build.js or blog-build.js:
 *   const { generateSitemap } = require('...lib/gen-sitemap');
 *   generateSitemap({ distDir: DIST, siteRoot: ROOT, domain: 'example.com' });
 *
 * Usage — standalone (from site root via per-site gen-sitemap.js wrapper):
 *   node gen-sitemap.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Slugs excluded from sitemap on every site — add site-specific ones via excludeSlugs param
const DEFAULT_EXCLUDES = new Set(['404', 'upload', 'thank-you', 'admin', 'staging']);

function getPriority(slug) {
  if (slug === '')                            return '1.0';
  if (/^(about|contact|services|gallery|get-a-quote)$/.test(slug)) return '0.8';
  if (slug === 'areas-served')               return '0.8';
  if (slug === 'blog')                       return '0.7';
  if (slug === 'videos')                     return '0.7';
  // Service hubs (single-segment, hyphenated, no city suffix)
  if (/^[a-z-]+-(?:painting|staining|cleaning|restoration|remediation|insurance|planning|plumbing|heating)$/.test(slug) &&
      !/-(?:co|ks|ok|tx|mo|ne|nm|az|ca|fl|ga|il|in|ia|ky|la|md|mi|mn|ms|mt|nv|nj|ny|nc|nd|oh|or|pa|sc|sd|tn|ut|vt|va|wa|wv|wi|wy)$/.test(slug)) return '0.9';
  if (slug.startsWith('areas-served/'))      return '0.8';
  if (slug.startsWith('locations/'))         return '0.8';
  if (slug.startsWith('blog/'))              return '0.6';
  if (slug.startsWith('videos/'))            return '0.6';
  // Service+city combos (ends in state abbreviation)
  if (/--?[a-z]{2}$/.test(slug) || /-(?:co|ks|ok|tx|mo|ne)$/.test(slug)) return '0.7';
  return '0.7'; // generic service pages
}

function getChangefreq(slug) {
  if (slug === '')               return 'weekly';
  if (slug === 'blog')           return 'weekly';
  if (slug.startsWith('blog/'))  return 'monthly';
  return 'monthly';
}

function urlEntry(slug, domain, today) {
  const loc        = slug === '' ? `https://${domain}/` : `https://${domain}/${slug}/`;
  const priority   = getPriority(slug);
  const changefreq = getChangefreq(slug);
  return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function collectSlugs(dir, distDir, excludes) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let slugs = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip asset/tool directories
      if (['assets', 'landing-assets', 'node_modules', '.git', 'fonts', 'blog-posts'].includes(entry.name)) continue;
      slugs = slugs.concat(collectSlugs(full, distDir, excludes));
    } else if (entry.name === 'index.html') {
      const slug = path.relative(distDir, dir).replace(/\\/g, '/');
      if (!excludes.has(slug)) slugs.push(slug);
    } else if (entry.name.endsWith('.html') && entry.name !== 'index.html') {
      const slug = path.relative(distDir, full).replace(/\\/g, '/').replace(/\.html$/, '');
      if (!excludes.has(slug)) slugs.push(slug);
    }
  }

  return slugs;
}

/**
 * generateSitemap — main export
 *
 * @param {object} opts
 * @param {string} opts.distDir      - Path to the built dist/ directory
 * @param {string} opts.siteRoot     - Path to the site root (sitemap.xml also written here)
 * @param {string} opts.domain       - Site domain, no protocol (e.g. 'timnathpainting.com')
 * @param {string[]} [opts.excludeSlugs] - Additional slugs to exclude beyond defaults
 * @param {boolean} [opts.silent]    - Suppress console output
 * @returns {{ count: number, slugs: string[] }}
 */
function generateSitemap({ distDir, siteRoot, domain, excludeSlugs = [], silent = false }) {
  if (!domain) {
    console.warn('[gen-sitemap] Warning: no domain provided — sitemap not generated.');
    return { count: 0, slugs: [] };
  }

  const today   = new Date().toISOString().slice(0, 10);
  const excludes = new Set([...DEFAULT_EXCLUDES, ...excludeSlugs]);

  const slugs = collectSlugs(distDir, distDir, excludes);

  // Sort: homepage first, then alphabetical
  slugs.sort((a, b) => {
    if (a === '') return -1;
    if (b === '') return 1;
    return a.localeCompare(b);
  });

  const nonBlogSlugs = slugs.filter(s => s !== 'blog' && !s.startsWith('blog/'));
  const blogSlugs    = slugs.filter(s => s === 'blog' || s.startsWith('blog/'));

  const sections = [nonBlogSlugs.map(s => urlEntry(s, domain, today)).join('\n\n')];
  if (blogSlugs.length > 0) {
    sections.push('  <!-- Blog -->\n' + blogSlugs.map(s => urlEntry(s, domain, today)).join('\n\n'));
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '',
    sections.join('\n\n'),
    '',
    '</urlset>',
  ].join('\n');

  // Write to both dist/ and site root
  const distOut = path.join(distDir, 'sitemap.xml');
  fs.writeFileSync(distOut, xml, 'utf8');

  if (siteRoot && siteRoot !== distDir) {
    const rootOut = path.join(siteRoot, 'sitemap.xml');
    fs.writeFileSync(rootOut, xml, 'utf8');
  }

  if (!silent) {
    console.log(`[gen-sitemap] ${slugs.length} URLs → sitemap.xml (${domain})`);
  }

  return { count: slugs.length, slugs };
}

module.exports = { generateSitemap };
