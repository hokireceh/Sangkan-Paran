'use strict';

const puppeteer   = require('puppeteer');
const path        = require('path');
const fs          = require('fs');
const { execSync } = require('child_process');
const { fetchUnsplashPhoto } = require('./unsplash');

// ─── Temukan Chromium sistem secara dinamis ───────────────────────────────────
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  try {
    return execSync(
      'which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null',
      { encoding: 'utf8' }
    ).trim();
  } catch { return null; }
}
const CHROMIUM_PATH = findChromium();
console.log('[INFO] Chromium path:', CHROMIUM_PATH || '(puppeteer bundled)');

// ─── HTML escape — cegah content AI merusak struktur kartu ───────────────────
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

// ─── Auto font-size kutipan ───────────────────────────────────────────────────
function calcKutipanFontSize(text = '') {
  const lines  = text.split('\n');
  const maxLen = Math.max(...lines.map(l => l.length));
  const nLine  = lines.length;
  if (maxLen > 32 || nLine > 4) return '19px';
  if (maxLen > 24 || nLine > 3) return '22px';
  return '26px';
}

// ─── Unique ID — aman untuk request bersamaan ─────────────────────────────────
function makeUid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Render kartu → PNG ───────────────────────────────────────────────────────
async function renderCard(content, photoUrlOverride) {
  let photoUrl = photoUrlOverride || '';
  if (!photoUrl) {
    try {
      photoUrl = await fetchUnsplashPhoto(content.photo_queries || content.unsplash_keyword);
    } catch (e) {
      console.warn('[WARN] Unsplash failed, card tanpa foto:', e.message);
    }
  }

  const html        = generateCardHTML(content, photoUrl);
  const uid         = makeUid();
  const tmpHtmlPath = path.join('/tmp', `card_${uid}.html`);
  const tmpPngPath  = path.join('/tmp', `card_${uid}.png`);

  fs.writeFileSync(tmpHtmlPath, html, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
    await page.goto(`file://${tmpHtmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.screenshot({
      path    : tmpPngPath,
      fullPage: false,
      clip    : { x: 0, y: 0, width: 800, height: 1200 },
    });
  } finally {
    // Selalu tutup browser & hapus file HTML — bahkan saat error
    await browser.close();
    try { fs.unlinkSync(tmpHtmlPath); } catch (_) {}
  }

  return tmpPngPath;
}

// ─── Generate HTML kartu ──────────────────────────────────────────────────────
function generateCardHTML(content, photoUrl) {
  const hasPhoto    = !!photoUrl;
  const kutipanSize = calcKutipanFontSize(content.kutipan_motivasi || '');

  // Escape semua field teks — aksara Arab tidak perlu di-escape (Unicode murni)
  const kutipan      = escapeHtml(content.kutipan_motivasi);
  const kataJawa     = escapeHtml(content.kata_jawa);
  const artiJawa     = escapeHtml(content.arti_jawa);
  const translitasi  = escapeHtml(content.transliterasi);
  const artiAyat     = escapeHtml(content.arti_ayat);
  // ayat_arab: aksara Arab aman, hanya escape karakter berbahaya saja
  const ayatArab     = String(content.ayat_arab ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Lora:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 800px; height: 1200px; overflow: hidden; }

  /* ── Background foto full-bleed ── */
  .bg-photo {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    z-index: 0;
    filter: brightness(1.12) saturate(0.8);
  }
  .bg-fallback {
    position: absolute;
    inset: 0;
    background: linear-gradient(160deg, #9b8ea8 0%, #7a7090 40%, #5a5070 100%);
    z-index: 0;
  }

  /* ── Overlay semi-transparan di atas foto ── */
  .overlay {
    position: absolute;
    inset: 0;
    background: rgba(250, 248, 245, 0.72);
    z-index: 1;
  }

  /* ── Card container ── */
  .card {
    width: 800px;
    height: 1200px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 52px 72px 48px;
    overflow: hidden;
  }

  /* ── Header ── */
  .header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    z-index: 2;
    margin-bottom: 36px;
  }
  .diamond-icon { width: 34px; height: 34px; }
  .brand-name {
    font-family: 'Cinzel', serif;
    font-size: 18px;
    font-weight: 600;
    color: #2c1600;
    letter-spacing: 1.5px;
  }

  /* ── Foto bingkai putih ── */
  .photo-wrap {
    z-index: 2;
    margin-bottom: 36px;
    background: #fff;
    padding: 8px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06);
    width: 560px;
  }
  .photo-wrap img {
    width: 100%;
    height: 310px;
    object-fit: cover;
    display: block;
  }
  .photo-placeholder {
    width: 100%;
    height: 310px;
    background: rgba(160,140,180,0.35);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .photo-placeholder-text {
    font-family: 'Cinzel', serif;
    color: rgba(44,22,0,0.4);
    font-size: 13px;
    letter-spacing: 3px;
  }

  /* ── Kutipan Jawa ── */
  .kutipan {
    z-index: 2;
    width: 100%;
    margin-bottom: 20px;
    text-align: center;
  }
  .kutipan-text {
    font-family: 'Lora', serif;
    font-weight: 700;
    color: #1a0a00;
    line-height: 1.75;
    white-space: pre-wrap;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }

  /* ── Kata Jawa ── */
  .kata-jawa-wrap {
    z-index: 2;
    width: 100%;
    margin-bottom: 10px;
    text-align: center;
    border-top: 1px solid rgba(44,22,0,0.18);
    border-bottom: 1px solid rgba(44,22,0,0.18);
    padding: 12px 0;
  }
  .kata-jawa-label {
    font-family: 'Cinzel', serif;
    font-size: 19px;
    font-weight: 600;
    color: #2c1600;
    letter-spacing: 1.5px;
  }
  .kata-jawa-arti {
    font-family: 'Lora', serif;
    font-size: 14px;
    font-style: italic;
    color: #5a3510;
    margin-top: 5px;
  }

  /* ── Divider ── */
  .divider {
    z-index: 2;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 20px 0;
  }
  .divider-line {
    flex: 1;
    height: 1px;
    background: linear-gradient(to right, transparent, rgba(44,22,0,0.30), transparent);
  }
  .divider-ornament { font-size: 13px; color: rgba(44,22,0,0.45); }

  /* ── Arab, transliterasi, arti_ayat ── */
  .arab-section {
    z-index: 2;
    width: 100%;
    text-align: center;
  }
  .arab-text {
    font-family: 'Amiri', serif;
    font-size: 48px;
    color: #180900;
    line-height: 1.7;
    direction: rtl;
  }
  .transliterasi {
    font-family: 'Lora', serif;
    font-size: 14px;
    font-style: italic;
    color: #3a1e05;
    margin-top: 6px;
  }
  .arti-ayat {
    font-family: 'Lora', serif;
    font-size: 13px;
    font-style: italic;
    color: #5a3510;
    margin-top: 6px;
    opacity: 0.88;
    padding: 0 8px;
  }

  /* ── Footer ── */
  .footer {
    z-index: 2;
    margin-top: auto;
    padding-top: 22px;
    text-align: center;
  }
  .footer-text {
    font-family: 'Lora', serif;
    font-size: 17px;
    font-style: italic;
    color: #2c1600;
    letter-spacing: 1px;
  }
</style>
</head>
<body>
<div class="card">

  <!-- Background foto full-bleed -->
  ${hasPhoto
    ? `<img class="bg-photo" src="${photoUrl}" alt="bg" crossorigin="anonymous"/>`
    : `<div class="bg-fallback"></div>`
  }

  <!-- Overlay putih transparan -->
  <div class="overlay"></div>

  <!-- Header -->
  <div class="header">
    <svg class="diamond-icon" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="17,2 30,13 17,32 4,13" fill="none" stroke="#2c1600" stroke-width="1.6"/>
      <polygon points="17,2 30,13 17,16 4,13" fill="rgba(44,22,0,0.10)" stroke="#2c1600" stroke-width="1.1"/>
      <line x1="4" y1="13" x2="30" y2="13" stroke="#2c1600" stroke-width="1.1"/>
    </svg>
    <div class="brand-name">Sangkan Paran</div>
  </div>

  <!-- Foto bingkai putih -->
  <div class="photo-wrap">
    ${hasPhoto
      ? `<img src="${photoUrl}" alt="wisdom" crossorigin="anonymous"/>`
      : `<div class="photo-placeholder"><span class="photo-placeholder-text">✦ SANGKAN PARAN ✦</span></div>`
    }
  </div>

  <!-- Kutipan Jawa -->
  <div class="kutipan">
    <div class="kutipan-text" style="font-size:${kutipanSize}">${kutipan}</div>
  </div>

  <!-- Kata Jawa -->
  <div class="kata-jawa-wrap">
    <div class="kata-jawa-label">${kataJawa}</div>
    <div class="kata-jawa-arti">${artiJawa}</div>
  </div>

  <!-- Divider -->
  <div class="divider">
    <div class="divider-line"></div>
    <div class="divider-ornament">✦</div>
    <div class="divider-line"></div>
  </div>

  <!-- Arab -->
  <div class="arab-section">
    <div class="arab-text">${ayatArab}</div>
    <div class="transliterasi">[ ${translitasi} ]</div>
    <div class="arti-ayat">"${artiAyat}"</div>
  </div>

  <!-- Footer -->
  <div class="footer">
    <div class="footer-text">- Sangkan Paran -</div>
  </div>

</div>
</body>
</html>`;
}

module.exports = { renderCard };