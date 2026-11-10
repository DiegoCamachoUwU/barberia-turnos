import { Router } from "express";
import { AppointmentStatus, Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { authenticate, requireOrganizationMatch, requireRoles } from "../middleware/auth.js";
import {
  addLocalDays,
  generateAvailableSlots,
  getLocalDate,
  getLocalDayOfWeek,
  isValidDateString,
  isWithinWorkingHours,
  zonedDateTimeToDate
} from "../services/schedule.js";
import {
  sendAppointmentConfirmation,
  sendBarberNotification,
  buildCalendarEvent,
  notificationSelection
} from "../services/notifications.js";

export const appointmentsRouter = Router();
const requireAdmin = [authenticate, requireRoles("ADMIN"), requireOrganizationMatch];

const appointmentSelection = {
  id: true,
  clientName: true,
  clientPhone: true,
  clientEmail: true,
  startsAt: true,
  endsAt: true,
  status: true,
  barberId: true,
  serviceId: true,
  createdAt: true,
  updatedAt: true,
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

appointmentsRouter.get("/disponibles", async (req, res, next) => {
  const { barberId, serviceId, date } = req.query;
  if (
    typeof barberId !== "string" ||
    typeof serviceId !== "string" ||
    typeof date !== "string" ||
    !isValidDateString(date)
  ) {
    return res.status(400).json({
      error: "Indica barberId, serviceId y una fecha válida con formato YYYY-MM-DD."
    });
  }

  try {
    const organization = req.organization;
    const [barber, service] = await Promise.all([
      prisma.barber.findFirst({
        where: { id: barberId, organizationId: organization.id, active: true },
        select: { id: true }
      }),
      prisma.service.findFirst({
        where: { id: serviceId, organizationId: organization.id, active: true },
        select: { id: true, durationMins: true }
      })
    ]);
    if (!barber || !service) {
      return res.status(404).json({ error: "El barbero o el servicio no está disponible." });
    }

    const localDate = new Date(`${date}T00:00:00.000Z`);
    const [exception, weeklyHours] = await Promise.all([
      prisma.scheduleException.findUnique({
        where: { barberId_date: { barberId, date: localDate } },
        select: { isClosed: true, startMinute: true, endMinute: true }
      }),
      prisma.workingHours.findMany({
        where: { barberId, dayOfWeek: getLocalDayOfWeek(
          zonedDateTimeToDate(date, 0, organization.timezone),
          organization.timezone
        ) },
        select: { startMinute: true, endMinute: true },
        orderBy: { startMinute: "asc" }
      })
    ]);

    const intervals = exception
      ? exception.isClosed
        ? []
        : [{ startMinute: exception.startMinute, endMinute: exception.endMinute }]
      : weeklyHours;
    if (intervals.length === 0) {
      res.set("Cache-Control", "no-store");
      return res.json({ date, timezone: organization.timezone, slots: [] });
    }

    const dayStartsAt = zonedDateTimeToDate(date, 0, organization.timezone);
    const dayEndsAt = zonedDateTimeToDate(addLocalDays(date, 1), 0, organization.timezone);
    const [appointments, timeOffs] = await Promise.all([
      prisma.appointment.findMany({
        where: {
          organizationId: organization.id,
          barberId,
          startsAt: { lt: dayEndsAt },
          endsAt: { gt: dayStartsAt },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
        },
        select: { startsAt: true, endsAt: true }
      }),
      prisma.timeOff.findMany({
        where: {
          barberId,
          startsAt: { lt: dayEndsAt },
          endsAt: { gt: dayStartsAt }
        },
        select: { startsAt: true, endsAt: true }
      })
    ]);
    const slots = generateAvailableSlots({
      date,
      timezone: organization.timezone,
      intervals,
      durationMins: service.durationMins,
      appointments,
      timeOffs
    });

    res.set("Cache-Control", "no-store");
    res.json({
      date,
      timezone: organization.timezone,
      slots: slots.map(({ startsAt, endsAt }) => ({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString()
      }))
    });
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.get("/admin", ...requireAdmin, async (req, res, next) => {
  const dateFilter = getDateFilter(req, res);
  if (!dateFilter) return;

  try {
    const appointments = await prisma.appointment.findMany({
      where: {
        organizationId: req.organization.id,
        ...dateFilter,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
      },
      select: {
        id: true,
        clientName: true,
        clientPhone: true,
        startsAt: true,
        endsAt: true,
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
        organizationId: req.organization.id,
        ...dateFilter,
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
      },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
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
  const { clientName, clientPhone, clientEmail, barberId, serviceId, startsAt: startsAtInput } = req.body;
  const startsAt = new Date(startsAtInput);
  if (
    typeof clientName !== "string" || !clientName.trim() ||
    typeof clientPhone !== "string" || !clientPhone.trim() ||
    typeof clientEmail !== "undefined" && clientEmail !== null && clientEmail !== "" &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(clientEmail)) ||
    typeof barberId !== "string" || typeof serviceId !== "string" ||
    !startsAtInput || Number.isNaN(startsAt.getTime()) || startsAt <= new Date()
  ) {
    return res.status(400).json({ error: "Completa los datos y selecciona una fecha futura válida." });
  }

  try {
    const { appointment, barber } = await prisma.$transaction(async (transaction) => {
      const organization = req.organization;
      const [barber, service] = await Promise.all([
        transaction.barber.findFirst({
          where: { id: barberId, organizationId: organization.id, active: true }
        }),
        transaction.service.findFirst({
          where: { id: serviceId, organizationId: organization.id, active: true }
        })
      ]);
      if (!barber || !service) {
        const error = new Error("El barbero o el servicio seleccionado no está disponible.");
        error.status = 400;
        throw error;
      }

      const endsAt = new Date(startsAt.getTime() + service.durationMins * 60_000);
      const localDate = getLocalDate(startsAt, organization.timezone);
      const exception = await transaction.scheduleException.findUnique({
        where: {
          barberId_date: {
            barberId,
            date: new Date(`${localDate}T00:00:00.000Z`)
          }
        }
      });
      if (exception?.isClosed) {
        const error = new Error("El barbero no atiende en la fecha seleccionada.");
        error.status = 400;
        throw error;
      }

      const intervals = exception
        ? [{ startMinute: exception.startMinute, endMinute: exception.endMinute }]
        : await transaction.workingHours.findMany({
          where: {
            barberId,
            dayOfWeek: getLocalDayOfWeek(startsAt, organization.timezone)
          },
          select: { startMinute: true, endMinute: true }
        });
      if (!isWithinWorkingHours({ startsAt, endsAt, timezone: organization.timezone, intervals })) {
        const error = new Error("El turno debe estar dentro del horario de atención del barbero.");
        error.status = 400;
        throw error;
      }

      const candidates = await transaction.appointment.findMany({
        where: {
          organizationId: organization.id,
          barberId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] }
        }
      });
      if (candidates.length > 0) {
        const error = new Error("Ese horario ya está ocupado para el barbero seleccionado.");
        error.status = 409;
        throw error;
      }

      const createdAppointment = await transaction.appointment.create({
        data: {
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          clientEmail: clientEmail?.trim() || null,
          organizationId: organization.id,
          barberId,
          serviceId,
          startsAt,
          endsAt
        },
        select: appointmentSelection
      });
      return { appointment: createdAppointment, barber };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const notification = await sendAppointmentConfirmation({
      appointment,
      organization: req.organization,
      barber: appointment.barber,
      service: appointment.service
    });
    const barberNotification = await sendBarberNotification({
      appointment,
      organization: req.organization,
      barber,
      service: appointment.service
    });

    res.status(201).json({
      ...appointment,
      calendar: notification.calendar,
      notification: {
        channel: notification.channel,
        sent: notification.sent,
        provider: notification.provider,
        error: notification.error,
        barber: { sent: barberNotification?.sent ?? false }
      }
    });
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.get("/:id/calendar.ics", async (req, res, next) => {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      select: {
        ...notificationSelection,
        barber: { select: { id: true, name: true } },
        service: { select: { id: true, name: true, durationMins: true } },
        organization: { select: { id: true, name: true, slug: true, timezone: true } }
      }
    });
    if (!appointment || !appointment.organization) {
      return res.status(404).json({ error: "Turno no encontrado." });
    }
    if (appointment.organizationId !== req.organization?.id) {
      return res.status(403).json({ error: "No tienes permisos para acceder a este turno." });
    }
    const ics = buildCalendarEvent({
      appointment,
      organization: appointment.organization,
      barber: appointment.barber,
      service: appointment.service
    });
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="cita-${appointment.id}.ics"`);
    res.send(ics);
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.patch("/:id/estado", ...requireAdmin, async (req, res, next) => {
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
      where: {
        id: req.params.id,
        organizationId: req.organization.id,
        status: { in: previousStatuses }
      },
      data: { status }
    });
    if (result.count === 0) {
      const exists = await prisma.appointment.findFirst({
        where: { id: req.params.id, organizationId: req.organization.id },
        select: { id: true }
      });
      return res.status(exists ? 409 : 404).json({
        error: exists ? "No se permite esa transición de estado." : "Turno no encontrado."
      });
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      select: appointmentSelection
    });
    res.json(appointment);
  } catch (error) {
    next(error);
  }
});
