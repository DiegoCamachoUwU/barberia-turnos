-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'BARBER');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Bogota',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- Preserve the existing single-business data as the default organization.
INSERT INTO "Organization" ("id", "name", "slug", "timezone", "updatedAt")
VALUES ('default-barbershop', 'Barbería principal', 'barberia-principal', 'America/Bogota', CURRENT_TIMESTAMP);

-- CreateTable
CREATE TABLE "StaffUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "StaffRole" NOT NULL DEFAULT 'BARBER',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffUser_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Barber" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "endsAt" TIMESTAMP(3);

UPDATE "Service" SET "organizationId" = 'default-barbershop';
UPDATE "Barber" SET "organizationId" = 'default-barbershop';
UPDATE "Appointment"
SET
    "organizationId" = 'default-barbershop',
    "endsAt" = "Appointment"."startsAt" + ("Service"."durationMins" * INTERVAL '1 minute')
FROM "Service"
WHERE "Appointment"."serviceId" = "Service"."id";

ALTER TABLE "Service" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Barber" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Appointment" ALTER COLUMN "endsAt" SET NOT NULL;

-- Replace global service-name uniqueness with per-organization uniqueness.
DROP INDEX "Service_name_key";

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkingHours_dayOfWeek_check" CHECK ("dayOfWeek" BETWEEN 1 AND 7),
    CONSTRAINT "WorkingHours_interval_check" CHECK ("startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440)
);

-- Existing barbers keep their ability to accept bookings under the agreed schedule.
INSERT INTO "WorkingHours" ("id", "barberId", "dayOfWeek", "startMinute", "endMinute", "updatedAt")
SELECT
    'default-hours-' || "Barber"."id" || '-' || "days"."day",
    "Barber"."id",
    "days"."day",
    540,
    1080,
    CURRENT_TIMESTAMP
FROM "Barber"
CROSS JOIN generate_series(1, 6) AS "days"("day");

-- CreateTable
CREATE TABLE "ScheduleException" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "startMinute" INTEGER,
    "endMinute" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleException_interval_check" CHECK (
        ("isClosed" = true AND "startMinute" IS NULL AND "endMinute" IS NULL)
        OR
        ("isClosed" = false AND "startMinute" IS NOT NULL AND "endMinute" IS NOT NULL
            AND "startMinute" >= 0 AND "startMinute" < "endMinute" AND "endMinute" <= 1440)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");
CREATE UNIQUE INDEX "StaffUser_organizationId_email_key" ON "StaffUser"("organizationId", "email");
CREATE INDEX "StaffUser_organizationId_role_idx" ON "StaffUser"("organizationId", "role");
CREATE UNIQUE INDEX "Service_organizationId_name_key" ON "Service"("organizationId", "name");
CREATE UNIQUE INDEX "Service_id_organizationId_key" ON "Service"("id", "organizationId");
CREATE UNIQUE INDEX "Barber_id_organizationId_key" ON "Barber"("id", "organizationId");
CREATE INDEX "Barber_organizationId_active_idx" ON "Barber"("organizationId", "active");
CREATE UNIQUE INDEX "WorkingHours_barberId_dayOfWeek_startMinute_key" ON "WorkingHours"("barberId", "dayOfWeek", "startMinute");
CREATE INDEX "WorkingHours_barberId_dayOfWeek_idx" ON "WorkingHours"("barberId", "dayOfWeek");
CREATE UNIQUE INDEX "ScheduleException_barberId_date_key" ON "ScheduleException"("barberId", "date");
CREATE INDEX "ScheduleException_date_idx" ON "ScheduleException"("date");
CREATE INDEX "Appointment_barberId_endsAt_idx" ON "Appointment"("barberId", "endsAt");
CREATE INDEX "Appointment_organizationId_startsAt_idx" ON "Appointment"("organizationId", "startsAt");

-- Create check constraints
ALTER TABLE "Service" ADD CONSTRAINT "Service_durationMins_check" CHECK ("durationMins" > 0);
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_interval_check" CHECK ("endsAt" > "startsAt");

-- AddForeignKey
ALTER TABLE "StaffUser" ADD CONSTRAINT "StaffUser_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Barber" ADD CONSTRAINT "Barber_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_barberId_fkey";
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_serviceId_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_barberId_organizationId_fkey"
    FOREIGN KEY ("barberId", "organizationId") REFERENCES "Barber"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_organizationId_fkey"
    FOREIGN KEY ("serviceId", "organizationId") REFERENCES "Service"("id", "organizationId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_barberId_fkey"
    FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleException" ADD CONSTRAINT "ScheduleException_barberId_fkey"
    FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
