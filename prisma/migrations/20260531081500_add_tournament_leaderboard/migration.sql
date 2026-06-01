BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[TournamentLeaderboard] (
    [id] NVARCHAR(1000) NOT NULL,
    [tournamentId] NVARCHAR(1000) NOT NULL,
    [teamId] NVARCHAR(1000) NOT NULL,
    [rank] INT NOT NULL CONSTRAINT [TournamentLeaderboard_rank_df] DEFAULT 0,
    [highestRank] INT NOT NULL CONSTRAINT [TournamentLeaderboard_highestRank_df] DEFAULT 0,
    [matchesPlayed] INT NOT NULL CONSTRAINT [TournamentLeaderboard_matchesPlayed_df] DEFAULT 0,
    [wins] INT NOT NULL CONSTRAINT [TournamentLeaderboard_wins_df] DEFAULT 0,
    [losses] INT NOT NULL CONSTRAINT [TournamentLeaderboard_losses_df] DEFAULT 0,
    [points] INT NOT NULL CONSTRAINT [TournamentLeaderboard_points_df] DEFAULT 0,
    [winRate] FLOAT(53) NOT NULL CONSTRAINT [TournamentLeaderboard_winRate_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TournamentLeaderboard_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [TournamentLeaderboard_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TournamentLeaderboard_tournamentId_teamId_key] UNIQUE NONCLUSTERED ([tournamentId],[teamId])
);

-- CreateTable
CREATE TABLE [dbo].[TeamRankingHistory] (
    [id] NVARCHAR(1000) NOT NULL,
    [tournamentId] NVARCHAR(1000) NOT NULL,
    [teamId] NVARCHAR(1000) NOT NULL,
    [matchId] NVARCHAR(1000) NOT NULL,
    [rank] INT NOT NULL,
    [highestRank] INT NOT NULL,
    [matchesPlayed] INT NOT NULL,
    [wins] INT NOT NULL,
    [losses] INT NOT NULL,
    [points] INT NOT NULL,
    [winRate] FLOAT(53) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TeamRankingHistory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [TeamRankingHistory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TeamRankingHistory_tournamentId_teamId_matchId_key] UNIQUE NONCLUSTERED ([tournamentId],[teamId],[matchId])
);

-- AddForeignKey
ALTER TABLE [dbo].[TournamentLeaderboard] ADD CONSTRAINT [TournamentLeaderboard_tournamentId_fkey] FOREIGN KEY ([tournamentId]) REFERENCES [dbo].[Tournament]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TournamentLeaderboard] ADD CONSTRAINT [TournamentLeaderboard_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[Team]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TeamRankingHistory] ADD CONSTRAINT [TeamRankingHistory_tournamentId_fkey] FOREIGN KEY ([tournamentId]) REFERENCES [dbo].[Tournament]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TeamRankingHistory] ADD CONSTRAINT [TeamRankingHistory_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[Team]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
