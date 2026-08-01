-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'VIEWER',
    CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Site" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Chicago',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Site_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    CONSTRAINT "Zone_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "zoneId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "aisle" TEXT,
    "bay" TEXT,
    "level" TEXT,
    CONSTRAINT "Location_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "uom" TEXT NOT NULL DEFAULT 'EA',
    "tracking" TEXT NOT NULL DEFAULT 'NONE',
    "barcode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Part_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KitDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "revision" TEXT NOT NULL DEFAULT 'A',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KitDefinition_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KitDefinitionLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kitDefinitionId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "KitDefinitionLine_kitDefinitionId_fkey" FOREIGN KEY ("kitDefinitionId") REFERENCES "KitDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KitDefinitionLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Demand" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "externalRef" TEXT NOT NULL,
    "dueAt" DATETIME,
    "priority" INTEGER NOT NULL DEFAULT 50,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Demand_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Demand_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MethodDna" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MethodDna_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MethodDnaVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "methodDnaId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "publishedAt" DATETIME,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL,
    "strategiesJson" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MethodDnaVersion_methodDnaId_fkey" FOREIGN KEY ("methodDnaId") REFERENCES "MethodDna" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Kit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "kitDefinitionId" TEXT NOT NULL,
    "demandId" TEXT,
    "dnaVersionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "stagingLocationId" TEXT,
    "kitInstanceCode" TEXT NOT NULL,
    "sealFingerprint" TEXT,
    "sealedAt" DATETIME,
    "sealedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Kit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Kit_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Kit_kitDefinitionId_fkey" FOREIGN KEY ("kitDefinitionId") REFERENCES "KitDefinition" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Kit_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "Demand" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Kit_dnaVersionId_fkey" FOREIGN KEY ("dnaVersionId") REFERENCES "MethodDnaVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Kit_stagingLocationId_fkey" FOREIGN KEY ("stagingLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Kit_sealedById_fkey" FOREIGN KEY ("sealedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KitLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kitId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "requiredQty" REAL NOT NULL,
    "stagedQty" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    CONSTRAINT "KitLine_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KitLine_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Lot_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Serial" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "lotId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "kitLineId" TEXT,
    CONSTRAINT "Serial_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Serial_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Serial_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Serial_kitLineId_fkey" FOREIGN KEY ("kitLineId") REFERENCES "KitLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL DEFAULT '',
    "serialId" TEXT NOT NULL DEFAULT '',
    "onHand" REAL NOT NULL DEFAULT 0,
    "reserved" REAL NOT NULL DEFAULT 0,
    "staged" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "InventoryBalance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryBalance_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "qty" REAL NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "lotId" TEXT,
    "serialId" TEXT,
    "kitId" TEXT,
    "kitLineId" TEXT,
    "actorId" TEXT,
    "metaJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "Serial" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryTransaction_kitLineId_fkey" FOREIGN KEY ("kitLineId") REFERENCES "KitLine" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScanSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kitId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'EXPECT_LOCATION',
    "pendingPartId" TEXT,
    "pendingLotId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScanSession_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScanSession_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Kit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "organizationId" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "responseJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_organizationId_key" ON "Membership"("userId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Site_organizationId_code_key" ON "Site"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_siteId_code_key" ON "Zone"("siteId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Location_barcode_key" ON "Location"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "Location_zoneId_code_key" ON "Location"("zoneId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Part_organizationId_sku_key" ON "Part"("organizationId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "KitDefinition_organizationId_code_revision_key" ON "KitDefinition"("organizationId", "code", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "KitDefinitionLine_kitDefinitionId_partId_key" ON "KitDefinitionLine"("kitDefinitionId", "partId");

-- CreateIndex
CREATE UNIQUE INDEX "MethodDnaVersion_methodDnaId_version_key" ON "MethodDnaVersion"("methodDnaId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Kit_organizationId_kitInstanceCode_key" ON "Kit"("organizationId", "kitInstanceCode");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_organizationId_partId_lotNumber_key" ON "Lot"("organizationId", "partId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Serial_organizationId_partId_serialNumber_key" ON "Serial"("organizationId", "partId", "serialNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryBalance_locationId_partId_lotId_serialId_key" ON "InventoryBalance"("locationId", "partId", "lotId", "serialId");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_organizationId_clientEventId_key" ON "IdempotencyKey"("organizationId", "clientEventId");
