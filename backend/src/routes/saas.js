import { Router } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../config/database.js";
import { isJwtConfigured, signAuthToken, verifyAuthToken } from "../middleware/auth.js";

export const saasRouter = Router();

const reservedSlugs = new Set([
  "auth",
  "barberos",
  "health",
  "servicios",
  "turnos",
  "saas",
  "onboarding",
  "organizations"
]);

function isSlugAvailable(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && !reservedSlugs.has(slug);
}

function defaultWorkingHours(barberId) {
  return Array.from({ length: 6 }, (_, index) => ({
    barberId,
    dayOfWeek: index + 1,
    startMinute: 540,
    endMinute: 1080
  }));
}

function defaultServices(organizationId) {
  return [
    { name: "Corte", description: "Corte clásico o moderno", durationMins: 30, priceCents: 15000, organizationId },
    { name: "Barba", description: "Perfilado y arreglo de barba", durationMins: 20, priceCents: 10000, organizationId }
  ];
}

saasRouter.post("/onboarding", async (req, res, next) => {
  const {
    name,
    slug,
    phone,
    address,
    timezone = "America/Bogota",
    adminEmail,
    adminPassword,
    adminPhone
  } = req.body ?? {};

  if (
    typeof name !== "string" || !name.trim() ||
    typeof slug !== "string" || !isSlugAvailable(slug.trim()) ||
    typeof adminEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) ||
    typeof adminPassword !== "string" || adminPassword.length < 12
  ) {
    return res.status(400).json({ error: "Datos de onboarding incompletos o inválidos." });
  }

  const cleanSlug = slug.trim().toLowerCase();
  const cleanEmail = adminEmail.trim().toLowerCase();

  try {
    const existing = await prisma.organization.findUnique({ where: { slug: cleanSlug } });
    if (existing) {
      return res.status(409).json({ error: "El slug ya está en uso. Elige otro nombre para tu barbería." });
    }

    const existingEmail = await prisma.staffUser.findFirst({
      where: { email: cleanEmail }
    });
    if (existingEmail) {
      return res.status(409).json({ error: "El correo del administrador ya está registrado." });
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: name.trim(),
          slug: cleanSlug,
          phone: phone && phone.trim() ? phone.trim() : null,
          address: address && address.trim() ? address.trim() : null,
          timezone: timezone && /^[A-Za-z_]+\/[A-Za-z_]+$/.test(timezone) ? timezone : "America/Bogota"
        }
      });

      const adminUser = await tx.staffUser.create({
        data: {
          email: cleanEmail,
          passwordHash,
          role: "ADMIN",
          organizationId: organization.id
        }
      });

      const defaultBarber = await tx.barber.create({
        data: {
          name: "Barbero principal",
          organizationId: organization.id
        }
      });

      await tx.workingHours.createMany({
        data: defaultWorkingHours(defaultBarber.id)
      });

      await tx.service.createMany({
        data: defaultServices(organization.id)
      });

      return { organization, adminUser, defaultBarber };
    });

    res.status(201).json({
      message: "Barbería registrada exitosamente.",
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        phone: result.organization.phone,
        address: result.organization.address,
        timezone: result.organization.timezone
      },
      adminUser: {
        id: result.adminUser.id,
        email: result.adminUser.email,
        role: result.adminUser.role,
        organizationId: result.adminUser.organizationId
      },
      defaultBarber: {
        id: result.defaultBarber.id,
        name: result.defaultBarber.name
      }
    });
  } catch (error) {
    next(error);
  }
});

saasRouter.get("/organizations", async (req, res, next) => {
  const token = req.get("authorization")?.match(/^Bearer\s+([^\s]+)$/i)?.[1];
  if (!token) {
    return res.status(401).json({ error: "Se requiere una sesión válida." });
  }

  let claims;
  try {
    claims = verifyAuthToken(token);
  } catch (error) {
    return res.status(401).json({ error: "La sesión no es válida o expiró." });
  }

  if (claims.role !== "SUPERADMIN") {
    return res.status(403).json({ error: "Solo el superadministrador puede listar organizaciones." });
  }

  try {
    const organizations = await prisma.organization.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        address: true,
        timezone: true,
        active: true,
        createdAt: true,
        _count: { select: { staffUsers: true, appointments: true } }
      },
      orderBy: { createdAt: "desc" }
    });
    res.json(organizations);
  } catch (error) {
    next(error);
  }
});
