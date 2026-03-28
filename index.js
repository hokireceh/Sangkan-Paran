require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const { generateWisdomContent } = require('./groq');
const { renderCard } = require('./renderer');
const fs = require('fs');

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
console.log('🤖 Sangkan Paran Bot is running...');

// ─── State per user ───────────────────────────────────────────────────────────
const userState = new Map();

// ─── ★ Cooldown anti-spam (10 detik per user) ─────────────────────────────────
const COOLDOWN_MS = 10_000;
const lastRequest = new Map(); // chatId → timestamp

function isOnCooldown(chatId) {
  const last = lastRequest.get(chatId);
  if (!last) return false;
  return (Date.now() - last) < COOLDOWN_MS;
}

function setCooldown(chatId) {
  lastRequest.set(chatId, Date.now());
}

function cooldownSisa(chatId) {
  const last = lastRequest.get(chatId);
  if (!last) return 0;
  return Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
}

// ─── ★ History tema per user (simpan 20 tema terakhir) ────────────────────────
const MAX_HISTORY = 20;
const userHistory = new Map(); // chatId → [{ tema, waktu }]

function addHistory(chatId, tema) {
  if (!userHistory.has(chatId)) userHistory.set(chatId, []);
  const hist = userHistory.get(chatId);
  // Hindari duplikat berturutan
  if (hist.length > 0 && hist[hist.length - 1].tema === tema) return;
  hist.push({ tema, waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) });
  if (hist.length > MAX_HISTORY) hist.shift();
}

function getHistory(chatId) {
  return userHistory.get(chatId) || [];
}

// ─── Tema Registry (atasi batas 64 byte callback_data Telegram) ───────────────
const temaRegistry = new Map();
let temaCounter = 0;

function registerTema(tema) {
  if (Buffer.byteLength(tema, 'utf8') <= 50) return tema;
  for (const [key, val] of temaRegistry) {
    if (val === tema) return `ref:${key}`;
  }
  const key = String(temaCounter++);
  temaRegistry.set(key, tema);
  if (temaRegistry.size > 200) {
    temaRegistry.delete(temaRegistry.keys().next().value);
  }
  return `ref:${key}`;
}

function resolveTema(raw) {
  if (raw.startsWith('ref:')) return temaRegistry.get(raw.slice(4)) || 'random';
  return raw;
}

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
    resize_keyboard: true,
    persistent: true,
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

  // ★ Cek cooldown
  if (isOnCooldown(chatId)) {
    const sisa = cooldownSisa(chatId);
    return bot.sendMessage(chatId,
      `⏱ Sabar sebentar ya! Tunggu *${sisa} detik* lagi sebelum request berikutnya. 🙏`,
      { parse_mode: 'Markdown' }
    );
  }
  setCooldown(chatId);

  let loadingMsg;
  try {
    await bot.sendChatAction(chatId, 'upload_photo');

    if (editMsgId) {
      await bot.editMessageText(
        `⏳ Membuat Wisdom Card *"${tema}"*...\nMohon tunggu 🙏`,
        { chat_id: chatId, message_id: editMsgId, parse_mode: 'Markdown' }
      ).catch(() => {});
      loadingMsg = { message_id: editMsgId };
    } else {
      loadingMsg = await bot.sendMessage(chatId,
        `⏳ Membuat Wisdom Card *"${tema}"*...\nMohon tunggu 🙏`,
        { parse_mode: 'Markdown' }
      );
    }

    // Generate konten & render
    const content = await generateWisdomContent(tema);
    console.log(`[INFO] Content (${content.tema}):`, JSON.stringify(content, null, 2));

    const imagePath = await renderCard(content);
    console.log('[INFO] Card rendered:', imagePath);

    // ★ Simpan ke history setelah berhasil
    const temaAktual = content.tema || tema;
    addHistory(chatId, temaAktual);
    console.log(`[HISTORY] ${chatId} → ${temaAktual} (total: ${getHistory(chatId).length})`);

    await bot.sendChatAction(chatId, 'upload_photo');

    // Caption + hashtag
    const BRAND_TAGS = ['SangkanParan', 'WisdomCard', 'KearifanLokal', 'QuoteJawa', 'MotivasiIslami', 'KataKata'];
    const allTags    = [...(content.hashtags || []), ...BRAND_TAGS];
    const hashtagLine = allTags.map(h => `#${h}`).join(' ');

    await bot.sendPhoto(chatId, imagePath, {
      caption:
        `✨ *${content.kata_jawa}*\n` +
        `_${content.arti_jawa}_\n\n` +
        `📖 _${content.arti_ayat}_\n\n` +
        `— *Sangkan Paran* —\n\n` +
        `${hashtagLine}`,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🔄 Ulangi tema ini', callback_data: `ulang:${registerTema(temaAktual)}` },
          { text: '🎲 Random lagi',     callback_data: 'ulang:random' },
        ]],
      },
    });

    if (loadingMsg) await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {});
    fs.unlinkSync(imagePath);

  } catch (error) {
    console.error('[ERROR]', error);
    const errText = `❌ Gagal membuat kartu *"${tema}"*.\nSilakan coba tema lain.`;
    if (loadingMsg) {
      await bot.editMessageText(errText, {
        chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: 'Markdown',
      }).catch(() => bot.sendMessage(chatId, errText, { parse_mode: 'Markdown' }));
    } else {
      await bot.sendMessage(chatId, errText, { parse_mode: 'Markdown' });
    }
  }
}

// ─── /start ───────────────────────────────────────────────────────────────────
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const nama = msg.from?.first_name || 'Sahabat';
  userState.delete(chatId);

  bot.sendMessage(chatId,
    `✨ *Selamat datang di Sangkan Paran Bot, ${nama}!*\n\n` +
    `Bot ini membuat *Wisdom Card* berisi kearifan Jawa,\n` +
    `dalil Al-Qur\'an, dan foto indah.\n\n` +
    `Pilih menu di bawah untuk mulai 👇`,
    { parse_mode: 'Markdown', ...mainMenuKeyboard }
  );
});

// ─── /help ────────────────────────────────────────────────────────────────────
bot.onText(/\/help/, (msg) => handleHelp(msg.chat.id));

function handleHelp(chatId) {
  userState.delete(chatId);
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
  const teks   = msg.text.trim();
  const state  = userState.get(chatId);

  // ── Buat Wisdom Card ──
  if (teks === MENU.BUAT_CARD) {
    userState.set(chatId, 'waiting_tema');
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
    userState.delete(chatId);
    return bot.sendMessage(chatId,
      `📂 *Pilih Tema Wisdom Card*\n\nKetuk tema yang kamu inginkan:`,
      { parse_mode: 'Markdown', reply_markup: temaInlineKeyboard() }
    );
  }

  // ── Random Card ──
  if (teks === MENU.RANDOM) {
    userState.delete(chatId);
    return kirimWisdomCard(chatId, 'random');
  }

  // ── ★ Riwayat Tema ──
  if (teks === MENU.HISTORY) {
    userState.delete(chatId);
    const hist = getHistory(chatId);

    if (hist.length === 0) {
      return bot.sendMessage(chatId,
        `📜 *Riwayat Tema*\n\nBelum ada riwayat. Buat Wisdom Card pertamamu dulu! 🎴`,
        { parse_mode: 'Markdown', ...mainMenuKeyboard }
      );
    }

    // Tampilkan 10 terakhir, terbaru di atas
    const list = [...hist].reverse().slice(0, 10);
    const teks_hist = list.map((h, i) => `${i + 1}. *${h.tema}* — _${h.waktu}_`).join('\n');

    // Inline keyboard dari riwayat: buat ulang tema-tema terakhir
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
      {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: inlineRows },
      }
    );
  }

  // ── Tentang Bot ──
  if (teks === MENU.ABOUT) {
    userState.delete(chatId);
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
    userState.delete(chatId);
    return bot.sendMessage(chatId, '🏠 Menu utama:', mainMenuKeyboard);
  }

  // ── State: menunggu input tema ──
  if (state === 'waiting_tema') {
    userState.delete(chatId);
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
  const chatId = query.message.chat.id;
  const msgId  = query.message.message_id;
  const data   = query.data;

  await bot.answerCallbackQuery(query.id);

  if (data === 'noop') return;

  if (data === 'menu:tema') {
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

  if (data.startsWith('tema:')) {
    const tema  = resolveTema(data.replace('tema:', ''));
    const label = tema.length > 40 ? tema.slice(0, 40) + '…' : tema;
    await bot.editMessageText(
      `⏳ Membuat Wisdom Card *"${label}"*...\nMohon tunggu 🙏`,
      { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
    ).catch(() => {});
    await kirimWisdomCard(chatId, tema, msgId);
    return;
  }

  if (data.startsWith('ulang:')) {
    const tema = resolveTema(data.replace('ulang:', ''));
    await kirimWisdomCard(chatId, tema);
    return;
  }
});