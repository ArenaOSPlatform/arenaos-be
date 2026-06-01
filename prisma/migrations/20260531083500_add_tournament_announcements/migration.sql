BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[TournamentAnnouncement] (
    [id] NVARCHAR(1000) NOT NULL,
    [tournamentId] NVARCHAR(1000) NOT NULL,
    [createdBy] NVARCHAR(1000) NOT NULL,
    [title] NVARCHAR(1000) NOT NULL,
    [content] NVARCHAR(MAX) NOT NULL,
    [type] NVARCHAR(1000) NOT NULL CONSTRAINT [TournamentAnnouncement_type_df] DEFAULT 'INFO',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TournamentAnnouncement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [TournamentAnnouncement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[TournamentAnnouncement] ADD CONSTRAINT [TournamentAnnouncement_tournamentId_fkey] FOREIGN KEY ([tournamentId]) REFERENCES [dbo].[Tournament]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
