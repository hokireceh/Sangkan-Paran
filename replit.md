# Sangkan Paran Bot

Bot Telegram yang menghasilkan **Wisdom Card** berisi kearifan lokal Jawa, dalil Al-Qur'an/Hadits, dan foto dari Unsplash.

## Arsitektur

| File | Fungsi |
|---|---|
| `index.js` | Entry point bot — semua command & callback handler |
| `groq.js` | Integrasi Groq AI (Llama 3.3) untuk generate konten |
| `renderer.js` | Render HTML → PNG menggunakan Puppeteer |
| `unsplash.js` | Fetch foto dari Unsplash API |

## Commands Bot

- `/start` — Selamat datang
- `/wisdom [tema]` — Generate Wisdom Card
- `/tema` — Pilih tema dari inline keyboard (4 kategori)
- `/random` — Wisdom Card acak langsung
- `/about` — Info & filosofi Sangkan Paran
- `/help` — Panduan

## Environment Variables

```
TELEGRAM_BOT_TOKEN=...
GROQ_API_KEY=...
UNSPLASH_ACCESS_KEY=...
```

## Fitur

- Inline keyboard untuk pilih tema dari kategori
- Callback handler untuk tombol interaktif
- Auto-suggest saat user ketik teks bebas
- Tombol ulang & random setelah kartu dikirim
- 25+ tema dari 4 kategori (Spiritual, Kehidupan, Hubungan, Karakter)
- `setMyCommands` untuk menu command Telegram resmi

## Workflow

- **Start application**: `node index.js` (console, autoStart)
