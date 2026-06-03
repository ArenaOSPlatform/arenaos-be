-- Align ArenaOS data model with the requirement documents.

ALTER TABLE "OrganizerRequest"
ADD COLUMN "organizationName" TEXT,
ADD COLUMN "contactEmail" TEXT,
ADD COLUMN "socialLink" TEXT,
ADD COLUMN "evidenceUrl" TEXT;

ALTER TABLE "Team"
ADD COLUMN "game" TEXT,
ADD COLUMN "region" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE "TeamMember"
ADD COLUMN "roleInTeam" TEXT NOT NULL DEFAULT 'MEMBER';

ALTER TABLE "Tournament"
ADD COLUMN "region" TEXT,
ADD COLUMN "livestreamUrl" TEXT;

ALTER TABLE "Bracket"
ADD COLUMN "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Bracket" SET "status" = 'LOCKED' WHERE "status" = 'GENERATED';
ALTER TABLE "Bracket" ALTER COLUMN "status" SET DEFAULT 'LOCKED';

CREATE TABLE "BracketRound" (
  "id" TEXT NOT NULL,
  "bracketId" TEXT NOT NULL,
  "roundNumber" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "BracketRound_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BracketRound_bracketId_roundNumber_key" ON "BracketRound"("bracketId", "roundNumber");

ALTER TABLE "BracketRound"
ADD CONSTRAINT "BracketRound_bracketId_fkey"
FOREIGN KEY ("bracketId") REFERENCES "Bracket"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "Match"
ADD COLUMN "roundId" TEXT,
ADD COLUMN "bestOf" TEXT,
ADD COLUMN "note" TEXT;

ALTER TABLE "Match"
ADD CONSTRAINT "Match_roundId_fkey"
FOREIGN KEY ("roundId") REFERENCES "BracketRound"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE "MatchCheckIn" (
  "id" TEXT NOT NULL,
  "matchId" TEXT NOT NULL,
  "teamId" TEXT NOT NULL,
  "checkedInBy" TEXT NOT NULL,
  "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MatchCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MatchCheckIn_matchId_teamId_key" ON "MatchCheckIn"("matchId", "teamId");

ALTER TABLE "MatchCheckIn"
ADD CONSTRAINT "MatchCheckIn_matchId_fkey"
FOREIGN KEY ("matchId") REFERENCES "Match"("id")
ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE "MatchEvidence"
ADD COLUMN "fileUrl" TEXT,
ADD COLUMN "type" TEXT NOT NULL DEFAULT 'SCREENSHOT';

UPDATE "MatchEvidence" SET "fileUrl" = "imageUrl" WHERE "fileUrl" IS NULL;

ALTER TABLE "Dispute"
ADD COLUMN "teamId" TEXT;

ALTER TABLE "AuditLog"
ADD COLUMN "actorId" TEXT,
ADD COLUMN "targetType" TEXT,
ADD COLUMN "targetId" TEXT,
ADD COLUMN "oldValue" TEXT,
ADD COLUMN "newValue" TEXT;

UPDATE "AuditLog"
SET
  "actorId" = "userId",
  "targetType" = "entityType",
  "targetId" = "entityId",
  "newValue" = "metadata";
