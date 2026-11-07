import crypto from "crypto";

/**
 * Validate Telegram WebApp initData (HMAC-SHA256).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function parseInitData(initData) {
  if (!initData || typeof initData !== "string") return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheck = pairs.join("\n");
  return { hash, dataCheck, params };
}

export function verifyInitData(initData, botToken, maxAgeSec = 86400) {
  const token = String(botToken || "").trim();
  if (!token || !initData) return { ok: false, reason: "missing" };
  const parsed = parseInitData(initData);
  if (!parsed) return { ok: false, reason: "bad_format" };

  const secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const calc = crypto.createHmac("sha256", secret).update(parsed.dataCheck).digest("hex");
  if (calc !== parsed.hash) return { ok: false, reason: "bad_hash" };

  const authDate = Number(parsed.params.get("auth_date") || 0);
  if (authDate && maxAgeSec > 0 && Date.now() / 1000 - authDate > maxAgeSec) {
    return { ok: false, reason: "expired" };
  }

  let user = null;
  try {
    user = JSON.parse(parsed.params.get("user") || "null");
  } catch {
    user = null;
  }
  if (!user || !user.id) return { ok: false, reason: "no_user" };
  return {
    ok: true,
    user: {
      id: String(user.id),
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      username: user.username || "",
      photo_url: user.photo_url || "",
      language_code: user.language_code || "",
    },
  };
}

/** Prefer verified user from initData; fallback to body uid only if no BOT_TOKEN */
export function resolveUser(req) {
  const token = process.env.BOT_TOKEN || "";
  const body = req.body || {};
  const initData = body.initData || req.headers["x-telegram-init-data"] || "";
  if (token && initData) {
    const v = verifyInitData(initData, token);
    if (v.ok) return { ...v.user, verified: true };
  }
  // soft mode (no bot token): trust client uid for demo / browser
  const uid = String(body.uid || req.query?.uid || "").trim();
  if (uid && uid !== "web" && uid !== "guest") {
    return {
      id: uid,
      first_name: body.uname || "User",
      username: "",
      verified: false,
    };
  }
  return null;
}
