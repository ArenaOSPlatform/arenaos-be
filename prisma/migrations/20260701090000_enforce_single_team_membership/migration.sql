DROP INDEX IF EXISTS "TeamMember_userId_idx";
CREATE UNIQUE INDEX "TeamMember_userId_key" ON "TeamMember"("userId");
