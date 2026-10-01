-- CreateTable
CREATE TABLE "AgentSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "providerName" TEXT,
    "providerBaseUrl" TEXT,
    "providerApiKey" TEXT,
    "modelAnalyst" TEXT,
    "modelSynth" TEXT,
    "supportsStructuredOutputs" BOOLEAN,
    "maxRunMs" INTEGER,
    "maxModelCalls" INTEGER,
    "debateRounds" INTEGER,
    "maxInputChars" INTEGER,
    "riskMode" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSetting_pkey" PRIMARY KEY ("id")
);
