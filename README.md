# 🎴 Sangkan Paran Bot

Bot Telegram untuk generate **Wisdom Card** otomatis dengan kearifan lokal Jawa, dalil Al-Qur'an, dan foto dari Unsplash.

---

## ✨ Fitur

- 🤖 **AI Groq** — konten dari 5 model tier dengan cascade fallback otomatis
- 🌿 **Kearifan Jawa** — kutipan Jawa murni (ngoko/krama), kata Jawa asli, 6 persona sesepuh
- 📖 **Dalil Islami** — ayat Al-Qur'an & Hadits spesifik per tema (30+ tema)
- 🖼️ **Foto Unsplash** — pencarian terkontrol dengan blacklist & collection filter
- 🗂️ **Cache 30 menit** — tema yang sama tidak panggil API ulang
- 🔒 **Anti-spam** — cooldown 12 detik + per-user request lock

---

## 🚀 Setup & Instalasi

### 1. Clone / Download project ini

### 2. Install dependencies
```bash
npm install
```

### 3. Install Chromium untuk Puppeteer
```bash
npx puppeteer browsers install chrome
```

### 4. Buat file `.env`
```bash
cp .env.example .env
```

Lalu isi ketiga API key di file `.env`:
```
TELEGRAM_BOT_TOKEN=isi_token_telegram_kamu
GROQ_API_KEY=isi_groq_api_key_kamu
UNSPLASH_ACCESS_KEY=isi_unsplash_key_kamu
```

### 5. Jalankan bot
```bash
npm start
```

---

## 🔑 Cara Dapat API Keys

### Telegram Bot Token
1. Buka Telegram → cari **@BotFather**
2. Kirim `/newbot`
3. Ikuti instruksi, copy token-nya

### Groq API Key
1. Buka [console.groq.com](https://console.groq.com)
2. Sign up / login
3. Klik **API Keys** → **Create API Key**

### Unsplash Access Key
1. Buka [unsplash.com/developers](https://unsplash.com/developers)
2. Register as developer
3. **New Application** → copy **Access Key**

---

## 💬 Cara Pakai Bot

### Commands
| Command | Fungsi |
|---|---|
| `/start` | Pesan selamat datang & menu utama |
| `/help` | Panduan penggunaan |

### Menu Utama (Reply Keyboard)
| Tombol | Fungsi |
|---|---|
| 🎴 Buat Wisdom Card | Ketik tema sendiri |
| 📂 Pilih Tema | Pilih dari daftar 25+ tema |
| 🎲 Random Card | Wisdom Card acak langsung |
| 📜 Riwayat Tema | 10 tema terakhir yang pernah dibuat |
| ℹ️ Tentang Bot | Filosofi & info Sangkan Paran |
| 📖 Bantuan | Panduan lengkap |

### Contoh tema yang bisa diketik langsung:
```
sabar          syukur         rezeki
ikhlas         tawakkal       kerja keras
cinta          keluarga       kejujuran
qanaah         istiqomah      welas asih
nrimo          eling          perjuangan
```

### Fitur tambahan:
- Ketik teks bebas → bot tawari buat Wisdom Card otomatis
- Tombol **🔄 Ulangi tema ini** & **🎲 Random lagi** setelah kartu dikirim
- Inline keyboard kategori: Spiritual, Kehidupan, Hubungan, Karakter

---

## 📁 Struktur File

```
sangkan-paran-bot/
├── index.js          ← Main bot Telegram (handler pesan & callback)
├── groq.js           ← Groq AI content generator (cascade model + cache)
├── renderer.js       ← HTML → PNG card renderer (Puppeteer)
├── unsplash.js       ← Unsplash photo fetcher (search + blacklist)
├── package.json
├── .env.example
└── README.md
```

---

## ⚙️ Konfigurasi Lanjutan (Opsional)

### Ganti Chromium path manual
Tambahkan di `.env`:
```
CHROMIUM_PATH=/usr/bin/chromium
```
Kalau tidak diset, bot akan cari otomatis via `which chromium`.

### Jalankan dengan PM2 (recommended untuk production)
```bash
npm install -g pm2
pm2 start index.js --name sangkan-paran
pm2 save
pm2 startup
```

---

## 🧠 Arsitektur AI

```
Request tema
    │
    ▼
Cache check (30 menit)
    │ miss
    ▼
Tier 1: llama-3.3-70b-versatile   (Premium)
    │ gagal / rate limit
    ▼
Tier 2: kimi-k2-instruct           (High)
    │ gagal
    ▼
Tier 3: compound-beta              (Good)
    │ gagal
    ▼
Tier 4: llama-4-scout              (Scout)
    │ gagal
    ▼
Tier 5: llama-3.1-8b-instant       (Standard)
```

---

*— Sangkan Paran —*