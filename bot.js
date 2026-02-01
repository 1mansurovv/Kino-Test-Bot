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

// 🔒 PRIVATE kanallar (Join Request bilan)
const PRIVATE_CHANNELS = [
  {
    title: "VIP KINOLAR UZ",
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
console.log("CHANNEL LINKS:", PRIVATE_CHANNELS.map(c => c.url));

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
// access.json structure:
// {
//   "123456": {
//     "ok": true/false,
//     "at": 170...,
//     "channels": {
//        "-100....": { requested: true, at: 170..., title: "VIP ..." }
//     }
//   }
// }
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

function markRequested(userId, channelId, channelTitle = "") {
  const access = loadAccess();
  const u = ensureUser(access, userId);
  u.channels[String(channelId)] = {
    requested: true,
    at: Date.now(),
    title: channelTitle || u.channels[String(channelId)]?.title || "",
  };
  saveAccess(access);
}

function hasRequestedAll(userId) {
  const access = loadAccess();
  const u = access[String(userId)];
  if (!u?.channels) return false;
  return PRIVATE_CHANNELS.every((ch) => u.channels[String(ch.chat_id)]?.requested);
}

function grantAccessIfComplete(userId) {
  const access = loadAccess();
  const u = ensureUser(access, userId);

  const complete = PRIVATE_CHANNELS.every((ch) => u.channels[String(ch.chat_id)]?.requested);
  if (complete) {
    u.ok = true;
    u.at = Date.now();
    saveAccess(access);
    return true;
  }
  saveAccess(access);
  return false;
}

function hasAccess(userId) {
  const access = loadAccess();
  return Boolean(access[String(userId)]?.ok);
}

function buildStatusLines(userId) {
  const access = loadAccess();
  const u = access[String(userId)];
  const channels = u?.channels || {};

  const lines = PRIVATE_CHANNELS.map((ch) => {
    const ok = Boolean(channels[String(ch.chat_id)]?.requested);
    return `${ok ? "✅" : "❌"} ${ch.title}`;
  });

  const missing = PRIVATE_CHANNELS.filter((ch) => !channels[String(ch.chat_id)]?.requested)
    .map((ch) => ch.title);

  return { lines, missingCount: missing.length, missing };
}

function buildSubscribeKeyboard() {
  const rows = PRIVATE_CHANNELS.map((ch, idx) => [
    { text: `${idx + 1}. ${ch.title}`, url: ch.url },
  ]);

  rows.push([{ text: "✅ Tekshirish", callback_data: "check_sub" }]);
  return rows;
}

// ====== SUBSCRIBE SCREEN ======
async function sendSubscribeScreen(chatId, userId, messageId) {
  const { lines, missingCount } = buildStatusLines(userId);

  const text =
    "📩 Quyidagi VIP kanallarga zayavka yuboring (Join Request).\n\n" +
    "Holat:\n" +
    lines.join("\n") +
    "\n\n" +
    (missingCount === 0
      ? "✅ Hamma kanalga zayavka yuborilgansiz. Endi ✅ Tekshirish bosing."
      : "❗ Hali hammasi emas. Hammasiga yuborgach ✅ Tekshirish bosing.");

  const opts = {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buildSubscribeKeyboard() },
  };

  if (messageId) {
    return bot
      .editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts })
      .catch(() => bot.sendMessage(chatId, text, opts));
  }
  return bot.sendMessage(chatId, text, opts);
}

// ====== ADMIN BUYRUQLAR ======
bot.onText(/\/myid/, (msg) => {
  bot.sendMessage(msg.chat.id, `Sizning ID: ${msg.from.id}`);
});

const waitingVideoForCode = new Map();

bot.onText(/\/add\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "❌ Siz admin emassiz.");

  const code = match[1];
  waitingVideoForCode.set(msg.chat.id, code);
  bot.sendMessage(msg.chat.id, `✅ Kod qabul qilindi: ${code}\nEndi video yoki fayl yuboring`);
});

bot.onText(/\/del\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) return bot.sendMessage(msg.chat.id, "❌ Siz admin emassiz.");

  const code = match[1];
  if (!MOVIES[code]) return bot.sendMessage(msg.chat.id, "❌ Bunday kod yo‘q.");

  delete MOVIES[code];
  saveMovies(MOVIES);
  bot.sendMessage(msg.chat.id, `🗑️ O‘chirildi: ${code}`);
});

bot.onText(/\/list/, (msg) => {
  if (msg.from.id !== ADMIN_ID) return;

  const keys = Object.keys(MOVIES);
  if (keys.length === 0) return bot.sendMessage(msg.chat.id, "Hozircha kino yo‘q.");

  bot.sendMessage(msg.chat.id, "🎬 Kinolar:\n" + keys.map((k) => `• ${k}`).join("\n"));
});

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

// ====== ENG MUHIM QISM: JOIN REQUEST EVENT ======
// ⚠️ Bu ishlashi uchun bot kanallarda ADMIN bo‘lishi shart!
bot.on("chat_join_request", async (req) => {
  try {
    const userId = req.from.id;
    const channelId = req.chat.id;
    const title = req.chat.title || "";

    // Faqat bizning kanallar bo'lsa yozamiz:
    const isOurChannel = PRIVATE_CHANNELS.some((ch) => ch.chat_id === channelId);
    if (!isOurChannel) return;

    markRequested(userId, channelId, title);

    // Userga xabar yuborishga urinib ko'ramiz (hamma holatda ham yozishmaydi)
    // Shart emas, lekin foydali:
    await bot.sendMessage(
      userId,
      `✅ Zayavkangiz qabul qilindi: ${title}\nBotga qaytib ✅ Tekshirish bosing.`
    ).catch(() => {});
  } catch (e) {
    console.log("chat_join_request error:", e);
  }
});

// ====== CALLBACK: TEKSHIRISH ======
bot.on("callback_query", async (q) => {
  const chatId = q.message?.chat?.id;
  const userId = q.from?.id;

  if (!chatId || !userId) return;

  if (q.data === "check_sub") {
    // hammasiga request bo'ldimi?
    const okNow = grantAccessIfComplete(userId);

    if (okNow) {
      await bot.answerCallbackQuery(q.id, { text: "✅ Tayyor!" });

      const text = "✅ Hamma kanalga zayavka yuborgansiz!\n🎬 Endi kino kodini yuboring.";
      return bot
        .editMessageText(text, {
          chat_id: chatId,
          message_id: q.message.message_id,
        })
        .catch(() => bot.sendMessage(chatId, text));
    }

    // hali hammasi emas — subscribe screenni status bilan qayta chiqaramiz
    await bot.answerCallbackQuery(q.id, {
      text: "❌ Hali hammasiga zayavka yuborilmadi!",
      show_alert: true,
    });

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

console.log("✅ Bot ishlayapti: join request (3/3) bo‘lsa ruxsat beradi.");
