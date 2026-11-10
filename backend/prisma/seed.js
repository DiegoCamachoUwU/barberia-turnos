import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.service.createMany({
    data: [
      { name: "Corte", description: "Corte clásico o moderno", durationMins: 30, priceCents: 15000 },
      { name: "Barba", description: "Perfilado y arreglo de barba", durationMins: 20, priceCents: 10000 },
      { name: "Corte y barba", description: "Servicio combinado", durationMins: 45, priceCents: 22000 }
    ],
    skipDuplicates: true
  });

  for (const name of ["Andrés", "Mateo"]) {
    await prisma.barber.upsert({
      where: { id: name === "Andrés" ? "barber-andres" : "barber-mateo" },
      update: {},
      create: { id: name === "Andrés" ? "barber-andres" : "barber-mateo", name }
    });
  }
}

main()
  .catch((error) => {
    console.error("No se pudieron cargar los datos iniciales:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
