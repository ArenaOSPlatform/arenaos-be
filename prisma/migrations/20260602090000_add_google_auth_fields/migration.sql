ALTER TABLE "User" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'LOCAL';
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
