-- CreateEnum
CREATE TYPE "PositionSide" AS ENUM ('long', 'short');

-- AlterTable
ALTER TABLE "Favorite" ADD COLUMN     "side" "PositionSide";
