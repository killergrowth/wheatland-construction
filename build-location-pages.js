'use strict';
/**
 * build-location-pages.js — Wheatland Construction
 * Converts AI-generated location page markdown drafts → static HTML in dist/
 *
 * Run standalone:   node build-location-pages.js
 * Or require from build.js:  require('./build-location-pages')(opts)
 *
 * Expects draft files at:
 *   DRAFTS_BASE/<service-key>/<city-slug>-location-page.md
 *
 * Outputs to:
 *   dist/<service-url-prefix>/<city-slug>/index.html
 */

const fs   = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT       = __dirname;
const DIST       = path.join(ROOT, 'dist');
const PARTS      = path.join(ROOT, '_partials');
const DRAFTS_BASE = 'C:\\Users\\KillerGrowth\\.openclaw\\workspace\\tools\\hyperlocal-pipeline\\drafts\\wheatland';
const DOMAIN     = 'wheatlandconstruction.com';

const SERVICE_MAP = {
  'custom-home-building':  { urlPrefix: 'custom-home-building',  parentLabel: 'Custom Homes',        parentUrl: '/custom-homes/',    heroImg: '/images/customhome-hero.jpg',  tag: 'CUSTOM HOME BUILDING' },
  'home-additions':        { urlPrefix: 'home-additions',        parentLabel: 'Home Additions',      parentUrl: '/additions/',       heroImg: '/images/addition.jpg',         tag: 'HOME ADDITIONS' },
  'major-remodels':        { urlPrefix: 'major-remodels',        parentLabel: 'Major Remodels',      parentUrl: '/major-remodels/',  heroImg: '/images/major-remodel-hero.jpg', tag: 'MAJOR REMODELS' },
  'bathroom-remodeling':   { urlPrefix: 'bathroom-remodeling',   parentLabel: 'Bathroom Remodeling', parentUrl: '/major-remodels/',  heroImg: '/images/remodel.jpg',          tag: 'BATHROOM REMODELING' },
  'kitchen-remodeling':    { urlPrefix: 'kitchen-remodeling',    parentLabel: 'Kitchen Remodeling',  parentUrl: '/major-remodels/',  heroImg: '/images/remodel-1.jpg',        tag: 'KITCHEN REMODELING' },
  'basement-finishing':    { urlPrefix: 'basement-finishing',    parentLabel: 'Basement Finishing',  parentUrl: '/major-remodels/',  heroImg: '/images/remodel-home-eldorado-kansas-scaled.jpg', tag: 'BASEMENT FINISHING' },
  'roofing':               { urlPrefix: 'roofing',               parentLabel: 'Roofing',             parentUrl: '/roofing/',         heroImg: '/images/standing-seam-roof.jpg', tag: 'ROOFING' }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFile(p) {
  const buf = fs.readFileSync(p);
  const start = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
  return buf.slice(start).toString('utf8');
}

function writeOut(relPath, content) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('  Built: ' + relPath);
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Markdown → HTML converter (minimal, for this use case) ──────────────────

function mdToHtml(md, city) {
  let out = md;
  const cityName = city || '';

  // Schema block — strip (handled separately)
  out = out.replace(/```json[\s\S]*?```/g, '');

  // --- separator lines
  out = out.replace(/^---\s*$/gm, '');

  // ### H3 — also fix truncated H3s ending with "in " (city name missing in draft)
  out = out.replace(/^### (.+?)\s*$/gm, (match, text) => {
    // If heading ends with incomplete city reference like "in " or "in  " fix it
    const fixed = cityName ? text.replace(/\bin\s*$/, `in ${cityName}, KS`) : text;
    return `<h3>${fixed}</h3>`;
  });
  // ## H2
  out = out.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  // # H1
  out = out.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold **text**
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code `code`
  out = out.replace(/`(.+?)`/g, '<code>$1</code>');

  // Convert markdown-style dash lists to <ul><li> before paragraph splitting
  out = out.replace(/((?:^- .+\n?)+)/gm, (block) => {
    const items = block.trim().split('\n').filter(l => l.startsWith('- '));
    return '<ul>\n' + items.map(l => `  <li>${l.slice(2).trim()}</li>`).join('\n') + '\n</ul>\n';
  });

  // Split on double newlines → paragraphs
  const blocks = out.split(/\n{2,}/);
  const htmlBlocks = blocks.map(block => {
    block = block.trim();
    if (!block) return '';
    // Already a block-level element
    if (/^<(h[1-6]|ul|ol|li|div|section|blockquote|pre|table|script|style|figure)/.test(block)) return block;
    // Testimonial placeholder — preserve as-is
    if (block.includes('<!-- TESTIMONIAL_BLOCK -->')) return block;
    // Single line with just a heading tag
    if (/^<h[1-6]>/.test(block) && !block.includes('\n')) return block;
    // Multi-line block that starts with heading — split it
    const lines = block.split('\n');
    const result = [];
    let para = [];
    for (const line of lines) {
      if (/^<h[1-6]>/.test(line.trim())) {
        if (para.length) { result.push('<p>' + para.join(' ') + '</p>'); para = []; }
        result.push(line.trim());
      } else if (line.trim()) {
        para.push(line.trim());
      } else {
        if (para.length) { result.push('<p>' + para.join(' ') + '</p>'); para = []; }
      }
    }
    if (para.length) result.push('<p>' + para.join(' ') + '</p>');
    return result.join('\n');
  });

  return htmlBlocks.filter(Boolean).join('\n\n');
}

// ─── Parse frontmatter ────────────────────────────────────────────────────────

function parseFrontmatter(text) {
  // Two frontmatter blocks: first is YAML metadata, second is page config
  // Format: ---\nYAML\n---\n\n---\nTITLE TAG: ...\nMETA DESCRIPTION: ...\nURL: ...\n---
  const meta = {};

  // Extract YAML frontmatter (first block)
  const yamlMatch = text.match(/^---\n([\s\S]+?)\n---/);
  if (yamlMatch) {
    for (const line of yamlMatch[1].split('\n')) {
      const m = line.match(/^(\w[\w_-]*):\s*(.+)/);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
    }
  }

  // Extract page config block (second --- block, may have different YAML block first)
  const configMatch = text.match(/TITLE TAG:(.+)\nMETA DESCRIPTION:(.+)(?:\nURL:(.+))?/);
  if (configMatch) {
    meta.titleTag   = configMatch[1].trim();
    meta.metaDesc   = configMatch[2].trim();
    meta.url        = configMatch[3] ? configMatch[3].trim() : '';
  }

  return meta;
}

// ─── Extract JSON-LD schema ───────────────────────────────────────────────────

function extractSchema(text) {
  const match = text.match(/```json\n([\s\S]+?)\n```/);
  if (!match) return null;
  // Sanitize corrupted special characters from AI-generated content before parsing:
  // em dashes (–, —), smart quotes, and other non-ASCII that break JSON.parse
  const cleaned = match[1]
    .replace(/\u2013/g, '-')   // en dash → hyphen
    .replace(/\u2014/g, '-')   // em dash → hyphen
    .replace(/\u2018/g, "'")
    .replace(/\u2019/g, "'")
    .replace(/\u201C/g, '"')
    .replace(/\u201D/g, '"')
    .replace(/[\uFFFD\uFFFE\uFFFF]/g, ''); // replacement chars
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch (e) {
    console.warn('  ⚠️  Schema JSON parse error — skipping schema:', e.message.slice(0, 60));
    return null;
  }
}

// ─── Testimonial block (inline, for drafts that use TESTIMONIAL_BLOCK placeholder) ───

function buildTestimonialBlock() {
  return `<div style="margin:28px 0;padding:24px;background:#fafafa;border-left:4px solid #C8922A;border-radius:4px;">
  <blockquote id="service-review-text" style="font-style:italic;color:#444;font-size:16px;line-height:1.75;margin:0 0 10px;">Loading review&hellip;</blockquote>
  <p id="service-review-author" style="font-size:13px;font-weight:700;color:#888;margin:0;"></p>
</div>`;
}

// ─── Two-column layout CSS ───────────────────────────────────────────────────

function buildLayoutCSS() {
  return `<style>
.kg-service-wrap {
  max-width: 1140px;
  margin: 0 auto;
  padding: 48px 20px;
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 48px;
  align-items: start;
}
@media (max-width: 1024px) {
  .kg-service-wrap { grid-template-columns: 1fr; }
  .kg-service-sidebar { display: none; }
}
.kg-section-title { color: #2a2a2a; font-family: 'Barlow', sans-serif; font-size: 22px; font-weight: 800; margin: 0 0 14px; }
.kg-faq-item { margin-bottom: 24px; }
.kg-faq-item h3 { font-size: 17px; color: #2a2a2a; font-family: 'Barlow', sans-serif; font-weight: 700; margin-bottom: 6px; }
.kg-faq-item p { color: #444; line-height: 1.75; font-size: 15px; margin: 0; }
.kg-sidebar-box { margin-bottom: 24px; border: 1px solid #e8e8e8; border-radius: 6px; padding: 20px; background: #fafafa; }
.kg-sidebar-box h6 { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; margin: 0 0 14px; font-weight: 700; font-family: 'Barlow', sans-serif; }
.kg-sidebar-box ul { list-style: none; padding: 0; margin: 0; }
.kg-sidebar-box ul li { border-bottom: 1px solid #eee; }
.kg-sidebar-box ul li:last-child { border-bottom: none; }
.kg-sidebar-box ul li a { display: block; padding: 9px 0; color: #2a2a2a; font-size: 14px; text-decoration: none; font-weight: 600; }
.kg-sidebar-box ul li a:hover { color: #C8922A; }
.kg-sidebar-cta { background: #2a2a2a; border-color: #2a2a2a; }
.kg-sidebar-cta h6 { color: #C8922A; }
.sidebar-phone { color: #fff; font-size: 22px; font-weight: 800; font-family: 'Barlow', sans-serif; margin: 0 0 8px; display: block; }
.sidebar-phone a { color: #fff; text-decoration: none; }
.btn-sidebar { display: block; background: #C8922A; color: #fff; padding: 11px 16px; border-radius: 4px; font-weight: 700; text-decoration: none; font-family: 'Barlow', sans-serif; font-size: 14px; text-align: center; margin-top: 12px; }
.kg-divider { border: none; border-top: 1px dashed #e0e0e0; margin: 28px 0; }
.kg-service-wrap main p { line-height: 1.75; color: #444; margin-bottom: 1.1em; }
.kg-service-wrap main p:last-child { margin-bottom: 0; }
.section-title { color: #2a2a2a; font-family: 'Barlow', sans-serif; font-size: 22px; font-weight: 800; margin: 0 0 14px; }
</style>`;
}

// ─── Sidebar helpers ─────────────────────────────────────────────────────────

const ALL_VERTICALS = ['basement-finishing','bathroom-remodeling','custom-home-building','home-additions','kitchen-remodeling','major-remodels','roofing'];
const VERTICAL_LABELS = {
  'basement-finishing':   'Basement Finishing',
  'bathroom-remodeling':  'Bathroom Remodeling',
  'custom-home-building': 'Custom Home Building',
  'home-additions':       'Home Additions',
  'kitchen-remodeling':   'Kitchen Remodeling',
  'major-remodels':       'Major Remodels',
  'roofing':              'Roofing',
};

function buildSidebarServices(serviceKey, citySlug) {
  return ALL_VERTICALS.map(v => {
    const label = VERTICAL_LABELS[v];
    const urlPrefix = SERVICE_MAP[v] ? SERVICE_MAP[v].urlPrefix : v;
    const active = v === serviceKey ? ' style="color:#C8922A;font-weight:800;"' : '';
    return `<li><a href="/${urlPrefix}/${citySlug}/"${active}><i class="fa-solid fa-angle-right" style="color:#C8922A;margin-right:6px;font-size:11px;"></i>${label}</a></li>`;
  }).join('\n        ');
}

function buildNearbyCities(serviceKey, citySlug) {
  const urlPrefix = SERVICE_MAP[serviceKey] ? SERVICE_MAP[serviceKey].urlPrefix : serviceKey;
  const dir = path.join(DIST, urlPrefix);
  if (!fs.existsSync(dir)) return '';
  const cities = fs.readdirSync(dir)
    .filter(f => f !== citySlug && fs.statSync(path.join(dir, f)).isDirectory())
    .slice(0, 5);
  return cities.map(c => {
    const label = c.replace('-ks','').split('-').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
    return `<li><a href="/${urlPrefix}/${c}/"><i class="fa-solid fa-angle-right" style="color:#C8922A;margin-right:6px;font-size:11px;"></i>${label}</a></li>`;
  }).join('\n        ');
}

// ─── Build two-column page content ───────────────────────────────────────────

function buildTwoColumnContent(sections, serviceKey, citySlug, serviceInfo) {
  const city = citySlug.replace('-ks','').split('-').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
  const ctaVerb = {
    'basement-finishing':'Finish Your Basement','bathroom-remodeling':'Start Your Bathroom Remodel',
    'custom-home-building':'Build Your Custom Home','home-additions':'Start Your Home Addition',
    'kitchen-remodeling':'Start Your Kitchen Remodel','major-remodels':'Start Your Major Remodel','roofing':'Start Your Roofing Project'
  }[serviceKey] || 'Start Your Project';

  // Pull the first section (intro) out to render as page hero above the grid.
  // It contains the breadcrumb + H1 (with color:#fff) + intro body paragraphs.
  let heroHtml = '';
  let introBodyForMain = '';
  let bodySections = sections;

  const firstSection = sections[0] || '';
  const hasH1 = /<h1[^>]*>/.test(firstSection);
  const hasBreadcrumb = /page-breadcrumb/.test(firstSection);

  if (hasH1 || hasBreadcrumb) {
    bodySections = sections.slice(1);

    // Extract H1 text for the hero
    const h1Match = firstSection.match(/<h1[^>]*>([\s\S]+?)<\/h1>/);
    const h1Text = h1Match ? h1Match[1] : city;

    // Extract intro body (everything after H1, strip breadcrumb nav)
    let introBody = firstSection
      .replace(/<nav[^>]*class="page-breadcrumb"[^>]*>[\s\S]*?<\/nav>/, '')
      .replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '')
      .replace(/<span class="section-tag">[^<]*<\/span>\s*/g, '')
      .trim();

    heroHtml = `<!-- PAGE HERO -->
<section class="page-hero" style="background:linear-gradient(rgba(42,42,42,0.72),rgba(42,42,42,0.72)) center/cover,url('${serviceInfo.heroImg}') center/cover;padding:96px 20px 80px;text-align:center;">
  <div class="container">
    <nav class="page-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>&rsaquo;</span>
      <a href="${serviceInfo.parentUrl}">${serviceInfo.parentLabel}</a> <span>&rsaquo;</span>
      <span>${city}</span>
    </nav>
    <h1 style="color:#fff;font-family:'Barlow',sans-serif;font-size:clamp(2rem,5vw,3rem);font-weight:900;margin:0 0 16px;">${h1Text}</h1>
  </div>
</section>
`;
    // Store intro body to inject at top of <main>
    introBodyForMain = introBody;
  }

  // Render body section blocks with dividers
  const sectionBlocks = bodySections.map((s, i) => {
    let content = s.replace(/<span class="section-tag">[^<]*<\/span>\s*/g, '');
    // Wrap h3 FAQ items
    content = content.replace(/<h3>([^<]+)<\/h3>\s*\n?([^<][^\n]*(?:\n(?!<h3>)[^\n]*)*)/g, (match, q, a) => {
      const answer = a.trim();
      const answerHtml = answer.startsWith('<p>') ? answer : `<p>${answer}</p>`;
      return `<div class="kg-faq-item"><h3>${q}</h3>${answerHtml}</div>`;
    });
    const divider = i > 0 ? '<hr class="kg-divider">\n\n    ' : '';
    return `${divider}${content}`;
  }).join('\n\n    ');

  return heroHtml + `
${buildLayoutCSS()}

<!-- PAGE CONTENT -->
<div class="kg-service-wrap">

  <main>
    ${introBodyForMain ? introBodyForMain + '\n\n    <hr class="kg-divider">\n\n    ' : ''}${sectionBlocks}

    <script>
(function(){
  fetch('/data/reviews.json')
    .then(function(r){return r.json();})
    .then(function(d){
      var reviews=(d.reviews||[]).filter(function(r){return r.text&&r.text.length>40;});
      if(!reviews.length)return;
      var r=reviews[Math.floor(Math.random()*reviews.length)];
      var qt=document.getElementById('service-review-text');
      var qa=document.getElementById('service-review-author');
      if(qt)qt.innerHTML='\u201C'+r.text+'\u201D';
      if(qa)qa.textContent=r.author||'';
    })
    .catch(function(){});
})();
    </script>
  </main>

  <aside class="kg-service-sidebar">
    <div class="kg-sidebar-box kg-sidebar-cta">
      <h6>Free Consultation</h6>
      <span class="sidebar-phone"><a href="tel:+13163227898">(316) 322-7898</a></span>
      <a href="/project-request/" class="btn-sidebar">Start Your Project</a>
    </div>
    <div class="kg-sidebar-box">
      <h6>Services in ${city}</h6>
      <ul>
        ${buildSidebarServices(serviceKey, citySlug)}
      </ul>
    </div>
    <div class="kg-sidebar-box">
      <h6>All Services</h6>
      <ul>
        <li><a href="/custom-homes/"><i class="fa-solid fa-angle-right" style="color:#C8922A;margin-right:6px;font-size:11px;"></i>Custom Homes</a></li>
        <li><a href="/additions/"><i class="fa-solid fa-angle-right" style="color:#C8922A;margin-right:6px;font-size:11px;"></i>Additions</a></li>
        <li><a href="/major-remodels/"><i class="fa-solid fa-angle-right" style="color:#C8922A;margin-right:6px;font-size:11px;"></i>Major Remodels</a></li>
        <li><a href="/roofing/"><i class="fa-solid fa-angle-right" style="color:#C8922A;margin-right:6px;font-size:11px;"></i>Roofing</a></li>
      </ul>
    </div>
    <div class="kg-sidebar-box">
      <h6>Nearby Cities</h6>
      <ul>
        ${buildNearbyCities(serviceKey, citySlug)}
        <li><a href="/service-areas/"><i class="fa-solid fa-angle-right" style="color:#C8922A;margin-right:6px;font-size:11px;"></i>All Areas</a></li>
      </ul>
    </div>
  </aside>

</div>

<div class="cta-float-wrap">
  <div class="cta-card">
    <h2>Ready to ${ctaVerb} in ${city}?</h2>
    <p>Free in-home consultation &mdash; honest assessment, no pressure, no obligation. Wheatland Construction serves ${city} and the entire Wichita metro area.</p>
    <a href="/project-request/" class="btn btn-cta-dark">Start Your Project</a>
    <p class="call-line">Or Call: <a href="tel:+13163227898">(316) 322-7898</a></p>
  </div>
</div>`;
}

// ─── Wrap content sections in proper HTML structure ───────────────────────────

function structureContent(htmlContent, serviceInfo, cityName, canonicalUrl) {
  // Split into sections by H2
  const sections = [];
  const lines = htmlContent.split('\n');
  let currentSection = { tag: 'intro', content: [] };

  for (const line of lines) {
    if (line.startsWith('<h2>')) {
      if (currentSection.content.length) sections.push(currentSection);
      currentSection = { tag: 'h2', heading: line, content: [] };
    } else {
      currentSection.content.push(line);
    }
  }
  if (currentSection.content.length || currentSection.heading) sections.push(currentSection);

  let out = '';

  for (const section of sections) {
    const contentStr = section.content.join('\n').trim();

    // Check if this section is the testimonial placeholder
    if (contentStr.includes('<!-- TESTIMONIAL_BLOCK -->')) {
      out += buildTestimonialBlock() + '\n\n';
      continue;
    }

    if (section.tag === 'intro') {
      // H1 + intro wrapped in page-hero + intro section
      // Extract H1 from content
      const h1Match = contentStr.match(/<h1>([\s\S]+?)<\/h1>/);
      const h1Text = h1Match ? h1Match[1] : cityName;
      const introBody = contentStr.replace(/<h1>[\s\S]+?<\/h1>/, '').trim();

      out += `<!-- PAGE HERO -->
<section class="page-hero" style="background:linear-gradient(rgba(42,42,42,0.72),rgba(42,42,42,0.72)) center/cover,url('${serviceInfo.heroImg}') center/cover;padding:96px 20px 80px;text-align:center;">
  <div class="container">
    <nav class="page-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>&rsaquo;</span>
      <a href="${serviceInfo.parentUrl}">${serviceInfo.parentLabel}</a> <span>&rsaquo;</span>
      <span>${escHtml(cityName)}</span>
    </nav>
    <h1 style="color:#fff;font-family:'Barlow',sans-serif;font-size:clamp(2rem,5vw,3rem);font-weight:900;margin:0 0 16px;">${h1Text}</h1>
  </div>
</section>

<!-- INTRO -->
<section class="section-padding" style="background:#fff;">
  <div class="container" style="max-width:900px;">
    <span class="section-tag">${serviceInfo.tag}</span>
${introBody}
  </div>
</section>

`;
    } else if (section.heading) {
      const headingText = section.heading.replace(/<\/?h2>/g, '');
      const body = contentStr;

      // H3 FAQ sections get a different bg
      const hasFaq = body.includes('<h3>');
      const bg = hasFaq ? '#f8f9fa' : (sections.indexOf(section) % 2 === 0 ? '#fff' : '#f8f9fa');

      out += `<!-- ${headingText.toUpperCase()} -->
<section class="section-padding" style="background:${bg};">
  <div class="container" style="max-width:900px;">
    <h2 class="section-title">${headingText}</h2>
${body}
  </div>
</section>

`;
    }
  }

  return out;
}

// ─── Main page builder ────────────────────────────────────────────────────────

function buildLocationPage(draftPath, serviceKey) {
  const serviceInfo = SERVICE_MAP[serviceKey];
  if (!serviceInfo) {
    console.warn(`  ⚠️  Unknown service key: ${serviceKey}`);
    return;
  }

  const raw = readFile(draftPath);
  const meta = parseFrontmatter(raw);
  const schema = extractSchema(raw);

  const title   = meta.titleTag || meta.titletag || meta.title || 'Wheatland Construction';
  const metaDesc = meta.metaDesc || meta.metadesc || meta.metadescription || '';
  const url     = meta.url || '';
  const city    = meta.city || '';

  // Strip frontmatter blocks and schema from body
  let body = raw;
  // Remove YAML frontmatter
  body = body.replace(/^---\n[\s\S]+?\n---\n/, '');
  // Remove page config block
  body = body.replace(/---\nTITLE TAG:[\s\S]+?---\n/, '');
  // Remove trailing schema block
  body = body.replace(/```json[\s\S]*?```[\s\S]*$/, '');
  // Remove trailing --- separator
  body = body.replace(/\n---\s*$/, '');

  const htmlBody = mdToHtml(body, city);
  const structured = structureContent(htmlBody, serviceInfo, city, url);

  // Extract sections from structured HTML for two-column layout
  const sectionContents = [];
  const sectionRegex = /<section[^>]*>([\s\S]*?)<\/section>/g;
  let secMatch;
  while ((secMatch = sectionRegex.exec(structured)) !== null) {
    const inner = secMatch[1].replace(/<div[^>]*class="container"[^>]*>([\s\S]*?)<\/div>\s*$/, '$1').trim();
    if (inner) sectionContents.push(inner);
  }

  // Determine city slug for sidebar helpers
  const citySlugForSidebar = path.basename(draftPath, '-location-page.md');
  const fullContent = buildTwoColumnContent(sectionContents, serviceKey, citySlugForSidebar, serviceInfo);

  // Build canonical URL
  const canonicalUrl = url
    ? `https://${DOMAIN}${url}`
    : `https://${DOMAIN}/${serviceInfo.urlPrefix}/${meta.state ? meta.city_slug || (city.toLowerCase().replace(/\s+/g, '-') + '-ks') : ''}/`;

  // Schema tag
  const schemaTag = schema ? `<script type="application/ld+json">${schema}</script>` : '';

  // Read partials
  const header = readFile(path.join(PARTS, 'header.html'));
  const footer = readFile(path.join(PARTS, 'footer.html'));

  const ogImage = `https://${DOMAIN}${serviceInfo.heroImg}`;
  const og = `  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(metaDesc)}">
  <meta property="og:image" content="${ogImage}">
  <meta property="og:url" content="${canonicalUrl}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Wheatland Construction">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(metaDesc)}">
  <meta name="twitter:image" content="${ogImage}">`;

  const head = header
    .replace('<!-- TITLE -->', `<title>${escHtml(title)}</title>`)
    .replace('<!-- META_DESC -->', `<meta name="description" content="${escHtml(metaDesc)}">`)
    .replace('<!-- CANONICAL -->', `<link rel="canonical" href="${canonicalUrl}">`)
    .replace('<!-- OG_TAGS -->', og)
    .replace('<!-- SCHEMA -->', schemaTag);

  // Inject layout CSS into head (before </head>) and attach body content
  const headWithCss = head;
  const html = headWithCss + '\n' + fullContent + '\n' + footer;

  // Determine output path from URL or city slug
  const citySlugRaw = path.basename(draftPath, '-location-page.md');
  const outPath = `${serviceInfo.urlPrefix}/${citySlugRaw}/index.html`;
  writeOut(outPath, html);

  return { outPath, title, city };
}

// ─── Batch runner ─────────────────────────────────────────────────────────────

function buildAllLocationPages() {
  console.log('\n📍 Building location pages...');
  let count = 0;

  for (const serviceKey of Object.keys(SERVICE_MAP)) {
    const draftsDir = path.join(DRAFTS_BASE, serviceKey);
    if (!fs.existsSync(draftsDir)) {
      console.log(`  ⏭  No drafts for ${serviceKey} — skipping`);
      continue;
    }

    const files = fs.readdirSync(draftsDir).filter(f => f.endsWith('-location-page.md'));
    if (!files.length) {
      console.log(`  ⏭  No draft files in ${serviceKey}`);
      continue;
    }

    console.log(`\n── ${serviceKey} (${files.length} pages) ──`);
    for (const file of files) {
      try {
        const result = buildLocationPage(path.join(draftsDir, file), serviceKey);
        if (result) count++;
      } catch (e) {
        console.warn(`  ⚠️  Error building ${file}: ${e.message}`);
      }
    }
  }

  console.log(`\n✅ Location pages built: ${count} total`);
  return count;
}

// ─── CLI entry ────────────────────────────────────────────────────────────────

if (require.main === module) {
  buildAllLocationPages();
}

module.exports = { buildAllLocationPages, buildLocationPage };
