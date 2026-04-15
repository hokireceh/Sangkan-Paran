# Audit Harian — Sangkan Paran Bot
**Tanggal:** 15 April 2026  
**Auditor:** Agent  
**Scope:** Seluruh codebase (`index.js`, `groq.js`, `renderer.js`, `unsplash.js`)

---

## Ringkasan Temuan

| No | File | Baris | Severity | Judul |
|----|------|-------|----------|-------|
| #1 | `groq.js` | 403 | ✅ FIXED | Regex `BAGIAN` strip broken — label tidak pernah terhapus |
| #2 | `index.js` | 342 | ✅ FIXED | Lock gagal tampilkan pesan cooldown yang salah (misleading UX) |
| #3 | `index.js` | 143–148 | 🟡 MEDIUM | Cleanup stale hapus state user yang masih aktif (tidak pernah buat kartu) |
| #4 | `renderer.js` | 113 | 🟡 MEDIUM | `ayat_arab` escaping tidak konsisten — `&` tidak di-escape |
| #5 | `unsplash.js` | 62 | 🟢 LOW | Variable `encoded` dideklarasi tapi tidak pernah dipakai (dead code) |
| #6 | `replit.md` | 17–22 | 🟢 LOW | Dokumentasi menyebut command `/wisdom`, `/tema` yang tidak ada di kode |

---

## Detail Temuan

---

### #1 — 🔴 CRITICAL: Regex BAGIAN strip broken (`groq.js:403`)

**Kode bermasalah:**
```js
content.kutipan_motivasi = content.kutipan_motivasi
  .replace(/BAGIANs*d+s*:s*/gi, '')
```

**Analisis:**  
Regex ini dimaksudkan untuk menghapus label seperti `BAGIAN 1:`, `BAGIAN 2:` yang kadang ditulis AI secara literal.  
Namun regex yang ditulis adalah `/BAGIANs*d+s*:s*/gi` — tanpa backslash `\` di depan `s` dan `d`.  
- `s*` dalam regex berarti "nol atau lebih karakter huruf `s`" — BUKAN whitespace.  
- `d+` berarti "satu atau lebih karakter huruf `d`" — BUKAN digit.  

Akibatnya: replace ini **tidak pernah menghapus label BAGIAN apapun**. Label seperti `BAGIAN 1:` akan tetap muncul di `kutipan_motivasi` dan tampil di kartu.

**Yang benar:** `/BAGIAN\s*\d+\s*:\s*/gi`

---

### #2 — 🟠 HIGH: Lock gagal → pesan cooldown yang salah (`index.js:342`)

**Kode bermasalah (Menu RANDOM):**
```js
if (isOnCooldown(chatId)) return rejectCooldown(chatId);
if (!acquireLock(chatId)) return rejectCooldown(chatId);  // ← salah
```

**Analisis:**  
Ketika `acquireLock` gagal (artinya sedang ada proses berjalan, bukan cooldown timer), bot menampilkan pesan:  
> "⏱ Sabar sebentar ya! Tunggu X detik lagi."  

Pesan ini menyebut "X detik" — padahal seharusnya kondisinya adalah "sedang memproses permintaan sebelumnya".  
Ini membingungkan user karena timer countdown yang ditampilkan tidak relevan.  

Hal yang sama terjadi di `state === 'waiting_tema'` (baris 419).  
Catatan: callback_query handler sudah benar — menampilkan pesan berbeda saat lock gagal (baris 471-475).

---

### #3 — 🟡 MEDIUM: Cleanup stale hapus state user yang masih aktif (`index.js:143–148`)

**Kode bermasalah:**
```js
for (const chatId of userState.keys()) {
  if (!lastRequest.has(chatId)) { userState.delete(chatId); cleaned++; }
}
for (const chatId of userHistory.keys()) {
  if (!lastRequest.has(chatId)) { userHistory.delete(chatId); cleaned++; }
}
```

**Analisis:**  
`lastRequest` hanya diisi saat user membuat kartu (`setCooldown`).  
User yang hanya menekan `/start`, melihat About, atau melihat History **tidak pernah masuk ke `lastRequest`**.  
Jika cleanup interval berjalan dan user sedang dalam state `waiting_tema` (tapi belum pernah buat kartu), statenya akan dihapus — padahal user masih menunggu bisa input tema.  
Efek yang lebih parah: `userHistory` akan terhapus untuk semua user yang tidak pernah buat kartu — ini benar tapi mungkin tidak disengaja sebagai satu-satunya cleanup gate.

---

### #4 — 🟡 MEDIUM: `ayat_arab` escaping tidak konsisten (`renderer.js:113`)

**Kode bermasalah:**
```js
const ayatArab = String(content.ayat_arab ?? '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
```

**Perbandingan:** Semua field lain menggunakan `escapeHtml()` yang meng-escape `&`, `<`, `>`, `"`, `'`.  
`ayat_arab` hanya meng-escape `<` dan `>`.  
Jika AI mengembalikan teks Arab yang mengandung `&` (misalnya karena encoding error atau format aneh), ini bisa merusak HTML dan menghasilkan kartu corrupt.

---

### #5 — 🟢 LOW: Dead variable `encoded` (`unsplash.js:62`)

**Kode bermasalah:**
```js
const encoded = encodeURIComponent(query);
const params  = new URLSearchParams({ query, ... });
```

`encoded` tidak pernah digunakan. `URLSearchParams` sudah handle encoding otomatis. Ini dead code yang membuat pembaca kode bingung.

---

### #6 — 🟢 LOW: Dokumentasi tidak sinkron dengan kode (`replit.md:17–22`)

`replit.md` mendokumentasikan command `/wisdom [tema]`, `/tema`, `/random`, `/about` — tetapi di `index.js` tidak ada handler `onText` untuk command-command ini (hanya ada `/start` dan `/help`).  
Fungsi-fungsi tersebut hanya accessible lewat ReplyKeyboard & InlineKeyboard, bukan slash command.

---

## Queue Prioritas Fix

1. **#1** — Regex BAGIAN broken (CRITICAL, fungsional rusak)
2. **#2** — Pesan lock salah (HIGH, UX misleading)
3. **#3** — Cleanup hapus state aktif (MEDIUM, edge case tapi bisa terjadi)
4. **#4** — Escaping ayat_arab tidak konsisten (MEDIUM, defensive)
5. **#5** — Dead variable `encoded` (LOW, code quality)
6. **#6** — Docs tidak sinkron (LOW, dokumentasi)
