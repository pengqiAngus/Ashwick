-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('open', 'closed');

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "baseAsset" TEXT NOT NULL,
    "quoteAsset" TEXT NOT NULL,
    "side" "PositionSide" NOT NULL,
    "margin" DECIMAL(38,18) NOT NULL,
    "leverage" INTEGER NOT NULL,
    "entryPrice" DECIMAL(38,18) NOT NULL,
    "baseQty" DECIMAL(38,18) NOT NULL,
    "status" "PositionStatus" NOT NULL DEFAULT 'open',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositionClose" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "entryPrice" DECIMAL(38,18) NOT NULL,
    "closePrice" DECIMAL(38,18) NOT NULL,
    "closedBase" DECIMAL(38,18) NOT NULL,
    "closedMargin" DECIMAL(38,18) NOT NULL,
    "realizedPnl" DECIMAL(38,18) NOT NULL,
    "roi" DECIMAL(38,18) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionClose_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_status_openedAt_idx" ON "Position"("status", "openedAt");

-- CreateIndex
CREATE INDEX "PositionClose_createdAt_idx" ON "PositionClose"("createdAt");

-- AddForeignKey
ALTER TABLE "PositionClose" ADD CONSTRAINT "PositionClose_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;
