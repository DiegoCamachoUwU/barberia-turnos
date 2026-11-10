-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "barberId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "TimeOff_interval_check" CHECK ("endsAt" > "startsAt")
);

-- CreateIndex
CREATE INDEX "TimeOff_barberId_startsAt_endsAt_idx" ON "TimeOff"("barberId", "startsAt", "endsAt");

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_barberId_fkey"
    FOREIGN KEY ("barberId") REFERENCES "Barber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
