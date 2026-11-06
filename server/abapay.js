/**
 * ABA PayWay via Khmer System API (optional).
 * Env:
 *   ABA_API_KEY or KHMER_SYSTEM_API_KEY  (profile/API key)
 *   ABA_MACHINE_ID or KHMER_SYSTEM_MACHINE_ID
 *   ABA_API_BASE (default https://khmer-system.com)
 */
const BASE = (process.env.ABA_API_BASE || process.env.KHMER_SYSTEM_URL || "https://khmer-system.com").replace(/\/$/, "");

function key() {
  return (
    process.env.ABA_API_KEY ||
    process.env.KHMER_SYSTEM_API_KEY ||
    process.env.KHMER_SYSTEM_PROFILE_KEY ||
    ""
  ).trim();
}
function machineId() {
  return (process.env.ABA_MACHINE_ID || process.env.KHMER_SYSTEM_MACHINE_ID || "").trim();
}

export function isAbaReady() {
  return Boolean(key());
}

async function post(path, body) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${key()}`,
    "X-API-Key": key(),
  };
  if (machineId()) headers["X-Machine-Id"] = machineId();
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const err = new Error(data?.error || data?.message || `HTTP ${r.status}`);
    err.data = data;
    err.status = r.status;
    throw err;
  }
  return data;
}

/** Create KHQR / ABA payment. Returns { providerRef, qrImageUrl, deeplink, amount } */
export async function createQr({ amount, billId, description }) {
  if (!isAbaReady()) throw new Error("aba_not_configured");
  const amt = Math.round(Number(amount) * 100) / 100;
  const payload = {
    amount: amt,
    bill_id: String(billId || "").slice(0, 64),
    description: String(description || "Zen Premium").slice(0, 120),
  };
  if (machineId()) payload.machine_id = machineId();

  // Try common Khmer-system style endpoints
  const paths = ["/api/v1/qr/create", "/api/qr/create", "/api/aba/qr", "/v1/payment/qr"];
  let lastErr;
  for (const p of paths) {
    try {
      const data = await post(p, payload);
      const qr =
        data.qr_image_url ||
        data.qrImageUrl ||
        data.qr ||
        data.image ||
        data.data?.qr_image_url ||
        data.data?.qr ||
        "";
      const ref =
        data.transaction_id ||
        data.tran_id ||
        data.id ||
        data.ref ||
        data.data?.transaction_id ||
        billId;
      const deeplink =
        data.aba_deeplink ||
        data.deeplink ||
        data.deep_link ||
        data.data?.aba_deeplink ||
        "";
      return {
        providerRef: String(ref),
        qrImageUrl: typeof qr === "string" && qr.startsWith("data:") ? qr : qr,
        deeplink: deeplink || "",
        amount: amt,
        raw: data,
      };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("qr_create_failed");
}

/** Check if payment is paid at provider */
export async function checkPaid(providerRef) {
  if (!isAbaReady() || !providerRef) return { paid: false };
  const paths = [
    ["/api/v1/qr/status", { transaction_id: providerRef }],
    ["/api/qr/status", { tran_id: providerRef, transaction_id: providerRef }],
    ["/api/aba/status", { id: providerRef }],
  ];
  for (const [p, body] of paths) {
    try {
      const data = await post(p, body);
      const st = String(
        data.status || data.payment_status || data.data?.status || "",
      ).toLowerCase();
      const paid =
        data.paid === true ||
        st === "paid" ||
        st === "success" ||
        st === "completed" ||
        st === "0" ||
        data.data?.paid === true;
      if (paid) return { paid: true, raw: data };
      if (data.ok === false && data.error) continue;
      return { paid: false, raw: data };
    } catch {
      /* try next */
    }
  }
  return { paid: false };
}
