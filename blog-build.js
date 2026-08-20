/**
 * blog-build.js — Shared Blog Build Module
 * KillerGrowth Site Builder
 *
 * Called from each site's build.js when blogEnabled: true.
 * Renders published blog posts to dist/blog/, generates paginated
 * blog index pages, and injects recent posts into the homepage.
 *
 * Template system: if _partials/blog-post.html, _partials/blog-index.html,
 * and/or _partials/blog-featured.html exist, they are used as {{token}}
 * templates. Falls back to inline rendering when templates are absent
 * (backward compatibility).
 *
 * Usage in site's build.js:
 *   const { buildBlog } = require('...path.../lib/blog-build');
 *   buildBlog({
 *     srcDir: __dirname,
 *     distDir: path.join(__dirname, 'dist'),
 *     siteId: 'my-site',
 *     domain: 'example.com',
 *     siteName: 'My Site Name'
 *   });
 */

const fs   = require('fs');
const path = require('path');
const { marked } = require('marked');
const matter = require('gray-matter');

marked.setOptions({ breaks: true, gfm: true });

// ─── Template Engine ─────────────────────────────────────────────────────────

/**
 * Replace {{token}} placeholders in a template string.
 * Unknown tokens → empty string.
 */
function applyTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] !== undefined ? String(vars[key]) : ''
  );
}

// ─── Image Helpers ───────────────────────────────────────────────────────────

function normImg(src) {
  if (!src) return '';
  return src.startsWith('/') ? src : `/${src}`;
}

/**
 * fixFloatImages — repositions standalone <p><img></p> blocks so the image
 * floats with text wrapping alongside it.
 */
function fixFloatImages(html) {
  html = html.replace(
    /<p>(<img[^>]*>)<\/p>\s*(<p>(?!<img))/g,
    '$2$1'
  );
  html = html.replace(
    /<p>([\s\S]*?)\s*(<img[^>]*>)\s*<\/p>(\s*<h[2-6][^>]*>[\s\S]*?<\/h[2-6]>\s*)<p>(?!<img)/g,
    (match, pre, img, heading) => `<p>${pre.trim()}</p>${heading}<p>${img}`
  );
  html = html.replace(
    /<p>([\s\S]*?)\s*(<img[^>]*>)\s*<\/p>\s*(<p>(?!<img))/g,
    (match, pre, img, nextP) => {
      if (pre.trim().length < 20) return match;
      return `<p>${pre.trim()}</p>\n${nextP}${img}`;
    }
  );
  return html;
}

// ─── Markdown Normalization ──────────────────────────────────────────────────


// --- Inline Image Injection ---------------------------------------------------

/**
 * Inject inlineImage1 and inlineImage2 (both float-right) immediately after
 * an H2/H3 heading. Picks the heading in each half whose following section has
 * the most text content before the next heading, so the image always has enough
 * content alongside it to avoid orphaned whitespace.
 */
function injectInlineImages(htmlBody, post) {
  var src1 = post.inlineImage1 ? normImg(post.inlineImage1) : null;
  var src2 = post.inlineImage2 ? normImg(post.inlineImage2) : null;
  if (!src1 && !src2) return htmlBody;

  // Build a list of {insertAt, sectionText} for each H2/H3
  var hRegex = /<\/h[23]>/gi;
  var sections = [];
  var m;
  while ((m = hRegex.exec(htmlBody)) !== null) {
    sections.push({ insertAt: m.index + m[0].length });
  }
  if (sections.length === 0) return htmlBody;

  // Measure how many visible text chars follow each heading before the next heading
  var nextHeadingRe = /<h[23][^>]*>/i;
  for (var i = 0; i < sections.length; i++) {
    var from = sections[i].insertAt;
    var to   = htmlBody.length;
    // Find start of next heading (if any)
    var rest = htmlBody.slice(from);
    var nextH = nextHeadingRe.exec(rest);
    if (nextH) to = from + nextH.index;
    var sectionHtml = htmlBody.slice(from, to);
    sections[i].chars = sectionHtml.replace(/<[^>]+>/g, '').trim().length;
  }

  var mid = Math.floor(sections.length / 2) || 1;

  // From a list of section candidates, pick the one with the most following text
  function bestSection(list) {
    if (!list.length) return null;
    return list.reduce(function(best, s) { return s.chars > best.chars ? s : best; });
  }

  var target1 = src1 ? bestSection(sections.slice(0, mid))  : null;
  var target2 = src2 ? bestSection(sections.slice(mid))     : null;

  // Ensure they don't share the same insertion point
  if (target1 && target2 && target1.insertAt === target2.insertAt) {
    // Fall back to the section with next-most chars in the second half
    var fallbacks = sections.slice(mid).filter(function(s) { return s.insertAt !== target2.insertAt; });
    target2 = fallbacks.length ? bestSection(fallbacks) : null;
  }

  function floatRight(src) {
    return '<img src="' + src + '" alt="" style="float:right;max-width:38%;height:auto;border-radius:6px;margin:8px 0 20px 24px;" loading="lazy">';
  }

  var injections = [];
  if (target1) injections.push({ at: target1.insertAt, html: floatRight(src1) });
  if (target2) injections.push({ at: target2.insertAt, html: floatRight(src2) });
  injections.sort(function(a, b) { return b.at - a.at; });

  var result = htmlBody;
  injections.forEach(function(inj) {
    result = result.slice(0, inj.at) + inj.html + result.slice(inj.at);
  });
  return result;
}
function normalizeMarkdown(md) {
  if (!md) return '';
  return md
    .replace(/([^\n])\s*(#{1,4})\s+\*\*([^*]+)\*\*/g, '$1\n\n$2 $3\n\n')
    .replace(/([^\n])\s*(#{1,4})\s+([A-Z][^\n#]{3,60})(?=\s+[A-Z])/g, '$1\n\n$2 $3\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncateExcerpt(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen).replace(/\s+\S*$/, '') + '\u2026';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return dateStr; }
}

// ─── Meta Generators ─────────────────────────────────────────────────────────

function buildPostMeta({ title, excerpt, slug, imgSrc, domain, schemaJson, siteName }) {
  return `<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://app.leadconnectorhq.com">
<link rel="dns-prefetch" href="//www.google-analytics.com">
<link rel="dns-prefetch" href="//www.googletagmanager.com">
<link rel="dns-prefetch" href="//fonts.googleapis.com">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${excerpt}">
<meta name="robots" content="index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large">
<link rel="canonical" href="https://${domain}/blog/${slug}/">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${excerpt}">
<meta property="og:url" content="https://${domain}/blog/${slug}/">
${imgSrc ? `<meta property="og:image" content="https://${domain}${imgSrc}">
<meta property="og:image:alt" content="${title}">` : ''}
<meta property="og:site_name" content="${siteName}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${excerpt}">
${imgSrc ? `<meta name="twitter:image" content="https://${domain}${imgSrc}">` : ''}
<script type="application/ld+json">${schemaJson}</script>`;
}

function buildIndexMeta({ page, totalPages, domain, siteName }) {
  const isFirstPage  = page === 1;
  const canonical    = isFirstPage ? `https://${domain}/blog/` : `https://${domain}/blog/page/${page}/`;
  const prevLink     = page > 1 ? (page === 2 ? '/blog/' : `/blog/page/${page - 1}/`) : null;
  const nextLink     = page < totalPages ? `/blog/page/${page + 1}/` : null;
  const indexTitle   = isFirstPage ? `Blog | ${siteName}` : `Blog - Page ${page} | ${siteName}`;
  const description  = `Tips, guides, and expert advice from the ${siteName} team.`;
  return `<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preconnect" href="https://app.leadconnectorhq.com">
<link rel="dns-prefetch" href="//www.google-analytics.com">
<link rel="dns-prefetch" href="//www.googletagmanager.com">
<link rel="dns-prefetch" href="//fonts.googleapis.com">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${indexTitle}</title>
<meta name="description" content="${description}">
<meta name="robots" content="index, follow, max-snippet:-1, max-video-preview:-1, max-image-preview:large">
<link rel="canonical" href="${canonical}">
${prevLink ? `<link rel="prev" href="https://${domain}${prevLink}">` : ''}
${nextLink ? `<link rel="next" href="https://${domain}${nextLink}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${indexTitle}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${siteName}">
<meta property="og:image" content="https://${domain}/images/og-default.jpg">
<meta property="og:image:alt" content="${siteName} Blog">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${indexTitle}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="https://${domain}/images/og-default.jpg">`;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

function buildPaginationLinks(page, totalPages, primaryColor = '#efa92c') {
  if (totalPages <= 1) return '';
  const links = [];
  if (page > 1) {
    const prev = page === 2 ? '/blog/' : `/blog/page/${page - 1}/`;
    links.push(`<a href="${prev}" style="padding:8px 16px;border:1px solid #ddd;border-radius:4px;color:${primaryColor};text-decoration:none;">&larr; Prev</a>`);
  }
  const range = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      range.push(i);
    } else if (range[range.length - 1] !== '...') {
      range.push('...');
    }
  }
  for (const p of range) {
    if (p === '...') {
      links.push(`<span style="padding:8px 4px;color:#aaa;">...</span>`);
    } else {
      const href = p === 1 ? '/blog/' : `/blog/page/${p}/`;
      const isCurrent = p === page;
      links.push(`<a href="${href}" style="padding:8px 14px;border:1px solid ${isCurrent ? primaryColor : '#ddd'};border-radius:4px;background:${isCurrent ? primaryColor : 'transparent'};color:${isCurrent ? '#fff' : 'inherit'};text-decoration:none;">${p}</a>`);
    }
  }
  if (page < totalPages) {
    links.push(`<a href="/blog/page/${page + 1}/" style="padding:8px 16px;border:1px solid #ddd;border-radius:4px;color:${primaryColor};text-decoration:none;">Next &rarr;</a>`);
  }
  return `<nav class="kg-pagination" aria-label="Blog pagination" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:center;margin-top:40px;padding-top:32px;border-top:1px solid #eee;">
    ${links.join('\n    ')}
  </nav>`;
}

// ─── Template-Based Rendering ─────────────────────────────────────────────────

/**
 * Render a single post using _partials/blog-post.html.
 *
 * Tokens available in template:
 *   {{page_meta}}           — <head> meta block (title, canonical, OG, schema)
 *   {{base_head}}           — site's shared _partials/head.html
 *   {{header}}              — site header partial
 *   {{footer}}              — site footer partial
 *   {{title}}               — HTML-escaped post title
 *   {{featured_image_html}} — <img> tag or empty string
 *   {{date_html}}           — date <span> or empty string
 *   {{author_html}}         — author <span> or empty string
 *   {{content}}             — rendered HTML body
 *   {{slug}}                — post slug
 */
function renderPostFromTemplate(tpl, { post, htmlBody, header, footer, baseHead, domain, siteName }) {
  const title   = escapeHtml(post.title || '');
  const excerpt = escapeHtml(post.excerpt || '');
  const slug    = post.slug || '';
  const date    = formatDate(post.publishDate);
  const author  = escapeHtml(post.author || '');
  const imgSrc  = normImg(post.featuredImage);

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline:      post.title || '',
    description:   post.excerpt || '',
    datePublished: post.publishDate || '',
    dateModified:  post.publishDate || '',
    author: { '@type': 'Organization', name: post.author || '' },
    url: `https://${domain}/blog/${slug}/`,
    ...(imgSrc ? { image: `https://${domain}${imgSrc}` } : {})
  });

  return applyTemplate(tpl, {
    page_meta:            buildPostMeta({ title, excerpt, slug, imgSrc, domain, schemaJson, siteName }),
    base_head:            baseHead,
    header,
    footer,
    title,
    featured_image_html:  imgSrc ? `<img class="kg-post-hero" src="${imgSrc}" alt="${title}" title="${title}" loading="eager">` : '',
    date_html:            date   ? `<span><i class="far fa-calendar-alt"></i> ${date}</span>` : '',
    author_html:          author ? `<span><i class="far fa-user"></i> ${author}</span>` : '',
    content:              htmlBody,
    slug,
  });
}

/**
 * Render a paginated blog index page using _partials/blog-index.html.
 *
 * Tokens available in template:
 *   {{page_meta}}       — <head> meta block
 *   {{base_head}}       — site's shared head partial
 *   {{header}}          — site header partial
 *   {{footer}}          — site footer partial
 *   {{page_title}}      — "Blog" or "Blog — Page N"
 *   {{posts_html}}      — generated post card HTML
 *   {{pagination_html}} — pagination nav HTML
 */
function renderBlogIndexFromTemplate(tpl, { posts, page, totalPages, header, footer, baseHead, domain, siteName, primaryColor = '#efa92c' }) {
  const isFirstPage = page === 1;
  // Detect gallery mode: template has <!-- KG_GALLERY_CARDS --> marker OR a Bootstrap section/row wrapping {{posts_html}}
  const usesGrid = tpl && (tpl.includes('<!-- KG_GALLERY_CARDS -->') || tpl.includes('kg-card-grid') || tpl.includes('kg-blog-card-new'));
  const postCards = posts.map(post => {
    const imgSrc = normImg(post.featuredImage);
    const dateHtml = post.publishDate ? `<div class="kg-card-date">${formatDate(post.publishDate)}</div>` : '';
    const thumbHtml = imgSrc
      ? `<img src="${imgSrc}" alt="${escapeHtml(post.title)}" title="${escapeHtml(post.title)}" loading="lazy">`
      : `<div class="kg-thumb-placeholder"><i class="fas fa-tractor"></i></div>`;
    if (usesGrid) {
      // Bootstrap col-wrapped gallery card
      return `
    <div class="col-lg-4 col-md-6 mb-30">
      <div class="kg-blog-card-new">
        <a href="/blog/${post.slug}/" class="kg-card-thumb">${thumbHtml}</a>
        <div class="kg-card-body-new">
          ${dateHtml}
          <h2 class="kg-card-title"><a href="/blog/${post.slug}/">${escapeHtml(post.title)}</a></h2>
          <p class="kg-card-excerpt">${escapeHtml(post.excerpt || '')}</p>
          <a href="/blog/${post.slug}/" class="kg-card-readmore">Read More <i class="fas fa-arrow-right"></i></a>
        </div>
      </div>
    </div>`;
    }
    // Legacy list-style card (fallback for templates without gallery marker)
    return `
    <div class="kg-blog-card" style="display:flex;gap:20px;padding:24px 0;border-bottom:1px solid #eee;align-items:flex-start;">
      ${imgSrc ? `<a href="/blog/${post.slug}/" style="flex-shrink:0;"><img src="${imgSrc}" alt="${escapeHtml(post.title)}" title="${escapeHtml(post.title)}" style="width:180px;height:120px;object-fit:cover;border-radius:4px;"></a>` : ''}
      <div class="kg-blog-card-body" style="flex:1;min-width:0;">
        <h2 style="font-size:1.2rem;margin:0 0 8px;"><a href="/blog/${post.slug}/" style="color:inherit;text-decoration:none;">${escapeHtml(post.title)}</a></h2>
        ${post.publishDate ? `<div style="font-size:0.83rem;color:#888;margin-bottom:10px;">${formatDate(post.publishDate)}</div>` : ''}
        <p style="margin:0 0 12px;color:#555;font-size:0.95rem;line-height:1.5;">${escapeHtml(post.excerpt || '')}</p>
        <a href="/blog/${post.slug}/" style="font-size:0.9rem;font-weight:600;color:var(--link-color,var(--kg-primary,${primaryColor}));">Read more &rarr;</a>
      </div>
    </div>`;
  }).join('');

  return applyTemplate(tpl, {
    page_meta:       buildIndexMeta({ page, totalPages, domain, siteName }),
    base_head:       baseHead,
    header,
    footer,
    page_title:      isFirstPage ? 'Blog' : `Blog — Page ${page}`,
    posts_html:      postCards,
    pagination_html: buildPaginationLinks(page, totalPages, primaryColor),
  });
}

/**
 * Render homepage featured cards using _partials/blog-featured.html.
 * Template is rendered once per post, then concatenated.
 *
 * Tokens available in template:
 *   {{url}}         — post URL (/blog/slug/)
 *   {{image}}       — image src path
 *   {{title}}       — HTML-escaped post title
 *   {{day}}         — date day padded (e.g. "05")
 *   {{month_year}}  — e.g. "Mar/26"
 *   {{excerpt_html}} — <p>excerpt</p> or empty string
 */
function renderFeaturedCardsFromTemplate(tpl, recentPosts) {
  function dateBadge(dateStr) {
    if (!dateStr) return { day: '', monthYear: '' };
    const d = new Date(dateStr);
    if (isNaN(d)) return { day: '', monthYear: '' };
    return {
      day:       String(d.getUTCDate()).padStart(2, '0'),
      monthYear: `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}/${String(d.getUTCFullYear()).slice(-2)}`
    };
  }

  return recentPosts.map(post => {
    const imgSrc  = normImg(post.featuredImage) || '/images/water-damage-restoration-pro.jpg';
    const { day, monthYear } = dateBadge(post.publishDate);
    const excerpt = escapeHtml(truncateExcerpt(post.excerpt || '', 140));
    const title   = escapeHtml(post.title || '');
    const url     = `/blog/${post.slug}/`;
    return applyTemplate(tpl, {
      url,
      image:        imgSrc,
      title,
      day,
      month_year:   monthYear,
      excerpt_html: excerpt ? `<p>${excerpt}</p>` : '',
    });
  }).join('\n');
}

// ─── Inline Rendering (fallback when no templates) ───────────────────────────

function renderPost({ post, htmlBody, header, footer, baseHead, domain = 'goodtobeclean.com' }) {
  const title   = escapeHtml(post.title || '');
  const excerpt = escapeHtml(post.excerpt || '');
  const slug    = post.slug || '';
  const date    = formatDate(post.publishDate);
  const author  = escapeHtml(post.author || '');
  const imgSrc  = normImg(post.featuredImage);

  const schemaJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline:      post.title || '',
    description:   post.excerpt || '',
    datePublished: post.publishDate || '',
    dateModified:  post.publishDate || '',
    author: { '@type': 'Organization', name: post.author || '' },
    url: `https://${domain}/blog/${slug}/`,
    ...(imgSrc ? { image: `https://${domain}${imgSrc}` } : {})
  });

  const pageMeta = buildPostMeta({ title, excerpt, slug, imgSrc, domain, schemaJson });

  return `<!DOCTYPE html>
<html lang="en-US" prefix="og: https://ogp.me/ns#">
<head>
${pageMeta}
${baseHead}
<style>
.kg-blog-layout { max-width: 1140px; margin: 0 auto; padding: 40px 20px; }
.kg-blog-content { min-width: 0; }
.kg-post-hero { width: 100%; max-height: 440px; object-fit: cover; border-radius: 6px; margin-bottom: 28px; }
.kg-post-meta { font-size: 0.88rem; color: #888; margin-bottom: 24px; display: flex; gap: 16px; flex-wrap: wrap; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 16px; }
.kg-post-meta span { display: flex; align-items: center; gap: 6px; }
.kg-post-body { color: #333; font-size: 16px; line-height: 1.8; }
.kg-post-body h1 { color: #1a237e; font-size: 30px; font-weight: 700; margin: 32px 0 14px; }
.kg-post-body h2 { color: #1a237e; font-size: 22px; font-weight: 700; margin: 32px 0 14px; padding-top: 12px; border-top: 2px solid #f0f0f0; }
.kg-post-body h2:first-child { border-top: none; padding-top: 0; margin-top: 0; }
.kg-post-body h3 { color: #1a237e; font-size: 18px; font-weight: 700; margin: 24px 0 10px; }
.kg-post-body p { margin: 0 0 18px; }
.kg-post-body ul, .kg-post-body ol { margin: 0 0 18px 24px; }
.kg-post-body li { margin-bottom: 8px; line-height: 1.7; }
.kg-post-body p > img { float: right; max-width: 42%; height: auto; border-radius: 6px; margin: 4px 0 24px 32px; }
.kg-post-body h2, .kg-post-body h3 { clear: both; }
@media (max-width: 600px) { .kg-post-body p > img { float: none; max-width: 100%; margin: 16px 0; display: block; } }
.kg-post-body a { color: #d32f2f; }
.kg-post-body strong { color: #222; }
.kg-post-body blockquote { border-left: 4px solid #d32f2f; background: #fdf5f5; padding: 16px 20px; margin: 24px 0; color: #444; }
.kg-post-body hr { border: none; border-top: 1px dashed #ddd; margin: 28px 0; }
.kg-cta-box { background: #1a237e; color: #fff; border-radius: 6px; padding: 28px 32px; margin-top: 40px; }
.kg-cta-box h4 { margin: 0 0 10px; font-size: 20px; color: #fff; }
.kg-cta-box p { margin: 0; font-size: 15px; line-height: 1.6; color: #e8eaf6; }
.kg-cta-box a { color: #ffcc80; font-weight: 700; }
.kg-post-back { margin-top: 32px; padding-top: 20px; border-top: 1px solid #eee; }
/* FAQ inside blog post — padding must match main site FAQ (24px horizontal) */
.kg-post-body .faq-section { margin-top: 48px; }
.kg-post-body .faq-section h2 { padding: 24px 24px 16px; }
.kg-post-body .faq-item { border-bottom: 1px solid #e0e0e0; padding: 4px 0; }
.kg-post-body .faq-question { width: 100%; background: none; border: none; text-align: left; padding: 14px 24px; font-size: 1rem; font-weight: 600; color: #1a237e; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.kg-post-body .faq-question::after { content: '+'; font-size: 1.4rem; font-weight: 400; color: #d32f2f; flex-shrink: 0; transition: transform 0.2s; }
.kg-post-body .faq-item.open .faq-question::after { transform: rotate(45deg); }
.kg-post-body .faq-answer { padding: 0 24px 16px; color: #555; line-height: 1.75; }
</style>
</head>
<body class="single single-post wp-theme-bixol group-blog redux-page site-h4 body-default-font heading-default-font header-sticky elementor-default">
${header}
<div id="pagetitle" class="page-title bg-image">
  <div class="container">
    <div class="page-title-inner">
      <div class="image-overlay"></div>
      <div class="page-title-holder"><h1 class="page-title">${title}</h1></div>
      <ul class="ct-breadcrumb">
        <li><a href="/">Home</a></li>
        <li><a href="/blog/">Blog</a></li>
        <li><span>${title}</span></li>
      </ul>
    </div>
  </div>
</div>
<div id="content" class="site-content">
  <div class="content-inner">
    <div class="container" style="padding-top:10px;padding-bottom:60px;">
      <div class="kg-blog-layout">
        <div class="kg-blog-content">
          ${imgSrc ? `<img class="kg-post-hero" src="${imgSrc}" alt="${title}" title="${title}" loading="eager">` : ''}
          <div class="kg-post-meta">
            ${date   ? `<span><i class="far fa-calendar-alt"></i> ${date}</span>` : ''}
            ${author ? `<span><i class="far fa-user"></i> ${author}</span>` : ''}
          </div>
          <div class="kg-post-body">${htmlBody}</div>
          <div class="kg-cta-box">
            <h4>Need Help?</h4>
            <p>Contact us today — we're here to help.</p>
          </div>
          <div class="kg-post-back">
            <a href="/blog/" style="color:#d32f2f;font-weight:600;">&larr; Back to Blog</a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
${footer}
</body>
</html>`;
}

function renderBlogIndex({ posts, page, totalPages, header, footer, baseHead, domain = 'goodtobeclean.com', siteName = '', primaryColor = '#efa92c' }) {
  const isFirstPage  = page === 1;
  const pageMeta     = buildIndexMeta({ page, totalPages, domain, siteName });

  const postCards = posts.map(post => {
    const imgSrc = normImg(post.featuredImage);
    return `
    <div class="kg-blog-card" style="display:flex;gap:20px;padding:24px 0;border-bottom:1px solid #eee;align-items:flex-start;">
      ${imgSrc ? `<a href="/blog/${post.slug}/" style="flex-shrink:0;"><img src="${imgSrc}" alt="${escapeHtml(post.title)}" title="${escapeHtml(post.title)}" style="width:180px;height:120px;object-fit:cover;border-radius:4px;"></a>` : ''}
      <div class="kg-blog-card-body" style="flex:1;min-width:0;">
        <h2 style="font-size:1.2rem;margin:0 0 8px;"><a href="/blog/${post.slug}/" style="color:inherit;text-decoration:none;">${escapeHtml(post.title)}</a></h2>
        ${post.publishDate ? `<div style="font-size:0.83rem;color:#888;margin-bottom:10px;">${formatDate(post.publishDate)}</div>` : ''}
        <p style="margin:0 0 12px;color:#555;font-size:0.95rem;line-height:1.5;">${escapeHtml(post.excerpt || '')}</p>
        <a href="/blog/${post.slug}/" style="font-size:0.9rem;font-weight:600;color:var(--link-color,var(--kg-primary,#efa92c));">Read more &rarr;</a>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en-US" prefix="og: https://ogp.me/ns#">
<head>
${pageMeta}
${baseHead}
</head>
<body class="page wp-theme-bixol group-blog redux-page site-h4 body-default-font heading-default-font header-sticky elementor-default">
${header}
<div id="pagetitle" class="page-title bg-image">
  <div class="container">
    <div class="page-title-inner">
      <div class="image-overlay"></div>
      <div class="page-title-holder">
        <h1 class="page-title">${isFirstPage ? 'Blog' : `Blog — Page ${page}`}</h1>
      </div>
      <ul class="ct-breadcrumb">
        <li><a href="/">Home</a></li>
        <li><span>Blog</span></li>
      </ul>
    </div>
  </div>
</div>
<div id="content" class="site-content">
  <div class="content-inner">
    <div class="container content-container">
      <div class="row content-row">
        <div id="primary" class="content-area content-full-width col-12">
          <main id="main" class="site-main">
            <div class="entry-content clearfix">
              <div class="kg-blog-index" style="max-width:860px;padding:40px 20px;margin:0 auto;">
                ${postCards}
                ${buildPaginationLinks(page, totalPages, primaryColor)}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  </div>
</div>
${footer}
</body>
</html>`;
}

function injectRecentPosts(recentPosts, distDir, featuredTemplate) {
  const homePath = path.join(distDir, 'index.html');
  if (!fs.existsSync(homePath)) return;
  let html = fs.readFileSync(homePath, 'utf8');
  if (!html.includes('<!-- RECENT_POSTS -->')) return;

  let cards;

  if (featuredTemplate) {
    cards = renderFeaturedCardsFromTemplate(featuredTemplate, recentPosts);
  } else {
    // Fallback: inline card rendering (Bixol carousel card structure)
    function dateBadge(dateStr) {
      if (!dateStr) return { day: '', monthYear: '' };
      const d = new Date(dateStr);
      if (isNaN(d)) return { day: '', monthYear: '' };
      return {
        day:       String(d.getUTCDate()).padStart(2, '0'),
        monthYear: `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}/${String(d.getUTCFullYear()).slice(-2)}`
      };
    }
    cards = recentPosts.map(post => {
      const imgSrc = normImg(post.featuredImage) || '/images/water-damage-restoration-pro.jpg';
      const { day, monthYear } = dateBadge(post.publishDate);
      const excerpt = escapeHtml(truncateExcerpt(post.excerpt || '', 140));
      const title   = escapeHtml(post.title || '');
      const url     = `/blog/${post.slug}/`;
      return `
            <div class="carousel-item">
                <div class="grid-item-inner ">
                    <div class="item--featured image-effect-white">
                        <a href="${url}"><img loading="lazy" decoding="async" class="no-lazyload" src="${imgSrc}" width="370" height="230" alt="${title}" title="${title}" style="width:370px;height:230px;object-fit:cover;"></a>
                        <div class="item--date">
                            <div class="item--date-inner">
                                <span>${day}</span>
                                <span>${monthYear}</span>
                            </div>
                        </div>
                    </div>
                    <div class="item--body">
                        <h3 class="item--title"><a href="${url}">${title}</a></h3>
                        <div class="item--content">${excerpt ? `<p>${excerpt}</p>` : ''}</div>
                        <div class="item--readmore"><a href="${url}"><span>Read more</span><i>+</i></a></div>
                    </div>
                </div>
            </div>`;
    }).join('\n');
  }

  html = html.replace('<!-- RECENT_POSTS -->', cards + '\n');
  fs.writeFileSync(homePath, html, 'utf8');
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

/**
 * @param {object}  opts
 * @param {string}  opts.srcDir       - Site source root (where blog-posts/ lives)
 * @param {string}  opts.distDir      - Build output directory
 * @param {string}  opts.siteId       - Site ID (for logging)
 * @param {number}  [opts.postsPerPage=10]
 * @param {string}  [opts.domain='']  - Site domain for canonical URLs / schema
 * @param {string}  [opts.siteName=''] - Site display name for meta titles
 */
function buildBlog({ srcDir, distDir, siteId, postsPerPage = 10, domain = '', siteName = '', primaryColor = '#efa92c' }) {
  const blogPostsDir = path.join(srcDir, 'blog-posts');
  const indexPath    = path.join(blogPostsDir, 'blog-index.json');

  if (!fs.existsSync(indexPath)) {
    console.log(`[Blog] No blog-index.json found for ${siteId} — skipping.`);
    return;
  }

  const index     = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  const published = (index.posts || [])
    .filter(p => p.status === 'published')
    .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate));

  if (published.length === 0) {
    console.log(`[Blog] No published posts for ${siteId} — skipping.`);
    return;
  }

  // Load site partials
  const partialsDir = path.join(srcDir, '_partials');
  const readPartial = name => {
    const p = path.join(partialsDir, name);
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  };

  const header   = readPartial('blog-header.html') || readPartial('header.html');
  const footer   = readPartial('footer.html');
  const baseHead = readPartial('head.html');

  // Load blog-specific templates (optional — falls back to inline rendering)
  const postTemplate      = readPartial('blog-post.html')     || null;
  const indexTemplate     = readPartial('blog-index.html')    || null;
  const featuredTemplate  = readPartial('blog-featured.html') || null;

  if (postTemplate)     console.log(`[Blog] Using _partials/blog-post.html template`);
  if (indexTemplate)    console.log(`[Blog] Using _partials/blog-index.html template`);
  if (featuredTemplate) console.log(`[Blog] Using _partials/blog-featured.html template`);

  // Copy blog-posts/images/ → dist/blog-posts/images/
  const blogImagesDir     = path.join(blogPostsDir, 'images');
  const distBlogImagesDir = path.join(distDir, 'blog-posts', 'images');
  if (fs.existsSync(blogImagesDir)) {
    fs.mkdirSync(distBlogImagesDir, { recursive: true });
    const imgFiles = fs.readdirSync(blogImagesDir);
    for (const file of imgFiles) {
      fs.copyFileSync(path.join(blogImagesDir, file), path.join(distBlogImagesDir, file));
    }
    console.log(`[Blog] Copied ${imgFiles.length} image(s) to dist/blog-posts/images/`);
  }

  // Render individual posts
  let postCount = 0;
  for (const post of published) {
    const mdPath = path.join(blogPostsDir, `${post.slug}.md`);
    if (!fs.existsSync(mdPath)) continue;

    const raw                   = fs.readFileSync(mdPath, 'utf8');
    const { data: fm, content } = matter(raw);
    const htmlBody              = injectInlineImages(fixFloatImages(marked.parse(normalizeMarkdown(content)).replace(/<hr\s*\/?>/gi, '')), fm);

    const pageHtml = postTemplate
      ? renderPostFromTemplate(postTemplate, { post: fm, htmlBody, header, footer, baseHead, domain, siteName })
      : renderPost({ post: fm, htmlBody, header, footer, baseHead, domain });

    const postDistDir = path.join(distDir, 'blog', post.slug);
    fs.mkdirSync(postDistDir, { recursive: true });
    fs.writeFileSync(path.join(postDistDir, 'index.html'), pageHtml, 'utf8');
    postCount++;
  }

  // Render paginated index pages
  const totalPages = Math.ceil(published.length / postsPerPage);
  for (let page = 1; page <= totalPages; page++) {
    const pagePosts = published.slice((page - 1) * postsPerPage, page * postsPerPage);
    const html = indexTemplate
      ? renderBlogIndexFromTemplate(indexTemplate, { posts: pagePosts, page, totalPages, header, footer, baseHead, domain, siteName, primaryColor })
      : renderBlogIndex({ posts: pagePosts, page, totalPages, header, footer, baseHead, domain, siteName, primaryColor });

    if (page === 1) {
      const blogDir = path.join(distDir, 'blog');
      fs.mkdirSync(blogDir, { recursive: true });
      fs.writeFileSync(path.join(blogDir, 'index.html'), html, 'utf8');
    } else {
      const pageDir = path.join(distDir, 'blog', 'page', String(page));
      fs.mkdirSync(pageDir, { recursive: true });
      fs.writeFileSync(path.join(pageDir, 'index.html'), html, 'utf8');
    }
  }

  // Inject recent posts into homepage
  injectRecentPosts(published.slice(0, 3), distDir, featuredTemplate || null);

  // Regenerate full sitemap via shared gen-sitemap module.
  // Falls back to legacy blog-sitemap injection if gen-sitemap isn't available.
  try {
    const { generateSitemap } = require('./gen-sitemap');
    generateSitemap({ distDir, siteRoot: srcDir, domain });
  } catch (e) {
    // gen-sitemap not available — fall back to legacy injection
    buildBlogSitemap(published, distDir, domain);
  }

  console.log(`[Blog] Built ${postCount} posts, ${totalPages} index page(s) for ${siteId}.`);
}

// ─── Blog Sitemap Generation ──────────────────────────────────────────────────
// Delegates to the shared gen-sitemap module so there's one sitemap per site,
// not a separate blog-sitemap.xml. Falls back to legacy injection if gen-sitemap
// is not available (e.g. old sites that haven't been updated yet).

function buildBlogSitemap(publishedPosts, distDir, domain) {
  if (!domain) return;

  const today = new Date().toISOString().slice(0, 10);

  // Build urlset entries for blog index + all published posts
  const urls = [
    `  <url>\n    <loc>https://${domain}/blog/</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>`
  ];
  for (const post of publishedPosts) {
    const lastmod = post.publishDate ? post.publishDate.slice(0, 10) : today;
    urls.push(`  <url>\n    <loc>https://${domain}/blog/${post.slug}/</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>`);
  }

  // Inject reference into sitemap_index.xml if it exists (legacy — sitemap_index.xml no longer generated for new sites)
  const sitemapIndexPath = path.join(distDir, 'sitemap_index.xml');
  if (fs.existsSync(sitemapIndexPath)) {
    let xml = fs.readFileSync(sitemapIndexPath, 'utf8');
    const blogEntry = `\n\t<sitemap>\n\t\t<loc>https://${domain}/blog-sitemap.xml</loc>\n\t\t<lastmod>${today}</lastmod>\n\t</sitemap>`;
    if (!xml.includes('blog-sitemap.xml')) {
      xml = xml.replace('</sitemapindex>', blogEntry + '\n</sitemapindex>');
      fs.writeFileSync(sitemapIndexPath, xml, 'utf8');
      console.log(`[Blog] Injected blog-sitemap.xml into sitemap_index.xml`);
    } else {
      // Update lastmod on existing entry
      xml = xml.replace(/<sitemap>[\s\S]*?blog-sitemap\.xml[\s\S]*?<\/sitemap>/, `<sitemap>\n\t\t<loc>https://${domain}/blog-sitemap.xml</loc>\n\t\t<lastmod>${today}</lastmod>\n\t</sitemap>`);
      fs.writeFileSync(sitemapIndexPath, xml, 'utf8');
    }
    return;
  }

  // Otherwise inject blog URLs into sitemap.xml (urlset)
  const sitemapPath = path.join(distDir, 'sitemap.xml');
  if (fs.existsSync(sitemapPath)) {
    let xml = fs.readFileSync(sitemapPath, 'utf8');
    if (xml.includes('<urlset') && !xml.includes('<!-- Blog -->')) {
      const blogUrls = '\n  <!-- Blog -->\n' + urls.join('\n');
      xml = xml.replace('</urlset>', blogUrls + '\n</urlset>');
      fs.writeFileSync(sitemapPath, xml, 'utf8');
      console.log(`[Blog] Injected blog URLs into sitemap.xml`);
    }
  }
}

module.exports = { buildBlog };

