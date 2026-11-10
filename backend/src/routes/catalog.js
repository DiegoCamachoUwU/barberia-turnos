import { Router } from "express";
import { prisma } from "../config/database.js";

export const catalogRouter = Router();

catalogRouter.get("/servicios", async (_req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    });
    res.json(services);
  } catch (error) {
    next(error);
  }
});

catalogRouter.get("/barberos", async (_req, res, next) => {
  try {
    const barbers = await prisma.barber.findMany({
      where: { active: true },
      orderBy: { name: "asc" }
    });
    res.json(barbers);
  } catch (error) {
    next(error);
  }
});
