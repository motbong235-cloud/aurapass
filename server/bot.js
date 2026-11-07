/**
 * Zen Premium Telegram bot — Mini App + Admin panel (ADMIN_ID).
 * Env: BOT_TOKEN, WEBAPP_URL|PUBLIC_URL, ADMIN_ID (comma-separated ids ok)
 */
import * as store from "./store.js";

const TOKEN = (process.env.BOT_TOKEN || "").trim();
const PUBLIC = (process.env.WEBAPP_URL || process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "")
  .trim()
  .replace(/\/$/, "");
const ADMIN_IDS = new Set(
  String(process.env.ADMIN_ID || "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean),
);

const API = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : "";

/** pending admin wizards: chatId -> { step, ... } */
const wiz = new Map();

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

function isAdmin(id) {
  return ADMIN_IDS.has(String(id));
}

function webAppUrl() {
  return PUBLIC || "https://example.com";
}

function userStartKb() {
  return {
    inline_keyboard: [
      [{ text: "🛒 បើក Zen Premium", web_app: { url: webAppUrl() } }],
      [{ text: "💬 ជំនួយ", url: process.env.SUPPORT_URL || "https://t.me/kairozen_support" }],
    ],
  };
}

function userReplyKb(admin) {
  const rows = [[{ text: "🛒 ហាង Zen Premium", web_app: { url: webAppUrl() } }]];
  if (admin) rows.push([{ text: "🛠 Admin Panel" }]);
  return { keyboard: rows, resize_keyboard: true };
}

function adminMenuKb() {
  return {
    inline_keyboard: [
      [
        { text: "📊 Dashboard", callback_data: "ad:dash" },
        { text: "💳 ការទូទាត់", callback_data: "ad:pay" },
      ],
      [
        { text: "📦 Orders", callback_data: "ad:orders" },
        { text: "📥 ស្តុក", callback_data: "ad:stock" },
      ],
      [
        { text: "🎮 Products", callback_data: "ad:prods" },
        { text: "👥 Users", callback_data: "ad:users" },
      ],
      [
        { text: "🌐 Web Admin", url: `${webAppUrl()}/admin` },
        { text: "🛒 បើក Shop", web_app: { url: webAppUrl() } },
      ],
    ],
  };
}

const money = (n) => "$" + Number(n || 0).toFixed(2);

function welcomeUser() {
  return (
    `<b>Zen Premium</b>\n` +
    `━━━━━━━━━━━━\n` +
    `សូមស្វាគមន៍! ទិញគណនី Premium\n` +
    `(CapCut · Spotify · Netflix · YouTube · AI…)\n\n` +
    `ចុចប៊ូតុងខាងក្រោមដើម្បីបើក <b>Mini App</b>។`
  );
}

async function sendAdminDash(chatId) {
  const s = store.stats();
  const text =
    `<b>🛠 Zen Premium — Admin</b>\n` +
    `━━━━━━━━━━━━\n` +
    `💰 ចំណូលសរុប: <b>${money(s.revenue)}</b>\n` +
    `📈 24ម៉ោង: <b>${money(s.revenue24)}</b> · ${s.orders24} orders\n` +
    `⏳ Processing: <b>${s.processing}</b>\n` +
    `💳 Pending pay: <b>${s.pendingPay}</b>\n` +
    `👥 Users: <b>${s.users}</b>\n` +
    (s.lowStock.length
      ? `\n⚠️ ស្តុកទាប:\n` + s.lowStock.map((x) => `· ${x.product} / ${x.plan}: ${x.left}`).join("\n")
      : `\n✅ ស្តុកគ្រប់គ្រាន់`);
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: adminMenuKb(),
  });
}

async function sendPendingPays(chatId) {
  const list = store.listPayments().filter((p) => p.status === "pending").slice(0, 12);
  if (!list.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "✅ មិនមានការទូទាត់រង់ចាំ",
      reply_markup: adminMenuKb(),
    });
    return;
  }
  for (const p of list) {
    const kind = p.kind === "topup" ? "Topup" : `${p.product} · ${p.plan}`;
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `<b>💳 ${p.id}</b>\n` +
        `👤 ${p.uname} (<code>${p.uid}</code>)\n` +
        `📦 ${kind}\n` +
        `💵 ${money(p.amount)}\n` +
        `🕐 ${new Date(p.at).toLocaleString()}`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ អនុម័ត", callback_data: `ad:payok:${p.id}` },
            { text: "❌ បដិសេធ", callback_data: `ad:payno:${p.id}` },
          ],
        ],
      },
    });
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: "⬆️ ការទូទាត់រង់ចាំ",
    reply_markup: adminMenuKb(),
  });
}

async function sendProcessingOrders(chatId) {
  const list = store.listOrders().filter((o) => o.status === "processing").slice(0, 12);
  if (!list.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "✅ មិនមាន order processing",
      reply_markup: adminMenuKb(),
    });
    return;
  }
  for (const o of list) {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `<b>📦 ${o.id}</b>\n` +
        `👤 ${o.uname} (<code>${o.uid}</code>)\n` +
        `🎮 ${o.pname || o.product} · ${o.plan}\n` +
        `💵 ${money(o.amount)} · ${o.how || ""}\n` +
        `🕐 ${new Date(o.at).toLocaleString()}`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📤 ដឹកជញ្ជូន (ផ្ញើ cred)", callback_data: `ad:del:${o.id}` }],
          [{ text: "↩️ Refund", callback_data: `ad:ref:${o.id}` }],
        ],
      },
    });
  }
}

async function sendStockMenu(chatId) {
  const ps = store.listProductsAdmin().filter((p) => p.delivery === "auto");
  if (!ps.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "មិនមាន product auto — កែនៅ Web Admin",
      reply_markup: adminMenuKb(),
    });
    return;
  }
  const rows = [];
  for (const p of ps.slice(0, 20)) {
    for (const pl of p.plans || []) {
      const n = p.stockByPlan?.[pl.k] || 0;
      rows.push([
        {
          text: `${p.name} · ${pl.k} (${n})`,
          callback_data: `ad:addstock:${p.id}:${encodeURIComponent(pl.k)}`.slice(0, 64),
        },
      ]);
    }
  }
  rows.push([{ text: "« ម៉ឺនុយ", callback_data: "ad:menu" }]);
  await tg("sendMessage", {
    chat_id: chatId,
    text: "<b>📥 ស្តុក</b>\nជ្រើសកញ្ចប់ដើម្បីបន្ថែម <code>email:password</code>",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function sendProducts(chatId) {
  const ps = store.listProductsAdmin();
  const lines = ps
    .map(
      (p) =>
        `${p.enabled ? "✅" : "⏸"} <b>${p.name}</b> · ${p.delivery}\n` +
        (p.plans || []).map((x) => `  · ${x.k}: ${money(x.p)} (stock ${p.stockByPlan?.[x.k] || 0})`).join("\n"),
    )
    .join("\n\n");
  await tg("sendMessage", {
    chat_id: chatId,
    text: `<b>🎮 Products</b>\n\n${lines || "—"}`.slice(0, 4000),
    parse_mode: "HTML",
    reply_markup: adminMenuKb(),
  });
}

async function sendUsers(chatId) {
  const us = store.listUsers().slice(0, 25);
  const lines = us
    .map((u) => `· <code>${u.id}</code> ${u.name} ${u.username ? "@" + u.username : ""} — ${money(u.balance)}`)
    .join("\n");
  await tg("sendMessage", {
    chat_id: chatId,
    text: `<b>👥 Users</b> (${store.listUsers().length})\n\n${lines || "—"}`.slice(0, 4000),
    parse_mode: "HTML",
    reply_markup: adminMenuKb(),
  });
}

export async function handleUpdate(update) {
  // callbacks
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const fromId = cq.from?.id;
    const data = cq.data || "";
    await tg("answerCallbackQuery", { callback_query_id: cq.id }).catch(() => {});
    if (!isAdmin(fromId)) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ Admin only" });
      return;
    }
    if (data === "ad:menu" || data === "ad:dash") return sendAdminDash(chatId);
    if (data === "ad:pay") return sendPendingPays(chatId);
    if (data === "ad:orders") return sendProcessingOrders(chatId);
    if (data === "ad:stock") return sendStockMenu(chatId);
    if (data === "ad:prods") return sendProducts(chatId);
    if (data === "ad:users") return sendUsers(chatId);

    if (data.startsWith("ad:payok:")) {
      const id = data.slice("ad:payok:".length);
      try {
        const r = store.approvePayment(id);
        await tg("editMessageText", {
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: `✅ អនុម័ត ${id}\nOrder: ${r.order?.id || "—"} · ${r.order?.status || ""}`,
        });
      } catch (e) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ " + e.message });
      }
      return;
    }
    if (data.startsWith("ad:payno:")) {
      const id = data.slice("ad:payno:".length);
      try {
        store.rejectPayment(id);
        await tg("editMessageText", {
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: `❌ បដិសេធ ${id}`,
        });
      } catch (e) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ " + e.message });
      }
      return;
    }
    if (data.startsWith("ad:del:")) {
      const id = data.slice("ad:del:".length);
      wiz.set(String(fromId), { step: "deliver", orderId: id });
      await tg("sendMessage", {
        chat_id: chatId,
        text: `📤 ផ្ញើ credentials សម្រាប់ <code>${id}</code>\nទម្រង់: <code>email:password</code>\nឬ /cancel`,
        parse_mode: "HTML",
      });
      return;
    }
    if (data.startsWith("ad:ref:")) {
      const id = data.slice("ad:ref:".length);
      try {
        store.refundOrder(id);
        await tg("sendMessage", { chat_id: chatId, text: `↩️ Refund ${id} រួច` });
      } catch (e) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ " + e.message });
      }
      return;
    }
    if (data.startsWith("ad:addstock:")) {
      const rest = data.slice("ad:addstock:".length);
      const i = rest.indexOf(":");
      const pid = rest.slice(0, i);
      const plan = decodeURIComponent(rest.slice(i + 1));
      wiz.set(String(fromId), { step: "stock", pid, plan });
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          `📥 បន្ថែមស្តុក\n<b>${pid}</b> · ${plan}\n` +
          `ផ្ញើមួយបន្ទាត់មួយគណនី:\n<code>email:password</code>\nឬ /cancel`,
        parse_mode: "HTML",
      });
      return;
    }
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  const text = (msg.text || "").trim();
  const admin = isAdmin(fromId);

  // wizard
  if (admin && wiz.has(String(fromId))) {
    if (text === "/cancel") {
      wiz.delete(String(fromId));
      await tg("sendMessage", { chat_id: chatId, text: "បោះបង់។", reply_markup: adminMenuKb() });
      return;
    }
    const w = wiz.get(String(fromId));
    if (w.step === "deliver") {
      try {
        store.deliverOrder(w.orderId, text);
        wiz.delete(String(fromId));
        await tg("sendMessage", {
          chat_id: chatId,
          text: `✅ ដឹកជញ្ជូន ${w.orderId} រួច`,
          reply_markup: adminMenuKb(),
        });
      } catch (e) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ " + e.message });
      }
      return;
    }
    if (w.step === "stock") {
      try {
        const r = store.addStock(w.pid, w.plan, text);
        wiz.delete(String(fromId));
        await tg("sendMessage", {
          chat_id: chatId,
          text: `✅ បន្ថែម ${r.added} · សរុប ${r.total}`,
          reply_markup: adminMenuKb(),
        });
      } catch (e) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ " + e.message });
      }
      return;
    }
  }

  if (text.startsWith("/start") || text === "menu" || text === "/shop") {
    await tg("sendMessage", {
      chat_id: chatId,
      text: welcomeUser(),
      parse_mode: "HTML",
      reply_markup: userStartKb(),
    });
    await tg("sendMessage", {
      chat_id: chatId,
      text: admin ? "អ្នកជា Admin — ចុច 🛠 Admin Panel ឬ /admin" : "ឬប្រើប៊ូតុងម៉ឺនុយខាងក្រោម 👇",
      reply_markup: userReplyKb(admin),
    }).catch(() => {});
    return;
  }

  if (text === "/admin" || text === "🛠 Admin Panel" || text === "Admin Panel") {
    if (!admin) {
      await tg("sendMessage", { chat_id: chatId, text: "⛔ សម្រាប់ Admin តែប៉ុណ្ណោះ" });
      return;
    }
    if (!ADMIN_IDS.size) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "⚠️ មិនទាន់ដាក់ ADMIN_ID លើ Render",
      });
      return;
    }
    await sendAdminDash(chatId);
    return;
  }

  if (text.startsWith("/")) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: admin ? "ពាក្យបញ្ជា: /start · /admin" : "ចុច /start ដើម្បីបើក Mini App",
      reply_markup: userStartKb(),
    });
    return;
  }

  await tg("sendMessage", {
    chat_id: chatId,
    text: "ចុច /start ដើម្បីបើក Zen Premium",
    reply_markup: userStartKb(),
  });
}

let offset = 0;
let polling = false;

async function pollOnce() {
  const updates = await tg("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message", "callback_query"],
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
  if (!PUBLIC) console.warn("[bot] WEBAPP_URL not set");
  if (!ADMIN_IDS.size) console.warn("[bot] ADMIN_ID not set — Telegram admin panel locked");
  try {
    const me = await tg("getMe");
    console.log(`[bot] @${me.username} | admins=${[...ADMIN_IDS].join(",") || "none"} | webapp=${webAppUrl()}`);
  } catch (e) {
    console.error("[bot] getMe failed:", e.message);
    return;
  }
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
          console.error("[bot] 409 Conflict — stop other bot instances");
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
