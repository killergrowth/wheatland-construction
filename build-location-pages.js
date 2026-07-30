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
  'custom-home-building': { urlPrefix: 'custom-home-building', parentLabel: 'Custom Homes',    parentUrl: '/custom-homes/',    heroImg: '/images/customhome-hero.jpg', tag: 'CUSTOM HOME BUILDING' },
  'home-additions':       { urlPrefix: 'home-additions',       parentLabel: 'Home Additions',   parentUrl: '/additions/',       heroImg: '/images/addition.jpg',        tag: 'HOME ADDITIONS' },
  'major-remodels':       { urlPrefix: 'major-remodels',       parentLabel: 'Major Remodels',   parentUrl: '/major-remodels/',  heroImg: '/images/major-remodel-hero.jpg', tag: 'MAJOR REMODELS' },
  'roofing':              { urlPrefix: 'roofing',               parentLabel: 'Roofing',          parentUrl: '/roofing/',         heroImg: '/images/standing-seam-roof.jpg', tag: 'ROOFING' }
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

function mdToHtml(md) {
  let out = md;

  // Schema block — strip (handled separately)
  out = out.replace(/```json[\s\S]*?```/g, '');

  // --- separator lines
  out = out.replace(/^---\s*$/gm, '');

  // ### H3
  out = out.replace(/^### (.+)$/gm, '<h3>$1</h3>');
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
  const configMatch = text.match(/TITLE TAG:(.+)\nMETA DESCRIPTION:(.+)\nURL:(.+)/);
  if (configMatch) {
    meta.titleTag   = configMatch[1].trim();
    meta.metaDesc   = configMatch[2].trim();
    meta.url        = configMatch[3].trim();
  }

  return meta;
}

// ─── Extract JSON-LD schema ───────────────────────────────────────────────────

function extractSchema(text) {
  const match = text.match(/```json\n([\s\S]+?)\n```/);
  if (!match) return null;
  try {
    JSON.parse(match[1]); // validate
    return match[1];
  } catch (e) {
    console.warn('  ⚠️  Schema JSON parse error — skipping schema');
    return null;
  }
}

// ─── Build the testimonial block (matching custom-homes.html pattern) ─────────

function buildTestimonialBlock() {
  return `<section class="service-testimonial" id="service-review-section">
  <div class="container" style="max-width:820px;">
    <hr class="testimonial-rule">
    <blockquote class="service-testimonial-quote" id="service-review-text">Loading review&hellip;</blockquote>
    <p class="service-testimonial-author" id="service-review-author"></p>
    <hr class="testimonial-rule">
  </div>
</section>
<script>
(function(){
  fetch("/data/reviews.json")
    .then(function(r){ return r.json(); })
    .then(function(d){
      var reviews = (d.reviews || []).filter(function(r){ return r.text && r.text.length > 40; });
      if(!reviews.length) return;
      var r = reviews[Math.floor(Math.random() * reviews.length)];
      document.getElementById("service-review-text").innerHTML = "\u201C" + r.text + "\u201D";
      document.getElementById("service-review-author").textContent = r.author;
    })
    .catch(function(){});
})();
</script>`;
}

// ─── Build CTA float block (matching custom-homes.html) ───────────────────────

function buildCtaBlock() {
  return `<div class="cta-float-wrap">
  <div class="cta-card">
    <h2>Let&#8217;s Work Together</h2>
    <p>Ready to work with Wheatland Construction on your next project?<br>Tell us more about your project by clicking the button below, or give us a call.</p>
    <a href="/project-request/" class="btn btn-cta-dark">Let&#8217;s Get Started</a>
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

  const htmlBody = mdToHtml(body);
  const structured = structureContent(htmlBody, serviceInfo, city, url);

  // Full content = structured body + CTA block
  const fullContent = structured + buildCtaBlock();

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

  const html = head + '\n' + fullContent + '\n' + footer;

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
