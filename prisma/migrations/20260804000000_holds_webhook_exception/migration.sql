-- AlterTable
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "webhookSecret" TEXT;

-- AlterTable
ALTER TABLE "Kit" ADD COLUMN IF NOT EXISTS "statusBeforeException" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "StockHold" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL DEFAULT '',
    "serialId" TEXT NOT NULL DEFAULT '',
    "kitId" TEXT NOT NULL,
    "kitLineId" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "qtyConsumed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockHold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockHold_kitId_kitLineId_idx" ON "StockHold"("kitId", "kitLineId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StockHold_organizationId_partId_locationId_idx" ON "StockHold"("organizationId", "partId", "locationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WaveKit_kitId_idx" ON "WaveKit"("kitId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StockHold" ADD CONSTRAINT "StockHold_kitLineId_fkey" FOREIGN KEY ("kitLineId") REFERENCES "KitLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
