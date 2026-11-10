import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./config/database.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { catalogRouter } from "./routes/catalog.js";
import { authRouter } from "./routes/auth.js";
import { saasRouter } from "./routes/saas.js";
import { adminRouter } from "./routes/admin.js";
import {
  defaultOrganizationMiddleware,
  organizationMiddleware
} from "./middleware/organization.js";

const app = express();
const port = Number(process.env.PORT) || 3000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.set("trust proxy", 1);
app.use(express.json());

app.get("/api/v1/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/v1/saas", saasRouter);

const legacyRouter = express.Router();
legacyRouter.use(catalogRouter);
legacyRouter.use("/turnos", appointmentsRouter);
legacyRouter.use("/auth", authRouter);
app.use("/api/v1", (req, res, next) => {
  if (!/^\/(?:auth|barberos|servicios|turnos)(?:\/|$)/.test(req.path)) {
    return next();
  }
  return defaultOrganizationMiddleware(req, res, next);
}, legacyRouter);

const tenantRouter = express.Router();
tenantRouter.use(catalogRouter);
tenantRouter.use("/admin", adminRouter);
tenantRouter.use("/turnos", appointmentsRouter);
tenantRouter.use("/auth", authRouter);
app.use("/api/v1/:slug", organizationMiddleware, tenantRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  const status = error.status || (error.code === "P2025" ? 404 : error.code === "P2034" ? 409 : 500);
  res.status(status).json({
    error: status === 500
      ? "Error interno del servidor."
      : error.code === "P2034"
        ? "El horario acaba de ser reservado. Selecciona otro."
        : error.message
  });
});

const server = app.listen(port, () => {
  console.log(`API disponible en http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
