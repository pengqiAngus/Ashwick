-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('pending_run', 'running', 'complete', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('queued', 'running', 'cancelling', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "RunKind" AS ENUM ('undetermined', 'full_analysis', 'followup_explain', 'hypothetical', 'refresh', 'change_horizon', 'switch_symbol', 'clarify');

-- CreateEnum
CREATE TYPE "StepStatus" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped', 'cancelled');

-- CreateEnum
CREATE TYPE "PredictionStatus" AS ENUM ('unavailable', 'not_configured', 'insufficient_data', 'ok');

-- CreateEnum
CREATE TYPE "LaunchSource" AS ENUM ('favorite_card', 'manual');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "source" "LaunchSource" NOT NULL DEFAULT 'manual',
    "currentSymbol" TEXT,
    "currentIntervals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentHorizon" TEXT,
    "currentReportId" TEXT,
    "activeRunId" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "parts" JSONB NOT NULL,
    "metadata" JSONB,
    "status" "MessageStatus" NOT NULL DEFAULT 'complete',
    "launchId" TEXT,
    "clientMessageId" TEXT,
    "replyToMessageId" TEXT,
    "currentRunId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "assistantMessageId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    "kind" "RunKind" NOT NULL DEFAULT 'undetermined',
    "config" JSONB NOT NULL,
    "snapshot" JSONB,
    "model" JSONB,
    "error" JSONB,
    "heartbeatAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "summary" TEXT,
    "result" JSONB,
    "error" JSONB,
    "evidenceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "AnalysisStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisReport" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "intervals" TEXT[],
    "horizon" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "dataCutoff" TIMESTAMP(3) NOT NULL,
    "report" JSONB NOT NULL,
    "predictionStatus" "PredictionStatus" NOT NULL DEFAULT 'unavailable',
    "modelVersion" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_currentReportId_key" ON "Conversation"("currentReportId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_activeRunId_key" ON "Conversation"("activeRunId");

-- CreateIndex
CREATE INDEX "Conversation_updatedAt_idx" ON "Conversation"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_launchId_key" ON "Message"("launchId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_replyToMessageId_key" ON "Message"("replyToMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_ordinal_key" ON "Message"("conversationId", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_clientMessageId_key" ON "Message"("conversationId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRun_idempotencyKey_key" ON "AnalysisRun"("idempotencyKey");

-- CreateIndex
CREATE INDEX "AnalysisRun_conversationId_createdAt_idx" ON "AnalysisRun"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalysisRun_status_heartbeatAt_idx" ON "AnalysisRun"("status", "heartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRun_messageId_attempt_key" ON "AnalysisRun"("messageId", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisStep_runId_stepId_key" ON "AnalysisStep"("runId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisReport_runId_key" ON "AnalysisReport"("runId");

-- CreateIndex
CREATE INDEX "AnalysisReport_conversationId_createdAt_idx" ON "AnalysisReport"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_currentReportId_fkey" FOREIGN KEY ("currentReportId") REFERENCES "AnalysisReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisStep" ADD CONSTRAINT "AnalysisStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisReport" ADD CONSTRAINT "AnalysisReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
