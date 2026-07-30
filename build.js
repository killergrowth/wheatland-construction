'use strict';
/**
 * build.js — Wheatland Construction
 * Builds static HTML site into ./dist/
 */
const fs   = require('fs');
const path = require('path');

const ROOT   = __dirname;
const DIST   = path.join(ROOT, 'dist');
const PARTS  = path.join(ROOT, '_partials');
const SITE_ID = 'wheatland-construction';
const DOMAIN  = 'wheatlandconstruction.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** BOM-safe UTF-8 read */
function read(p) {
  const buf = fs.readFileSync(p);
  const start = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
  return buf.slice(start).toString('utf8');
}

function write(relPath, content) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('Built: ' + relPath);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const file of fs.readdirSync(src)) {
    const s = path.join(src, file), d = path.join(dest, file);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Partials ────────────────────────────────────────────────────────────────

const header = read(path.join(PARTS, 'header.html'));
const footer = read(path.join(PARTS, 'footer.html'));

// ─── Reviews Data ────────────────────────────────────────────────────────────

const reviewsFile = path.join(ROOT, 'data', 'reviews.json');
const reviewData  = fs.existsSync(reviewsFile)
  ? JSON.parse(read(reviewsFile))
  : { rating: null, userRatingCount: 0, reviews: [] };

function buildReviewCards() {
  const reviews = (reviewData.reviews || []).slice(0, 8);
  if (!reviews.length) return '';
  const avatarColors = ['#c0392b','#2980b9','#27ae60','#8e44ad','#e67e22','#16a085','#d35400','#2c3e50'];
  const cards = reviews.map((r, i) => {
    const fullText = escHtml(r.text || '');
    const truncated = r.text && r.text.length > 160 ? escHtml(r.text.slice(0, 160)) + '...' : fullText;
    const initial = (r.author || '?')[0].toUpperCase();
    const color = avatarColors[i % avatarColors.length];
    // Format date from publishTime
    let dateStr = escHtml(r.relativeTime || '');
    if (r.publishTime) {
      try {
        const d = new Date(r.publishTime);
        dateStr = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      } catch(e) {}
    }
    const hasMore = r.text && r.text.length > 160;
    return `<div class="review-card-new">
  <div class="rc-header">
    <div class="rc-avatar" style="background:${color}">${initial}</div>
    <div class="rc-meta">
      <div class="rc-name">${escHtml(r.author || '')}</div>
      <div class="rc-date">${dateStr}</div>
    </div>
    <div class="rc-google-badge"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.38 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-3.88-13.46-9.41l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg></div>
  </div>
  <div class="rc-stars">&#9733;&#9733;&#9733;&#9733;&#9733; <span class="rc-verified">&#10003;</span></div>
  <p class="rc-text">${truncated}${hasMore ? ` <a href="https://share.google/aUvlrJyK53Mqm1tAy" target="_blank" rel="noopener" class="rc-read-more">Read more</a>` : ''}</p>
</div>`;
  }).join('\n');
  return `<div class="reviews-carousel-wrap">
  <button class="rc-arrow rc-prev" aria-label="Previous" id="rc-prev">&#10094;</button>
  <div class="reviews-carousel" id="reviews-carousel">
    <div class="reviews-track" id="reviews-track">
${cards}
    </div>
  </div>
  <button class="rc-arrow rc-next" aria-label="Next" id="rc-next">&#10095;</button>
</div>`;
}

function buildRatingLine() {
  if (!reviewData.rating) return '';
  const rating = reviewData.rating || 4.5;
  const count = reviewData.userRatingCount || 0;
  // Round to nearest 0.5
  const rounded = Math.round(rating * 2) / 2;
  const fullStars = Math.floor(rounded);
  const halfStar = rounded - fullStars >= 0.5;
  let starsHtml = '';
  for (let i = 0; i < fullStars; i++) starsHtml += '<span class="rs-star rs-full">&#9733;</span>';
  if (halfStar) starsHtml += '<span class="rs-star rs-half">&#9733;</span>'; // half: CSS clips left 50% gold over grey base
  const googleSvg = `<svg width="80" height="26" viewBox="0 0 272 92" xmlns="http://www.w3.org/2000/svg"><path d="M115.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18C71.25 34.32 81.24 25 93.5 25s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44S80.99 39.2 80.99 47.18c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" fill="#EA4335"/><path d="M163.75 47.18c0 12.77-9.99 22.18-22.25 22.18s-22.25-9.41-22.25-22.18c0-12.85 9.99-22.18 22.25-22.18s22.25 9.32 22.25 22.18zm-9.74 0c0-7.98-5.79-13.44-12.51-13.44s-12.51 5.46-12.51 13.44c0 7.9 5.79 13.44 12.51 13.44s12.51-5.55 12.51-13.44z" fill="#FBBC05"/><path d="M209.75 26.34v39.82c0 16.38-9.66 23.07-21.08 23.07-10.75 0-17.22-7.19-19.66-13.07l8.48-3.53c1.51 3.61 5.21 7.87 11.17 7.87 7.31 0 11.84-4.51 11.84-13v-3.19h-.34c-2.18 2.69-6.38 5.04-11.68 5.04-11.09 0-21.25-9.66-21.25-22.09 0-12.52 10.16-22.26 21.25-22.26 5.29 0 9.49 2.35 11.68 4.96h.34v-3.61h9.25zm-8.56 20.92c0-7.81-5.21-13.52-11.84-13.52-6.72 0-12.35 5.71-12.35 13.52 0 7.73 5.63 13.36 12.35 13.36 6.63 0 11.84-5.63 11.84-13.36z" fill="#4285F4"/><path d="M225 3v65h-9.5V3h9.5z" fill="#34A853"/><path d="M262.02 54.48l7.56 5.04c-2.44 3.61-8.32 9.83-18.48 9.83-12.6 0-22.01-9.74-22.01-22.18 0-13.19 9.49-22.18 20.92-22.18 11.51 0 17.14 9.16 18.98 14.11l1.01 2.52-29.65 12.28c2.27 4.45 5.8 6.72 10.75 6.72 4.96 0 8.4-2.44 10.92-6.14zm-23.27-7.98l19.82-8.23c-1.09-2.77-4.37-4.7-8.23-4.7-4.95 0-11.84 4.37-11.59 12.93z" fill="#EA4335"/><path d="M35.29 41.41V32h31.86c.31 1.64.47 3.58.47 5.68 0 7.06-1.93 15.79-8.15 22.01-6.05 6.3-13.78 9.66-24.02 9.66C16.32 69.35.36 53.89.36 35.29.36 16.69 16.32 1.23 35.43 1.23c10.5 0 17.98 4.12 23.6 9.49l-6.64 6.64c-4.03-3.78-9.49-6.72-16.97-6.72-13.86 0-24.7 11.17-24.7 25.03 0 13.86 10.84 25.03 24.7 25.03 8.99 0 14.11-3.61 17.39-6.89 2.66-2.66 4.41-6.46 5.1-11.65H35.29z" fill="#4285F4"/></svg>`;
  return `<div class="reviews-summary-block">
  <div class="rsb-excellent">EXCELLENT</div>
  <div class="rsb-stars">${starsHtml}</div>
  <div class="rsb-count">Based on <strong>${count} reviews</strong></div>
  <div class="rsb-google">${googleSvg}</div>
</div>`;
}

// ─── Blog: 3 most recent posts for homepage ───────────────────────────────────

function buildBlogCards3() {
  const indexPath = path.join(ROOT, 'blog-posts', 'blog-index.json');
  if (!fs.existsSync(indexPath)) return '';
  const idx = JSON.parse(read(indexPath));
  const posts = (idx.posts || [])
    .filter(p => p.status === 'published')
    .sort((a, b) => new Date(b.publishDate) - new Date(a.publishDate))
    .slice(0, 3);
  return posts.map(p => {
    const img  = p.featuredImage ? (p.featuredImage.startsWith('/') ? p.featuredImage : '/' + p.featuredImage) : '/images/customhome-hero.jpg';
    const date = p.publishDate ? new Date(p.publishDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
    return `<div class="blog-card">
  <a href="/blog/${p.slug}/"><img src="${img}" alt="${escHtml(p.title)}" loading="lazy"></a>
  <div class="blog-card-body">
    <div class="post-date">${date}</div>
    <h3><a href="/blog/${p.slug}/">${escHtml(p.title)}</a></h3>
    <p>${escHtml(p.excerpt || '')}</p>
    <a href="/blog/${p.slug}/" class="read-more">Read More &rsaquo;</a>
  </div>
</div>`;
  }).join('\n');
}

// ─── Page Builder ─────────────────────────────────────────────────────────────

function buildPage(opts) {
  const { title, metaDesc, canonical, ogImage, schema, content } = opts;

  const og = `  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(metaDesc || '')}">
  <meta property="og:image" content="${ogImage || 'https://' + DOMAIN + '/images/customhome-hero.jpg'}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Wheatland Construction">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(metaDesc || '')}">
  <meta name="twitter:image" content="${ogImage || 'https://' + DOMAIN + '/images/customhome-hero.jpg'}">`;

  const schemaTag = schema ? `  <script type="application/ld+json">${schema}</script>` : '';

  let head = header
    .replace('<!-- TITLE -->', `<title>${escHtml(title)}</title>`)
    .replace('<!-- META_DESC -->', `<meta name="description" content="${escHtml(metaDesc || '')}">`)
    .replace('<!-- CANONICAL -->', `<link rel="canonical" href="${canonical}">`)
    .replace('<!-- OG_TAGS -->', og)
    .replace('<!-- SCHEMA -->', schemaTag);

  let body = content
    .replace('<!-- REVIEWS_RATING -->', buildRatingLine())
    .replace('<!-- REVIEWS_CARDS -->', buildReviewCards())
    .replace('<!-- BLOG_POSTS_3 -->', buildBlogCards3());

  return head + '\n' + body + '\n' + footer;
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const orgSchema = {
  '@context': 'https://schema.org',
  '@type': 'HomeAndConstructionBusiness',
  '@id': 'https://' + DOMAIN + '/#organization',
  name: 'Wheatland Construction',
  url: 'https://' + DOMAIN,
  telephone: '(316) 322-7898',
  email: 'contact@wheatlandconstruction.com',
  foundingDate: '2018',
  description: 'Family-owned construction company in El Dorado, KS specializing in custom homes, additions, major remodels, and roofing across Butler and Sedgwick counties.',
  address: [
    { '@type': 'PostalAddress', streetAddress: '838 SW Purity Springs Rd Suite C', addressLocality: 'El Dorado', addressRegion: 'KS', postalCode: '67042', addressCountry: 'US' },
    { '@type': 'PostalAddress', streetAddress: '4904 East Central', addressLocality: 'Wichita', addressRegion: 'KS', postalCode: '67208', addressCountry: 'US' }
  ],
  areaServed: ['Butler County KS', 'Sedgwick County KS', 'Greenwood County KS', 'El Dorado KS', 'Wichita KS'],
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday','Tuesday','Wednesday','Thursday','Friday'],
    opens: '08:00', closes: '17:00'
  },
  sameAs: [
    'https://www.facebook.com/wheatlandconst',
    'https://www.instagram.com/wheatland_construction/'
  ]
};
if (reviewData.rating) {
  orgSchema.aggregateRating = {
    '@type': 'AggregateRating',
    ratingValue: reviewData.rating,
    reviewCount: reviewData.userRatingCount,
    bestRating: 5,
    worstRating: 1
  };
}

function breadcrumbSchema(name, url) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://' + DOMAIN + '/' },
      { '@type': 'ListItem', position: 2, name, item: url }
    ]
  });
}

// ─── Build Pages ──────────────────────────────────────────────────────────────

// Homepage
write('index.html', buildPage({
  title:    'Wheatland Construction | Custom Homes, Additions & Remodels | El Dorado, KS',
  metaDesc: 'Family-owned construction in Butler & Sedgwick County, KS. Custom homes, additions, major remodels & roofing. Veterans Approved Builder. Call (316) 322-7898.',
  canonical: 'https://' + DOMAIN + '/',
  ogImage:  'https://' + DOMAIN + '/images/customhome-hero.jpg',
  schema:   JSON.stringify(orgSchema),
  content:  read(path.join(ROOT, 'index.html'))
}));

// Custom Homes
write('custom-homes/index.html', buildPage({
  title:    'Custom Home Builder in El Dorado & Wichita, KS | Wheatland Construction',
  metaDesc: 'Wheatland Construction builds custom homes in Butler & Sedgwick County, KS. Veterans Approved Builder. From first sketch to final walk-through. Call (316) 322-7898.',
  canonical: 'https://' + DOMAIN + '/custom-homes/',
  ogImage:  'https://' + DOMAIN + '/images/customhome-hero.jpg',
  schema:   breadcrumbSchema('Custom Homes', 'https://' + DOMAIN + '/custom-homes/'),
  content:  read(path.join(ROOT, 'custom-homes.html'))
}));

// Additions
write('additions/index.html', buildPage({
  title:    'Home Additions in El Dorado & Wichita, KS | Wheatland Construction',
  metaDesc: 'Expand your home with a quality addition from Wheatland Construction. Serving Butler & Sedgwick County, KS. Call (316) 322-7898 for a consultation.',
  canonical: 'https://' + DOMAIN + '/additions/',
  ogImage:  'https://' + DOMAIN + '/images/addition.jpg',
  schema:   breadcrumbSchema('Additions', 'https://' + DOMAIN + '/additions/'),
  content:  read(path.join(ROOT, 'additions.html'))
}));

// Major Remodels
write('major-remodels/index.html', buildPage({
  title:    'Major Home Remodels in El Dorado & Wichita, KS | Wheatland Construction',
  metaDesc: 'Transform your home with a major remodel from Wheatland Construction. Serving Butler & Sedgwick County, KS. Starting at $50,000. Call (316) 322-7898.',
  canonical: 'https://' + DOMAIN + '/major-remodels/',
  ogImage:  'https://' + DOMAIN + '/images/major-remodel-hero.jpg',
  schema:   breadcrumbSchema('Major Remodels', 'https://' + DOMAIN + '/major-remodels/'),
  content:  read(path.join(ROOT, 'major-remodels.html'))
}));

// Roofing
write('roofing/index.html', buildPage({
  title:    'Roofing Contractor in El Dorado & Wichita, KS | Wheatland Construction',
  metaDesc: 'Licensed roofing contractor serving Butler & Sedgwick County, KS. Free roof inspections, guttering, and complete replacements. Call (316) 322-7898.',
  canonical: 'https://' + DOMAIN + '/roofing/',
  ogImage:  'https://' + DOMAIN + '/images/standing-seam-roof.jpg',
  schema:   breadcrumbSchema('Roofing', 'https://' + DOMAIN + '/roofing/'),
  content:  read(path.join(ROOT, 'roofing.html'))
}));

// Contact
write('contact/index.html', buildPage({
  title:    'Contact Wheatland Construction | El Dorado & Wichita, KS',
  metaDesc: 'Contact Wheatland Construction in El Dorado & Wichita, KS. Call (316) 322-7898 or email contact@wheatlandconstruction.com. Serving Butler & Sedgwick counties.',
  canonical: 'https://' + DOMAIN + '/contact/',
  schema:   breadcrumbSchema('Contact', 'https://' + DOMAIN + '/contact/'),
  content:  read(path.join(ROOT, 'contact.html'))
}));

// Project Request
write('project-request/index.html', buildPage({
  title:    'Project Request | Start Your Project with Wheatland Construction',
  metaDesc: 'Ready to start your custom home, addition, remodel or roofing project? Submit a project request to Wheatland Construction in El Dorado, KS. Call (316) 322-7898.',
  canonical: 'https://' + DOMAIN + '/project-request/',
  schema:   breadcrumbSchema('Project Request', 'https://' + DOMAIN + '/project-request/'),
  content:  read(path.join(ROOT, 'project-request.html'))
}));

// ─── Copy Assets ─────────────────────────────────────────────────────────────

copyDir(path.join(ROOT, 'images'),     path.join(DIST, 'images'));
copyDir(path.join(ROOT, 'css'),        path.join(DIST, 'css'));
copyDir(path.join(ROOT, 'js'),         path.join(DIST, 'js'));
copyDir(path.join(ROOT, 'functions'),  path.join(DIST, 'functions'));
console.log('Assets copied.');

// ─── Blog Build ───────────────────────────────────────────────────────────────

const { buildBlog } = require('../../tools/kg-site-builder/lib/blog-build');
buildBlog({
  srcDir:    ROOT,
  distDir:   DIST,
  siteId:    SITE_ID,
  domain:    DOMAIN,
  siteName:  'Wheatland Construction'
});

// ─── Sitemap ──────────────────────────────────────────────────────────────────

try {
  const genSitemap = require('../../tools/kg-site-builder/lib/gen-sitemap');
  genSitemap({ srcDir: ROOT, distDir: DIST, domain: DOMAIN });
} catch (e) {
  console.log('[Sitemap] Skipped:', e.message);
}

console.log('\n✓ Build complete → dist/');
