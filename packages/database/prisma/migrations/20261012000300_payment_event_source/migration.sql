-- CreateTable
CREATE TABLE "PaymentEventSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "provider" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "defaultChannels" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEventSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEventSource_workspaceId_environment_provider_key" ON "PaymentEventSource"("workspaceId", "environment", "provider");

-- AddForeignKey
ALTER TABLE "PaymentEventSource" ADD CONSTRAINT "PaymentEventSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

