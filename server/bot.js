/**
 * Zen Premium Telegram bot — opens Mini App via Web App button.
 * Env: BOT_TOKEN (required), PUBLIC_URL or WEBAPP_URL (https://your.onrender.com)
 * Optional: ADMIN_ID (telegram user id for admin alerts)
 */
const TOKEN = (process.env.BOT_TOKEN || "").trim();
const PUBLIC =
  (process.env.WEBAPP_URL || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "")
    .trim()
    .replace(/\/$/, "");
const ADMIN_ID = String(process.env.ADMIN_ID || "").trim();

const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : "";

async function tg(method, body) {
  if (!TOKEN) throw new Error("BOT_TOKEN missing");
  const r = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) {
    const err = new Error(j.description || method);
    err.code = j.error_code;
    throw err;
  }
  return j.result;
}

function webAppUrl() {
  return PUBLIC || "https://example.com";
}

function startKeyboard() {
  const url = webAppUrl();
  return {
    inline_keyboard: [
      [{ text: "🛒 បើក Zen Premium", web_app: { url } }],
      [
        { text: "💬 ជំនួយ", url: process.env.SUPPORT_URL || "https://t.me/kairozen_support" },
      ],
    ],
  };
}

function replyKeyboard() {
  const url = webAppUrl();
  return {
    keyboard: [[{ text: "🛒 ហាង Zen Premium", web_app: { url } }]],
    resize_keyboard: true,
  };
}

const welcome = () =>
  `<b>Zen Premium</b>\n` +
  `━━━━━━━━━━━━━━━━━━\n` +
  `សូមស្វាគមន៍! ទិញគណនី Premium\n` +
  `(CapCut · Spotify · Netflix · YouTube · AI…)\n\n` +
  `ចុចប៊ូតុងខាងក្រោមដើម្បីបើក <b>Mini App</b>។`;

export async function handleUpdate(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = (msg.text || "").trim();
  if (text.startsWith("/start") || text === "menu" || text === "/shop") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: welcome(),
      parse_mode: "HTML",
      reply_markup: startKeyboard(),
    });
    try {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "ឬប្រើប៊ូតុងម៉ឺនុយខាងក្រោម 👇",
        reply_markup: replyKeyboard(),
      });
    } catch {
      /* ignore */
    }
    return;
  }
  if (text.startsWith("/admin") && ADMIN_ID && String(chatId) === ADMIN_ID) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: `Admin panel:\n${webAppUrl()}/admin`,
    });
    return;
  }
  // default
  await tg("sendMessage", {
    chat_id: chatId,
    text: "ចុច /start ដើម្បីបើក Zen Premium Mini App",
    reply_markup: startKeyboard(),
  });
}

let offset = 0;
let polling = false;

async function pollOnce() {
  const updates = await tg("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message"],
  });
  for (const u of updates || []) {
    offset = u.update_id + 1;
    try {
      await handleUpdate(u);
    } catch (e) {
      console.warn("[bot handle]", e.message);
    }
  }
}

export async function startBot() {
  if (!TOKEN) {
    console.warn("[bot] BOT_TOKEN not set — Telegram bot disabled");
    return;
  }
  if (!PUBLIC) {
    console.warn("[bot] WEBAPP_URL / PUBLIC_URL not set — Web App button may use wrong URL");
  }
  try {
    const me = await tg("getMe");
    console.log(`[bot] @${me.username} starting… webapp=${webAppUrl()}`);
  } catch (e) {
    console.error("[bot] getMe failed:", e.message);
    return;
  }
  // Prefer long-polling on one Render instance (avoids webhook secret setup)
  try {
    await tg("deleteWebhook", { drop_pending_updates: false });
  } catch {
    /* ok */
  }
  polling = true;
  (async () => {
    while (polling) {
      try {
        await pollOnce();
      } catch (e) {
        const msg = e.message || "";
        if (msg.includes("409") || msg.includes("Conflict")) {
          console.error("[bot] 409 Conflict — another getUpdates is running. Stop other instances.");
          await new Promise((r) => setTimeout(r, 15000));
        } else {
          console.warn("[bot] poll error:", msg);
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
  })();
}

export function stopBot() {
  polling = false;
}

/** Optional webhook endpoint helper */
export function webhookMiddleware() {
  return async (req, res) => {
    try {
      await handleUpdate(req.body || {});
      res.json({ ok: true });
    } catch (e) {
      console.warn("[webhook]", e.message);
      res.json({ ok: true });
    }
  };
}
