/**
 * Zen Premium bot — simple Mini App + easy Admin (ADMIN_ID)
 * Env: BOT_TOKEN, WEBAPP_URL, ADMIN_ID
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
const wiz = new Map();
/** Short callback targets for stock: a:st:0 → { pid, plan } */
const stockTargets = new Map();
let stockSeq = 0;


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

const isAdmin = (id) => ADMIN_IDS.has(String(id));
const web = () => PUBLIC || "https://example.com";
const money = (n) => "$" + Number(n || 0).toFixed(2);
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** Reply keyboard — always visible for admin */
function kbAdmin() {
  return {
    keyboard: [
      [{ text: "📊 ទិដ្ឋភាព" }, { text: "💳 បង់ប្រាក់" }, { text: "📦 Order" }],
      [{ text: "📥 ស្តុក" }, { text: "🎮 ផលិតផល" }, { text: "👥 User" }],
      [{ text: "🛒 ហាង" }, { text: "🌐 Web Admin" }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

function kbUser() {
  return {
    keyboard: [[{ text: "🛒 បើកហាង" }]],
    resize_keyboard: true,
  };
}

function inlineShop() {
  return {
    inline_keyboard: [[{ text: "🛒 បើក Zen Premium", web_app: { url: web() } }]],
  };
}

function inlineBack() {
  return { inline_keyboard: [[{ text: "« ទិដ្ឋភាព", callback_data: "a:home" }]] };
}

async function home(chatId) {
  const s = store.stats();
  const low =
    s.lowStock.length > 0
      ? "\n⚠️ " + s.lowStock.slice(0, 5).map((x) => `${x.product}/${x.plan}=${x.left}`).join(" · ")
      : "\n✅ ស្តុកគ្រប់";
  const text =
    `<b>Zen Premium Admin</b>\n` +
    `━━━━━━━━━━\n` +
    `💰 សរុប <b>${money(s.revenue)}</b> · 24h <b>${money(s.revenue24)}</b>\n` +
    `📦 Order 24h: <b>${s.orders24}</b>\n` +
    `⏳ កំពុងដឹក: <b>${s.processing}</b>\n` +
    `💳 រង់ចាំបង់: <b>${s.pendingPay}</b>\n` +
    `👥 User: <b>${s.users}</b>` +
    low +
    `\n\n👇 ប្រើប៊ូតុងក្រោមអេក្រង់`;
  await tg("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: kbAdmin(),
  });
  // quick actions
  await tg("sendMessage", {
    chat_id: chatId,
    text: "សកម្មភាពលឿន:",
    reply_markup: {
      inline_keyboard: [
        [
          { text: `💳 បង់ (${s.pendingPay})`, callback_data: "a:pay" },
          { text: `📦 Order (${s.processing})`, callback_data: "a:ord" },
        ],
        [
          { text: "📥 បន្ថែមស្តុក", callback_data: "a:stock" },
          { text: "🛒 ហាង", web_app: { url: web() } },
        ],
      ],
    },
  });
}

async function listPay(chatId) {
  const list = store.listPayments().filter((p) => p.status === "pending").slice(0, 15);
  if (!list.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "✅ គ្មានការបង់រង់ចាំ",
      reply_markup: kbAdmin(),
    });
    return;
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: `<b>💳 រង់ចាំ ${list.length}</b>\nចុច ✅ បើទទួលលុយហើយ`,
    parse_mode: "HTML",
  });
  for (const p of list) {
    const what = p.kind === "topup" ? `Topup ${money(p.amount)}` : `${p.product} ${p.plan}`;
    await tg("sendMessage", {
      chat_id: chatId,
      text: `👤 ${esc(p.uname)}\n${esc(what)}\n💵 <b>${money(p.amount)}</b>\n<code>${p.id}</code>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ អនុម័ត", callback_data: `a:ok:${p.id}` },
            { text: "❌ ទេ", callback_data: `a:no:${p.id}` },
          ],
        ],
      },
    });
  }
}

async function listOrd(chatId) {
  const list = store.listOrders().filter((o) => o.status === "processing").slice(0, 15);
  if (!list.length) {
    await tg("sendMessage", { chat_id: chatId, text: "✅ គ្មាន order កំពុងដឹក", reply_markup: kbAdmin() });
    return;
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: `<b>📦 កំពុងដឹក ${list.length}</b>`,
    parse_mode: "HTML",
  });
  for (const o of list) {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `🎮 ${esc(o.pname || o.product)} · ${esc(o.plan)}\n` +
        `👤 ${esc(o.uname)}\n💵 ${money(o.amount)}\n<code>${o.id}</code>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📤 ផ្ញើ email:pass", callback_data: `a:send:${o.id}` }],
          [{ text: "↩️ សងលុយ", callback_data: `a:ref:${o.id}` }],
        ],
      },
    });
  }
}

async function listStock(chatId, fromId) {
  const ps = store.listProductsAdmin().filter((p) => p.delivery === "auto");
  if (!ps.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        "មិនទាន់មាន product <b>Auto</b>\n" +
        "បង្កើតផលិតផល → ជ្រើស Auto សិន ទើបបន្ថែមស្តុកបាន\n\n" +
        "ចុច 🎮 ផលិតផល → ➕ បង្កើត",
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ បង្កើតផលិតផល", callback_data: "a:newp" }],
          [{ text: "🌐 Web Admin", web_app: { url: `${web()}/admin` } }],
        ],
      },
    });
    return;
  }

  // Flatten plans
  const options = [];
  for (const p of ps) {
    for (const pl of p.plans || []) {
      options.push({ pid: p.id, name: p.name, plan: pl.k, n: p.stockByPlan?.[pl.k] || 0 });
    }
  }
  if (!options.length) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "មាន product តែគ្មានកញ្ចប់ — កែនៅ Web Admin",
      reply_markup: kbAdmin(),
    });
    return;
  }

  // Only 1 plan → auto-select (no extra click)
  if (options.length === 1 && fromId) {
    const o = options[0];
    wiz.set(String(fromId), { step: "stock", pid: o.pid, plan: o.plan, at: Date.now() });
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `📥 <b>${esc(o.name)}</b> · <b>${esc(o.plan)}</b> (ស្តុក ${o.n})\n\n` +
        `ផ្ញើស្តុកឥឡូវ (ច្រើនបន្ទាត់បាន):\n` +
        `<code>email:password</code>\n` +
        `ឬ <code>user:pass</code> / លេខ + link\n\n` +
        `/cancel បោះបង់`,
      parse_mode: "HTML",
      reply_markup: kbAdmin(),
    });
    return;
  }

  stockTargets.clear();
  const rows = [];
  for (const o of options.slice(0, 40)) {
    const idx = String(++stockSeq % 100000);
    stockTargets.set(idx, { pid: o.pid, plan: o.plan, name: o.name });
    const mark = o.n === 0 ? "🔴" : o.n <= 2 ? "🟡" : "🟢";
    const label = `${mark} ${o.name} · ${o.plan} (${o.n})`.slice(0, 60);
    rows.push([{ text: label, callback_data: `a:st:${idx}` }]);
  }
  rows.push([{ text: "« ត្រឡប់", callback_data: "a:home" }]);
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "<b>📥 ជ្រើសកញ្ចប់</b>\n" +
      "១) ចុចកញ្ចប់ខាងក្រោម\n" +
      "២) រួចផ្ញើស្តុក (មួយបន្ទាត់ = ១គណនី)\n\n" +
      "ឧ: <code>mail@gmail.com:password123</code>",
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows },
  });
}

async function listProds(chatId) {
  const ps = store.listProductsAdmin();
  let t = "<b>🎮 ផលិតផល</b>\n";
  for (const p of ps) {
    t += `\n${p.enabled ? "✅" : "⏸"} <b>${esc(p.name)}</b> (${p.delivery})\n`;
    for (const pl of p.plans || []) {
      t += `  · ${esc(pl.k)} ${money(pl.p)} · ស្តុក ${p.stockByPlan?.[pl.k] || 0}\n`;
    }
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: (t || "—").slice(0, 4000),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ បង្កើតផលិតផល", callback_data: "a:newp" }],
        [{ text: "🌐 Web Admin", web_app: { url: `${web()}/admin` } }],
        [{ text: "« ត្រឡប់", callback_data: "a:home" }],
      ],
    },
  });
}

async function startNewProduct(chatId, fromId) {
  wiz.set(String(fromId), { step: "prod_name", data: {} });
  await tg("sendMessage", {
    chat_id: chatId,
    text:
      "<b>➕ ផលិតផលថ្មី</b>\n\n" +
      "១) ផ្ញើ <b>ឈ្មោះ</b> (ឧ. CapCut Pro)\n\n" +
      "/cancel បោះបង់",
    parse_mode: "HTML",
    reply_markup: kbAdmin(),
  });
}

async function listUsers(chatId) {
  const us = store.listUsers().slice(0, 30);
  let t = `<b>👥 User (${store.listUsers().length})</b>\n\n`;
  for (const u of us) {
    t += `· ${esc(u.name)} ${u.username ? "@" + u.username : ""}\n  <code>${u.id}</code> · ${money(u.balance)}\n`;
  }
  await tg("sendMessage", {
    chat_id: chatId,
    text: t.slice(0, 4000),
    parse_mode: "HTML",
    reply_markup: inlineBack(),
  });
}

async function ans(cq, text) {
  try {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: text || "", show_alert: false });
  } catch {
    /* ignore */
  }
}

export async function handleUpdate(update) {
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const fromId = cq.from?.id;
    const data = cq.data || "";
    if (!isAdmin(fromId)) {
      await ans(cq, "Admin only");
      return;
    }

    if (data === "a:home") {
      await ans(cq);
      return home(chatId);
    }
    if (data === "a:pay") {
      await ans(cq);
      return listPay(chatId);
    }
    if (data === "a:ord") {
      await ans(cq);
      return listOrd(chatId);
    }
    if (data === "a:stock") {
      await ans(cq);
      return listStock(chatId, fromId);
    }

    if (data.startsWith("a:ok:")) {
      const id = data.slice(5);
      try {
        const r = store.approvePayment(id);
        await ans(cq, "អនុម័ត ✓");
        await tg("editMessageText", {
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: `✅ ${id}\n${r.order ? "Order " + r.order.id + " · " + r.order.status : "Topup OK"}`,
        });
      } catch (e) {
        await ans(cq, e.message);
      }
      return;
    }
    if (data.startsWith("a:no:")) {
      const id = data.slice(5);
      try {
        store.rejectPayment(id);
        await ans(cq, "បដិសេធ");
        await tg("editMessageText", {
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: `❌ ${id}`,
        });
      } catch (e) {
        await ans(cq, e.message);
      }
      return;
    }
    if (data.startsWith("a:send:")) {
      const id = data.slice(7);
      wiz.set(String(fromId), { step: "deliver", orderId: id });
      await ans(cq, "ផ្ញើ cred");
      await tg("sendMessage", {
        chat_id: chatId,
        text: `📤 <b>${id}</b>\nផ្ញើតែមួយសារ:\n<code>email:password</code>\n\n/cancel បោះបង់`,
        parse_mode: "HTML",
      });
      return;
    }
    if (data.startsWith("a:ref:")) {
      const id = data.slice(6);
      try {
        store.refundOrder(id);
        await ans(cq, "សងលុយ ✓");
        await tg("editMessageText", {
          chat_id: chatId,
          message_id: cq.message.message_id,
          text: `↩️ Refund ${id}`,
        });
      } catch (e) {
        await ans(cq, e.message);
      }
      return;
    }
    if (data.startsWith("a:st:")) {
      const idx = data.slice(5);
      const target = stockTargets.get(idx);
      if (!target) {
        await ans(cq, "ផុតពេល — ចុច 📥 ស្តុក ម្តងទៀត");
        return listStock(chatId, fromId);
      }
      wiz.set(String(fromId), {
        step: "stock",
        pid: target.pid,
        plan: target.plan,
        at: Date.now(),
      });
      const n = store.listProductsAdmin().find((p) => p.id === target.pid)?.stockByPlan?.[target.plan] || 0;
      await ans(cq, "ផ្ញើស្តុកឥឡូវ");
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          `📥 <b>${esc(target.name)}</b> · <b>${esc(target.plan)}</b> (ស្តុក ${n})\n\n` +
          `✅ រួចហើយ — ផ្ញើស្តុកឥឡូវនេះ:\n` +
          `<code>email:password</code>\n` +
          `ឬបិទភ្ជាប់ច្រើនបន្ទាត់\n\n` +
          `/cancel បោះបង់`,
        parse_mode: "HTML",
      });
      return;
    }
    await ans(cq);
    return;
  }

  const msg = update.message || update.edited_message;
  if (!msg?.chat) return;
  const chatId = msg.chat.id;
  const fromId = msg.from?.id;
  const text = (msg.text || "").trim();
  const admin = isAdmin(fromId);

  // wizard steps
  if (admin && wiz.has(String(fromId))) {
    if (text === "/cancel") {
      wiz.delete(String(fromId));
      await tg("sendMessage", { chat_id: chatId, text: "បោះបង់ហើយ", reply_markup: kbAdmin() });
      return;
    }
    const w = wiz.get(String(fromId));
    if (w.step === "deliver") {
      try {
        store.deliverOrder(w.orderId, text);
        wiz.delete(String(fromId));
        await tg("sendMessage", {
          chat_id: chatId,
          text: `✅ ផ្ញើ ${w.orderId} រួច`,
          reply_markup: kbAdmin(),
        });
      } catch (e) {
        await tg("sendMessage", { chat_id: chatId, text: "❌ " + e.message + "\nសាកម្តងទៀត ឬ /cancel" });
      }
      return;
    }
    if (w.step === "stock") {
      // Ignore menu button presses while waiting for stock lines
      const menuBtns = ["📊 ទិដ្ឋភាព", "💳 បង់ប្រាក់", "📦 Order", "📥 ស្តុក", "🎮 ផលិតផល", "👥 User", "🛒 ហាង", "🌐 Web Admin", "/admin", "Admin"];
      if (menuBtns.includes(text) || text.startsWith("/start")) {
        // fall through to menu handlers — but keep wizard unless explicit cancel
        if (text === "📥 ស្តុក") {
          return listStock(chatId, fromId);
        }
        // other menus: cancel stock wait
        wiz.delete(String(fromId));
        // continue to menu below
      } else {
        try {
          const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
          if (!lines.length) {
            await tg("sendMessage", { chat_id: chatId, text: "ផ្ញើយ៉ាងហោច 1 បន្ទាត់ស្តុក" });
            return;
          }
          const r = store.addStock(w.pid, w.plan, lines.join("\n"));
          wiz.delete(String(fromId));
          await tg("sendMessage", {
            chat_id: chatId,
            text:
              `✅ បន្ថែមស្តុក <b>${r.added}</b> បន្ទាត់\n` +
              `📦 ${esc(w.pid)} · ${esc(w.plan)}\n` +
              `សរុបឥឡូវ: <b>${r.total}</b>`,
            parse_mode: "HTML",
            reply_markup: kbAdmin(),
          });
        } catch (e) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: "❌ " + e.message + "\nសាកម្តងទៀត ឬ /cancel",
          });
        }
        return;
      }
    }
    if (w.step === "prod_name") {
      w.data.name = text.slice(0, 80);
      w.step = "prod_plans";
      wiz.set(String(fromId), w);
      await tg("sendMessage", {
        chat_id: chatId,
        text:
          "២) ផ្ញើ <b>កញ្ចប់</b> មួយបន្ទាត់មួយ\n" +
          "ទម្រង់: <code>ឈ្មោះកញ្ចប់ | តម្លៃ</code>\n" +
          "ឧ:\n<code>1 ខែ | 2.5\n3 ខែ | 6.5\n12 ខែ | 22</code>",
        parse_mode: "HTML",
      });
      return;
    }
    if (w.step === "prod_plans") {
      const plans = text.split("\n").map((line) => {
        const [k, p] = line.split("|").map((s) => s.trim());
        return { k: k || "1 ខែ", p: Number(p) || 0 };
      }).filter((x) => x.k);
      if (!plans.length) {
        await tg("sendMessage", { chat_id: chatId, text: "ទម្រង់ខុស — សាកម្តងទៀត" });
        return;
      }
      w.data.plans = plans;
      w.step = "prod_delivery";
      wiz.set(String(fromId), w);
      await tg("sendMessage", {
        chat_id: chatId,
        text: "៣) ប្រភេទដឹកជញ្ជូន?",
        reply_markup: {
          inline_keyboard: [
            [{ text: "⚡ Auto (ស្តុក email:pass)", callback_data: "a:pdel:auto" }],
            [{ text: "✋ Manual (admin ផ្ញើ)", callback_data: "a:pdel:manual" }],
          ],
        },
      });
      return;
    }
  }

  // reply keyboard routes
  if (admin) {
    if (text === "📊 ទិដ្ឋភាព" || text === "/admin" || text === "Admin") {
      return home(chatId);
    }
    if (text === "💳 បង់ប្រាក់") return listPay(chatId);
    if (text === "📦 Order") return listOrd(chatId);
    if (text === "📥 ស្តុក") return listStock(chatId, fromId);
    if (text === "🎮 ផលិតផល") return listProds(chatId);
    if (text === "👥 User") return listUsers(chatId);
    if (text === "🌐 Web Admin") {
      await tg("sendMessage", {
        chat_id: chatId,
        text: "បើក Web Admin ក្នុង Telegram (ចងចាំ Admin ដោយស្វ័យ — គ្មាន password)",
        reply_markup: {
          inline_keyboard: [[{ text: "🌐 បើក Web Admin", web_app: { url: `${web()}/admin` } }]],
        },
      });
      return;
    }
  }

  if (text === "🛒 ហាង" || text === "🛒 បើកហាង" || text.startsWith("/start") || text === "/shop") {
    await tg("sendMessage", {
      chat_id: chatId,
      text:
        `<b>Zen Premium</b>\n` +
        `ទិញគណនី Premium — ចុចប៊ូតុងខាងក្រោម`,
      parse_mode: "HTML",
      reply_markup: inlineShop(),
    });
    await tg("sendMessage", {
      chat_id: chatId,
      text: admin ? "Admin: ចុច 📊 ទិដ្ឋភាព ឬ /admin" : "សូមស្វាគមន៍ 👋",
      reply_markup: admin ? kbAdmin() : kbUser(),
    }).catch(() => {});
    return;
  }

  await tg("sendMessage", {
    chat_id: chatId,
    text: admin ? "ចុច 📊 ទិដ្ឋភាព ឬ /admin" : "ចុច /start ដើម្បីបើកហាង",
    reply_markup: admin ? kbAdmin() : kbUser(),
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
      console.warn("[bot]", e.message);
    }
  }
}

export async function startBot() {
  if (!TOKEN) {
    console.warn("[bot] BOT_TOKEN missing");
    return;
  }
  try {
    const me = await tg("getMe");
    console.log(`[bot] @${me.username} admins=${[...ADMIN_IDS].join(",") || "-"}`);
  } catch (e) {
    console.error("[bot] getMe", e.message);
    return;
  }
  try {
    await tg("deleteWebhook", { drop_pending_updates: false });
  } catch {
    /* */
  }
  polling = true;
  (async () => {
    while (polling) {
      try {
        await pollOnce();
      } catch (e) {
        if (String(e.message).includes("409")) {
          console.error("[bot] 409 — បិទ instance ផ្សេង");
          await new Promise((r) => setTimeout(r, 15000));
        } else {
          console.warn("[bot] poll", e.message);
          await new Promise((r) => setTimeout(r, 4000));
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
    } catch (e) {
      console.warn("[webhook]", e.message);
    }
    res.json({ ok: true });
  };
}
