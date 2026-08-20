'use strict';
/**
 * build-city-pillar-pages.js - Wheatland Construction
 * Builds /service-areas/[city-ks]/ pillar pages from city-pillar draft markdown.
 * Outputs: dist/service-areas/[city-ks]/index.html
 */

const fs   = require('fs');
const path = require('path');

const ROOT        = __dirname;
const DIST        = path.join(ROOT, 'dist');
const PARTS       = path.join(ROOT, '_partials');
const DRAFTS_BASE = 'C:\\Users\\KillerGrowth\\.openclaw\\workspace\\tools\\hyperlocal-pipeline\\drafts\\wheatland\\city-pillar';
const DOMAIN      = 'wheatlandconstruction.com';

function readFile(p) {
  const buf = fs.readFileSync(p);
  const start = (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) ? 3 : 0;
  return buf.slice(start).toString('utf8');
}

function writeOut(relPath, content) {
  const full = path.join(DIST, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Extract frontmatter value
function fm(raw, key) {
  const m = raw.match(new RegExp('^' + key + ':\\s*(.+)$', 'm'));
  return m ? m[1].trim() : '';
}

// Minimal markdown → HTML converter
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inUl = false, inOl = false;

  function closeList() {
    if (inUl) { out.push('</ul>'); inUl = false; }
    if (inOl) { out.push('</ol>'); inOl = false; }
  }

  for (let raw of lines) {
    // Skip frontmatter / meta lines
    if (/^(---|\*\*\*|TITLE TAG:|META DESCRIPTION:|URL:|```json|```)/.test(raw)) {
      closeList(); continue;
    }
    // Skip JSON schema blocks
    if (raw.startsWith('{') || raw.startsWith('}') || raw.startsWith('"@') || raw.startsWith('  "') || raw.startsWith('    {') || raw.startsWith('    }') || raw.startsWith('    "')) {
      continue;
    }

    let line = raw;

    // Inline: bold, italic, links
    line = line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    line = line.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    line = line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

    // Headings
    if (/^### /.test(line)) { closeList(); out.push('<h3>' + line.replace(/^### /, '') + '</h3>'); continue; }
    if (/^## /.test(line))  { closeList(); out.push('<h2>' + line.replace(/^## /, '') + '</h2>'); continue; }
    if (/^# /.test(line))   { closeList(); out.push('<h1>' + line.replace(/^# /, '') + '</h1>'); continue; }

    // Lists
    if (/^- /.test(line)) {
      if (!inUl) { closeList(); out.push('<ul>'); inUl = true; }
      out.push('<li>' + line.replace(/^- /, '') + '</li>'); continue;
    }
    if (/^\d+\. /.test(line)) {
      if (!inOl) { closeList(); out.push('<ol>'); inOl = true; }
      out.push('<li>' + line.replace(/^\d+\. /, '') + '</li>'); continue;
    }

    closeList();
    const trimmed = line.trim();
    if (trimmed === '') { out.push(''); continue; }
    out.push('<p>' + trimmed + '</p>');
  }
  closeList();

  // Collapse blank lines
  return out.filter((l, i) => !(l === '' && out[i - 1] === '')).join('\n');
}

// Extract schema JSON blocks
function extractSchemas(raw) {
  const schemas = [];
  const re = /```json\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const json = m[1].trim();
    if (json.startsWith('{')) schemas.push(json);
  }
  return schemas;
}

function buildPillarPage(draftPath) {
  const raw = readFile(draftPath);
  const filename = path.basename(draftPath, '-city-pillar.md'); // e.g. "andover-ks"
  const citySlug = filename; // andover-ks

  const titleTag  = fm(raw, 'TITLE TAG');
  const metaDesc  = fm(raw, 'META DESCRIPTION');
  const urlPath   = fm(raw, 'URL') || `/service-areas/${citySlug}/`;
  const cityName  = fm(raw, 'city');
  const canonical = `https://${DOMAIN}${urlPath}`;

  // Strip frontmatter blocks and schema blocks for prose
  let prose = raw
    .replace(/^---[\s\S]*?---\s*/gm, '')
    .replace(/```json[\s\S]*?```/g, '')
    .trim();

  const bodyHtml = mdToHtml(prose);
  const schemas  = extractSchemas(raw);

  const schemaScripts = schemas.map(s =>
    `<script type="application/ld+json">${s}</script>`
  ).join('\n  ');

  const breadcrumbSchema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home",         "item": `https://${DOMAIN}/` },
      { "@type": "ListItem", "position": 2, "name": "Areas Served", "item": `https://${DOMAIN}/service-areas/` },
      { "@type": "ListItem", "position": 3, "name": cityName,        "item": canonical }
    ]
  });

  const og = `  <meta property="og:title" content="${escHtml(titleTag)}">
  <meta property="og:description" content="${escHtml(metaDesc)}">
  <meta property="og:image" content="https://${DOMAIN}/images/remodel-home-eldorado-kansas-scaled.jpg">
  <meta property="og:url" content="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Wheatland Construction">`;

  const header = readFile(path.join(PARTS, 'header.html'));
  const footer = readFile(path.join(PARTS, 'footer.html'));

  const head = header
    .replace('<!-- TITLE -->',    `<title>${escHtml(titleTag)}</title>`)
    .replace('<!-- META_DESC -->', `<meta name="description" content="${escHtml(metaDesc)}">`)
    .replace('<!-- CANONICAL -->', `<link rel="canonical" href="${canonical}">`)
    .replace('<!-- OG_TAGS -->',   og)
    .replace('<!-- SCHEMA -->',    `${schemaScripts}\n  <script type="application/ld+json">${breadcrumbSchema}</script>`);

  const body = `
<section class="page-hero" style="background:linear-gradient(rgba(42,42,42,0.72),rgba(42,42,42,0.72)) center/cover,url('/images/remodel-home-eldorado-kansas-scaled.jpg') center/cover;padding:96px 20px 80px;text-align:center;">
  <div class="container">
    <nav class="page-breadcrumb" aria-label="Breadcrumb">
      <a href="/">Home</a> <span>&rsaquo;</span>
      <a href="/service-areas/">Areas Served</a> <span>&rsaquo;</span>
      <span>${escHtml(cityName)}, KS</span>
    </nav>
    <p class="page-hero__tag" style="color:#C8922A;font-family:'Barlow',sans-serif;font-weight:700;letter-spacing:2px;font-size:.85rem;text-transform:uppercase;margin:0 0 12px;">WHERE WE WORK</p>
    <h1 style="color:#fff;font-family:'Barlow',sans-serif;font-size:clamp(2rem,5vw,3rem);font-weight:900;margin:0 0 16px;">Construction Services in ${escHtml(cityName)}, KS</h1>
    <p style="color:rgba(255,255,255,0.85);font-size:1.1rem;max-width:600px;margin:0 auto 28px;">Wheatland Construction &mdash; Veterans Approved &bull; Family-Owned Since 2018</p>
    <a href="tel:+13163227898" class="btn btn-cta" style="display:inline-block;background:#C8922A;color:#fff;padding:14px 32px;border-radius:4px;font-weight:800;text-decoration:none;font-family:'Barlow',sans-serif;font-size:1rem;">(316) 322-7898</a>
  </div>
</section>

<section class="section-padding" style="background:#fff;">
  <div class="container location-page-body" style="max-width:860px;">
    ${bodyHtml}
  </div>
</section>

<div class="cta-float-wrap">
  <div class="cta-card">
    <h2>Ready to Start Your ${escHtml(cityName)} Project?</h2>
    <p>Call us or submit a project request. We&rsquo;ll come to you, assess the project, and price it in writing.</p>
    <a href="/project-request/" class="btn btn-cta-dark">Request a Quote</a>
    <p class="call-line">Or Call: <a href="tel:+13163227898">(316) 322-7898</a></p>
  </div>
</div>
`;

  const html = head + body + footer;
  const outRel = `service-areas/${citySlug}/index.html`;
  writeOut(outRel, html);
  return outRel;
}

function buildAllCityPillarPages() {
  if (!fs.existsSync(DRAFTS_BASE)) {
    console.log('[City Pillars] Draft directory not found:', DRAFTS_BASE);
    return;
  }
  const files = fs.readdirSync(DRAFTS_BASE).filter(f => f.endsWith('-city-pillar.md'));
  let count = 0;
  for (const f of files) {
    try {
      buildPillarPage(path.join(DRAFTS_BASE, f));
      count++;
    } catch (e) {
      console.log(`[City Pillars] Error on ${f}: ${e.message}`);
    }
  }
  console.log(`[City Pillars] Built ${count} city pillar pages.`);
  return count;
}

module.exports = { buildAllCityPillarPages };

if (require.main === module) {
  buildAllCityPillarPages();
}
