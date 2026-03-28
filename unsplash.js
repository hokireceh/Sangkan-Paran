const https = require('https');

// ─── Fetch satu query ─────────────────────────────────────────────────────────
function fetchSingleQuery(query, accessKey) {
  return new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(query);
    const url = `https://api.unsplash.com/photos/random?query=${encoded}&orientation=landscape&content_filter=high&client_id=${accessKey}`;

    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);

          // Rate limit dari Unsplash
          if (res.statusCode === 403 || res.statusCode === 429) {
            reject(new Error(`Unsplash rate limit (${res.statusCode})`));
            return;
          }

          if (json.errors) {
            reject(new Error(json.errors[0]));
            return;
          }

          const photoUrl = json.urls?.regular || json.urls?.small;
          if (!photoUrl) {
            reject(new Error('No photo URL in response'));
            return;
          }

          resolve({
            url: photoUrl,
            credit: json.user?.name || 'Unsplash',
            creditLink: json.user?.links?.html || 'https://unsplash.com',
            query,
          });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// ─── Main: cascade photo_queries array ───────────────────────────────────────
async function fetchUnsplashPhoto(photoQueries) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) throw new Error('UNSPLASH_ACCESS_KEY not set');

  // Support string lama (backward compatible) & array baru
  const queries = Array.isArray(photoQueries)
    ? photoQueries
    : [photoQueries || 'peaceful nature wisdom'];

  // Tambah fallback universal di akhir
  const allQueries = [...queries, 'peaceful nature sunrise', 'spiritual journey light'];

  const errors = [];

  for (let i = 0; i < allQueries.length; i++) {
    const query = allQueries[i];
    try {
      console.log(`[UNSPLASH] Trying query ${i + 1}/${allQueries.length}: "${query}"`);
      const result = await fetchSingleQuery(query, accessKey);
      console.log(`[UNSPLASH] ✓ Found photo via "${query}" — Credit: ${result.credit}`);
      return result.url;
    } catch (err) {
      console.warn(`[UNSPLASH] ✗ Query "${query}" failed: ${err.message}`);
      errors.push({ query, reason: err.message });

      // Kalau rate limit, stop cascade — tidak akan berhasil dengan query lain
      if (/rate limit|403|429/.test(err.message)) {
        console.error('[UNSPLASH] Rate limit reached, stopping cascade');
        break;
      }
    }
  }

  // Semua query gagal
  console.error('[UNSPLASH] Semua query gagal:', errors.map(e => `"${e.query}": ${e.reason}`));
  throw new Error('Tidak bisa mengambil foto dari Unsplash. Kartu akan dibuat tanpa foto.');
}

module.exports = { fetchUnsplashPhoto };