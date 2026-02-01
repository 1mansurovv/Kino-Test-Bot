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

const bot = new TelegramBot(token, { polling: true });

// ✅ Sizning bot username (caption uchun)
const BOT_USERNAME = "kino_uz_24_bot"; // @ belgisisiz

// 🔒 3 ta PRIVATE kanal (faqat tugma/link ko'rsatish uchun)
const PRIVATE_CHANNELS = [
  {
    title: "VIP KINOLAR UZ",
    url: "https://t.me/+Lepigm4SE8RjNWQy",
    chat_id: -1003723778329,
  },
  {
    title: "VIP KANAL 2",
    url: "https://t.me/+oCQf5S0d12c1ODMy",
    chat_id: -1003732022071,
  },
  {
    title: "VIP KANAL 3",
    url: "https://t.me/+Q7cmDW5Dbvs1MjY6",
    chat_id: -1003580032469,
  },
];

// ====== MOVIES.JSON ======
const MOVIES_FILE = path.join(__dirname, "movies.json");

function loadMovies() {
  if (!fs.existsSync(MOVIES_FILE)) fs.writeFileSync(MOVIES_FILE, "{}");
  return JSON.parse(fs.readFileSync(MOVIES_FILE, "utf8"));
}
function saveMovies(data) {
  fs.writeFileSync(MOVIES_FILE, JSON.stringify(data, null, 2));
}
let MOVIES = loadMovies();

// ====== ACCESS.JSON (kim "obuna bo'ldim" bosganini saqlaydi) ======
const ACCESS_FILE = path.join(__dirname, "access.json");

function loadAccess() {
  if (!fs.existsSync(ACCESS_FILE)) fs.writeFileSync(ACCESS_FILE, "{}");
  return JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8"));
}
function saveAccess(data) {
  fs.writeFileSync(ACCESS_FILE, JSON.stringify(data, null, 2));
}
let ACCESS = loadAccess();

function grantAccess(userId) {
  ACCESS[String(userId)] = { ok: true, at: Date.now() };
  saveAccess(ACCESS);
}
function hasAccess(userId) {
  return Boolean(ACCESS[String(userId)]?.ok);
}

// ====== KEYBOARD (request_chat bo'lsa ishlatadi, bo'lmasa url) ======
function buildRequestChatKeyboard() {
  const rows = PRIVATE_CHANNELS.map((ch, idx) => [
    {
      text: `${idx + 1}. ${ch.title}`,
      request_chat: {
        request_id: Number(String(Math.abs(ch.chat_id)).slice(-6)) + idx + 1,
        chat_is_channel: true,
      },
    },
  ]);

  // ✅ Asosiy tugma
  rows.push([{ text: "✅ Men obuna bo‘ldim", callback_data: "i_subscribed" }]);
  return rows;
}

function buildUrlKeyboard() {
  const rows = PRIVATE_CHANNELS.map((ch, idx) => [
    { text: `${idx + 1}. ${ch.title}`, url: ch.url },
  ]);

  // ✅ Asosiy tugma
  rows.push([{ text: "✅ Men obuna bo‘ldim", callback_data: "i_subscribed" }]);
  return rows;
}

// ====== SUBSCRIBE OYNASI (TEKSHIRUV YO'Q) ======
async function sendSubscribeScreen(chatId, messageId) {
  const text =
    "📩 VIP kanallarga zayavka yuboring.\n" +
    "So‘ng botga qaytib ✅ *Men obuna bo‘ldim* tugmasini bosing.";

  const reqOpts = {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buildRequestChatKeyboard() },
  };

  const urlOpts = {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buildUrlKeyboard() },
  };

  // request_chat bilan urinib ko‘ramiz, bo‘lmasa url fallback
  if (messageId) {
    return bot
      .editMessageText(text, { chat_id: chatId, message_id: messageId, ...reqOpts })
      .catch(() =>
        bot
          .editMessageText(text, { chat_id: chatId, message_id: messageId, ...urlOpts })
          .catch(() => bot.sendMessage(chatId, text, urlOpts))
      );
  }

  return bot.sendMessage(chatId, text, reqOpts).catch(() => bot.sendMessage(chatId, text, urlOpts));
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

// ====== CALLBACK (✅ Men obuna bo‘ldim) ======
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const userId = q.from.id;

  if (q.data === "i_subscribed") {
    grantAccess(userId); // ✅ tugma bosildi, saqlandi
    await bot.answerCallbackQuery(q.id, { text: "✅ Qabul qilindi!" });

    return bot
      .editMessageText("✅ Obuna bo‘ldingiz!\n🎬 Endi kino kodini yuboring.", {
        chat_id: chatId,
        message_id: q.message.message_id,
      })
      .catch(() => bot.sendMessage(chatId, "✅ Obuna bo‘ldingiz!\n🎬 Endi kino kodini yuboring."));
  }
});

// ====== USER QISMI ======
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (!hasAccess(userId)) return sendSubscribeScreen(chatId);

  bot.sendMessage(chatId, "🎬 Kino kodini yuboring");
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  // ✅ Tekshiruv yo'q: faqat tugma bosgan bo'lsa kiradi
  if (!hasAccess(userId)) return sendSubscribeScreen(chatId);

  const code = msg.text.trim();
  const fileId = MOVIES[code];

  if (!fileId) return bot.sendMessage(chatId, "❌ Bunday kod topilmadi.");

  const caption = `🎬 Kino kodi: ${code}\n🤖 Bizning bot: @${BOT_USERNAME}\n`;

  return bot
    .sendVideo(chatId, fileId, { caption })
    .catch(() => bot.sendDocument(chatId, fileId, { caption }));
});

console.log("✅ Bot ishlayapti (tugma bosildi => ruxsat, tekshiruv yo‘q)...");
