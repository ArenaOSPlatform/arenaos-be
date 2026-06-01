BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[TournamentRegistration] (
    [id] NVARCHAR(1000) NOT NULL,
    [tournamentId] NVARCHAR(1000) NOT NULL,
    [teamId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TournamentRegistration_status_df] DEFAULT 'PENDING',
    [rejectReason] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TournamentRegistration_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [TournamentRegistration_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TournamentRegistration_tournamentId_teamId_key] UNIQUE NONCLUSTERED ([tournamentId],[teamId])
);

-- AddForeignKey
ALTER TABLE [dbo].[TournamentRegistration] ADD CONSTRAINT [TournamentRegistration_tournamentId_fkey] FOREIGN KEY ([tournamentId]) REFERENCES [dbo].[Tournament]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TournamentRegistration] ADD CONSTRAINT [TournamentRegistration_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[Team]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
