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

// ✅ PUBLIC yo‘q
const PUBLIC_CHANNELS = []; // bo'sh (ishlatilmaydi)

// 🔒 3 ta PRIVATE kanal (INVITE LINK + chat_id tekshiruv)
const PRIVATE_CHANNELS = [
  {
    title: "VIP KINOLAR UZ",
    url: "https://t.me/+s0bW32xOKo04MDVi",
    chat_id: -1003723778329,
    chat_is_channel: true,
  },
  {
    title: "VIP KANAL 2",
    url: "https://t.me/+VECkUA6aYDdmMWVi",
    chat_id: -1003732022071,
    chat_is_channel: true,
  },
  {
    title: "VIP KANAL 3",
    url: "https://t.me/+Aj-PAUWXNKM0NmQy",
    chat_id: -1003580032469,
     chat_is_channel: true,
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

// ====== PRIVATE OBUNA TEKSHIRUV ======
async function getNotSubscribedPrivate(userId) {
  const notSub = [];

  for (const ch of PRIVATE_CHANNELS) {
    try {
      const m = await bot.getChatMember(ch.chat_id, userId);
      const ok = ["creator", "administrator", "member"].includes(m.status);
      if (!ok) notSub.push(ch);
    } catch (err) {
      // bot admin bo'lmasa, chat_id xato bo'lsa, yoki user a'zo bo'lmasa shu yerga tushadi
      notSub.push(ch);
    }
  }

  return notSub;
}

// ====== SUBSCRIBE OYNASI ======
async function sendOrUpdateSubscribeScreen({ chatId, userId, messageId }) {
  const notSubPrivate = await getNotSubscribedPrivate(userId);

  // ✅ hammasiga a'zo bo'lsa
  if (notSubPrivate.length === 0) {
    if (messageId) {
      await bot
        .editMessageText("", {
          chat_id: chatId,
          message_id: messageId,
        })
        .catch(() => {});
    }
    return bot.sendMessage(chatId, "🎬 Kino kodini yuboring");
  }

  const text =
    "❌ Botdan foydalanishdan oldin quyidagi kanallarga a'zo bo‘ling:";

  const buttons = notSubPrivate.map((ch, idx) => [
    { text: `${idx + 1}. ${ch.title}`, url: ch.url },
  ]);

  buttons.push([{ text: "✅ Tasdiqlash", callback_data: "check_sub" }]);

  const opts = { reply_markup: { inline_keyboard: buttons } };

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

// /add 101
bot.onText(/\/add\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "❌ Siz admin emassiz.");
  }

  const code = match[1];
  waitingVideoForCode.set(msg.chat.id, code);
  bot.sendMessage(
    msg.chat.id,
    `✅ Kod qabul qilindi: ${code}\nEndi video yoki fayl yuboring`
  );
});

// /del 101
bot.onText(/\/del\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "❌ Siz admin emassiz.");
  }

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

  bot.sendMessage(
    msg.chat.id,
    "🎬 Kinolar:\n" + keys.map((k) => `• ${k}`).join("\n")
  );
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

// ====== CALLBACK (✅ Tasdiqlash) ======
bot.on("callback_query", async (q) => {
  if (q.data === "check_sub") {
    await bot.answerCallbackQuery(q.id, { text: "Tekshiryapman..." });
    return sendOrUpdateSubscribeScreen({
      chatId: q.message.chat.id,
      userId: q.from.id,
      messageId: q.message.message_id,
    });
  }
});

// ====== USER QISMI ======
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const notSubPrivate = await getNotSubscribedPrivate(userId);
  if (notSubPrivate.length > 0) return sendOrUpdateSubscribeScreen({ chatId, userId });

  bot.sendMessage(chatId, "🎬 Kino kodini yuboring");
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const notSubPrivate = await getNotSubscribedPrivate(userId);
  if (notSubPrivate.length > 0) return sendOrUpdateSubscribeScreen({ chatId, userId });

  const code = msg.text.trim();
  const fileId = MOVIES[code];

  if (!fileId) return bot.sendMessage(chatId, "❌ Bunday kod topilmadi.");

  const caption =
    `🎬 Kino kodi: ${code}\n` +
    `🤖 Bizning bot: @${BOT_USERNAME}\n`;

  return bot
    .sendVideo(chatId, fileId, { caption })
    .catch(() => bot.sendDocument(chatId, fileId, { caption }));
});

console.log("✅ Bot ishlayapti (3 ta PRIVATE tekshiruv + join request)...");
