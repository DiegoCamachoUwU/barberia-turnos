import { Router } from "express";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { createAdminAuth } from "../middleware/adminAuth.js";

export const appointmentsRouter = Router();
const requireAdmin = createAdminAuth();

const appointmentInclude = {
  barber: { select: { id: true, name: true } },
  service: { select: { id: true, name: true, durationMins: true, priceCents: true } }
};

function getDateFilter(req, res) {
  if (!req.query.date) return {};

  const dateString = String(req.query.date);
  const timezoneOffset = Number(req.query.timezoneOffset ?? 0);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateString) ||
    !Number.isInteger(timezoneOffset) ||
    Math.abs(timezoneOffset) > 840
  ) {
    res.status(400).json({ error: "La fecha debe tener el formato YYYY-MM-DD." });
    return null;
  }

  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateString) {
    res.status(400).json({ error: "La fecha debe tener el formato YYYY-MM-DD." });
    return null;
  }
  date.setUTCMinutes(date.getUTCMinutes() + timezoneOffset);
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return { startsAt: { gte: date, lt: nextDay } };
}

appointmentsRouter.get("/admin", requireAdmin, async (req, res, next) => {
  const dateFilter = getDateFilter(req, res);
  if (!dateFilter) return;

  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        ...dateFilter,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
      },
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        startsAt: true,
        status: true,
        barber: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, durationMins: true, priceCents: true } }
      },
      orderBy: { startsAt: "asc" }
    });
    res.set("Cache-Control", "no-store");
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.get("/", async (req, res, next) => {
  const dateFilter = getDateFilter(req, res);
  if (!dateFilter) return;

  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        ...dateFilter,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
      },
      select: {
        id: true,
        startsAt: true,
        status: true,
        barber: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, durationMins: true, priceCents: true } }
      },
      orderBy: { startsAt: "asc" }
    });
    res.json(appointments);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.post("/", async (req, res, next) => {
  const { clientName, clientPhone, barberId, serviceId, startsAt: startsAtInput } = req.body;
  const startsAt = new Date(startsAtInput);
  if (
    typeof clientName !== "string" || !clientName.trim() ||
    typeof clientPhone !== "string" || !clientPhone.trim() ||
    typeof barberId !== "string" || typeof serviceId !== "string" ||
    !startsAtInput || Number.isNaN(startsAt.getTime()) || startsAt <= new Date()
  ) {
    return res.status(400).json({ error: "Completa los datos y selecciona una fecha futura válida." });
  }

  try {
    const appointment = await prisma.$transaction(async (transaction) => {
      const [barber, service] = await Promise.all([
        transaction.barber.findFirst({ where: { id: barberId, active: true } }),
        transaction.service.findFirst({ where: { id: serviceId, active: true } })
      ]);
      if (!barber || !service) {
        const error = new Error("El barbero o el servicio seleccionado no está disponible.");
        error.status = 400;
        throw error;
      }

      const endsAt = new Date(startsAt.getTime() + service.durationMins * 60_000);
      const candidates = await transaction.appointment.findMany({
        where: {
          barberId,
          startsAt: { lt: endsAt },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
        },
        include: { service: { select: { durationMins: true } } }
      });
      const hasConflict = candidates.some((existing) => {
        const existingEndsAt = new Date(
          existing.startsAt.getTime() + existing.service.durationMins * 60_000
        );
        return existing.startsAt < endsAt && existingEndsAt > startsAt;
      });
      if (hasConflict) {
        const error = new Error("Ese horario ya está ocupado para el barbero seleccionado.");
        error.status = 409;
        throw error;
      }

      return transaction.appointment.create({
        data: {
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          barberId,
          serviceId,
          startsAt
        },
        include: appointmentInclude
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.status(201).json(appointment);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.patch("/:id/estado", requireAdmin, async (req, res, next) => {
  const { status } = req.body;
  if (!Object.values(AppointmentStatus).includes(status)) {
    return res.status(400).json({ error: "Estado inválido." });
  }

  try {
    const previousStatuses = {
      [AppointmentStatus.PENDING]: [],
      [AppointmentStatus.CONFIRMED]: [AppointmentStatus.PENDING],
      [AppointmentStatus.COMPLETED]: [AppointmentStatus.CONFIRMED],
      [AppointmentStatus.CANCELLED]: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED]
    }[status];
    if (previousStatuses.length === 0) {
      return res.status(409).json({ error: "No se permite esa transición de estado." });
    }

    const result = await prisma.appointment.updateMany({
      where: { id: req.params.id, status: { in: previousStatuses } },
      data: { status }
    });
    if (result.count === 0) {
      const exists = await prisma.appointment.findUnique({ where: { id: req.params.id }, select: { id: true } });
      return res.status(exists ? 409 : 404).json({
        error: exists ? "No se permite esa transición de estado." : "Turno no encontrado."
      });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: appointmentInclude
    });
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});
