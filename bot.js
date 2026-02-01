require("dotenv").config();
const fs = require("fs");
const path = require("path");
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

if (!token) {
  console.error("BOT_TOKEN yo‘q!");
  process.exit(1);
}

// ✅ chat_join_request kelishi uchun allowed_updates qo'yamiz
const bot = new TelegramBot(token, {
  polling: {
    interval: 300,
    params: {
      allowed_updates: ["message", "callback_query", "chat_join_request"],
    },
  },
});

// 409 Conflict bo'lsa - 2 ta instance ishlayapti degani
bot.on("polling_error", (err) => console.log("polling_error:", err.message));

// ✅ Bot username (caption uchun)
const BOT_USERNAME = "kino_uz_24_bot"; // @ belgisisiz

// ✅ 3 ta PRIVATE kanal
const PRIVATE_CHANNELS = [
  {
    title: "VIP KANAL 1",
    url: "https://t.me/+syYmVLhMD2w4ZTky",
    chat_id: -1003723778329,
  },
  {
    title: "VIP KANAL 2",
    url: "https://t.me/+Y0tZ14SODvs2MWQy",
    chat_id: -1003732022071,
  },
  {
    title: "VIP KANAL 3",
    url: "https://t.me/+3aHjwQlSreRkMGYy",
    chat_id: -1003580032469,
  },
];

console.log("CHANNEL LINKS:", PRIVATE_CHANNELS.map((c) => c.url));
console.log("✅ Bot ishga tushdi.");

// ====== MOVIES.JSON ======
const MOVIES_FILE = path.join(__dirname, "movies.json");

function loadMovies() {
  if (!fs.existsSync(MOVIES_FILE)) fs.writeFileSync(MOVIES_FILE, "{}");
  return JSON.parse(fs.readFileSync(MOVIES_FILE, "utf8"));
}
function saveMovies(data) {
  fs.writeFileSync(MOVIES_FILE, JSON.stringify(data, null, 2), "utf8");
}
let MOVIES = loadMovies();

// ====== ACCESS.JSON ======
/**
 * access.json structure:
 * {
 *   "userId": {
 *     "ok": true/false,
 *     "at": 0,
 *     "channels": {
 *       "-100xxxx": { "requested": true, "at": 123456789 }
 *     },
 *     "last_subscribe": { "chatId": 123, "messageId": 45, "at": 123456789 }
 *   }
 * }
 */
const ACCESS_FILE = path.join(__dirname, "access.json");

function loadAccess() {
  if (!fs.existsSync(ACCESS_FILE)) fs.writeFileSync(ACCESS_FILE, "{}");
  return JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8"));
}
function saveAccess(data) {
  fs.writeFileSync(ACCESS_FILE, JSON.stringify(data, null, 2), "utf8");
}

function ensureUser(access, userId) {
  const key = String(userId);
  if (!access[key]) access[key] = { ok: false, at: 0, channels: {} };
  if (!access[key].channels) access[key].channels = {};
  return access[key];
}

function markRequested(userId, channelId) {
  const access = loadAccess();
  const u = ensureUser(access, userId);
  u.channels[String(channelId)] = { requested: true, at: Date.now() };
  saveAccess(access);
}

function hasRequestedAll(userId) {
  const access = loadAccess();
  const u = access[String(userId)];
  if (!u?.channels) return false;

  return PRIVATE_CHANNELS.every((ch) => u.channels[String(ch.chat_id)]?.requested);
}

function grantAccess(userId) {
  const access = loadAccess();
  const u = ensureUser(access, userId);
  u.ok = true;
  u.at = Date.now();
  saveAccess(access);
}

function hasAccess(userId) {
  const access = loadAccess();
  return Boolean(access[String(userId)]?.ok);
}

// ✅ subscribe oynasining message_id sini saqlash
function setLastSubscribeMessage(userId, chatId, messageId) {
  const access = loadAccess();
  const u = ensureUser(access, userId);
  u.last_subscribe = { chatId, messageId, at: Date.now() };
  saveAccess(access);
}
function getLastSubscribeMessage(userId) {
  const access = loadAccess();
  const u = access[String(userId)];
  return u?.last_subscribe || null;
}

// ====== ✅ STATUS TUGMALARDA (rasmdagidek) ======
function buildSubscribeKeyboard(userId) {
  const access = loadAccess();
  const u = access[String(userId)] || {};
  const channels = u.channels || {};

  const CHECK = "✅";
  const CROSS = "❌";

  const rows = PRIVATE_CHANNELS.map((ch) => {
    const ok = Boolean(channels[String(ch.chat_id)]?.requested);
    return [
      {
        text: `${ok ? CHECK : CROSS} ${ch.title}`,
        url: ch.url,
      },
    ];
  });

  rows.push([{ text: "✅ Tasdiqlash", callback_data: "check_sub" }]);
  return rows;
}

// ====== SUBSCRIBE SCREEN (yuqorida ro'yxat YO'Q) ======
async function sendSubscribeScreen(chatId, userId, messageId) {
  const text = "❌ Botdan foydalanishdan oldin quyidagi kanallarga a'zo bo‘ling";

  const opts = {
    reply_markup: { inline_keyboard: buildSubscribeKeyboard(userId) },
    disable_web_page_preview: true,
  };

  if (messageId) {
    return bot
      .editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts })
      .catch(() =>
        bot.sendMessage(chatId, text, opts).then((m) => {
          setLastSubscribeMessage(userId, chatId, m.message_id);
          return m;
        })
      );
  }

  return bot.sendMessage(chatId, text, opts).then((m) => {
    setLastSubscribeMessage(userId, chatId, m.message_id);
    return m;
  });
}


// ====== ADMIN BUYRUQLAR ======
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Sizning ID: ${msg.from.id}`);
});

const waitingVideoForCode = new Map();

// /add 101
bot.onText(/\/add\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "❌ Siz admin emassiz.");

  const code = match[1];
  waitingVideoForCode.set(msg.chat.id, code);
  bot.sendMessage(msg.chat.id, `✅ Kod qabul qilindi: ${code}\nEndi video yoki fayl yuboring`);
});

// /del 101
bot.onText(/\/del\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "❌ Siz admin emassiz.");

  const code = match[1];
  if (!MOVIES[code]) return bot.sendMessage(msg.chat.id, "❌ Bunday kod yo‘q.");

  delete MOVIES[code];
  saveMovies(MOVIES);
  bot.sendMessage(msg.chat.id, `🗑️ O‘chirildi: ${code}`);
});

// /list
bot.onText(/\/list/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  const keys = Object.keys(MOVIES);
  if (keys.length === 0) return bot.sendMessage(msg.chat.id, "Hozircha kino yo‘q.");

  bot.sendMessage(msg.chat.id, "🎬 Kinolar:\n" + keys.map((k) => `• ${k}`).join("\n"));
});

// Admin video qabul
bot.on("video", (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  const code = waitingVideoForCode.get(msg.chat.id);
  if (!code) return;

  MOVIES[code] = msg.video.file_id;
  saveMovies(MOVIES);

  waitingVideoForCode.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, `✅ Saqlandi!\nKod: ${code}`);
});

bot.on("document", (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  const code = waitingVideoForCode.get(msg.chat.id);
  if (!code) return;

  MOVIES[code] = msg.document.file_id;
  saveMovies(MOVIES);

  waitingVideoForCode.delete(msg.chat.id);
  bot.sendMessage(msg.chat.id, `✅ Saqlandi!\nKod: ${code}`);
});

// ====== JOIN REQUEST EVENT ======
// ✅ DM yo‘q, lekin tugmalar avtomatik ✅/❌ bo'lib yangilanadi
bot.on("chat_join_request", async (req) => {
  try {
    const userId = req.from.id;
    const channelId = req.chat.id;

    const isOurChannel = PRIVATE_CHANNELS.some((ch) => ch.chat_id === channelId);
    if (!isOurChannel) return;

    markRequested(userId, channelId);

    const last = getLastSubscribeMessage(userId);
    if (last?.chatId && last?.messageId) {
      await sendSubscribeScreen(last.chatId, userId, last.messageId).catch(() => {});
    }
  } catch (e) {
    console.log("chat_join_request error:", e);
  }
});

// ====== CALLBACK: ✅ Tasdiqlash ======
bot.on("callback_query", async (q) => {
  const chatId = q.message?.chat?.id;
  const userId = q.from?.id;

  if (!chatId || !userId) return;

  if (q.data === "check_sub") {
    const complete = hasRequestedAll(userId);

if (complete) {
  grantAccess(userId);

  await bot.answerCallbackQuery(q.id); // ❌ hech qanday yozuv chiqmaydi

  const okText = "🎬 Endi kino kodini yuboring";
  return bot
    .editMessageText(okText, { chat_id: chatId, message_id: q.message.message_id })
    .catch(() => bot.sendMessage(chatId, okText));
}


    await bot.answerCallbackQuery(q.id, { text: "❌ Hali hammasi emas!", show_alert: true });
    return sendSubscribeScreen(chatId, userId, q.message.message_id);
  }
});

// ====== USER QISMI ======
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!hasAccess(userId)) return sendSubscribeScreen(chatId, userId);

  bot.sendMessage(chatId, "🎬 Kino kodini yuboring");
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!hasAccess(userId)) return sendSubscribeScreen(chatId, userId);

  const code = msg.text.trim();
  const fileId = MOVIES[code];

  if (!fileId) return bot.sendMessage(chatId, "❌ Bunday kod topilmadi.");

  const caption = `🎬 Kino kodi: ${code}\n🤖 Bizning bot: @${BOT_USERNAME}\n`;

  return bot
    .sendVideo(chatId, fileId, { caption })
    .catch(() => bot.sendDocument(chatId, fileId, { caption }));
});
