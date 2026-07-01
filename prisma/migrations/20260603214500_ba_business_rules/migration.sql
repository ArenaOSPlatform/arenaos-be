-- Add BA-level business rule fields from the standardized requirements.

ALTER TABLE "Tournament"
ADD COLUMN "minTeams" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "Dispute"
ADD COLUMN "decisionReason" TEXT;
