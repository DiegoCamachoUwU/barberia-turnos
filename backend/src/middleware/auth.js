import jwt from "jsonwebtoken";
import { prisma } from "../config/database.js";

const TOKEN_ISSUER = "barberia-turnos-api";
const TOKEN_AUDIENCE = "barberia-turnos-admin";
const TOKEN_LIFETIME = "8h";

export function isJwtConfigured() {
  const secret = process.env.JWT_SECRET;
  return Boolean(secret && Buffer.byteLength(secret, "utf8") >= 32);
}

export function signAuthToken(user) {
  if (!isJwtConfigured()) {
    throw new Error("JWT_SECRET debe tener al menos 32 bytes.");
  }
  return jwt.sign(
    { role: user.role, organizationId: user.organizationId },
    process.env.JWT_SECRET,
    {
      algorithm: "HS256",
      subject: user.id,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: TOKEN_LIFETIME
    }
  );
}

export function verifyAuthToken(token, secret = process.env.JWT_SECRET) {
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("JWT_SECRET debe tener al menos 32 bytes.");
  }
  const claims = jwt.verify(token, secret, {
    algorithms: ["HS256"],
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE
  });
  if (
    typeof claims === "string" ||
    typeof claims.sub !== "string" ||
    typeof claims.role !== "string" ||
    typeof claims.organizationId !== "string"
  ) {
    throw new jwt.JsonWebTokenError("Invalid token claims");
  }
  return {
    userId: claims.sub,
    role: claims.role,
    organizationId: claims.organizationId
  };
}

export async function authenticate(req, res, next) {
  if (!isJwtConfigured()) {
    return res.status(503).json({ error: "La autenticación no está configurada." });
  }

  const token = req.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) {
    res.set("WWW-Authenticate", 'Bearer realm="admin"');
    return res.status(401).json({ error: "Se requiere una sesión válida." });
  }

  let claims;
  try {
    claims = verifyAuthToken(token);
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      res.set("WWW-Authenticate", 'Bearer realm="admin"');
      return res.status(401).json({ error: "La sesión no es válida o expiró." });
    }
    return next(error);
  }

  try {
    const user = await prisma.staffUser.findUnique({
      where: { id: claims.userId },
      select: { id: true, role: true, organizationId: true }
    });
    if (
      !user ||
      user.role !== claims.role ||
      user.organizationId !== claims.organizationId
    ) {
      res.set("WWW-Authenticate", 'Bearer realm="admin"');
      return res.status(401).json({ error: "La sesión no es válida o expiró." });
    }
    req.user = {
      userId: user.id,
      role: user.role,
      organizationId: user.organizationId
    };
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "No tienes permisos para realizar esta acción." });
    }
    return next();
  };
}

export function requireOrganizationMatch(req, res, next) {
  if (!req.user || req.user.organizationId !== req.organization?.id) {
    return res.status(403).json({ error: "No tienes permisos para acceder a esta barbería." });
  }
  return next();
}
