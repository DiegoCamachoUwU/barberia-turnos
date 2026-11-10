import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  createAdminSession,
  isAdminConfigured,
  verifyAdminCredentials
} from "../middleware/adminAuth.js";

export const adminRouter = Router();

const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Demasiados intentos. Espera 15 minutos e inténtalo otra vez." }
});

adminRouter.post("/login", loginRateLimit, (req, res) => {
  res.set("Cache-Control", "no-store");
  if (!isAdminConfigured()) {
    return res.status(503).json({ error: "El acceso administrativo no está configurado." });
  }

  const { username, password } = req.body ?? {};
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    username.length > 128 ||
    password.length > 1024 ||
    !verifyAdminCredentials(username, password)
  ) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }

  res.json(createAdminSession(process.env.ADMIN_USERNAME.trim()));
});
