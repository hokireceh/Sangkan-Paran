# Sangkan Paran Bot

Bot Telegram yang menghasilkan **Wisdom Card** berisi kearifan lokal Jawa, dalil Al-Qur'an/Hadits, dan foto dari Unsplash.

## Arsitektur

| File | Fungsi |
|---|---|
| `index.js` | Entry point bot — semua command & callback handler |
| `groq.js` | Integrasi Groq AI (Llama 3.3) untuk generate konten |
| `renderer.js` | Render HTML → PNG menggunakan Puppeteer |
| `unsplash.js` | Fetch foto dari Unsplash API |

## Commands Bot (Slash Command)

- `/start` — Selamat datang & buka menu utama
- `/help` — Panduan penggunaan

## Menu Bot (ReplyKeyboard — tombol "Menu" di text bar)

Keyboard tersembunyi di belakang tombol **Menu** di text bar Telegram (`is_persistent: false`). User tap "Menu" untuk toggle:

- 🎴 **Buat Wisdom Card** — Ketik tema, bot buatkan kartu
- 📂 **Pilih Tema** — Pilih dari 25+ tema per 4 kategori via inline keyboard
- 🎲 **Random Card** — Wisdom Card acak langsung
- 📜 **Riwayat Tema** — Lihat & ulangi tema yang pernah dibuat
- ℹ️ **Tentang Bot** — Filosofi & info Sangkan Paran
- 📖 **Bantuan** — Panduan penggunaan

## Environment Variables

```
TELEGRAM_BOT_TOKEN=...
GROQ_API_KEY=...
UNSPLASH_ACCESS_KEY=...
```

## Fitur

- ReplyKeyboard tersembunyi di tombol "Menu" bawaan Telegram (tidak persistent)
- Inline keyboard untuk pilih tema dari 4 kategori
- Callback handler untuk semua tombol interaktif
- Auto-suggest saat user ketik teks bebas
- Tombol ulang & random setelah kartu dikirim
- Cooldown 12 detik + per-user request lock anti-spam
- In-memory cache konten 30 menit per tema
- Periodic cleanup stale Map setiap 1 jam

## Workflow

- **Start application**: `node index.js` (console, autoStart)
