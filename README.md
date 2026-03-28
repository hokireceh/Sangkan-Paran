# 🎴 Sangkan Paran Bot

Bot Telegram untuk generate **Wisdom Card** otomatis dengan kearifan lokal Jawa, dalil Al-Qur'an, dan foto dari Unsplash.

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

## 💬 Commands Bot

| Command | Fungsi |
|---|---|
| `/start` | Pesan selamat datang |
| `/wisdom [tema]` | Generate Wisdom Card dengan tema tertentu |
| `/tema` | Pilih tema dari daftar kategori (inline keyboard) |
| `/random` | Wisdom Card acak langsung |
| `/about` | Info & filosofi Sangkan Paran |
| `/help` | Panduan penggunaan |

**Contoh:**
```
/wisdom sabar
/wisdom rezeki
/wisdom ikhlas
/wisdom kerja keras
/wisdom tawakkal
```

**Fitur tambahan:**
- Ketik teks bebas → bot otomatis tawari buat Wisdom Card
- Tombol 🔄 Tema lain & 🎲 Random setelah kartu dikirim
- Inline keyboard kategori tema: Spiritual, Kehidupan, Hubungan, Karakter

---

## 📁 Struktur File

```
sangkan-paran-bot/
├── index.js          ← Main bot Telegram
├── groq.js           ← Groq AI content generator
├── renderer.js       ← HTML → PNG renderer
├── unsplash.js       ← Unsplash photo fetcher
├── package.json
├── .env.example
└── README.md
```

---

*— Sangkan Paran —*
