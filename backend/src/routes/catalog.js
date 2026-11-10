import { Router } from "express";
import { prisma } from "../config/database.js";

export const catalogRouter = Router();

catalogRouter.get("/", (req, res) => {
  res.json({
    name: req.organization.name,
    slug: req.organization.slug,
    timezone: req.organization.timezone
  });
});

catalogRouter.get("/servicios", async (_req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { organizationId: req.organization.id, active: true },
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

catalogRouter.get("/barberos", async (req, res, next) => {
  try {
    const barbers = await prisma.barber.findMany({
      where: { organizationId: req.organization.id, active: true },
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
