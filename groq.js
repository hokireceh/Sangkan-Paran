'use strict';

const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ─── Model Tiers ──────────────────────────────────────────────────────────────
const MODEL_TIERS = [
  { name: 'llama-3.3-70b-versatile',                  dailyLimit: 1000,  quality: 10, temperature: 0.92, description: 'Premium (10/10)'  },
  { name: 'moonshotai/kimi-k2-instruct',               dailyLimit: 1000,  quality: 9,  temperature: 0.88, description: 'High (9/10)'      },
  { name: 'compound-beta',                             dailyLimit: 250,   quality: 8,  temperature: 0.85, description: 'Good (8/10)'      },
  { name: 'meta-llama/llama-4-scout-17b-16e-instruct', dailyLimit: 1000,  quality: 7,  temperature: 0.82, description: 'Scout (7/10)'     },
  { name: 'llama-3.1-8b-instant',                      dailyLimit: 14400, quality: 6,  temperature: 0.78, description: 'Standard (6/10)'  },
];

// ─── Random Themes ────────────────────────────────────────────────────────────
const RANDOM_THEMES = [
  'sabar', 'syukur', 'rezeki', 'ikhlas', 'tawakkal',
  'kerja keras', 'doa', 'keikhlasan', 'cinta', 'keluarga',
  'usaha', 'ridho', 'tawakal', 'qanaah', 'istiqomah',
  'semangat', 'perjuangan', 'keberanian', 'bangkit', 'kejujuran',
  'kerendahan hati', 'kesederhanaan', 'keadilan', 'amanah', 'persahabatan',
  'nrimo', 'welas asih', 'eling', 'laku', 'gusti',
];

// ─── Persona Variants ─────────────────────────────────────────────────────────
const PERSONA_VARIANTS = [
  {
    nama: 'Mbah Suro',
    asal: 'lereng Gunung Kidul',
    gaya: 'pelan, menghujam, tidak banyak kata — seperti orang yang sudah menerima segalanya',
    ciri: 'sering memakai perumpamaan alam: sawah, batu, air, pohon',
  },
  {
    nama: 'Ki Suwondo',
    asal: 'pinggir kali Bengawan Solo',
    gaya: 'sedikit jenaka tapi dalam, seperti orang tua yang sedang bergurau sambil menasehati',
    ciri: 'suka memakai perbandingan kehidupan sehari-hari: pasar, dapur, ladang',
  },
  {
    nama: 'Mbah Kartini',
    asal: 'dusun terpencil di Blitar',
    gaya: 'lembut tapi tajam, seperti ibu yang tidak marah-marah tapi kata-katanya tidak bisa dilupakan',
    ciri: 'sering bicara tentang rumah, keluarga, dan hal-hal kecil yang bermakna besar',
  },
  {
    nama: 'Kiai Rondho',
    asal: 'pesantren tua di Jombang',
    gaya: 'tenang, seperti orang yang sudah banyak berdoa dan banyak melihat',
    ciri: 'pandai menghubungkan falsafah Jawa dengan hikmat Islam tanpa terasa dipaksakan',
  },
  // ── BARU: persona terinspirasi karakter Mbah Moen ──
  {
    nama: 'Kiai Maimun',
    asal: 'Pesantren Al-Anwar, Sarang',
    gaya: 'tenang seperti kiai yang sudah banyak berdoa, bicara sedikit tapi tembus ke hati — tidak pernah terburu-buru',
    ciri: 'menggabungkan falsafah Jawa (bener vs pinter, ngemong, andhap asor) dengan hikmah Islam tanpa terasa dipaksakan; sering memberi perumpamaan dari kehidupan santri dan pasar',
  },
  {
    nama: 'Mbah Nun',
    asal: 'pedalaman Jawa Tengah',
    gaya: 'bicara seperti orang yang tidak sedang mengajar — lebih seperti bergumam sendiri tapi semua orang terdiam mendengarnya',
    ciri: 'menggunakan kisah kecil: percikan api, tangkai padi, langkah di lumpur — bukan slogan',
  },
];

// ─── Gaya Petuah Variants ─────────────────────────────────────────────────────
const GAYA_PETUAH_HINTS = [
  'Gunakan gaya paribasan atau bebasan — perumpamaan yang langsung terasa tanpa penjelasan.',
  'Gunakan gaya singiran — sindiran halus seperti dalam tembang, tidak menunjuk langsung.',
  'Gunakan gaya suluk — renungan batin ritmis, seperti larik tembang macapat yang mengalir.',
  'Gunakan gaya tutur sesepuh — omongan langsung seorang yang lebih tua, pendek dan padat.',
  'Gunakan gaya lelagon — pendek, ritmis, mudah diingat, seperti potongan lagu Jawa tua.',
];

// ─── Ayat Hints per Tema ──────────────────────────────────────────────────────
const AYAT_HINTS = {
  // Aqidah & tawakal
  prasangka    : "Hadits paling tepat: 'Ana inda dhanni abdi bi' (أَنَا عِنْدَ ظَنِّ عَبْدِي بِي). Gunakan ini.",
  husnuzan     : "Hadits paling tepat: 'Ana inda dhanni abdi bi' (أَنَا عِنْدَ ظَنِّ عَبْدِي بِي). Gunakan ini.",
  tawakkal     : "Gunakan QS At-Talaq 3 (وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ).",
  tawakal      : "Gunakan QS At-Talaq 3 (وَمَن يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ).",
  // Akhlak
  sabar        : "Gunakan QS Al-Baqarah 153 (إِنَّ اللَّهَ مَعَ الصَّابِرِينَ) atau QS Az-Zumar 10.",
  syukur       : "Gunakan QS Ibrahim 7 (لَئِن شَكَرْتُمْ لَأَزِيدَنَّكُمْ).",
  ikhlas       : "Gunakan QS Al-Bayyinah 5 atau QS Az-Zumar 11.",
  keikhlasan   : "Gunakan QS Al-Bayyinah 5 atau QS Az-Zumar 11.",
  kejujuran    : "Gunakan QS At-Tawbah 119 (وَكُونُوا مَعَ الصَّادِقِينَ).",
  amanah       : "Gunakan QS An-Nisa 58 tentang amanah.",
  qanaah       : "Gunakan hadits: 'Qad aflaha man aslama wa ruziga kafaafan' atau QS At-Talaq 3.",
  keadilan     : "Gunakan QS An-Nisa 135 atau QS Al-Ma'idah 8 tentang keadilan.",
  keberanian   : "Gunakan QS Ali Imran 139 (وَلَا تَهِنُوا وَلَا تَحْزَنُوا) atau hadits tentang syaja'ah.",
  kerendahan   : "Gunakan hadits: 'Ma tawadha'a ahadun lillahi illa rafa'ahullah' tentang tawadhu.",
  'kerendahan hati': "Gunakan hadits: 'Ma tawadha'a ahadun lillahi illa rafa'ahullah' tentang tawadhu.",
  kesederhanaan: "Gunakan hadits tentang zuhud: 'Kun fid dunya ka annaka gharibun' atau QS Al-Hadid 20.",
  istiqomah    : "Gunakan QS Fussilat 30 (إِنَّ الَّذِينَ قَالُوا رَبُّنَا اللَّهُ ثُمَّ اسْتَقَامُوا).",
  // Ibadah & doa
  doa          : "Gunakan QS Al-Baqarah 186 (وَإِذَا سَأَلَكَ عِبَادِي عَنِّي فَإِنِّي قَرِيبٌ).",
  ridho        : "Gunakan hadits 'Ridha Allah fi ridha al-walidayn' atau QS Al-Fajr 28.",
  // Rezeki & usaha
  rezeki       : "Gunakan QS Hud 6 (وَمَا مِن دَابَّةٍ فِي الْأَرْضِ إِلَّا عَلَى اللَّهِ رِزْقُهَا) atau QS Adz-Dzariyat 22.",
  usaha        : "Gunakan QS An-Najm 39 (وَأَن لَّيْسَ لِلْإِنسَانِ إِلَّا مَا سَعَى).",
  'kerja keras': "Gunakan QS An-Najm 39 (وَأَن لَّيْسَ لِلْإِنسَانِ إِلَّا مَا سَعَى).",
  // Hubungan sosial
  cinta        : "Gunakan QS Al-Baqarah 165 atau hadits tentang cinta karena Allah.",
  keluarga     : "Gunakan QS At-Tahrim 6 atau QS An-Nisa 1.",
  persahabatan : "Gunakan hadits: 'Al-mar'u ala dini khalilihi' tentang pengaruh kawan dekat.",
  welas        : "Gunakan QS Al-Anbiya 107 (وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ).",
  'welas asih' : "Gunakan QS Al-Anbiya 107 (وَمَا أَرْسَلْنَاكَ إِلَّا رَحْمَةً لِّلْعَالَمِينَ).",
  // Semangat & bangkit
  semangat     : "Gunakan QS Ali Imran 139 (وَلَا تَهِنُوا وَلَا تَحْزَنُوا وَأَنتُمُ الْأَعْلَوْنَ).",
  bangkit      : "Gunakan QS Ali Imran 139 atau QS Az-Zumar 53 tentang jangan berputus asa.",
  perjuangan   : "Gunakan QS Al-Ankabut 69 (وَالَّذِينَ جَاهَدُوا فِينَا لَنَهْدِيَنَّهُمْ سُبُلَنَا).",
  // Kearifan Jawa murni
  nrimo        : "Gunakan hadits qanaah: 'Qad aflaha man aslama wa ruziga kafaafan wa qanna'ahullahu bima atahu'.",
  eling        : "Gunakan QS Al-Hasyr 19 (وَلَا تَكُونُوا كَالَّذِينَ نَسُوا اللَّهَ فَأَنسَاهُمْ أَنفُسَهُمْ).",
  laku         : "Gunakan QS Al-Ankabut 69 tentang mujahadah atau QS Al-Inshirah 7 (فَإِذَا فَرَغْتَ فَانصَبْ).",
  gusti        : "Gunakan QS Al-Baqarah 186 (فَإِنِّي قَرِيبٌ) atau hadits Qudsi tentang kedekatan Allah.",
};

// ─── In-Memory Cache ──────────────────────────────────────────────────────────
const _cache      = new Map();
const CACHE_TTL   = 1000 * 60 * 30; // 30 menit

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _cache.delete(key);
    return null;
  }
  return entry.data;
}

function cacheSet(key, data) {
  // Batasi cache max 200 entri — hindari memory leak
  if (_cache.size >= 200) {
    const oldest = _cache.keys().next().value;
    _cache.delete(oldest);
  }
  _cache.set(key, { data, ts: Date.now() });
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getAyatHint(tema) {
  const key = tema.toLowerCase().trim();
  if (AYAT_HINTS[key]) return AYAT_HINTS[key];
  for (const [k, v] of Object.entries(AYAT_HINTS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return 'Pilih ayat atau hadits yang PALING SPESIFIK dan PALING LANGSUNG relevan dengan tema — BUKAN ayat umum tentang keimanan atau hari akhir. Pikirkan: ada tidak hadits atau ayat yang menyebut tema ini secara eksplisit?';
}

// ─── JSON Extractor — lebih aman dari greedy regex ────────────────────────────
function extractJsonBlock(rawText) {
  const start = rawText.indexOf('{');
  const end   = rawText.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Tidak ada blok JSON dalam response');
  }
  return rawText.slice(start, end + 1);
}

// ─── Sanitasi JSON — aman untuk aksara Arab & Jawa ───────────────────────────
// Hanya bersihkan newline/tab di dalam string value, tidak sentuh karakter Unicode
function sanitizeJsonString(jsonStr) {
  let result  = '';
  let inStr   = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (escaped) {
      result  += ch;
      escaped  = false;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      inStr  = !inStr;
      result += ch;
      continue;
    }

    if (inStr) {
      // Dalam string: escape karakter kontrol yang merusak JSON
      if (ch === '\n')      { result += '\\n';  continue; }
      if (ch === '\r')      {                   continue; } // buang CR
      if (ch === '\t')      { result += ' ';    continue; }
      if (ch.charCodeAt(0) < 0x20) {            continue; } // kontrol lain
    }

    result += ch;
  }

  return result;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────
function buildPrompt(tema) {
  const persona  = pick(PERSONA_VARIANTS);
  const gaya     = pick(GAYA_PETUAH_HINTS);
  const ayatHint = getAyatHint(tema);
  const quirk    = Math.random() < 0.4
    ? '\nKali ini, mulai dari sesuatu yang kecil dan sering diabaikan — bukan dari hal yang besar dan jelas.'
    : '';

  const isKonteks = tema.split(/\s+/).length > 6 || tema.length > 50;
  const temaBlock = isKonteks
    ? `Konteks / inspirasi dari pengguna:
"${tema}"

Tangkap sari dari konteks di atas. Temukan satu tema inti paling kuat
(1–4 kata, misalnya: husnuzan, sabar, rezeki) dan jadikan landasan wisdom card.
Isi field "tema" dengan tema inti itu — BUKAN salin ulang teks konteks.`
    : `Tema: "${tema}"`;

  return `Kamu adalah ${persona.nama}, sesepuh Jawa dari ${persona.asal}.
Caramu bicara: ${persona.gaya}.
Kamu dikenal karena: ${persona.ciri}.

Kamu tidak pernah ceramah. Kamu tidak memberi motivasi.
Kamu hanya berkata — dan kata-katamu terasa karena datang dari pengalaman hidup yang panjang.
Kamu hafal ribuan petuah dari paribasan, bebasan, saloka, singiran, suluk, serat,
tembang macapat, dan tradisi lisan Jawa yang jarang tercatat di buku manapun.

${temaBlock}
${quirk}

${gaya}

Tuliskan wisdom card "Sangkan Paran". Pilih petuah yang paling menghujam,
paling jarang dipakai, dan paling terasa seperti keluar dari mulut ${persona.nama} sendiri.

OUTPUT: JSON valid saja, tanpa teks lain di luar JSON.

{
  "tema": "tema inti 1–4 kata bahasa Indonesia — BUKAN salin ulang input",

  "kutipan_motivasi": "3–5 baris BAHASA JAWA NGOKO atau KRAMA MURNI, dipisah \\n. TIGA ATURAN MUTLAK: (1) JANGAN menyebut tema secara langsung — biarkan makna muncul sendiri dari gambaran yang kamu buat. (2) Gunakan perumpamaan konkret: alam, benda, kejadian sehari-hari — bukan kata abstrak. (3) Struktur bukan kalimat biasa — bisa berima, bisa patah-patah, bisa seperti gumaman. CONTOH BENAR untuk tema sabar: 'wit gedhang ora rubuh amung sak pisan\\nkena angin mung mlengkung\\nbali ngadeg maneh'. CONTOH SALAH: 'kudu sabar lan ikhlas supaya urip ayem' — ini ceramah, bukan petuah. KATA TERLARANG: kudu percaya, mesthi apik, tansah eling, selalu, tetap, harus, agar, supaya, dan semua kata bahasa Indonesia.",

  "kata_jawa": "satu kata atau frasa Jawa asli yang paling tepat merangkum tema — BUKAN 'Sangkan Paran', BUKAN kata serapan umum",

  "arti_jawa": "arti singkat bahasa Indonesia, jujur dan tepat",

  "ayat_arab": "${ayatHint} Tulis dalam aksara Arab yang benar.",

  "transliterasi": "transliterasi latin dengan spasi antar kata — contoh benar: wa man yata wakkal alallahi fa huwa hasbuh",

  "arti_ayat": "terjemahan singkat bahasa Indonesia",

  "photo_queries": [
    "WAJIB bahasa Inggris murni. WAJIB mulai dengan salah satu anchor word ini: rice paddy / mosque / river stream / banyan tree / mountain fog / rice field / old wooden door / tropical forest / rice terrace. Contoh BENAR: 'rice paddy morning mist soft light'. Contoh SALAH: 'rural village courtyard' atau 'peaceful nature' — terlalu ambigu, Unsplash bisa return foto apa saja.",
    "bahasa Inggris — anchor word berbeda dari query 1, alam atau arsitektur tradisional, terang minimal",
    "bahasa Inggris — anchor word spiritual: mosque / old wooden door / banyan tree / river stone, soft light airy"
  ],

  "hashtags": ["Tag1","Tag2","Tag3","Tag4","Tag5","Tag6","Tag7"]
}

RINGKASAN PRINSIP:
1. kutipan: menyiratkan bukan menjelaskan — konkret bukan abstrak — Jawa murni tanpa campuran Indonesia.
2. kata_jawa: asli Jawa, bukan nama bot, bukan serapan umum.
3. ayat_arab: spesifik ke tema. Transliterasi ada spasi antar kata.
4. photo_queries: bahasa Inggris, padanan Unsplash yang terbukti bekerja.
5. hashtags: 7 string tanpa # tanpa spasi, campur Indonesia–Jawa–Inggris.
6. JSON valid — tidak ada karakter yang merusak parse.`;
}

// ─── Retry Prompt ─────────────────────────────────────────────────────────────
function buildRetryPrompt(tema, attempt) {
  const persona  = pick(PERSONA_VARIANTS);
  const gaya     = pick(GAYA_PETUAH_HINTS);
  const ayatHint = getAyatHint(tema);

  const hints = [
    '',
    'Kali ini buat kutipan lebih pendek — dua atau tiga baris saja, tapi setiap kata punya berat.',
    'Kali ini gunakan satu metafora tunggal yang dikembangkan — satu benda atau kejadian yang mewakili seluruh tema.',
    'Kali ini coba gaya singiran — seperti sindiran tembang yang tidak langsung menyebut siapa.',
    '',
  ];

  const hint      = hints[attempt] || '';
  const isKonteks = tema.split(/\s+/).length > 6 || tema.length > 50;
  const temaLine  = isKonteks
    ? `Konteks: "${tema}"\nTangkap tema intinya — 1–4 kata untuk field "tema".`
    : `Tema: "${tema}"`;

  return `Kamu adalah ${persona.nama} dari ${persona.asal}.
Caramu bicara: ${persona.gaya}.
${gaya}

${temaLine}
${hint}

OUTPUT: JSON valid saja.

{
  "tema": "tema inti 1–4 kata",
  "kutipan_motivasi": "3–5 baris Jawa murni, dipisah \\n. Menyiratkan bukan menjelaskan. Konkret bukan abstrak. Bukan ceramah.",
  "kata_jawa": "satu kata/frasa Jawa asli — bukan nama bot",
  "arti_jawa": "arti singkat bahasa Indonesia",
  "ayat_arab": "${ayatHint} Tulis dalam aksara Arab.",
  "transliterasi": "transliterasi latin dengan spasi antar kata",
  "arti_ayat": "terjemahan singkat Indonesia",
  "photo_queries": [
    "bahasa Inggris — WAJIB mulai dengan anchor: rice paddy / mosque / river stream / banyan tree / rice field / old wooden door. Contoh: 'rice paddy morning mist'",
    "bahasa Inggris — anchor alam: mountain fog / tropical forest / river stones soft light",
    "bahasa Inggris — anchor spiritual: mosque interior / banyan tree roots / old wooden door morning"
  ],
  "hashtags": ["Tag1","Tag2","Tag3","Tag4","Tag5","Tag6","Tag7"]
}`;
}

// ─── Parse & Normalize ────────────────────────────────────────────────────────
function parseResponse(rawText, tema) {
  // ── Ekstrak blok JSON ──
  const jsonBlock  = extractJsonBlock(rawText);
  const sanitized  = sanitizeJsonString(jsonBlock);

  let content;
  try {
    content = JSON.parse(sanitized);
  } catch (e) {
    throw new Error(`JSON parse gagal: ${e.message}`);
  }

  // ── Normalisasi photo_queries ──
  const INDO_IN_QUERY = /\b(sawah|sungai|pohon|gunung|masjid|desa|pagi|dengan|dan|di|dalam|yang)\b/i;
  const FALLBACK_QUERIES = [
    'rice paddy morning mist soft light',
    'peaceful river stream morning light',
    'tropical nature sunrise soft light airy',
  ];

  if (!Array.isArray(content.photo_queries) || content.photo_queries.length === 0) {
    content.photo_queries = [...FALLBACK_QUERIES];
  } else {
    content.photo_queries = content.photo_queries
      .map((q) => {
        if (typeof q !== 'string' || q.trim().length === 0) return null;
        if (INDO_IN_QUERY.test(q)) {
          console.warn(`[WARN] photo_query mengandung kata Indonesia: "${q}" — diganti fallback`);
          return null;
        }
        return q.trim();
      })
      .filter(Boolean);

    // Pastikan selalu ada minimal 3 query
    while (content.photo_queries.length < 3) {
      const fb = FALLBACK_QUERIES[content.photo_queries.length] || FALLBACK_QUERIES[0];
      if (!content.photo_queries.includes(fb)) content.photo_queries.push(fb);
      else break;
    }
  }

  // ── Normalisasi hashtags ──
  if (!Array.isArray(content.hashtags) || content.hashtags.length === 0) {
    content.hashtags = [
      tema.replace(/\s+/g, ''),
      'MotivasiIslam',
      'QuoteJawa',
      'SangkanParan',
      'HikmahPagi',
      'PetuahJawa',
      'Spiritualitas',
    ];
  } else {
    content.hashtags = content.hashtags
      .map((h) => String(h).replace(/^#+/, '').replace(/\s+/g, '').trim())
      .filter((h) => h.length > 0)
      .slice(0, 10);
  }

  // ── Validasi field wajib ──
  const required = [
    'tema', 'kutipan_motivasi', 'kata_jawa',
    'arti_jawa', 'ayat_arab', 'transliterasi', 'arti_ayat',
  ];
  for (const field of required) {
    if (!content[field] || String(content[field]).trim().length < 2) {
      throw new Error(`Field "${field}" kosong atau terlalu pendek`);
    }
  }

  // ── Warn: kutipan masih campur Indonesia ──
  const INDO_IN_KUTIPAN = /\b(mau|gimana|atau|dengan|untuk|dari|kamu|aku|dia|ini|itu|tidak|sudah|akan|bisa|ada|jadi|agar|saja|tetap|selalu|dan|tapi|karena|kalau|emang|banget)\b/i;
  if (INDO_IN_KUTIPAN.test(content.kutipan_motivasi)) {
    console.warn('[WARN] kutipan_motivasi terdeteksi campur Indonesia:', content.kutipan_motivasi.slice(0, 80));
  }

  // ── Warn: transliterasi tidak ada spasi ──
  if (content.transliterasi && !/\s/.test(content.transliterasi) && content.transliterasi.length > 12) {
    console.warn('[WARN] transliterasi tidak ada spasi:', content.transliterasi);
  }

  // ── Warn: kata_jawa adalah nama bot ──
  if (/sangkan paran/i.test(content.kata_jawa)) {
    console.warn('[WARN] kata_jawa adalah nama bot — seharusnya kata Jawa asli');
  }

  return content;
}

// ─── Main: cascade + smart retry + cache ─────────────────────────────────────
async function generateWisdomContent(tema) {
  if (!tema || tema.trim() === '') tema = 'random';
  if (tema === 'random') {
    tema = pick(RANDOM_THEMES);
    console.log(`[INFO] Tema random terpilih: "${tema}"`);
  }

  tema = tema.trim();

  // ── Cache check ──
  const cacheKey    = tema.toLowerCase();
  const cachedData  = cacheGet(cacheKey);
  if (cachedData) {
    console.log(`[INFO] Cache hit untuk tema: "${tema}"`);
    return cachedData;
  }

  const errors     = [];
  let attemptCount = 0;

  for (let i = 0; i < MODEL_TIERS.length; i++) {
    const tier   = MODEL_TIERS[i];
    const prompt = attemptCount === 0
      ? buildPrompt(tema)
      : buildRetryPrompt(tema, attemptCount);

    // max_tokens adaptif: tier premium dapat lebih banyak ruang
    const maxTokens = tier.quality >= 9 ? 1400 : 1100;

    attemptCount++;

    try {
      console.log(`[INFO] Tier ${i + 1}/${MODEL_TIERS.length}: ${tier.name} (${tier.description})`);

      const response = await groq.chat.completions.create({
        model      : tier.name,
        messages   : [{ role: 'user', content: prompt }],
        temperature: tier.temperature,
        max_tokens : maxTokens,
      });

      const rawText = response.choices?.[0]?.message?.content?.trim();
      if (!rawText) throw new Error('Response kosong dari model');

      const content = parseResponse(rawText, tema);

      console.log(`[INFO] ✓ Konten berhasil dari ${tier.name} (${tier.description})`);
      console.log(`[INFO] Tema: ${content.tema} | Kata Jawa: ${content.kata_jawa}`);

      // ── Simpan ke cache sebelum return ──
      cacheSet(cacheKey, content);

      return content;

    } catch (err) {
      const reason         = err?.error?.message || err?.message || String(err);
      const isRateLimit    = /rate.?limit|quota|429|exceeded|limit.reached/i.test(reason);
      const isModelUnavail = /model|not.found|unavailable|400|401|403/i.test(reason);

      console.warn(`[WARN] Tier ${i + 1} (${tier.name}) gagal: ${reason.slice(0, 140)}`);
      errors.push({ tier: tier.name, reason });

      if (isRateLimit)    console.warn('[WARN] Rate limit — lanjut tier berikut');
      if (isModelUnavail) console.warn('[WARN] Model tidak tersedia — lanjut tier berikut');

      continue;
    }
  }

  // ── Semua tier gagal ──
  console.error('[ERROR] Semua model tier gagal:');
  errors.forEach((e, idx) => console.error(`  ${idx + 1}. ${e.tier}: ${e.reason.slice(0, 80)}`));

  throw new Error(
    'Semua model AI tidak tersedia saat ini. Coba lagi dalam beberapa menit.\n' +
    'Detail: ' + errors.map((e) => e.tier).join(', ')
  );
}

// ─── Cache Utilities (opsional, bisa dipakai dari luar) ──────────────────────
function clearCache()            { _cache.clear(); }
function getCacheSize()          { return _cache.size; }
function invalidateCache(tema)   { _cache.delete(tema.toLowerCase().trim()); }

module.exports = {
  generateWisdomContent,
  clearCache,
  getCacheSize,
  invalidateCache,
  MODEL_TIERS,
  RANDOM_THEMES,
};{ generateWisdomContent, MODEL_TIERS };
