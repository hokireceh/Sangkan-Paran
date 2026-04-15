'use strict';

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { generateWisdomContent } = require('./groq');
const { renderCard }            = require('./renderer');
const fs                        = require('fs');

// ─── Whitelist dari .env ──────────────────────────────────────────────────────
// Isi ALLOWED_IDS di .env dengan Telegram user ID, pisah koma
// Contoh: ALLOWED_IDS=123456789,987654321
const ALLOWED_IDS = new Set(
  (process.env.ALLOWED_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
    .map(Number)
);

function isAllowed(chatId) {
  return ALLOWED_IDS.has(Number(chatId));
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: {
    interval: 3000,
    autoStart: true,
    params: { timeout: 10, allowed_updates: ['message','callback_query'] },
  },
  request: {
    agentOptions: { keepAlive: true, family: 4 },
  },
});
console.log('🤖 Sangkan Paran Bot is running...');
console.log(`🔒 Whitelist aktif: ${ALLOWED_IDS.size} user diizinkan`);

// ─── Global error handler — cegah bot mati saat polling error ────────────────
bot.on('polling_error', (err) => {
  console.error('[POLLING ERROR]', err.code, err.message?.slice(0, 120));
});
bot.on('error', (err) => {
  console.error('[BOT ERROR]', err.message?.slice(0, 120));
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  console.log(`\n[INFO] ${signal} diterima — menghentikan bot...`);
  await bot.stopPolling();
  console.log('[INFO] Bot berhenti.');
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ─── State per user ───────────────────────────────────────────────────────────
const userState     = new Map();   // chatId → state string
const userStateTime = new Map();   // chatId → timestamp saat state diset

function setState(chatId, state) {
  userState.set(chatId, state);
  userStateTime.set(chatId, Date.now());
}
function clearState(chatId) {
  userState.delete(chatId);
  userStateTime.delete(chatId);
}

// ─── Cooldown anti-spam ───────────────────────────────────────────────────────
const COOLDOWN_MS = 12_000;
const lastRequest = new Map();

function isOnCooldown(chatId) {
  const last = lastRequest.get(chatId);
  return last ? (Date.now() - last) < COOLDOWN_MS : false;
}
function setCooldown(chatId)   { lastRequest.set(chatId, Date.now()); }
function cooldownSisa(chatId) {
  const last = lastRequest.get(chatId);
  if (!last) return 0;
  const sisa = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
  return sisa > 0 ? sisa : 0;
}

// ─── Per-user request lock ────────────────────────────────────────────────────
const processingLock = new Set();

function acquireLock(chatId) {
  if (processingLock.has(chatId)) return false;
  processingLock.add(chatId);
  return true;
}
function releaseLock(chatId) { processingLock.delete(chatId); }

// ─── Helper: tolak cooldown ───────────────────────────────────────────────────
async function rejectCooldown(chatId, queryId = null) {
  const sisa = cooldownSisa(chatId);
  if (queryId) {
    return bot.answerCallbackQuery(queryId, {
      text: `⏱ Sabar sebentar ya! Tunggu ${sisa} detik lagi. 🙏`,
      show_alert: true,
    });
  }
  return bot.sendMessage(chatId,
    `⏱ Sabar sebentar ya! Tunggu *${sisa} detik* lagi sebelum request berikutnya. 🙏`,
    { parse_mode: 'Markdown' }
  );
}

// ─── Helper: tolak karena sedang diproses ────────────────────────────────────
async function rejectBusy(chatId) {
  return bot.sendMessage(chatId,
    `⏳ Masih memproses permintaanmu sebelumnya, tunggu sebentar ya. 🙏`,
    { parse_mode: 'Markdown' }
  );
}

// ─── History tema per user ────────────────────────────────────────────────────
const MAX_HISTORY = 20;
const userHistory = new Map();

function addHistory(chatId, tema) {
  if (!userHistory.has(chatId)) userHistory.set(chatId, []);
  const hist = userHistory.get(chatId);
  if (hist.length > 0 && hist[hist.length - 1].tema === tema) return;
  hist.push({ tema, waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) });
  if (hist.length > MAX_HISTORY) hist.shift();
}
function getHistory(chatId) { return userHistory.get(chatId) || []; }

// ─── Tema Registry ────────────────────────────────────────────────────────────
const temaRegistry = new Map();
let temaCounter = 0;

function registerTema(tema) {
  if (Buffer.byteLength(tema, 'utf8') <= 50) return tema;
  for (const [key, val] of temaRegistry) {
    if (val === tema) return `ref:${key}`;
  }
  const key = String(temaCounter++);
  temaRegistry.set(key, tema);
  if (temaRegistry.size > 200) temaRegistry.delete(temaRegistry.keys().next().value);
  return `ref:${key}`;
}
function resolveTema(raw) {
  if (raw.startsWith('ref:')) return temaRegistry.get(raw.slice(4)) || 'random';
  return raw;
}

// ─── Periodic cleanup stale Maps ─────────────────────────────────────────────
const STALE_TTL = 1000 * 60 * 60 * 24;

setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [chatId, ts] of lastRequest) {
    if (now - ts > STALE_TTL) { lastRequest.delete(chatId); cleaned++; }
  }
  for (const [chatId, ts] of userStateTime) {
    if (now - ts > STALE_TTL) { clearState(chatId); cleaned++; }
  }
  for (const chatId of userHistory.keys()) {
    if (!lastRequest.has(chatId)) { userHistory.delete(chatId); cleaned++; }
  }
  if (cleaned > 0) console.log(`[CLEANUP] Hapus ${cleaned} entri stale dari Maps`);
}, 1000 * 60 * 60);

// ─── Tema Kategori ────────────────────────────────────────────────────────────
const TEMA_KATEGORI = {
  '🌿 Spiritual': ['sabar', 'syukur', 'ikhlas', 'tawakkal', 'qanaah', 'istiqomah', 'doa', 'ridho'],
  '💪 Kehidupan': ['kerja keras', 'usaha', 'semangat', 'perjuangan', 'keberanian', 'bangkit'],
  '❤️ Hubungan':  ['cinta', 'keluarga', 'persahabatan', 'kesetiaan', 'kebersamaan'],
  '🌱 Karakter':  ['kejujuran', 'kerendahan hati', 'kesederhanaan', 'keadilan', 'amanah'],
};

const MENU = {
  BUAT_CARD : '🎴 Buat Wisdom Card',
  PILIH_TEMA: '📂 Pilih Tema',
  RANDOM    : '🎲 Random Card',
  HISTORY   : '📜 Riwayat Tema',
  ABOUT     : 'ℹ️ Tentang Bot',
  HELP      : '📖 Bantuan',
};

// ─── Keyboard utama ───────────────────────────────────────────────────────────
const mainMenuKeyboard = {
  reply_markup: {
    keyboard: [
      [MENU.BUAT_CARD, MENU.PILIH_TEMA],
      [MENU.RANDOM,    MENU.HISTORY],
      [MENU.ABOUT,     MENU.HELP],
    ],
    resize_keyboard : true,
    is_persistent   : false,
  },
};

// ─── Inline keyboard pilih tema ───────────────────────────────────────────────
function temaInlineKeyboard() {
  const keyboard = [];
  for (const [kategori, temas] of Object.entries(TEMA_KATEGORI)) {
    keyboard.push([{ text: `— ${kategori} —`, callback_data: 'noop' }]);
    let row = [];
    temas.forEach((t, i) => {
      row.push({ text: t, callback_data: `tema:${t}` });
      if (row.length === 3 || i === temas.length - 1) { keyboard.push([...row]); row = []; }
    });
  }
  keyboard.push([{ text: '🎲 Random Sekarang!', callback_data: 'tema:random' }]);
  return { inline_keyboard: keyboard };
}

// ─── Helper: kirim Wisdom Card ────────────────────────────────────────────────
async function kirimWisdomCard(chatId, tema, editMsgId = null) {
  let loadingMsg = editMsgId ? { message_id: editMsgId } : null;
  let imagePath  = null;

  try {
    await bot.sendChatAction(chatId, 'upload_photo').catch(() => {});

    if (!editMsgId) {
      loadingMsg = await bot.sendMessage(chatId,
        `⏳ Membuat Wisdom Card *"${tema}"*...\nMohon tunggu 🙏`,
        { parse_mode: 'Markdown' }
      );
    }

    const content = await generateWisdomContent(tema);
    console.log(`[INFO] Content (${content.tema}):`, JSON.stringify(content, null, 2));

    imagePath = await renderCard(content);
    console.log('[INFO] Card rendered:', imagePath);

    const temaAktual = content.tema || tema;
    addHistory(chatId, temaAktual);
    console.log(`[HISTORY] ${chatId} → ${temaAktual} (total: ${getHistory(chatId).length})`);

    await bot.sendChatAction(chatId, 'upload_photo').catch(() => {});

    const BRAND_TAGS  = ['SangkanParan', 'fyp'];
    const allTags     = [...(content.hashtags || []).slice(0, 3), ...BRAND_TAGS];
    const hashtagLine = allTags.map(h => `#${h}`).join(' ');
    const kutipanLines = (content.kutipan_motivasi || '')
      .split('\n').map(l => l.trim()).join('\n');

    await bot.sendPhoto(chatId, imagePath, {
      caption:
        `${kutipanLines}\n\n` +
        `<i>${content.arti_ayat}</i>\n\n` +
        `— Sangkan Paran —\n\n` +
        `${hashtagLine}`,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 Ulangi tema ini', callback_data: `ulang:${registerTema(temaAktual)}` },
          { text: '🎲 Random lagi',     callback_data: 'ulang:random' },
        ]],
      },
    });

    if (loadingMsg) await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});

  } catch (error) {
    console.error('[ERROR] kirimWisdomCard:', error.message || error);

    const errText = `❌ Gagal membuat kartu *"${tema}"*.\nSilakan coba tema lain atau tunggu sebentar.`;
    if (loadingMsg) {
      await bot.editMessageText(errText, {
        chat_id   : chatId,
        message_id: loadingMsg.message_id,
        parse_mode: 'Markdown',
      }).catch(() => bot.sendMessage(chatId, errText, { parse_mode: 'Markdown' }));
    } else {
      await bot.sendMessage(chatId, errText, { parse_mode: 'Markdown' });
    }

  } finally {
    if (imagePath) { try { fs.unlinkSync(imagePath); } catch (_) {} }
    releaseLock(chatId);
  }
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) return; // ← whitelist check

  const nama = msg.from?.first_name || 'Sahabat';
  clearState(chatId);

  bot.sendMessage(chatId,
    `✨ *Selamat datang di Sangkan Paran Bot, ${nama}!*\n\n` +
    `Bot ini membuat *Wisdom Card* berisi kearifan Jawa,\n` +
    `dalil Al-Qur\'an, dan foto indah.\n\n` +
    `Pilih menu di bawah untuk mulai 👇`,
    { parse_mode: 'Markdown', ...mainMenuKeyboard }
  );
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, (msg) => {
  if (!isAllowed(msg.chat.id)) return; // ← whitelist check
  handleHelp(msg.chat.id);
});

function handleHelp(chatId) {
  clearState(chatId);
  bot.sendMessage(chatId,
    `📖 *Panduan Sangkan Paran Bot*\n\n` +
    `🎴 *Buat Wisdom Card* — Ketik tema, bot buatkan kartu\n` +
    `📂 *Pilih Tema* — Pilih dari 25+ tema per kategori\n` +
    `🎲 *Random Card* — Kartu acak langsung\n` +
    `📜 *Riwayat Tema* — Lihat tema yang pernah kamu buat\n` +
    `ℹ️ *Tentang Bot* — Filosofi & info Sangkan Paran\n\n` +
    `*Contoh tema:*\n` +
    `_sabar, syukur, rezeki, ikhlas, tawakkal,_\n` +
    `_kerja keras, cinta, keluarga, kejujuran, dll._\n\n` +
    `_— Sangkan Paran —_`,
    { parse_mode: 'Markdown', ...mainMenuKeyboard }
  );
}

// ─── Handler pesan teks ───────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) return; // ← whitelist check

  const teks  = msg.text.trim();
  const state = userState.get(chatId);

  // ── Buat Wisdom Card ──
  if (teks === MENU.BUAT_CARD) {
    setState(chatId, 'waiting_tema');
    return bot.sendMessage(chatId,
      `🎴 *Buat Wisdom Card*\n\nKetik tema yang kamu inginkan:\n_Contoh: sabar, rezeki, ikhlas, kerja keras_`,
      {
        parse_mode: 'Markdown',
        reply_markup: { keyboard: [[{ text: '« Kembali ke Menu' }]], resize_keyboard: true },
      }
    );
  }

  // ── Pilih Tema ──
  if (teks === MENU.PILIH_TEMA) {
    clearState(chatId);
    return bot.sendMessage(chatId,
      `📂 *Pilih Tema Wisdom Card*\n\nKetuk tema yang kamu inginkan:`,
      { parse_mode: 'Markdown', reply_markup: temaInlineKeyboard() }
    );
  }

  // ── Random Card ──
  if (teks === MENU.RANDOM) {
    clearState(chatId);
    if (isOnCooldown(chatId)) return rejectCooldown(chatId);
    if (!acquireLock(chatId)) return rejectBusy(chatId);
    setCooldown(chatId);
    return kirimWisdomCard(chatId, 'random');
  }

  // ── Riwayat Tema ──
  if (teks === MENU.HISTORY) {
    clearState(chatId);
    const hist = getHistory(chatId);

    if (hist.length === 0) {
      return bot.sendMessage(chatId,
        `📜 *Riwayat Tema*\n\nBelum ada riwayat. Buat Wisdom Card pertamamu dulu! 🎴`,
        { parse_mode: 'Markdown', ...mainMenuKeyboard }
      );
    }

    const list      = [...hist].reverse().slice(0, 10);
    const teks_hist = list.map((h, i) => `${i + 1}. *${h.tema}* — _${h.waktu}_`).join('\n');
    const inlineRows = [];
    let row = [];
    list.slice(0, 6).forEach((h, i) => {
      row.push({ text: h.tema, callback_data: `tema:${registerTema(h.tema)}` });
      if (row.length === 3 || i === Math.min(list.length, 6) - 1) {
        inlineRows.push([...row]);
        row = [];
      }
    });

    return bot.sendMessage(chatId,
      `📜 *Riwayat Tema Kamu* (${hist.length} tema)\n\n${teks_hist}\n\n_Ketuk untuk buat ulang:_`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: inlineRows } }
    );
  }

  // ── Tentang Bot ──
  if (teks === MENU.ABOUT) {
    clearState(chatId);
    const totalTema = Object.values(TEMA_KATEGORI).flat().length;
    const histCount = getHistory(chatId).length;
    return bot.sendMessage(chatId,
      `ℹ️ *Tentang Sangkan Paran Bot*\n\n` +
      `*Sangkan Paran* dalam falsafah Jawa bermakna:\n` +
      `_"Dari mana kita berasal, dan ke mana kita kembali."_\n\n` +
      `Bot ini hadir untuk mengingatkan jati diri melalui:\n\n` +
      `🌿 *Kearifan Jawa* — Kata & frasa Jawa penuh makna\n` +
      `📖 *Dalil Islami* — Ayat Al-Qur\'an & Hadits sahih\n` +
      `🖼️ *Visual Indah* — Foto berkualitas dari Unsplash\n` +
      `🤖 *AI Groq Llama* — Konten cerdas & relevan\n\n` +
      `✨ Tersedia *${totalTema}+ tema* dari 4 kategori.\n` +
      `📜 Kamu sudah membuat *${histCount} kartu*.\n\n` +
      `_— Sangkan Paran —_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📂 Lihat Daftar Tema', callback_data: 'menu:tema' }],
            [{ text: '🎲 Coba Random Card',  callback_data: 'ulang:random' }],
          ],
        },
      }
    );
  }

  // ── Bantuan ──
  if (teks === MENU.HELP) return handleHelp(chatId);

  // ── Kembali ke menu ──
  if (teks === '« Kembali ke Menu') {
    clearState(chatId);
    return bot.sendMessage(chatId, '🏠 Menu utama:', mainMenuKeyboard);
  }

  // ── State: menunggu input tema ──
  if (state === 'waiting_tema') {
    clearState(chatId);
    if (isOnCooldown(chatId)) return rejectCooldown(chatId);
    if (!acquireLock(chatId)) return rejectBusy(chatId);
    setCooldown(chatId);
    return kirimWisdomCard(chatId, teks);
  }

  // ── Teks bebas → tawari buat kartu ──
  const teksKey   = registerTema(teks);
  const labelTeks = teks.length > 30 ? teks.slice(0, 30) + '…' : teks;
  bot.sendMessage(chatId,
    `🎴 Buat Wisdom Card tentang *"${labelTeks}"*?`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✨ Ya, buat kartu ini', callback_data: `tema:${teksKey}` }],
          [{ text: '📂 Lihat daftar tema',  callback_data: 'menu:tema' }],
        ],
      },
    }
  );
});

// ─── Callback Query ───────────────────────────────────────────────────────────
bot.on('callback_query', async (query) => {
  const chatId  = query.message.chat.id;
  const msgId   = query.message.message_id;
  const data    = query.data;
  const queryId = query.id;

  if (!isAllowed(chatId)) return bot.answerCallbackQuery(queryId); // ← whitelist check

  if (data === 'noop') {
    return bot.answerCallbackQuery(queryId);
  }

  if (data === 'menu:tema') {
    await bot.answerCallbackQuery(queryId);
    await bot.editMessageText(
      `📂 *Pilih Tema Wisdom Card*\n\nKetuk tema yang kamu inginkan:`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown', reply_markup: temaInlineKeyboard() }
    ).catch(() =>
      bot.sendMessage(chatId,
        `📂 *Pilih Tema Wisdom Card*\n\nKetuk tema yang kamu inginkan:`,
        { parse_mode: 'Markdown', reply_markup: temaInlineKeyboard() }
      )
    );
    return;
  }

  if (data.startsWith('tema:') || data.startsWith('ulang:')) {
    if (isOnCooldown(chatId)) return rejectCooldown(chatId, queryId);
    if (!acquireLock(chatId)) {
      return bot.answerCallbackQuery(queryId, {
        text: '⏳ Masih memproses permintaan sebelumnya, tunggu sebentar...',
        show_alert: true,
      });
    }

    await bot.answerCallbackQuery(queryId);
    setCooldown(chatId);

    const prefix = data.startsWith('tema:') ? 'tema:' : 'ulang:';
    const tema   = resolveTema(data.replace(prefix, ''));
    const label  = tema.length > 40 ? tema.slice(0, 40) + '…' : tema;

    if (data.startsWith('tema:')) {
      await bot.editMessageText(
        `⏳ Membuat Wisdom Card *"${label}"*...\nMohon tunggu 🙏`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
      ).catch(() => {});
      await kirimWisdomCard(chatId, tema, msgId);
    } else {
      await kirimWisdomCard(chatId, tema);
    }
    return;
  }

  // Fallback
  await bot.answerCallbackQuery(queryId);
});