-- CreateEnum
CREATE TYPE "Department" AS ENUM ('HEADERS', 'SHEET_METAL');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('IN_TRANSIT', 'RECEIVED', 'PARTIAL', 'DISCREPANCY', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransferEventType" AS ENUM ('SENT', 'RECEIVED', 'DISCREPANCY_FLAGGED', 'CANCELLED');

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "transferNo" TEXT NOT NULL,
    "jobOrderNo" TEXT NOT NULL,
    "sfgCode" TEXT NOT NULL,
    "sfgDescription" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "qtySent" DOUBLE PRECISION NOT NULL,
    "uom" TEXT NOT NULL,
    "fromPlantId" TEXT NOT NULL,
    "toPlantId" TEXT NOT NULL,
    "sentBy" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TransferStatus" NOT NULL DEFAULT 'IN_TRANSIT',
    "qtyReceived" DOUBLE PRECISION,
    "receivedBy" TEXT,
    "receivedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_events" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "eventType" "TransferEventType" NOT NULL,
    "actor" TEXT NOT NULL,
    "plantId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_counters" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "daily_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plants_code_key" ON "plants"("code");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_transferNo_key" ON "transfers"("transferNo");

-- CreateIndex
CREATE INDEX "transfers_status_idx" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "transfers_fromPlantId_idx" ON "transfers"("fromPlantId");

-- CreateIndex
CREATE INDEX "transfers_toPlantId_idx" ON "transfers"("toPlantId");

-- CreateIndex
CREATE INDEX "transfers_jobOrderNo_idx" ON "transfers"("jobOrderNo");

-- CreateIndex
CREATE INDEX "transfer_events_transferId_idx" ON "transfer_events"("transferId");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE UNIQUE INDEX "daily_counters_date_key" ON "daily_counters"("date");

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fromPlantId_fkey" FOREIGN KEY ("fromPlantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_toPlantId_fkey" FOREIGN KEY ("toPlantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_events" ADD CONSTRAINT "transfer_events_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_events" ADD CONSTRAINT "transfer_events_plantId_fkey" FOREIGN KEY ("plantId") REFERENCES "plants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom SQL: PostgreSQL trigger enforcing APPEND-ONLY behavior on transfer_events
CREATE OR REPLACE FUNCTION prevent_transfer_event_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'TransferEvent table is append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_transfer_event_update ON "transfer_events";
CREATE TRIGGER trg_prevent_transfer_event_update
BEFORE UPDATE OR DELETE ON "transfer_events"
FOR EACH ROW
EXECUTE FUNCTION prevent_transfer_event_modification();
