-- CreateTable
CREATE TABLE "FavoriteEvent" (
    "id" TEXT NOT NULL,
    "favoriteId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FavoriteEvent_favoriteId_createdAt_idx" ON "FavoriteEvent"("favoriteId", "createdAt");

-- AddForeignKey
ALTER TABLE "FavoriteEvent" ADD CONSTRAINT "FavoriteEvent_favoriteId_fkey" FOREIGN KEY ("favoriteId") REFERENCES "Favorite"("id") ON DELETE CASCADE ON UPDATE CASCADE;
