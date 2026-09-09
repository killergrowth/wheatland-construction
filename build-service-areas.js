'use strict';
/**
 * build-service-areas.js — Wheatland Construction
 * Builds /service-areas/index.html — city hub page listing all cities × services
 * Structure mirrors Keystone Painting's areas-served page, using Wheatland CSS.
 */

const fs   = require('fs');
const path = require('path');

const ROOT   = __dirname;
const DIST   = path.join(ROOT, 'dist');
const PARTS  = path.join(ROOT, '_partials');
const DRAFTS = 'C:\\Users\\KillerGrowth\\.openclaw\\workspace\\tools\\hyperlocal-pipeline\\drafts\\wheatland';

const SERVICE_MAP = [
  { key: 'basement-finishing',   label: 'Basement Finishing',   url: '/basement-finishing/' },
  { key: 'bathroom-remodeling',  label: 'Bathroom Remodeling',  url: '/bathroom-remodeling/' },
  { key: 'custom-home-building', label: 'Custom Home Building', url: '/custom-home-building/' },
  { key: 'home-additions',       label: 'Home Additions',       url: '/home-additions/' },
  { key: 'kitchen-remodeling',   label: 'Kitchen Remodeling',   url: '/kitchen-remodeling/' },
  { key: 'major-remodels',       label: 'Major Remodels',       url: '/major-remodels/' },
  { key: 'roofing',              label: 'Roofing',              url: '/roofing/' }
];

function readFile(p) {
  const buf = fs.readFileSync(p);
  const start = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
  return buf.slice(start).toString('utf8');
}

function slugToName(slug) {
  const parts = slug.split('-');
  const state = parts[parts.length - 1].toUpperCase();
  const city  = parts.slice(0, -1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  return { city, state, display: city + ', ' + state };
}

// Build city -> services map
const cityMap = {};
for (const svc of SERVICE_MAP) {
  const dir = path.join(DRAFTS, svc.key);
  if (!fs.existsSync(dir)) continue;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('-location-page.md'));
  for (const f of files) {
    const citySlug = f.replace('-location-page.md', '');
    if (!cityMap[citySlug]) cityMap[citySlug] = { ...slugToName(citySlug), slug: citySlug, services: [] };
    cityMap[citySlug].services.push({ label: svc.label, pageUrl: svc.url + citySlug + '/' });
  }
}

const cities = Object.values(cityMap).sort((a, b) => a.display.localeCompare(b.display));

// Build city cards HTML
function buildCityCards(cities) {
  return cities.map(c => {
    const serviceLinks = c.services.map(s =>
      `        <li><a href="${s.pageUrl}"><i class="fa-solid fa-angle-right" style="color:#C8922A;font-size:10px;margin-right:6px;"></i>${s.label}</a></li>`
    ).join('\n');

    return `      <div class="area-col">
        <div class="area-card">
          <h3 class="area-card__city">${c.display}</h3>
          <ul class="area-card__services">
${serviceLinks}
          </ul>
          <a href="/service-areas/${c.slug}/" class="area-card__all">View services in ${c.city} &rarr;</a>
        </div>
      </div>`;
  }).join('\n\n');
}

// Build the full hub page
function buildHubPage() {
  const header = readFile(path.join(PARTS, 'header.html'));
  const footer = readFile(path.join(PARTS, 'footer.html'));

  const title   = 'Areas Served | Wheatland Construction | Wichita Metro, KS';
  const metaDesc = 'Wheatland Construction serves homeowners across the Wichita metro area in Butler and Sedgwick County, KS. Select your city to see available services.';
  const canonical = 'https://wheatlandconstruction.com/service-areas/';

  const og = `  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${metaDesc}">
  <meta property="og:image" content="https://wheatlandconstruction.com/images/remodel-home-eldorado-kansas-scaled.jpg">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Wheatland Construction">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${metaDesc}">
  <meta name="twitter:image" content="https://wheatlandconstruction.com/images/remodel-home-eldorado-kansas-scaled.jpg">`;

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": "https://wheatlandconstruction.com/#localbusiness",
    "name": "Wheatland Construction",
    "url": "https://wheatlandconstruction.com",
    "areaServed": cities.map(c => ({ "@type": "City", "name": c.city, "containedInPlace": { "@type": "AdministrativeArea", "name": "Kansas" } }))
  });

  const head = header
    .replace('<!-- TITLE -->', `<title>${title}</title>`)
    .replace('<!-- META_DESC -->', `<meta name="description" content="${metaDesc}">`)
    .replace('<!-- CANONICAL -->', `<link rel="canonical" href="${canonical}">`)
    .replace('<!-- OG_TAGS -->', og)
    .replace('<!-- SCHEMA -->', `<script type="application/ld+json">${schema}</script>`);

  const cityCards = buildCityCards(cities);

  const body = `
<!-- PAGE HERO -->
<section class="page-hero" style="background:linear-gradient(rgba(42,42,42,0.72),rgba(42,42,42,0.72)) center/cover,url('/images/remodel-home-eldorado-kansas-scaled.jpg') center/cover;padding:96px 20px 80px;text-align:center;">
  <div class="container">
    <nav class="page-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>&rsaquo;</span>
      <span>Areas Served</span>
    </nav>
    <h1 style="color:#fff;font-family:'Barlow',sans-serif;font-size:clamp(2rem,5vw,3rem);font-weight:900;margin:0 0 16px;">Areas Served &mdash; Wichita Metro &amp; Surrounding Communities</h1>
  </div>
</section>

<!-- INTRO -->
<section class="section-padding" style="background:#fff;">
  <div class="container" style="max-width:900px;text-align:center;">
    <span class="section-tag">WHERE WE WORK</span>
    <h2 class="section-title">Construction Services Across the Wichita Metro Area</h2>
    <p style="margin:20px auto 0;max-width:700px;color:#555;font-size:1.05rem;line-height:1.8;">Wheatland Construction serves homeowners throughout Butler and Sedgwick County, Kansas. Select your city below to see which services are available in your area.</p>
  </div>
</section>

<!-- CITY GRID -->
<section class="section-padding" style="background:#f8f9fa;">
  <div class="container">
    <div class="areas-grid-wrap">
${cityCards}
    </div>
  </div>
</section>

<!-- CTA -->
<div class="cta-float-wrap">
  <div class="cta-card">
    <h2>Don&rsquo;t See Your City?</h2>
    <p>We may still serve your area. Give us a call or submit a project request and we&rsquo;ll let you know.</p>
    <a href="/project-request/" class="btn btn-cta-dark">Let&rsquo;s Get Started</a>
    <p class="call-line">Or Call: <a href="tel:+13163227898">(316) 322-7898</a></p>
  </div>
</div>

<style>
.areas-grid-wrap { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; }
@media (max-width: 1199px) { .areas-grid-wrap { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 767px) { .areas-grid-wrap { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .areas-grid-wrap { grid-template-columns: 1fr; } }
.area-col { display: flex; }
.area-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 24px;
  flex: 1;
  transition: box-shadow 0.2s;
}
.area-card:hover { box-shadow: 0 4px 18px rgba(0,0,0,0.10); }
.area-card__city { font-size: 1.1rem; font-weight: 800; margin: 0 0 14px; font-family: 'Barlow', sans-serif; }
.area-card__city a { color: #2a2a2a; text-decoration: none; }
.area-card__city a:hover { color: #C8922A; }
.area-card__services { list-style: none; padding: 0; margin: 0 0 16px; }
.area-card__services li { margin-bottom: 4px; }
.area-card__services li a { font-size: 13px; color: #555; text-decoration: none; display: flex; align-items: center; padding: 2px 0; }
.area-card__services li a:hover { color: #C8922A; }
.area-card__all { font-size: 12px; font-weight: 700; color: #C8922A; text-decoration: none; text-transform: uppercase; letter-spacing: 1px; }
.area-card__all:hover { text-decoration: underline; }
</style>
`;

  const html = head + body + footer;

  const outPath = path.join(DIST, 'service-areas', 'index.html');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, html, 'utf8');
  console.log('Built: service-areas/index.html');
  console.log('Cities on page:', cities.length);
}

buildHubPage();
