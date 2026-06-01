BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Team] ADD
    [totalMatchesPlayed] INT NOT NULL CONSTRAINT [Team_totalMatchesPlayed_df] DEFAULT 0,
    [totalWins] INT NOT NULL CONSTRAINT [Team_totalWins_df] DEFAULT 0,
    [totalLosses] INT NOT NULL CONSTRAINT [Team_totalLosses_df] DEFAULT 0,
    [championCount] INT NOT NULL CONSTRAINT [Team_championCount_df] DEFAULT 0,
    [overallWinRate] FLOAT(53) NOT NULL CONSTRAINT [Team_overallWinRate_df] DEFAULT 0;

-- AlterTable
ALTER TABLE [dbo].[Tournament] ADD
    [championTeamId] NVARCHAR(1000),
    [runnerUpTeamId] NVARCHAR(1000),
    [completedAt] DATETIME2;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
