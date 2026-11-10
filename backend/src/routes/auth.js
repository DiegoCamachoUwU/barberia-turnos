import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { authenticate, isJwtConfigured, signAuthToken } from "../middleware/auth.js";

export const authRouter = Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos e inténtalo otra vez." }
});

authRouter.post("/login", loginRateLimit, async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!isJwtConfigured()) {
    return res.status(503).json({ error: "La autenticación no está configurada." });
  }

  const { email: emailInput, password } = req.body ?? {};
  if (
    typeof emailInput !== "string" ||
    typeof password !== "string" ||
    emailInput.length > 254 ||
    password.length > 1024 ||
    !emailInput.trim()
  ) {
    return res.status(400).json({ error: "Indica un correo y una contraseña válidos." });
  }

  try {
    const user = await prisma.staffUser.findUnique({
      where: {
        organizationId_email: {
          organizationId: req.organization.id,
          email: emailInput.trim().toLowerCase()
        }
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        organizationId: true
      }
    });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Correo o contraseña incorrectos." });
    }

    const token = signAuthToken(user);
    res.json({
      token,
      expiresIn: 8 * 60 * 60,
      user: {
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", authenticate, async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const user = await prisma.staffUser.findUnique({
      where: { id: req.user.userId },
      select: { id: true, email: true, role: true, organizationId: true }
    });
    if (!user || user.organizationId !== req.organization.id) {
      return res.status(401).json({ error: "La sesión no es válida o expiró." });
    }
    res.json({
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId
    });
  } catch (error) {
    next(error);
  }
});
