'use strict';

const puppeteer    = require('puppeteer');
const path         = require('path');
const fs2          = require('fs');
const { execSync } = require('child_process');
const { fetchUnsplashPhoto } = require('./unsplash');

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

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function makeUid() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Split kutipan → main + kicker (dipisah \n\n)
function splitKutipan(raw = '') {
  const parts = raw.split(/\n\n+/);
  if (parts.length >= 2) {
    return {
      main  : parts.slice(0, parts.length - 1).join('\n').trim(),
      kicker: parts[parts.length - 1].trim(),
    };
  }
  return { main: raw.trim(), kicker: '' };
}

// Auto font-size quote utama
function calcMainFontSize(text = '') {
  const lines  = text.split('\n');
  const maxLen = Math.max(...lines.map(l => l.length));
  const nLine  = lines.length;
  if (maxLen > 38 || nLine > 4) return '20px';
  if (maxLen > 28 || nLine > 3) return '23px';
  return '27px';
}

// Auto font-size Arab — ayat panjang dapat font lebih kecil
function calcArabFontSize(text = '') {
  const len = text.length;
  if (len > 120) return '28px';
  if (len > 80)  return '34px';
  if (len > 50)  return '40px';
  return '46px';
}

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

  fs2.writeFileSync(tmpHtmlPath, html, 'utf8');

  const browser = await puppeteer.launch({
    headless: 'new',
    ...(CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}),
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--single-process'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 2 });
    await page.goto(`file://${tmpHtmlPath}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.screenshot({ path: tmpPngPath, fullPage: false, clip: { x: 0, y: 0, width: 800, height: 1200 } });
  } finally {
    await browser.close();
    try { fs2.unlinkSync(tmpHtmlPath); } catch (_) {}
  }

  return tmpPngPath;
}

function generateCardHTML(content, photoUrl) {
  const hasPhoto   = !!photoUrl;
  const { main, kicker } = splitKutipan(content.kutipan_motivasi || '');
  const mainSize   = calcMainFontSize(main);
  const arabSize   = calcArabFontSize(content.ayat_arab || '');

  const mainEsc     = escapeHtml(main).replace(/\n/g, '<br>');
  const kickerEsc   = escapeHtml(kicker);
  const kataJawa    = escapeHtml(content.kata_jawa);
  const artiJawa    = escapeHtml(content.arti_jawa);
  const translitasi = escapeHtml(content.transliterasi);
  const artiAyat    = escapeHtml(content.arti_ayat);
  const ayatArab    = String(content.ayat_arab ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;');

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
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover; object-position: center;
    z-index: 0;
    filter: brightness(1.08) saturate(0.75);
  }
  .bg-fallback {
    position: absolute; inset: 0;
    background: linear-gradient(160deg, #9b8ea8 0%, #7a7090 40%, #5a5070 100%);
    z-index: 0;
  }

  /* ── Overlay putih transparan ── */
  .overlay {
    position: absolute; inset: 0;
    background: rgba(252, 250, 246, 0.74);
    z-index: 1;
  }

  /* ── Card container ── */
  .card {
    width: 800px; height: 1200px;
    position: relative;
    display: flex; flex-direction: column; align-items: center; justify-content: space-between;
    padding: 46px 68px 40px;
    overflow: hidden;
  }

  /* ── Header ── */
  .header { display: flex; flex-direction: column; align-items: center; gap: 6px; z-index: 2; margin-bottom: 28px; }
  .diamond-icon { width: 32px; height: 32px; }
  .brand-name { font-family: 'Cinzel', serif; font-size: 17px; font-weight: 600; color: #2c1600; letter-spacing: 2px; }

  /* ── Foto ── */
  .photo-wrap {
    z-index: 2; margin-bottom: 16px;
    background: #fff; padding: 7px;
    box-shadow: 0 5px 20px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06);
    width: 550px;
  }
  .photo-wrap img { width: 100%; height: 270px; object-fit: cover; display: block; }
  .photo-placeholder {
    width: 100%; height: 295px; background: rgba(160,140,180,0.3);
    display: flex; align-items: center; justify-content: center;
  }
  .photo-placeholder-text { font-family: 'Cinzel', serif; color: rgba(44,22,0,0.35); font-size: 13px; letter-spacing: 3px; }

  /* ── Quote utama — bold, center ── */
  .quote-main {
    z-index: 2; width: 100%; text-align: center;
    margin-bottom: 6px;
    font-family: 'Lora', serif; font-weight: 700;
    font-size: ${mainSize};
    color: #1a0800; line-height: 1.7;
    text-shadow: 0 1px 2px rgba(255,255,255,0.4);
    white-space: normal;
  }

  /* ── Kicker — italic kecil, rata kiri, beda karakter ── */
  .quote-kicker {
    z-index: 2; width: 100%;
    text-align: left; padding-left: 4px;
    margin-bottom: 12px;
    font-family: 'Lora', serif; font-style: italic; font-weight: 400;
    font-size: 14px; color: #7a5030; line-height: 1.5;
    opacity: 0.75; font-weight: 400;
  }

  /* ── Kata Jawa ── */
  .kata-wrap {
    z-index: 2; width: 100%; text-align: center;
    border-top: 1px solid rgba(44,22,0,0.18);
    border-bottom: 1px solid rgba(44,22,0,0.18);
    padding: 10px 0; margin-bottom: 10px;
  }
  .kata-label { font-family: 'Cinzel', serif; font-size: 15px; font-weight: 600; color: #3c2610; letter-spacing: 1.5px; opacity: 0.85; }
  .kata-arti  { font-family: 'Lora', serif; font-size: 13px; font-style: italic; color: #8b6040; margin-top: 4px; font-weight: 400; }

  /* ── Divider ── */
  .divider { z-index: 2; width: 100%; display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .divider-line { flex: 1; height: 1px; background: linear-gradient(to right, transparent, rgba(44,22,0,0.25), transparent); }
  .divider-ornament { font-size: 12px; color: rgba(44,22,0,0.4); }

  /* ── Arab ── */
  .arab-section { z-index: 2; width: 100%; text-align: center; }
  .arab-text {
    font-family: 'Amiri', serif;
    font-size: ${arabSize};
    color: #180900; line-height: 1.65; direction: rtl;
  }
  .transliterasi { font-family: 'Lora', serif; font-size: 12px; font-style: italic; color: #5a3e20; margin-top: 5px; opacity: 0.8; }
  .arti-ayat {
    font-family: 'Lora', serif; font-size: 12px; font-style: italic;
    color: #7a5530; margin-top: 4px; opacity: 0.75; padding: 0 4px;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }

  /* ── Footer ── */
  .footer { z-index: 2; margin-top: 0; padding-top: 14px; text-align: center; }
  .footer-text { font-family: 'Lora', serif; font-size: 15px; font-style: italic; color: #2c1600; letter-spacing: 1px; }
</style>
</head>
<body>
<div class="card">

  ${hasPhoto
    ? `<img class="bg-photo" src="${photoUrl}" alt="bg" crossorigin="anonymous"/>`
    : `<div class="bg-fallback"></div>`
  }
  <div class="overlay"></div>

  <div class="header">
    <svg class="diamond-icon" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="17,2 30,13 17,32 4,13" fill="none" stroke="#2c1600" stroke-width="1.6"/>
      <polygon points="17,2 30,13 17,16 4,13" fill="rgba(44,22,0,0.10)" stroke="#2c1600" stroke-width="1.1"/>
      <line x1="4" y1="13" x2="30" y2="13" stroke="#2c1600" stroke-width="1.1"/>
    </svg>
    <div class="brand-name">Sangkan Paran</div>
  </div>

  <div class="photo-wrap">
    ${hasPhoto
      ? `<img src="${photoUrl}" alt="wisdom" crossorigin="anonymous"/>`
      : `<div class="photo-placeholder"><span class="photo-placeholder-text">✦ SANGKAN PARAN ✦</span></div>`
    }
  </div>

  <div class="quote-main">${mainEsc}</div>
  ${kickerEsc ? `<div class="quote-kicker">${kickerEsc}</div>` : ''}

  <div class="kata-wrap">
    <div class="kata-label">${kataJawa}</div>
    <div class="kata-arti">${artiJawa}</div>
  </div>

  <div class="divider">
    <div class="divider-line"></div>
    <div class="divider-ornament">✦</div>
    <div class="divider-line"></div>
  </div>

  <div class="arab-section">
    <div class="arab-text">${ayatArab}</div>
    <div class="transliterasi">[ ${translitasi} ]</div>
    <div class="arti-ayat">"${artiAyat}"</div>
  </div>

  <div class="footer">
    <div class="footer-text">- Sangkan Paran -</div>
  </div>

</div>
</body>
</html>`;
}

module.exports = { renderCard };
