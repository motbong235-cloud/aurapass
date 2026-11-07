import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = process.env.DATA_DIR || path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true });

function fp(n) {
  return path.join(DATA, n);
}
function load(name, fallback) {
  try {
    const t = fs.readFileSync(fp(name), "utf8");
    return JSON.parse(t);
  } catch {
    return typeof fallback === "function" ? fallback() : structuredClone(fallback);
  }
}
function save(name, data) {
  const tmp = fp(name + ".tmp");
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp(name));
}

const defaultProducts = () => [
  {
    id: "capcut",
    name: "CapCut Pro",
    letter: "C",
    c: ["#2B2F3A", "#000"],
    cat: "Video Editing",
    tag: "កាត់តវីដេអូ គ្មាន Watermark · Effect Premium",
    rating: 4.9,
    sold: "1.2K",
    enabled: true,
    delivery: "auto",
    feat: ["ទទួលអ៊ីមែល + ពាក្យសម្ងាត់ភ្លាមៗ", "ធានាគណនីពេញរយៈពេល", "Export 4K · Effect Premium", "ជំនួយ ២៤/៧"],
    types: ["Private (ផ្ទាល់ខ្លួន)", "Shared"],
    plans: [
      { k: "1 ខែ", p: 2.5 },
      { k: "3 ខែ", p: 6.5, save: "សន្សំ 13%" },
      { k: "12 ខែ", p: 22, save: "សន្សំ 27%" },
    ],
  },
  {
    id: "spotify",
    name: "Spotify Premium",
    letter: "S",
    c: ["#1ED760", "#14803C"],
    cat: "Music",
    tag: "ស្តាប់ភ្លេងគ្មានពាណិជ្ជកម្ម · Offline",
    rating: 4.8,
    sold: "980",
    enabled: true,
    delivery: "auto",
    feat: ["គ្មានពាណិជ្ជកម្ម · Offline", "ធានាពេញរយៈពេល", "ជំនួយ ២៤/៧"],
    types: ["Private (ផ្ទាល់ខ្លួន)", "Upgrade គណនីខ្ញុំ"],
    plans: [
      { k: "1 ខែ", p: 3 },
      { k: "3 ខែ", p: 8, save: "សន្សំ 11%" },
      { k: "6 ខែ", p: 15, save: "សន្សំ 17%" },
    ],
  },
  {
    id: "netflix",
    name: "Netflix",
    letter: "N",
    c: ["#FF3B3B", "#9B0F1A"],
    cat: "Streaming",
    tag: "1 Profile · 4K UHD",
    rating: 4.7,
    sold: "760",
    enabled: true,
    delivery: "manual",
    feat: ["1 Profile + PIN", "4K UHD", "ធានាពេញរយៈពេល"],
    types: ["1 Profile", "Full Account"],
    plans: [
      { k: "1 ខែ", p: 4 },
      { k: "3 ខែ", p: 11, save: "សន្សំ 8%" },
    ],
  },
  {
    id: "youtube",
    name: "YouTube Premium",
    letter: "Y",
    c: ["#FF4D4D", "#B30000"],
    cat: "Streaming",
    tag: "គ្មានពាណិជ្ជកម្ម · Background Play",
    rating: 4.8,
    sold: "640",
    enabled: true,
    delivery: "auto",
    feat: ["គ្មានពាណិជ្ជកម្ម", "Background + Download", "YouTube Music"],
    types: ["Upgrade គណនីខ្ញុំ", "Private"],
    plans: [
      { k: "1 ខែ", p: 2.2 },
      { k: "3 ខែ", p: 6, save: "សន្សំ 9%" },
      { k: "12 ខែ", p: 20, save: "សន្សំ 24%" },
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT Plus",
    letter: "G",
    c: ["#19C39B", "#0B7A62"],
    cat: "AI",
    tag: "GPT ជំនាន់ថ្មី · លឿន",
    rating: 4.6,
    sold: "410",
    enabled: true,
    delivery: "manual",
    feat: ["Model ថ្មី", "ធានាពេញរយៈពេល"],
    types: ["Shared", "Private"],
    plans: [{ k: "1 ខែ", p: 8 }],
  },
  {
    id: "canva",
    name: "Canva Pro",
    letter: "Ca",
    c: ["#9B5CFF", "#4C2BD1"],
    cat: "Design",
    tag: "Template · Brand Kit",
    rating: 4.9,
    sold: "530",
    enabled: true,
    delivery: "auto",
    feat: ["Template Premium", "Background Remover"],
    types: ["Team Invite"],
    plans: [{ k: "12 ខែ", p: 1.5 }],
  },
];

let products = load("products.json", defaultProducts);
let stock = load("stock.json", {}); // { productId: { planKey: [lines] } }
let users = load("users.json", {}); // uid -> { id, name, username, balance, joined }
let orders = load("orders.json", []);
let payments = load("payments.json", []);
let settings = load("settings.json", {
  storeName: "Zen Premium",
  supportUrl: "https://t.me/kairozen_support",
  khqrImageUrl: "",
  payNote: "ស្កេន KHQR រួចចុច «ខ្ញុំបានបង់ហើយ»",
  qrExpireSec: 600,
  maintenance: false,
});
let sessions = load("sessions.json", {}); // token -> { at }

function persist() {
  save("products.json", products);
  save("stock.json", stock);
  save("users.json", users);
  save("orders.json", orders);
  save("payments.json", payments);
  save("settings.json", settings);
  save("sessions.json", sessions);
}

export function getSettings() {
  return { ...settings };
}
export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  if (patch.qrExpireSec != null) settings.qrExpireSec = Number(patch.qrExpireSec) || 600;
  settings.maintenance = !!settings.maintenance;
  persist();
  return settings;
}

export function listProductsPublic() {
  return products
    .filter((p) => p.enabled !== false)
    .map((p) => {
      const by = stock[p.id] || {};
      const stockByPlan = {};
      let any = false;
      for (const pl of p.plans || []) {
        const n = (by[pl.k] || []).length;
        stockByPlan[pl.k] = n;
        if (n > 0) any = true;
      }
      const hasStock = p.delivery === "manual" ? true : any;
      return { ...p, stock: hasStock, stockByPlan };
    });
}

export function listProductsAdmin() {
  return products.map((p) => {
    const by = stock[p.id] || {};
    const stockByPlan = {};
    for (const pl of p.plans || []) stockByPlan[pl.k] = (by[pl.k] || []).length;
    return { ...p, stockByPlan };
  });
}

export function saveProduct(id, body) {
  const parseLines = (v) =>
    String(v || "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  const row = {
    id: id || String(body.name || "p")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32) || crypto.randomBytes(4).toString("hex"),
    name: String(body.name || "").trim() || "Product",
    letter: String(body.letter || "P").slice(0, 2),
    c: Array.isArray(body.c) && body.c.length >= 2 ? body.c : ["#7C5CFF", "#3B82F6"],
    cat: String(body.cat || ""),
    tag: String(body.tag || ""),
    rating: Number(body.rating) || 4.8,
    sold: String(body.sold || "0"),
    enabled: body.enabled !== false && body.enabled !== "false",
    delivery: body.delivery === "manual" ? "manual" : "auto",
    feat: Array.isArray(body.feat) ? body.feat : parseLines(body.feat),
    types: Array.isArray(body.types) ? body.types : parseLines(body.types),
    plans: Array.isArray(body.plans)
      ? body.plans.map((x) => ({ k: String(x.k), p: Number(x.p) || 0, save: x.save || "" }))
      : [],
  };
  const i = products.findIndex((x) => x.id === row.id);
  if (i >= 0) products[i] = { ...products[i], ...row };
  else products.push(row);
  persist();
  return row;
}

export function deleteProduct(id) {
  products = products.filter((p) => p.id !== id);
  delete stock[id];
  persist();
}

export function addStock(pid, plan, linesText) {
  const lines = String(linesText || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!stock[pid]) stock[pid] = {};
  if (!stock[pid][plan]) stock[pid][plan] = [];
  stock[pid][plan].push(...lines);
  persist();
  return { added: lines.length, total: stock[pid][plan].length };
}

export function getStock(pid, plan) {
  return { lines: (stock[pid] && stock[pid][plan]) || [] };
}

export function clearStock(pid, plan) {
  if (stock[pid]) stock[pid][plan] = [];
  persist();
}

function popStock(pid, plan) {
  const arr = stock[pid] && stock[pid][plan];
  if (!arr || !arr.length) return null;
  const line = arr.shift();
  persist();
  const parts = String(line).split(":");
  if (parts.length >= 2) {
    return { email: parts[0].trim(), password: parts.slice(1).join(":").trim(), raw: line };
  }
  return { email: line, password: "", raw: line };
}

export function upsertUser(u) {
  const id = String(u.id);
  if (!users[id]) {
    users[id] = {
      id,
      name: u.name || u.first_name || "User",
      username: u.username || "",
      balance: 0,
      joined: Date.now(),
    };
  } else {
    users[id].name = u.name || u.first_name || users[id].name;
    if (u.username) users[id].username = u.username;
  }
  persist();
  return users[id];
}

export function listUsers() {
  return Object.values(users).sort((a, b) => (b.joined || 0) - (a.joined || 0));
}

export function adjustBalance(uid, delta) {
  const u = users[String(uid)];
  if (!u) throw new Error("user_not_found");
  u.balance = Math.round((Number(u.balance) + Number(delta)) * 100) / 100;
  persist();
  return u;
}

export function getUser(uid) {
  return users[String(uid)] || null;
}

function nextId(prefix) {
  return prefix + Math.floor(10000 + Math.random() * 89999);
}

/** Create pending payment (KHQR manual approve or wallet). */
export function createPayment({ uid, uname, kind, amount, product, plan, type, providerRef, qrImageUrl, deeplink }) {
  const id = nextId("PAY-");
  const row = {
    id,
    uid: String(uid || "guest"),
    uname: uname || "Guest",
    kind: kind || "order", // order | topup
    amount: Number(amount) || 0,
    product: product || "",
    plan: plan || "",
    type: type || "",
    status: "pending",
    at: Date.now(),
    expires: Date.now() + (Number(settings.qrExpireSec) || 600) * 1000,
    providerRef: providerRef || "",
    qrImageUrl: qrImageUrl || "",
    deeplink: deeplink || "",
    auto: Boolean(providerRef),
  };
  payments.unshift(row);
  persist();
  return row;
}

export function getPayment(id) {
  return payments.find((p) => p.id === id) || null;
}

/** After ABA confirms paid — approve + auto-deliver stock (same as admin approve). */
export function settlePaidPayment(id) {
  const pay = getPayment(id);
  if (!pay) throw new Error("not_found");
  if (pay.status === "approved") {
    const o = orders.find((x) => x.payId === pay.id);
    return { pay, order: o || null, already: true };
  }
  if (pay.status !== "pending") throw new Error("invalid_payment");
  return approvePayment(id);
}

export function listPayments() {
  return payments;
}

function deliverFromStock(order) {
  const p = products.find((x) => x.id === order.product);
  if (!p) return null;
  if (p.delivery === "auto") {
    const cred = popStock(order.product, order.plan);
    if (cred) {
      order.status = "delivered";
      order.cred = cred;
      order.deliveredAt = Date.now();
      return order;
    }
    order.status = "processing";
    return order;
  }
  order.status = "processing";
  return order;
}

export function approvePayment(id) {
  const pay = getPayment(id);
  if (!pay || pay.status !== "pending") throw new Error("invalid_payment");
  pay.status = "approved";
  pay.approvedAt = Date.now();

  if (pay.kind === "topup") {
    upsertUser({ id: pay.uid, name: pay.uname });
    adjustBalance(pay.uid, pay.amount);
    persist();
    return { pay, order: null };
  }

  const order = {
    id: nextId("AP-"),
    uid: pay.uid,
    uname: pay.uname,
    product: pay.product,
    pname: products.find((x) => x.id === pay.product)?.name || pay.product,
    plan: pay.plan,
    type: pay.type,
    amount: pay.amount,
    how: "khqr",
    status: "processing",
    at: Date.now(),
    payId: pay.id,
  };
  deliverFromStock(order);
  orders.unshift(order);
  persist();
  return { pay, order };
}

export function rejectPayment(id) {
  const pay = getPayment(id);
  if (!pay || pay.status !== "pending") throw new Error("invalid_payment");
  pay.status = "rejected";
  persist();
  return pay;
}

export function walletPurchase({ uid, uname, product, plan, type, amount }) {
  const u = upsertUser({ id: uid, name: uname });
  if (Number(u.balance) < Number(amount)) throw new Error("insufficient_balance");
  adjustBalance(uid, -Number(amount));
  const order = {
    id: nextId("AP-"),
    uid: String(uid),
    uname: uname || u.name,
    product,
    pname: products.find((x) => x.id === product)?.name || product,
    plan,
    type,
    amount: Number(amount),
    how: "wallet",
    status: "processing",
    at: Date.now(),
  };
  deliverFromStock(order);
  orders.unshift(order);
  persist();
  return order;
}

export function listOrders() {
  return orders;
}

export function listOrdersByUser(uid) {
  const id = String(uid || "");
  return orders.filter((o) => String(o.uid) === id);
}

export function deliverOrder(id, credLine) {
  const o = orders.find((x) => x.id === id);
  if (!o) throw new Error("not_found");
  const parts = String(credLine || "").split(":");
  o.cred = {
    email: parts[0]?.trim() || credLine,
    password: parts.slice(1).join(":").trim() || "",
    raw: credLine,
  };
  o.status = "delivered";
  o.deliveredAt = Date.now();
  persist();
  return o;
}

export function refundOrder(id) {
  const o = orders.find((x) => x.id === id);
  if (!o || o.status === "refunded") throw new Error("invalid");
  adjustBalance(o.uid, o.amount);
  o.status = "refunded";
  persist();
  return o;
}

export function stats() {
  const day = Date.now() - 86400000;
  const paidOrders = orders.filter((o) => o.status !== "refunded");
  const revenue = paidOrders.reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const revenue24 = paidOrders.filter((o) => o.at >= day).reduce((s, o) => s + (Number(o.amount) || 0), 0);
  const orders24 = paidOrders.filter((o) => o.at >= day).length;
  const processing = orders.filter((o) => o.status === "processing").length;
  const pendingPay = payments.filter((p) => p.status === "pending").length;
  const lowStock = [];
  for (const p of products) {
    if (p.delivery !== "auto") continue;
    for (const pl of p.plans || []) {
      const left = (stock[p.id] && stock[p.id][pl.k] || []).length;
      if (left <= 2) lowStock.push({ product: p.name, plan: pl.k, left });
    }
  }
  return {
    revenue,
    revenue24,
    orders: paidOrders.length,
    orders24,
    users: Object.keys(users).length,
    processing,
    pendingPay,
    lowStock,
    recent: paidOrders.slice(0, 8).map((o) => ({
      pname: o.pname,
      plan: o.plan,
      uname: o.uname,
      amount: o.amount,
      at: o.at,
    })),
  };
}

export function createSession() {
  const token = crypto.randomBytes(24).toString("hex");
  sessions[token] = { at: Date.now() };
  persist();
  return token;
}

export function validSession(token) {
  if (!token || !sessions[token]) return false;
  if (Date.now() - sessions[token].at > 7 * 86400000) {
    delete sessions[token];
    persist();
    return false;
  }
  return true;
}

export function destroySession(token) {
  delete sessions[token];
  persist();
}
