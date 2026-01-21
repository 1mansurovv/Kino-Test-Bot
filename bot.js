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

// ====== MAJBURIY KANALLAR (3 TA) ======
const REQUIRED_CHANNELS = ["newbot113", "teznew1"]; // 3 tasini shu yerga yozing

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

// ====== OBUNA TEKSHIRUV (qaysi kanallarga obuna EMAS) ======
async function getNotSubscribedChannels(userId) {
  const notSub = [];

  for (const ch of REQUIRED_CHANNELS) {
    try {
      const m = await bot.getChatMember(`@${ch}`, userId);
      const ok = ["creator", "administrator", "member"].includes(m.status);
      if (!ok) notSub.push(ch);
    } catch (err) {
      console.log(
        `getChatMember xato (@${ch}):`,
        err?.response?.statusCode,
        err?.response?.body || err.message
      );
      notSub.push(ch);
    }
  }
  return notSub;
}

// ====== SUBSCRIBE OYNASI (SIZ KO'RSATGAN KO'RINISH) ======
async function sendOrUpdateSubscribeScreen({ chatId, userId, messageId }) {
  const notSub = await getNotSubscribedChannels(userId);

  // Hammasiga obuna bo‘lsa
  if (notSub.length === 0) {
    if (messageId) {
      await bot
        .editMessageText("✅ Tasdiqlandi! Endi kino kodini yuboring.", {
          chat_id: chatId,
          message_id: messageId,
        })
        .catch(() => {});
    }
    return bot.sendMessage(chatId, "🎬 Kino kodini yuboring");
  }

  const text =
    "❌ Kechirasiz botimizdan foydalanishdan oldin ushbu kanallarga a'zo bo'lishingiz kerak.";

  // Faqat obuna bo‘lmagan kanallar tugmada qoladi (dinamik)
  // Tugma yozuvi: 1 - kanal, 2 - kanal, 3 - kanal ...
  const buttons = notSub.map((ch, idx) => [
    { text: `${idx + 1} - kanal`, url: `https://t.me/${ch}` },
  ]);

  // Pastdagi tasdiqlash tugmasi
  buttons.push([{ text: "✅ Tasdiqlash", callback_data: "check_sub" }]);

  const opts = {
    reply_markup: { inline_keyboard: buttons },
  };

  // callbackdan kelsa — o‘sha xabarni edit qilamiz
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

// /add 101
const waitingVideoForCode = new Map();

bot.onText(/\/add\s+(\d+)/, (msg, match) => {
  if (msg.from.id !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, "❌ Siz admin emassiz.");
  }

  const code = match[1];
  waitingVideoForCode.set(msg.chat.id, code);
  bot.sendMessage(msg.chat.id, `✅ Kod qabul qilindi: ${code}\nEndi video yuboring`);
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

// ====== CALLBACK (✅ Tasdiqlash) ======
bot.on("callback_query", async (q) => {
  const chatId = q.message.chat.id;
  const userId = q.from.id;

  if (q.data === "check_sub") {
    await bot.answerCallbackQuery(q.id, { text: "Tekshiryapman..." });
    return sendOrUpdateSubscribeScreen({
      chatId,
      userId,
      messageId: q.message.message_id,
    });
  }
});

// ====== USER QISMI ======
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const notSub = await getNotSubscribedChannels(userId);
  if (notSub.length > 0) {
    return sendOrUpdateSubscribeScreen({ chatId, userId });
  }

  bot.sendMessage(chatId, "🎬 Kino kodini yuboring");
});

bot.on("message", async (msg) => {
  if (!msg.text || msg.text.startsWith("/")) return;

  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const notSub = await getNotSubscribedChannels(userId);
  if (notSub.length > 0) {
    return sendOrUpdateSubscribeScreen({ chatId, userId });
  }

  const code = msg.text.trim();
  const fileId = MOVIES[code];

  if (!fileId) return bot.sendMessage(chatId, "❌ Bunday kod topilmadi.");

  bot.sendVideo(chatId, fileId).catch(() => bot.sendDocument(chatId, fileId));
});

console.log("✅ Bot ishlayapti (subscribe UI siz xohlagandek)...");
