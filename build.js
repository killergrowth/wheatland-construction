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
  const cards = reviews.map(r => {
    const text = escHtml(r.text || '');
    return `<div class="review-card">
  <div class="review-stars">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
  <p class="review-text">&#8220;${text}&#8221;</p>
  <div class="review-author">${escHtml(r.author || '')}</div>
  <div class="review-date">${escHtml(r.relativeTime || '')}</div>
</div>`;
  }).join('\n');
  return `<div class="reviews-grid">\n${cards}\n</div>`;
}

function buildRatingLine() {
  if (!reviewData.rating) return '';
  return `<div class="reviews-rating-line"><strong>EXCELLENT</strong> &mdash; Based on <strong>${reviewData.userRatingCount || ''} reviews</strong> &mdash; Posted on Google</div>`;
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
