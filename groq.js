const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Auto Cascade - 5 Tier Model System ──────────────────────────────────────
const MODEL_TIERS = [
  { name: 'llama-3.3-70b-versatile',                  dailyLimit: 1000,  quality: 10, description: 'Premium (10/10)'  },
  { name: 'moonshotai/kimi-k2-instruct',               dailyLimit: 1000,  quality: 9,  description: 'High (9/10)'     },
  { name: 'compound-beta',                             dailyLimit: 250,   quality: 8,  description: 'Good (8/10)'     },
  { name: 'meta-llama/llama-4-scout-17b-16e-instruct', dailyLimit: 1000,  quality: 7,  description: 'Scout (7/10)'    },
  { name: 'llama-3.1-8b-instant',                      dailyLimit: 14400, quality: 6,  description: 'Standard (6/10)' },
];

// ─── Random Themes ────────────────────────────────────────────────────────────
const RANDOM_THEMES = [
  'sabar', 'syukur', 'rezeki', 'ikhlas', 'tawakkal',
  'kerja keras', 'doa', 'keikhlasan', 'cinta', 'keluarga',
  'usaha', 'ridho', 'tawakal', 'qanaah', 'istiqomah',
  'semangat', 'perjuangan', 'keberanian', 'bangkit', 'kejujuran',
  'kerendahan hati', 'kesederhanaan', 'keadilan', 'amanah', 'persahabatan',
];

// ─── Prompt builder ───────────────────────────────────────────────────────────
function buildPrompt(tema) {
  return `Kamu adalah ahli filosofi Jawa dan Islam sekaligus direktur kreatif visual.
Buatkan konten Wisdom Card "Sangkan Paran" untuk tema: "${tema}".

OUTPUT: HANYA JSON valid berikut, tanpa teks lain apapun di luar JSON.

{
  "tema": "${tema}",
  "kutipan_motivasi": "3-5 baris puitis BAHASA JAWA NGOKO/KRAMA (bukan bahasa Indonesia) dipisah \\n, seperti contoh: eleng asale eleng baline\\nseko teko ora gowo opo-opo\\nbakal bali tanpo gowo opo-opo",
  "kata_jawa": "satu kata/frasa Jawa asli",
  "arti_jawa": "arti singkat dalam bahasa Indonesia",
  "ayat_arab": "potongan ayat Al-Quran atau Hadits dalam aksara Arab",
  "transliterasi": "transliterasi latin tanpa tanda kurung",
  "arti_ayat": "terjemahan singkat bahasa Indonesia",
  "photo_queries": [
    "deskripsi visual scene konkret bahasa Inggris 3-5 kata untuk foto tema ini",
    "alternatif scene visual berbeda juga deskriptif",
    "fallback lebih umum tapi relevan"
  ],
  "hashtags": [
    "TagPertama",
    "TagKedua",
    "TagKetiga",
    "TagKeempat",
    "TagKelima",
    "TagKeenam",
    "TagKetujuh"
  ]
}

ATURAN WAJIB:
1. kutipan_motivasi: WAJIB dalam bahasa Jawa ngoko atau krama (BUKAN bahasa Indonesia), per baris pendek, puitis, menyentuh hati. Contoh untuk tema sabar: "alon-alon waton kelakon\nora susah kesusu\nnrima ing pandum\nwiting tresna jalaran saka kulina"
2. kata_jawa: kata Jawa autentik yang relevan tema
3. ayat_arab: ayat/hadits sahih yang benar-benar relevan
4. photo_queries: WAJIB deskripsi scene nyata (bukan kata abstrak), contoh untuk tema sabar: "elderly man praying at dawn mosque", "calm water flowing between rocks", "person sitting alone mountain sunrise"
5. hashtags: 7 string tanpa spasi tanpa #, campur Indonesia+Inggris, relevan tema, berpotensi viral di medsos. Contoh untuk sabar: ["KataSabar","SabarItuIndah","Patience","QuoteSabar","MotivasiIslam","HidupSabar","IslamicQuotes"]
6. Semua nilai string harus VALID JSON — tidak boleh ada karakter yang merusak JSON`;
}

// ─── Parse & normalize response ───────────────────────────────────────────────
function parseResponse(text, tema) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Tidak ada JSON dalam response');

  // Sanitasi newline literal di dalam string JSON
  const sanitized = jsonMatch[0]
    .replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
      m.replace(/\n/g, '\\n').replace(/\r/g, '').replace(/\t/g, ' ')
    );

  const content = JSON.parse(sanitized);

  // Normalisasi photo_queries
  if (!Array.isArray(content.photo_queries) || content.photo_queries.length === 0) {
    content.photo_queries = [tema + ' nature peaceful', tema + ' spiritual', 'peaceful nature light'];
  }

  // Normalisasi hashtags
  if (!Array.isArray(content.hashtags) || content.hashtags.length === 0) {
    content.hashtags = [tema.replace(/\s+/g, ''), 'MotivasiIslam', 'QuoteJawa'];
  } else {
    content.hashtags = content.hashtags
      .map(h => String(h).replace(/^#+/, '').replace(/\s+/g, '').trim())
      .filter(h => h.length > 0)
      .slice(0, 10);
  }

  return content;
}

// ─── Main: cascade through tiers ─────────────────────────────────────────────
async function generateWisdomContent(tema) {
  if (tema === 'random') {
    tema = RANDOM_THEMES[Math.floor(Math.random() * RANDOM_THEMES.length)];
  }

  const prompt = buildPrompt(tema);
  const errors = [];

  for (let i = 0; i < MODEL_TIERS.length; i++) {
    const tier = MODEL_TIERS[i];
    try {
      console.log(`[INFO] Trying model tier ${i + 1}/${MODEL_TIERS.length}: ${tier.name} (${tier.description})`);

      const response = await groq.chat.completions.create({
        model: tier.name,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const text = response.choices[0].message.content.trim();
      const content = parseResponse(text, tema);

      console.log(`[INFO] Content generated via ${tier.name} (${tier.description})`);
      return content;

    } catch (err) {
      const reason = err?.error?.message || err?.message || String(err);
      const isRateLimit = /rate.limit|quota|429|exceeded|limit reached/i.test(reason);
      const isModelUnavail = /model|not found|unavailable|400|401|403/i.test(reason);

      console.warn(`[WARN] Tier ${i + 1} (${tier.name}) failed: ${reason.slice(0, 120)}`);
      errors.push({ tier: tier.name, reason });

      // Kalau bukan rate limit / model unavail, bisa jadi parsing error — coba tier berikut
      if (!isRateLimit && !isModelUnavail) {
        // Parsing / JSON error — masih worth mencoba tier lain
        console.warn(`[WARN] Non-limit error on ${tier.name}, cascading...`);
      }

      // Lanjut ke tier berikutnya
      continue;
    }
  }

  // Semua tier gagal
  console.error('[ERROR] Semua model tier gagal:', errors.map(e => `${e.tier}: ${e.reason.slice(0, 60)}`));
  throw new Error('Semua model AI tidak tersedia saat ini. Coba lagi dalam beberapa menit.');
}

module.exports = { generateWisdomContent, MODEL_TIERS };
