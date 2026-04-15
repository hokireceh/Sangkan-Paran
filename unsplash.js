'use strict';

const https = require('https');

// ─── Collection IDs Unsplash yang aman & relevan ──────────────────────────────
// Nature, Indonesia landscape, spiritual/minimal, rice field, tropical
const SAFE_COLLECTIONS = [
  '1163637',  // Nature & Landscapes
  '3330448',  // Minimal & Peaceful
  '9458273',  // Tropical Asia
  '162326',   // Rice Fields & Farms
  '4332580',  // Spiritual & Sacred
].join(',');

// ─── Keyword blacklist — cek di description, alt_description, tags ────────────
const PHOTO_BLACKLIST = [
  // Hewan
  'dog', 'cat', 'pet', 'puppy', 'kitten', 'animal', 'bird', 'cow', 'goat',
  // Manusia close-up
  'portrait', 'selfie', 'face', 'smile', 'people', 'crowd', 'person',
  // Urban / modern
  'car', 'vehicle', 'street', 'city', 'urban', 'building', 'skyscraper',
  'traffic', 'road', 'highway', 'mall', 'office',
  // Makanan
  'food', 'plate', 'dish', 'restaurant', 'coffee cup', 'drink',
  // Lain-lain tidak relevan
  'party', 'concert', 'sport', 'gym', 'fitness', 'wedding',
];

// ─── Fallback hardcoded — sudah terbukti aman di Unsplash ────────────────────
const ULTIMATE_FALLBACKS = [
  'rice paddy morning mist Java',
  'mosque interior soft morning light minimal',
  'tropical rice field aerial view green',
  'banyan tree roots morning light',
  'mountain fog rice terraces Bali',
];

// ─── Cek apakah foto aman (tidak mengandung blacklist) ───────────────────────
function isPhotoSafe(photo) {
  const haystack = [
    photo.description        || '',
    photo.alt_description    || '',
    ...(photo.tags?.map(t => t.title) || []),
  ].join(' ').toLowerCase();

  const blocked = PHOTO_BLACKLIST.find(word => haystack.includes(word));
  if (blocked) {
    console.warn(`[UNSPLASH] ✗ Foto diblokir — mengandung kata: "${blocked}" | desc: "${(photo.alt_description || '').slice(0, 60)}"`);
    return false;
  }
  return true;
}

// ─── Search endpoint — lebih terkontrol dari /random ─────────────────────────
function searchPhotos(query, accessKey, page = 1) {
  return new Promise((resolve, reject) => {
    const params  = new URLSearchParams({
      query,
      orientation   : 'landscape',
      content_filter: 'high',
      per_page      : '10',
      page          : String(page),
      collections   : SAFE_COLLECTIONS,
      client_id     : accessKey,
    });

    const url = `https://api.unsplash.com/search/photos?${params}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 403 || res.statusCode === 429) {
            reject(new Error(`Unsplash rate limit (${res.statusCode})`));
            return;
          }

          const json = JSON.parse(data);

          if (json.errors) {
            reject(new Error(json.errors[0]));
            return;
          }

          const results = json.results || [];
          resolve(results);

        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ─── Search tanpa collections — fallback jika collections kosong ──────────────
function searchPhotosNoCollection(query, accessKey) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      query,
      orientation   : 'landscape',
      content_filter: 'high',
      per_page      : '15',
      client_id     : accessKey,
    });

    const url = `https://api.unsplash.com/search/photos?${params}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 403 || res.statusCode === 429) {
            reject(new Error(`Unsplash rate limit (${res.statusCode})`));
            return;
          }
          const json  = JSON.parse(data);
          const results = json.results || [];
          resolve(results);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ─── Cari satu query — dengan dan tanpa collection filter ────────────────────
async function fetchSingleQuery(query, accessKey) {
  // Pass 1: dengan collection filter (lebih aman)
  let photos = await searchPhotos(query, accessKey);
  let safe   = photos.filter(isPhotoSafe);

  // Pass 2: tanpa collection jika hasil kosong
  if (safe.length === 0) {
    console.warn(`[UNSPLASH] Collection filter kosong untuk "${query}" — coba tanpa collections`);
    photos = await searchPhotosNoCollection(query, accessKey);
    safe   = photos.filter(isPhotoSafe);
  }

  if (safe.length === 0) {
    throw new Error(`Tidak ada foto aman untuk query: "${query}"`);
  }

  // Ambil acak dari 3 teratas supaya tidak monoton
  const pool  = safe.slice(0, 3);
  const photo = pool[Math.floor(Math.random() * pool.length)];

  const photoUrl = photo.urls?.regular || photo.urls?.small;
  if (!photoUrl) throw new Error('No photo URL in response');

  return {
    url       : photoUrl,
    credit    : photo.user?.name        || 'Unsplash',
    creditLink: photo.user?.links?.html || 'https://unsplash.com',
    query,
  };
}

// ─── Main: cascade photo_queries → ultimate fallback ─────────────────────────
async function fetchUnsplashPhoto(photoQueries) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error('UNSPLASH_ACCESS_KEY not set');

  // Support string lama (backward compatible) & array baru
  const queries = Array.isArray(photoQueries)
    ? photoQueries
    : [photoQueries || 'rice paddy morning mist'];

  // Gabung: query dari AI + ultimate fallback di akhir
  const allQueries = [...queries, ...ULTIMATE_FALLBACKS];

  const errors = [];

  for (let i = 0; i < allQueries.length; i++) {
    const query = allQueries[i];
    const label = i < queries.length
      ? `AI query ${i + 1}/${queries.length}`
      : `fallback ${i - queries.length + 1}/${ULTIMATE_FALLBACKS.length}`;

    try {
      console.log(`[UNSPLASH] Trying ${label}: "${query}"`);
      const result = await fetchSingleQuery(query, accessKey);
      console.log(`[UNSPLASH] ✓ Found safe photo via "${query}" — Credit: ${result.credit}`);
      return result.url;

    } catch (err) {
      console.warn(`[UNSPLASH] ✗ ${label} "${query}" gagal: ${err.message}`);
      errors.push({ query, reason: err.message });

      // Rate limit → stop total, tidak ada gunanya lanjut
      if (/rate limit|403|429/.test(err.message)) {
        console.error('[UNSPLASH] Rate limit reached — cascade dihentikan');
        break;
      }
    }
  }

  // Semua gagal
  console.error('[UNSPLASH] Semua query gagal:', errors.map(e => `"${e.query}": ${e.reason}`).join(' | '));
  throw new Error('Tidak bisa mengambil foto dari Unsplash. Kartu akan dibuat tanpa foto.');
}

module.exports = { fetchUnsplashPhoto };