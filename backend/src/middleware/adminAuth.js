import { timingSafeEqual } from "node:crypto";

export function createAdminAuth(getConfiguredToken) {
  return (req, res, next) => {
    const configuredToken = getConfiguredToken()?.trim();
    if (!configuredToken || Buffer.byteLength(configuredToken, "utf8") < 32) {
      return res.status(503).json({ error: "La operación administrativa no está configurada." });
    }

    const providedToken = req.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];
    if (!providedToken) {
      res.set("WWW-Authenticate", 'Bearer realm="admin"');
      return res.status(401).json({ error: "Se requiere autenticación administrativa." });
    }

    const expected = Buffer.from(configuredToken, "utf8");
    const provided = Buffer.from(providedToken, "utf8");
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      res.set("WWW-Authenticate", 'Bearer realm="admin"');
      return res.status(401).json({ error: "Se requiere autenticación administrativa." });
    }

    next();
  };
}
