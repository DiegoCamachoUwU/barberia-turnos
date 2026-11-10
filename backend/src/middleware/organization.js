import { prisma } from "../config/database.js";

const reservedSlugs = new Set(["auth", "barberos", "health", "servicios", "turnos"]);

export function createOrganizationMiddleware(client = prisma, defaultSlug) {
  return async (req, res, next) => {
    const slug = defaultSlug ?? req.params.slug;
    if (
      typeof slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      (!defaultSlug && reservedSlugs.has(slug))
    ) {
      return res.status(404).json({ error: "La barbería no existe o no está disponible." });
    }

    try {
      const organization = await client.organization.findUnique({
        where: { slug },
        select: { id: true, name: true, slug: true, timezone: true, active: true }
      });
      if (!organization?.active) {
        return res.status(404).json({ error: "La barbería no existe o no está disponible." });
      }

      req.organization = organization;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const organizationMiddleware = createOrganizationMiddleware();
export const defaultOrganizationMiddleware = createOrganizationMiddleware(
  prisma,
  process.env.DEFAULT_ORGANIZATION_SLUG || "barberia-principal"
);
