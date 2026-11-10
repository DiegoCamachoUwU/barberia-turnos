import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    throw new Error("Configura ADMIN_EMAIL con un correo válido para crear el administrador.");
  }
  if (!adminPassword || adminPassword.length < 12) {
    throw new Error("ADMIN_PASSWORD debe tener al menos 12 caracteres.");
  }

  const organization = await prisma.organization.upsert({
    where: { slug: "barberia-principal" },
    update: {},
    create: {
      id: "default-barbershop",
      name: "Barbería principal",
      slug: "barberia-principal",
      timezone: "America/Bogota"
    }
  });

  const passwordHash = await bcrypt.hash(adminPassword, 12);
  await prisma.staffUser.upsert({
    where: {
      organizationId_email: {
        organizationId: organization.id,
        email: adminEmail
      }
    },
    update: { passwordHash, role: "ADMIN" },
    create: {
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
      organizationId: organization.id
    }
  });

  await prisma.service.createMany({
    data: [
      { name: "Corte", description: "Corte clásico o moderno", durationMins: 30, priceCents: 15000, organizationId: organization.id },
      { name: "Barba", description: "Perfilado y arreglo de barba", durationMins: 20, priceCents: 10000, organizationId: organization.id },
      { name: "Corte y barba", description: "Servicio combinado", durationMins: 45, priceCents: 22000, organizationId: organization.id }
    ],
    skipDuplicates: true
  });

  const barberIds = [];
  for (const name of ["Andrés", "Mateo"]) {
    const id = name === "Andrés" ? "barber-andres" : "barber-mateo";
    await prisma.barber.upsert({
      where: { id },
      update: {},
      create: { id, name, organizationId: organization.id }
    });
    barberIds.push(id);
  }

  await prisma.workingHours.createMany({
    data: barberIds.flatMap((barberId) =>
      Array.from({ length: 6 }, (_, index) => ({
        barberId,
        dayOfWeek: index + 1,
        startMinute: 540,
        endMinute: 1080
      }))
    ),
    skipDuplicates: true
  });
}

main()
  .catch((error) => {
    console.error("No se pudieron cargar los datos iniciales:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
