-- CreateEnum
CREATE TYPE "ApiEnvironment" AS ENUM ('SANDBOX', 'LIVE');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('WHATSAPP', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "DeliveryKind" AS ENUM ('INVOICE', 'OTP', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'PROCESSING', 'PROVIDER_ACCEPTED', 'SENT', 'DELIVERED', 'READ', 'RETRYING', 'FAILED', 'EXPIRED', 'BLOCKED', 'SANDBOX_SIMULATED');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('NOT_CONNECTED', 'PENDING_SETUP', 'CONNECTED', 'ERROR', 'REVOKED');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'DEAD');

-- CreateEnum
CREATE TYPE "OtpStatus" AS ENUM ('PENDING', 'VERIFIED', 'EXPIRED', 'LOCKED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "IssuedDocumentType" AS ENUM ('INVOICE', 'RECEIPT');

-- CreateEnum
CREATE TYPE "ActivationPaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('PAYMENT', 'COMPLIMENTARY');

-- CreateEnum
CREATE TYPE "IdempotencyState" AS ENUM ('IN_PROGRESS', 'COMPLETE');

-- CreateEnum
CREATE TYPE "MerchantWebhookStatus" AS ENUM ('PENDING', 'RETRYING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "ApiKey" ADD COLUMN     "environment" "ApiEnvironment" NOT NULL DEFAULT 'LIVE',
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastFour" TEXT,
ADD COLUMN     "rateLimitPerMinute" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "rotatedFromId" TEXT;

-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "addressText" TEXT,
ADD COLUMN     "invoiceFooter" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "displayName" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretCiphertext" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "externalCustomerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "whatsappPhone" TEXT,
    "whatsappConsentAt" TIMESTAMP(3),
    "telegramChatId" TEXT,
    "telegramLinkedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "recipientId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "state" "IdempotencyState" NOT NULL DEFAULT 'IN_PROGRESS',
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentCounter" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "documentType" "IssuedDocumentType" NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DocumentCounter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "recipientId" TEXT,
    "documentType" "IssuedDocumentType" NOT NULL,
    "number" TEXT NOT NULL,
    "externalOrderId" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "paymentReference" TEXT,
    "currency" TEXT NOT NULL,
    "subtotalMinor" BIGINT NOT NULL,
    "discountMinor" BIGINT NOT NULL DEFAULT 0,
    "taxMinor" BIGINT NOT NULL DEFAULT 0,
    "totalMinor" BIGINT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "pdfStorageKey" TEXT,
    "pdfGeneratedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IssuedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "recipientPhone" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "customerRef" TEXT,
    "seed" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OtpStatus" NOT NULL DEFAULT 'PENDING',
    "codeLength" INTEGER NOT NULL DEFAULT 6,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "kind" "DeliveryKind" NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "toAddress" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "payload" JSONB,
    "invoiceId" TEXT,
    "otpChallengeId" TEXT,
    "otpVersion" INTEGER,
    "scenario" TEXT,
    "requestId" TEXT,
    "providerMessageId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Delivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "providerStatusCode" INTEGER,
    "retryAfterSeconds" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DeliveryAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderStatusEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "deliveryId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboxEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "workspaceId" TEXT,
    "environment" "ApiEnvironment",
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneAt" TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantWebhookEndpoint" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "url" TEXT NOT NULL,
    "secretCiphertext" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantWebhookEndpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantWebhookEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "environment" "ApiEnvironment" NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantWebhookDelivery" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "endpointId" TEXT NOT NULL,
    "status" "MerchantWebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastStatus" INTEGER,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantWebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantWebhookAttempt" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "responseStatus" INTEGER,
    "error" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantWebhookAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateTable
CREATE TABLE "ActivationQuote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivationQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivationPayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "livemode" BOOLEAN NOT NULL,
    "status" "ActivationPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "providerTransactionId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "refundedAmountMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivationPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entitlement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "source" "EntitlementSource" NOT NULL,
    "activationPaymentId" TEXT,
    "grantedById" TEXT,
    "note" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_workspaceId_environment_channel_key" ON "ChannelConnection"("workspaceId", "environment", "channel");

-- CreateIndex
CREATE INDEX "Recipient_telegramChatId_idx" ON "Recipient"("telegramChatId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipient_workspaceId_environment_externalCustomerId_key" ON "Recipient"("workspaceId", "environment", "externalCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "TelegramLinkToken_workspaceId_environment_idx" ON "TelegramLinkToken"("workspaceId", "environment");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_workspaceId_environment_operation_key_key" ON "IdempotencyRecord"("workspaceId", "environment", "operation", "key");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCounter_workspaceId_environment_documentType_key" ON "DocumentCounter"("workspaceId", "environment", "documentType");

-- CreateIndex
CREATE INDEX "IssuedDocument_workspaceId_environment_createdAt_idx" ON "IssuedDocument"("workspaceId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "IssuedDocument_workspaceId_environment_externalOrderId_idx" ON "IssuedDocument"("workspaceId", "environment", "externalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedDocument_workspaceId_environment_documentType_number_key" ON "IssuedDocument"("workspaceId", "environment", "documentType", "number");

-- CreateIndex
CREATE INDEX "OtpChallenge_workspaceId_environment_recipientPhone_created_idx" ON "OtpChallenge"("workspaceId", "environment", "recipientPhone", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_workspaceId_environment_createdAt_idx" ON "Delivery"("workspaceId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "Delivery_providerMessageId_idx" ON "Delivery"("providerMessageId");

-- CreateIndex
CREATE INDEX "Delivery_status_nextAttemptAt_idx" ON "Delivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "DeliveryAttempt_deliveryId_idx" ON "DeliveryAttempt"("deliveryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderStatusEvent_provider_externalId_status_key" ON "ProviderStatusEvent"("provider", "externalId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "OutboxEvent_status_runAt_idx" ON "OutboxEvent"("status", "runAt");

-- CreateIndex
CREATE INDEX "MerchantWebhookEndpoint_workspaceId_environment_idx" ON "MerchantWebhookEndpoint"("workspaceId", "environment");

-- CreateIndex
CREATE INDEX "MerchantWebhookEvent_workspaceId_environment_createdAt_idx" ON "MerchantWebhookEvent"("workspaceId", "environment", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantWebhookDelivery_eventId_endpointId_key" ON "MerchantWebhookDelivery"("eventId", "endpointId");

-- CreateIndex
CREATE INDEX "MerchantWebhookAttempt_deliveryId_idx" ON "MerchantWebhookAttempt"("deliveryId");

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");

-- CreateIndex
CREATE INDEX "ActivationQuote_workspaceId_idx" ON "ActivationQuote"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivationPayment_reference_key" ON "ActivationPayment"("reference");

-- CreateIndex
CREATE INDEX "ActivationPayment_workspaceId_status_idx" ON "ActivationPayment"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_workspaceId_key" ON "Entitlement"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Entitlement_activationPaymentId_key" ON "Entitlement"("activationPaymentId");

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipient" ADD CONSTRAINT "Recipient_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramLinkToken" ADD CONSTRAINT "TelegramLinkToken_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssuedDocument" ADD CONSTRAINT "IssuedDocument_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "IssuedDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delivery" ADD CONSTRAINT "Delivery_otpChallengeId_fkey" FOREIGN KEY ("otpChallengeId") REFERENCES "OtpChallenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAttempt" ADD CONSTRAINT "DeliveryAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantWebhookEndpoint" ADD CONSTRAINT "MerchantWebhookEndpoint_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantWebhookDelivery" ADD CONSTRAINT "MerchantWebhookDelivery_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MerchantWebhookEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantWebhookDelivery" ADD CONSTRAINT "MerchantWebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "MerchantWebhookEndpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantWebhookAttempt" ADD CONSTRAINT "MerchantWebhookAttempt_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "MerchantWebhookDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationQuote" ADD CONSTRAINT "ActivationQuote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationPayment" ADD CONSTRAINT "ActivationPayment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivationPayment" ADD CONSTRAINT "ActivationPayment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "ActivationQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entitlement" ADD CONSTRAINT "Entitlement_activationPaymentId_fkey" FOREIGN KEY ("activationPaymentId") REFERENCES "ActivationPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

