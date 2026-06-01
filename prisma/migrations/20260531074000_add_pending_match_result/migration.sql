BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Match] ADD [pendingScoreA] INT,
    [pendingScoreB] INT,
    [resultStatus] NVARCHAR(1000),
    [resultSubmittedBy] NVARCHAR(1000),
    [resultSubmittedTeamId] NVARCHAR(1000),
    [resultSubmittedAt] DATETIME2,
    [resultEvidenceId] NVARCHAR(1000);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
