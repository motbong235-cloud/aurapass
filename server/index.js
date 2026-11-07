import express from "express";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import * as store from "./store.js";
import * as abapay from "./abapay.js";
import { startBot, webhookMiddleware } from "./bot.js";
import { resolveUser, verifyInitData } from "./telegramAuth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "zenpremium-admin-change-me";
const isProd = process.env.NODE_ENV === "production";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "4mb" }));
app.use(cookieParser());

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "ALLOWALL"); // Telegram WebApp iframe
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (isProd) res.setHeader("Strict-Transport-Security", "max-age=31536000");
  next();
});

function safeEq(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function adminAuth(req, res, next) {
  const token = req.cookies?.aura_admin;
  if (!store.validSession(token)) return res.status(401).json({ error: "unauthorized" });
  next();
}

/* ---------- Admin API ---------- */
const adm = express.Router();
adm.post("/login", (req, res) => {
  const pw = String(req.body?.password || "");
  if (!safeEq(pw, ADMIN_PASSWORD)) return res.status(401).json({ error: "ពាក្យសម្ងាត់ខុស" });
  const token = store.createSession();
  res.cookie("aura_admin", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 7 * 86400000,
  });
  res.json({ ok: true });
});
adm.post("/logout", (req, res) => {
  store.destroySession(req.cookies?.aura_admin);
  res.clearCookie("aura_admin");
  res.json({ ok: true });
});
adm.get("/stats", adminAuth, (_req, res) => res.json(store.stats()));
adm.get("/orders", adminAuth, (_req, res) => res.json(store.listOrders()));
adm.get("/payments", adminAuth, (_req, res) => res.json(store.listPayments()));
adm.get("/products", adminAuth, (_req, res) => res.json(store.listProductsAdmin()));
adm.post("/products", adminAuth, (req, res) => res.json(store.saveProduct(null, req.body || {})));
adm.post("/upload-image", adminAuth, (req, res) => {
  try {
    const dataUrl = String(req.body?.data || "");
    const m = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/i);
    if (!m) return res.status(400).json({ error: "invalid_image" });
    const ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 2.5 * 1024 * 1024) return res.status(400).json({ error: "image_too_large" });
    const dir = path.join(process.env.DATA_DIR || path.join(ROOT, "data"), "uploads");
    fs.mkdirSync(dir, { recursive: true });
    const name = `p_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}.${ext}`;
    fs.writeFileSync(path.join(dir, name), buf);
    const url = "/uploads/" + name;
    res.json({ ok: true, url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

adm.put("/products/:id", adminAuth, (req, res) => res.json(store.saveProduct(req.params.id, req.body || {})));
adm.delete("/products/:id", adminAuth, (req, res) => {
  store.deleteProduct(req.params.id);
  res.json({ ok: true });
});
adm.get("/stock/:pid", adminAuth, (req, res) => {
  res.json(store.getStock(req.params.pid, req.query.plan || ""));
});
adm.post("/stock/:pid", adminAuth, (req, res) => {
  res.json(store.addStock(req.params.pid, req.query.plan || "", req.body?.lines || ""));
});
adm.delete("/stock/:pid", adminAuth, (req, res) => {
  store.clearStock(req.params.pid, req.query.plan || "");
  res.json({ ok: true });
});
adm.get("/users", adminAuth, (_req, res) => res.json(store.listUsers()));
adm.post("/users/:id/balance", adminAuth, (req, res) => {
  try {
    res.json(store.adjustBalance(req.params.id, Number(req.body?.delta) || 0));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adm.get("/settings", adminAuth, (_req, res) => res.json(store.getSettings()));
adm.put("/settings", adminAuth, (req, res) => res.json(store.updateSettings(req.body || {})));
adm.post("/orders/:id/deliver", adminAuth, (req, res) => {
  try {
    res.json(store.deliverOrder(req.params.id, req.body?.cred || ""));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adm.post("/orders/:id/refund", adminAuth, (req, res) => {
  try {
    res.json(store.refundOrder(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adm.post("/payments/:id/approve", adminAuth, (req, res) => {
  try {
    res.json(store.approvePayment(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
adm.post("/payments/:id/reject", adminAuth, (req, res) => {
  try {
    res.json(store.rejectPayment(req.params.id));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.use("/admin/api", adm);

/* ---------- Public Mini App API ---------- */
app.get("/api/premium/catalog", (_req, res) => {
  const s = store.getSettings();
  if (s.maintenance) return res.json({ maintenance: true, products: [], storeName: s.storeName });
  res.json({
    storeName: s.storeName,
    supportUrl: s.supportUrl,
    products: store.listProductsPublic(),
  });
});

app.get("/api/premium/settings", (_req, res) => {
  const s = store.getSettings();
  res.json({
    storeName: s.storeName,
    supportUrl: s.supportUrl,
    khqrImageUrl: s.khqrImageUrl,
    payNote: s.payNote,
    qrExpireSec: s.qrExpireSec,
    maintenance: !!s.maintenance,
  });
});

app.post("/api/premium/pay", async (req, res) => {
  const s = store.getSettings();
  if (s.maintenance) return res.status(503).json({ error: "maintenance" });
  const body = req.body || {};
  const order = body.order || body;
  const tgUser = resolveUser(req);
  if (!tgUser) {
    return res.status(401).json({
      error: "telegram_required",
      message: "សូមបើកតាម Telegram bot (Mini App) — គណនីនីមួយៗផ្សេងគ្នា",
    });
  }
  const uid = tgUser.id;
  const uname = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || body.uname || "User";
  store.upsertUser({ id: uid, name: uname, username: tgUser.username || "", first_name: tgUser.first_name });
  try {
    if (order.topup) {
      const amount = Number(order.amount || order.topup);
      let providerRef = "", qrImageUrl = s.khqrImageUrl || "", deeplink = "";
      if (abapay.isAbaReady()) {
        const billId = "TP" + Date.now().toString(36).toUpperCase();
        const qr = await abapay.createQr({
          amount,
          billId,
          description: "Zen Premium Topup",
          username: uname || uid,
        });
        if (!qr.success) {
          console.warn("[aba topup qr]", qr.error);
          return res.status(502).json({ error: "qr_failed", message: qr.error || "Cannot create QR" });
        }
        providerRef = qr.providerRef;
        qrImageUrl = qr.qrImageUrl || "";
        deeplink = qr.deeplink || "";
      } else if (!qrImageUrl) {
        return res.status(503).json({
          error: "qr_not_configured",
          message: "មិនទាន់ដាក់ ABA_API_KEY + ABA_MERCHANT_ID លើ Render (ឬ KHQR image ក្នុង Admin)",
        });
      }
      const pay = store.createPayment({
        uid, uname, kind: "topup", amount, providerRef, qrImageUrl, deeplink,
      });
      return res.json({
        id: pay.id,
        qr_image_url: abapay.normalizeQrImage(pay.qrImageUrl || s.khqrImageUrl || ""),
        deeplink: pay.deeplink || "",
        expires_in: s.qrExpireSec || 600,
        amount: pay.amount,
        auto: Boolean(pay.providerRef),
      });
    }
    if (order.pay === "wallet" || body.method === "wallet") {
      const o = store.walletPurchase({
        uid, uname,
        product: order.product, plan: order.plan, type: order.type, amount: order.amount,
      });
      return res.json({
        id: o.id, paid: true,
        credentials: o.cred ? { email: o.cred.email, password: o.cred.password } : null,
        status: o.status, orderId: o.id,
        auto_delivery: o.status === "delivered",
      });
    }
    // KHQR order — auto QR if ABA keys set, else static image + admin approve
    let providerRef = "", qrImageUrl = s.khqrImageUrl || "", deeplink = "";
    if (abapay.isAbaReady()) {
      const billId = "ZP" + Date.now().toString(36).toUpperCase();
      const qr = await abapay.createQr({
        amount: Number(order.amount),
        billId,
        description: `Zen Premium ${order.product || ""} ${order.plan || ""}`.trim(),
        username: uname || uid,
      });
      if (!qr.success) {
        console.warn("[aba order qr]", qr.error);
        return res.status(502).json({ error: "qr_failed", message: qr.error || "Cannot create QR" });
      }
      providerRef = qr.providerRef;
      qrImageUrl = qr.qrImageUrl || "";
      deeplink = qr.deeplink || "";
    } else if (!qrImageUrl) {
      return res.status(503).json({
        error: "qr_not_configured",
        message: "មិនទាន់ដាក់ ABA_API_KEY + ABA_MERCHANT_ID លើ Render (ឬ KHQR image ក្នុង Admin)",
      });
    }
    const pay = store.createPayment({
      uid, uname, kind: "order",
      amount: Number(order.amount),
      product: order.product, plan: order.plan, type: order.type,
      providerRef, qrImageUrl, deeplink,
    });
    res.json({
      id: pay.id,
      qr_image_url: abapay.normalizeQrImage(pay.qrImageUrl || s.khqrImageUrl || ""),
      deeplink: pay.deeplink || "",
      expires_in: s.qrExpireSec || 600,
      amount: pay.amount,
      auto: Boolean(pay.providerRef),
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get("/api/premium/pay/:id", async (req, res) => {
  const pay = store.getPayment(req.params.id);
  if (!pay) return res.status(404).json({ paid: false, error: "not_found" });
  if (pay.status === "approved") {
    const o = store.listOrders().find((x) => x.payId === pay.id);
    return res.json({
      paid: true,
      status: o?.status || "approved",
      orderId: o?.id,
      credentials: o?.cred ? { email: o.cred.email, password: o.cred.password } : null,
      auto_delivery: o?.status === "delivered",
    });
  }
  if (pay.status === "rejected") return res.json({ paid: false, status: "rejected" });

  // Auto payment: poll ABA PayWay when providerRef exists
  if (pay.providerRef && abapay.isAbaReady()) {
    try {
      const chk = await abapay.checkPaid(pay.providerRef);
      if (chk.paid) {
        const settled = store.settlePaidPayment(pay.id);
        const o = settled.order;
        return res.json({
          paid: true,
          status: o?.status || "approved",
          orderId: o?.id,
          credentials: o?.cred ? { email: o.cred.email, password: o.cred.password } : null,
          auto_delivery: o?.status === "delivered",
          auto_payment: true,
        });
      }
    } catch (e) {
      console.warn("[aba check]", e.message);
    }
  }
  res.json({ paid: false, status: "pending", auto: Boolean(pay.providerRef) });
});

app.get("/api/premium/me", (req, res) => {
  const token = process.env.BOT_TOKEN || "";
  const initData = req.headers["x-telegram-init-data"] || req.query.initData || "";
  let uid = String(req.query.uid || "");
  let name = "";
  let username = "";
  if (token && initData) {
    const v = verifyInitData(initData, token);
    if (v.ok) {
      uid = v.user.id;
      name = [v.user.first_name, v.user.last_name].filter(Boolean).join(" ");
      username = v.user.username || "";
    }
  }
  if (!uid || uid === "web" || uid === "guest") {
    return res.json({ balance: 0, user: null, orders: [], needTelegram: true });
  }
  const u = store.upsertUser({ id: uid, name: name || "User", username, first_name: name });
  const orders = store.listOrdersByUser(uid).slice(0, 50);
  res.json({
    balance: u.balance || 0,
    user: { id: u.id, name: u.name, username: u.username, balance: u.balance, joined: u.joined },
    orders,
    verified: Boolean(token && initData),
  });
});


app.post("/telegram/webhook", express.json(), webhookMiddleware());

app.get("/api/premium/aba-diag", async (_req, res) => {
  const ready = abapay.isAbaReady();
  if (!ready) return res.json({ ready: false, error: "Set ABA_API_KEY and ABA_MERCHANT_ID" });
  const qr = await abapay.createQr({ amount: 0.01, billId: "diag", username: "diag_test" });
  res.json({
    ready: true,
    ok: !!qr.success,
    error: qr.error || null,
    hasImage: Boolean(qr.qrImageUrl),
    payment_id: qr.providerRef || null,
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "Zen Premium", aba: abapay.isAbaReady() }));

const uploadsDir = path.join(process.env.DATA_DIR || path.join(ROOT, "data"), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));
app.use(express.static(path.join(ROOT, "public"), { index: false }));


app.get("/admin", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "admin.html"));
});
app.get("*", (_req, res) => {
  res.sendFile(path.join(ROOT, "public", "index.html"));
});

// Background: auto-settle ABA payments every 12s
setInterval(async () => {
  if (!abapay.isAbaReady()) return;
  const pending = store.listPayments().filter((p) => p.status === "pending" && p.providerRef);
  for (const pay of pending.slice(0, 15)) {
    try {
      const chk = await abapay.checkPaid(pay.providerRef);
      if (chk.paid) {
        store.settlePaidPayment(pay.id);
        console.log("[auto-pay] settled", pay.id);
      }
    } catch (e) {
      /* ignore */
    }
  }
}, 12_000).unref?.();

app.listen(PORT, () => {
  console.log(`Zen Premium on :${PORT} | ABA auto-pay: ${abapay.isAbaReady() ? "ON" : "OFF (manual KHQR)"}`);
  if (ADMIN_PASSWORD === "zenpremium-admin-change-me") {
    console.warn("[warn] Set ADMIN_PASSWORD env in production");
  }
  startBot().catch((e) => console.error("[bot start]", e.message));
});
