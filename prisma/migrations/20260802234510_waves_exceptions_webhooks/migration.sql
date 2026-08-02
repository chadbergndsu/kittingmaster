-- CreateEnum
CREATE TYPE "WaveStatus" AS ENUM ('OPEN', 'RELEASED', 'IN_PROGRESS', 'COMPLETE', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DocumentType" ADD VALUE 'WAVE_LIST';

-- AlterTable
ALTER TABLE "Kit" ADD COLUMN     "exceptionAt" TIMESTAMP(3),
ADD COLUMN     "exceptionReason" TEXT;

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "webhookUrl" TEXT;

-- CreateTable
CREATE TABLE "Wave" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "status" "WaveStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Wave_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaveKit" (
    "id" TEXT NOT NULL,
    "waveId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WaveKit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Wave_organizationId_code_key" ON "Wave"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WaveKit_waveId_kitId_key" ON "WaveKit"("waveId", "kitId");

-- AddForeignKey
ALTER TABLE "Wave" ADD CONSTRAINT "Wave_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wave" ADD CONSTRAINT "Wave_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaveKit" ADD CONSTRAINT "WaveKit_waveId_fkey" FOREIGN KEY ("waveId") REFERENCES "Wave"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaveKit" ADD CONSTRAINT "WaveKit_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
