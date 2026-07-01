ALTER TABLE "PasswordResetOtp"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Match"
ADD COLUMN "reminderSentAt" TIMESTAMP(3);

CREATE INDEX "PasswordResetOtp_userId_consumedAt_createdAt_idx" ON "PasswordResetOtp"("userId", "consumedAt", "createdAt");
CREATE INDEX "OrganizerRequest_userId_status_createdAt_idx" ON "OrganizerRequest"("userId", "status", "createdAt");
CREATE INDEX "OrganizerRequest_reviewedBy_idx" ON "OrganizerRequest"("reviewedBy");
CREATE INDEX "Team_captainId_idx" ON "Team"("captainId");
CREATE INDEX "Team_status_createdAt_idx" ON "Team"("status", "createdAt");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE INDEX "TeamInvite_inviteeId_status_createdAt_idx" ON "TeamInvite"("inviteeId", "status", "createdAt");
CREATE INDEX "TeamInvite_inviterId_idx" ON "TeamInvite"("inviterId");
CREATE INDEX "Tournament_organizerId_createdAt_idx" ON "Tournament"("organizerId", "createdAt");
CREATE INDEX "Tournament_status_createdAt_idx" ON "Tournament"("status", "createdAt");
CREATE INDEX "Tournament_startDate_idx" ON "Tournament"("startDate");
CREATE INDEX "TournamentRegistration_tournamentId_status_createdAt_idx" ON "TournamentRegistration"("tournamentId", "status", "createdAt");
CREATE INDEX "TournamentRegistration_teamId_idx" ON "TournamentRegistration"("teamId");
CREATE UNIQUE INDEX "Match_bracketId_roundNumber_matchNumber_key" ON "Match"("bracketId", "roundNumber", "matchNumber");
CREATE INDEX "Match_tournamentId_status_idx" ON "Match"("tournamentId", "status");
CREATE INDEX "Match_scheduledAt_reminderSentAt_idx" ON "Match"("scheduledAt", "reminderSentAt");
CREATE INDEX "Match_teamAId_idx" ON "Match"("teamAId");
CREATE INDEX "Match_teamBId_idx" ON "Match"("teamBId");
CREATE INDEX "Match_winnerId_idx" ON "Match"("winnerId");
CREATE INDEX "Match_nextMatchId_idx" ON "Match"("nextMatchId");
CREATE INDEX "MatchCheckIn_teamId_idx" ON "MatchCheckIn"("teamId");
CREATE INDEX "MatchEvidence_matchId_createdAt_idx" ON "MatchEvidence"("matchId", "createdAt");
CREATE INDEX "MatchEvidence_submittedBy_idx" ON "MatchEvidence"("submittedBy");
CREATE INDEX "Dispute_matchId_status_createdAt_idx" ON "Dispute"("matchId", "status", "createdAt");
CREATE INDEX "Dispute_teamId_idx" ON "Dispute"("teamId");
CREATE INDEX "Dispute_createdBy_idx" ON "Dispute"("createdBy");
CREATE INDEX "TournamentLeaderboard_teamId_rank_idx" ON "TournamentLeaderboard"("teamId", "rank");
CREATE INDEX "TeamRankingHistory_teamId_createdAt_idx" ON "TeamRankingHistory"("teamId", "createdAt");
CREATE INDEX "TournamentAnnouncement_tournamentId_createdAt_idx" ON "TournamentAnnouncement"("tournamentId", "createdAt");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");
