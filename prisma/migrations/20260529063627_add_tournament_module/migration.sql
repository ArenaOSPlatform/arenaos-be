BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Tournament] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [game] NVARCHAR(1000) NOT NULL,
    [description] NVARCHAR(1000),
    [bannerUrl] NVARCHAR(1000),
    [maxTeams] INT NOT NULL,
    [teamSize] INT NOT NULL,
    [format] NVARCHAR(1000) NOT NULL,
    [prizePool] NVARCHAR(1000),
    [rules] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Tournament_status_df] DEFAULT 'DRAFT',
    [startDate] DATETIME2 NOT NULL,
    [endDate] DATETIME2,
    [registrationDeadline] DATETIME2 NOT NULL,
    [organizerId] NVARCHAR(1000) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Tournament_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Tournament_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[Tournament] ADD CONSTRAINT [Tournament_organizerId_fkey] FOREIGN KEY ([organizerId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
