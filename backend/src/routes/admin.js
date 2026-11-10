import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { authenticate, requireRoles, requireOrganizationMatch } from "../middleware/auth.js";

export const adminRouter = Router();

const requireAdminSelfService = [authenticate, requireRoles("ADMIN"), requireOrganizationMatch];

// ---------- OrganizaciÃ³n (datos del negocio) ----------

adminRouter.patch("/organization", ...requireAdminSelfService, async (req, res, next) => {
  const { name, phone, address, timezone } = req.body ?? {};

  try {
    const organization = await prisma.organization.update({
      where: { id: req.organization.id },
      data: {
        name: name && name.trim() ? name.trim() : undefined,
        phone: phone !== undefined ? (phone.trim() ? phone.trim() : null) : undefined,
        address: address !== undefined ? (address.trim() ? address.trim() : null) : undefined,
        timezone: timezone && /^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone) ? timezone : undefined
      },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        address: true,
        timezone: true,
        active: true,
        updatedAt: true
      }
    });
    res.json(organization);
  } catch (error) {
    next(error);
  }
});

// ---------- Servicios (catÃ¡logo) ----------

adminRouter.get("/servicios", ...requireAdminSelfService, async (_req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { organizationId: req.organization.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        durationMins: true,
        priceCents: true,
        active: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json(services);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/servicios", ...requireAdminSelfService, async (req, res, next) => {
  const { name, description, durationMins, priceCents } = req.body ?? {};

  if (
    typeof name !== "string" || !name.trim() ||
    typeof durationMins !== "number" || durationMins <= 0 ||
    typeof priceCents !== "number" || priceCents < 0
  ) {
    return res.status(400).json({ error: "Datos de servicio invÃ¡lidos." });
  }

  try {
    const service = await prisma.service.create({
      data: {
        name: name.trim(),
        description: description && description.trim() ? description.trim() : null,
        durationMins,
        priceCents,
        organizationId: req.organization.id
      }
    });
    res.status(201).json(service);
  } catch (error) {
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un servicio con ese nombre en esta barberÃ­a." });
    }
    next(error);
  }
});adminRouter.patch("/servicios/:id", ...requireAdminSelfService, async (req, res, next) => {
  const { name, description, durationMins, priceCents, active } = req.body ?? {};
  const data = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "El nombre del servicio es obligatorio." });
    }
    data.name = name.trim();
  }
  if (description !== undefined) data.description = description.trim() ? description.trim() : null;
  if (durationMins !== undefined) {
    if (typeof durationMins !== "number" || durationMins <= 0) {
      return res.status(400).json({ error: "La duración debe ser mayor a cero." });
    }
    data.durationMins = durationMins;
  }
  if (priceCents !== undefined) {
    if (typeof priceCents !== "number" || priceCents < 0) {
      return res.status(400).json({ error: "El precio no puede ser negativo." });
    }
    data.priceCents = priceCents;
  }
  if (active !== undefined) data.active = Boolean(active);

  try {
    const service = await prisma.service.update({
      where: { id: req.params.id, organizationId: req.organization.id },
      data,
      select: {
        id: true,
        name: true,
        description: true,
        durationMins: true,
        priceCents: true,
        active: true,
        updatedAt: true
      }
    });
    res.json(service);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Servicio no encontrado." });
    }
    if (error.code === "P2002") {
      return res.status(409).json({ error: "Ya existe un servicio con ese nombre en esta barbería." });
    }
    next(error);
  }
});

adminRouter.delete("/servicios/:id", ...requireAdminSelfService, async (req, res, next) => {
  try {
    await prisma.service.update({
      where: { id: req.params.id, organizationId: req.organization.id },
      data: { active: false }
    });
    res.json({ message: "Servicio desactivado." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Servicio no encontrado." });
    }
    next(error);
  }
});
// ---------- Barberos (equipo) ----------

adminRouter.get("/barberos", ...requireAdminSelfService, async (_req, res, next) => {
  try {
    const barbers = await prisma.barber.findMany({
      where: { organizationId: req.organization.id },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        active: true,
        createdAt: true,
        updatedAt: true
      }
    });
    res.json(barbers);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/barberos", ...requireAdminSelfService, async (req, res, next) => {
  const { name } = req.body ?? {};

  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "El nombre del barbero es obligatorio." });
  }

  try {
    const barber = await prisma.barber.create({
      data: {
        name: name.trim(),
        organizationId: req.organization.id
      }
    });

    await prisma.workingHours.createMany({
      data: defaultWorkingHours(barber.id)
    });

    res.status(201).json(barber);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/barberos/:id", ...requireAdminSelfService, async (req, res, next) => {
  const { name, active } = req.body ?? {};
  const data = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "El nombre del barbero es obligatorio." });
    }
    data.name = name.trim();
  }
  if (active !== undefined) data.active = Boolean(active);

  try {
    const barber = await prisma.barber.update({
      where: { id: req.params.id, organizationId: req.organization.id },
      data,
      select: { id: true, name: true, active: true, updatedAt: true }
    });
    res.json(barber);
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Barbero no encontrado." });
    }
    next(error);
  }
});

adminRouter.delete("/barberos/:id", ...requireAdminSelfService, async (req, res, next) => {
  try {
    await prisma.barber.update({
      where: { id: req.params.id, organizationId: req.organization.id },
      data: { active: false }
    });
    res.json({ message: "Barbero desactivado." });
  } catch (error) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Barbero no encontrado." });
    }
    next(error);
  }
});
// ---------- TimeOff (bloqueos y pausas) ----------

adminRouter.get("/timeoff", ...requireAdminSelfService, async (req, res, next) => {
  try {
    const barbers = await prisma.barber.findMany({
      where: { organizationId: req.organization.id },
      select: { id: true, name: true }
    });
    const barberIds = barbers.map((b) => b.id);
    const timeOffs = await prisma.timeOff.findMany({
      where: { barberId: { in: barberIds } },
      include: { barber: { select: { id: true, name: true } } },
      orderBy: { startsAt: "asc" }
    });
    res.json(timeOffs);
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/timeoff", ...requireAdminSelfService, async (req, res, next) => {
  const { barberId, startsAt, endsAt, reason } = req.body ?? {};

  if (
    typeof barberId !== "string" ||
    typeof startsAt !== "string" ||
    typeof endsAt !== "string" ||
    Number.isNaN(new Date(startsAt).getTime()) ||
    Number.isNaN(new Date(endsAt).getTime()) ||
    new Date(endsAt) <= new Date(startsAt)
  ) {
    return res.status(400).json({ error: "Datos de bloqueo inválidos." });
  }

  try {
    const barber = await prisma.barber.findFirst({
      where: { id: barberId, organizationId: req.organization.id }
    });
    if (!barber) {
      return res.status(404).json({ error: "Barbero no encontrado." });
    }

    const timeOff = await prisma.timeOff.create({
      data: {
        barberId,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        reason: reason && reason.trim() ? reason.trim() : null
      },
      include: { barber: { select: { id: true, name: true } } }
    });
    res.status(201).json(timeOff);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/timeoff/:id", ...requireAdminSelfService, async (req, res, next) => {
  try {
    const timeOff = await prisma.timeOff.findFirst({
      where: { id: req.params.id },
      select: { id: true, barberId: true }
    });
    if (!timeOff) {
      return res.status(404).json({ error: "Bloqueo no encontrado." });
    }

    const barber = await prisma.barber.findUnique({
      where: { id: timeOff.barberId },
      select: { organizationId: true }
    });
    if (!barber || barber.organizationId !== req.organization.id) {
      return res.status(403).json({ error: "No tienes permisos para eliminar este bloqueo." });
    }

    await prisma.timeOff.delete({ where: { id: req.params.id } });
    res.json({ message: "Bloqueo eliminado." });
  } catch (error) {
    next(error);
  }
});

// ---------- Helpers ----------

function defaultWorkingHours(barberId) {
  return Array.from({ length: 6 }, (_, index) => ({
    barberId,
    dayOfWeek: index + 1,
    startMinute: 540,
    endMinute: 1080
  }));
}
