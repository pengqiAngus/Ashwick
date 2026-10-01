-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('sms', 'email');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('pending', 'sending', 'sent', 'failed');

-- CreateTable
CREATE TABLE "FavoriteAlertState" (
    "id" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "inRange" BOOLEAN NOT NULL DEFAULT false,
    "lastPrice" DECIMAL(38,18),
    "lastCheckedAt" TIMESTAMP(3),
    "lastEnteredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FavoriteAlertState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceAlertTrigger" (
    "id" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "rangeKey" TEXT NOT NULL,
    "targetLow" DECIMAL(38,18) NOT NULL,
    "targetHigh" DECIMAL(38,18) NOT NULL,
    "price" DECIMAL(38,18) NOT NULL,
    "triggeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceAlertTrigger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "triggerId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationWorkerHeartbeat" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastCheckAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationWorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteAlertState_favoriteId_key" ON "FavoriteAlertState"("favoriteId");
CREATE INDEX "PriceAlertTrigger_favoriteId_triggeredAt_idx" ON "PriceAlertTrigger"("favoriteId", "triggeredAt");
CREATE UNIQUE INDEX "NotificationDelivery_triggerId_channel_key" ON "NotificationDelivery"("triggerId", "channel");
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "FavoriteAlertState" ADD CONSTRAINT "FavoriteAlertState_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "Favorite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PriceAlertTrigger" ADD CONSTRAINT "PriceAlertTrigger_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "Favorite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_triggerId_fkey" FOREIGN KEY ("triggerId") REFERENCES "PriceAlertTrigger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
