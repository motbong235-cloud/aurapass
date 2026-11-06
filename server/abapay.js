/**
 * ABA PayWay real KHQR — same API as Porpor / Kai-
 * POST https://khmer-system.com/aba-api/generate-qr
 * body: { api_key, merchant_id, username, amount }
 *
 * Env (Render):
 *   ABA_API_KEY
 *   ABA_MERCHANT_ID
 * Optional: KHMER_SYSTEM_URL, QR_EXPIRE_SEC
 */
const BASE_URL = (process.env.KHMER_SYSTEM_URL || "https://khmer-system.com").replace(/\/$/, "");
const CREATE_URL = `${BASE_URL}/aba-api/generate-qr`;
const CHECK_URL = `${BASE_URL}/aba-api/check-payment`;

function clean(v) {
  return String(v || "")
    .replace(/[\s\u200b\ufeff]+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "");
}

function apiKey() {
  return clean(process.env.ABA_API_KEY || process.env.KHMER_SYSTEM_API_KEY || "");
}
function merchantId() {
  return clean(process.env.ABA_MERCHANT_ID || process.env.KHMER_SYSTEM_MERCHANT_ID || "");
}

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

export function isAbaReady() {
  return Boolean(apiKey() && merchantId());
}

function makeUsername(raw) {
  const u = String(raw || "")
    .replace(/^@/, "")
    .replace(/[^A-Za-z0-9_]/g, "")
    .slice(0, 32);
  return u || "customer";
}

/**
 * Create real KHQR.
 * @returns {{ success, qrImageUrl, providerRef, deeplink, pay_url, error? }}
 */
export async function createQr({ amount, billId, description, username }) {
  if (!isAbaReady()) {
    return { success: false, error: "ABA_API_KEY or ABA_MERCHANT_ID not set", simulation: true };
  }
  const QR_EXPIRE_SEC = Math.max(600, Number(process.env.QR_EXPIRE_SEC || 3600) || 3600);
  const payload = {
    api_key: apiKey(),
    merchant_id: merchantId(),
    username: makeUsername(username || billId || "zen"),
    amount: Math.round(Number(amount) * 100) / 100,
    expires_in: QR_EXPIRE_SEC,
    expire_in: QR_EXPIRE_SEC,
    ttl: QR_EXPIRE_SEC,
  };

  let lastErr = "unknown";
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(CREATE_URL, {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25000),
      });
      const text = await r.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        lastErr = `HTTP ${r.status} non-JSON: ${text.slice(0, 180)}`;
        if (attempt < 2) {
          await new Promise((x) => setTimeout(x, 800));
          continue;
        }
        return { success: false, error: lastErr };
      }

      if (data.ok && data.payment_id) {
        let deeplink =
          data.abapay_deeplink || data.aba_deeplink || data.deeplink || data.pay_url || "";
        const qr_string = data.qr_string || data.qr_data || data.qr || "";
        if (!deeplink || !String(deeplink).toLowerCase().startsWith("abamobilebank://")) {
          if (qr_string) {
            deeplink = `abamobilebank://ababank.com?type=payway&qrcode=${encodeURIComponent(qr_string)}`;
          }
        }
        const qrImageUrl = data.card_image || data.qr_image || "";
        return {
          success: true,
          providerRef: String(data.payment_id),
          qrImageUrl,
          deeplink,
          pay_url: data.pay_url || data.checkout_url || "",
          amount: payload.amount,
          raw: { ...data, card_image: undefined, qr_image: undefined },
        };
      }
      lastErr = data.message || data.error || "Failed to create QR";
      // invalid username style — retry with simpler username
      if (String(lastErr).toLowerCase().includes("username") && attempt < 2) {
        payload.username = "customer" + Date.now().toString(36).slice(-4);
        await new Promise((x) => setTimeout(x, 400));
        continue;
      }
      if (attempt < 2) {
        await new Promise((x) => setTimeout(x, 800));
        continue;
      }
      return { success: false, error: lastErr, raw: data };
    } catch (e) {
      lastErr = e.message || String(e);
      if (attempt < 2) {
        await new Promise((x) => setTimeout(x, 800));
        continue;
      }
      return { success: false, error: lastErr };
    }
  }
  return { success: false, error: lastErr };
}

/** Check payment — only explicit paid status counts */
export async function checkPaid(providerRef) {
  if (!isAbaReady() || !providerRef) return { paid: false };
  const payload = {
    api_key: apiKey(),
    merchant_id: merchantId(),
    payment_id: String(providerRef),
  };
  try {
    const r = await fetch(CHECK_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const data = await r.json().catch(() => ({}));
    const status = String(
      data.status || data.payment_status || data.state || data.tran_status || "",
    )
      .toUpperCase()
      .trim();
    const paidStatuses = new Set(["PAID", "SUCCESS", "COMPLETED", "COMPLETE", "DONE", "SETTLED"]);
    const unpaidStatuses = new Set([
      "PENDING",
      "UNPAID",
      "WAITING",
      "CREATED",
      "EXPIRED",
      "FAILED",
      "CANCELLED",
      "CANCELED",
      "TIMEOUT",
      "OPEN",
    ]);
    let paid = false;
    if (data.paid === true || String(data.paid).toLowerCase() === "true") paid = true;
    if (paidStatuses.has(status)) paid = true;
    if (unpaidStatuses.has(status)) paid = false;
    return { paid, status, raw: data };
  } catch (e) {
    return { paid: false, error: e.message };
  }
}
