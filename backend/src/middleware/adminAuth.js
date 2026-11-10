import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

function fixedTimeStringEqual(first, second) {
  const firstHash = createHash("sha256").update(first).digest();
  const secondHash = createHash("sha256").update(second).digest();
  return timingSafeEqual(firstHash, secondHash);
}

export function isAdminConfigured() {
  const { ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_SESSION_SECRET } = process.env;
  return Boolean(
    ADMIN_USERNAME?.trim() &&
    ADMIN_PASSWORD &&
    ADMIN_SESSION_SECRET &&
    Buffer.byteLength(ADMIN_SESSION_SECRET, "utf8") >= 32
  );
}

export function verifyAdminCredentials(username, password) {
  if (!isAdminConfigured()) return false;
  return fixedTimeStringEqual(username, process.env.ADMIN_USERNAME.trim()) &&
    fixedTimeStringEqual(password, process.env.ADMIN_PASSWORD);
}

export function createAdminSession(username, secret = process.env.ADMIN_SESSION_SECRET, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({
    sub: username,
    exp: Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return { token: `${payload}.${signature}`, expiresIn: SESSION_LIFETIME_SECONDS };
}

export function verifyAdminSession(token, {
  secret = process.env.ADMIN_SESSION_SECRET,
  username = process.env.ADMIN_USERNAME?.trim(),
  now = Date.now()
} = {}) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || !username) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return false;

  const expectedSignature = createHmac("sha256", secret).update(payload).digest();
  const providedSignature = Buffer.from(signature, "base64url");
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(expectedSignature, providedSignature)
  ) {
    return false;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return claims.sub === username &&
      Number.isInteger(claims.exp) &&
      claims.exp > Math.floor(now / 1000) &&
      claims.exp <= Math.floor(now / 1000) + SESSION_LIFETIME_SECONDS;
  } catch {
    return false;
  }
}

export function createAdminAuth() {
  return (req, res, next) => {
    if (!isAdminConfigured()) {
      return res.status(503).json({ error: "El acceso administrativo no está configurado." });
    }

    const token = req.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
    if (!token || !verifyAdminSession(token)) {
      res.set("WWW-Authenticate", 'Bearer realm="admin"');
      return res.status(401).json({ error: "La sesión administrativa no es válida o expiró." });
    }

    next();
  };
}
