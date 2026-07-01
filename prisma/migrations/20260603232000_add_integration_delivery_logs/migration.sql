-- CreateTable
CREATE TABLE "IntegrationDeliveryLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipient" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "providerStatus" INTEGER,
    "providerMessageId" TEXT,
    "error" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationDeliveryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrationDeliveryLog_provider_eventType_status_createdAt_idx" ON "IntegrationDeliveryLog"("provider", "eventType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationDeliveryLog_targetType_targetId_idx" ON "IntegrationDeliveryLog"("targetType", "targetId");
