BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[TeamInvite] (
    [id] NVARCHAR(1000) NOT NULL,
    [teamId] NVARCHAR(1000) NOT NULL,
    [inviterId] NVARCHAR(1000) NOT NULL,
    [inviteeId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [TeamInvite_status_df] DEFAULT 'PENDING',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [TeamInvite_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [TeamInvite_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [TeamInvite_teamId_inviteeId_key] UNIQUE NONCLUSTERED ([teamId],[inviteeId])
);

-- AddForeignKey
ALTER TABLE [dbo].[TeamInvite] ADD CONSTRAINT [TeamInvite_teamId_fkey] FOREIGN KEY ([teamId]) REFERENCES [dbo].[Team]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TeamInvite] ADD CONSTRAINT [TeamInvite_inviterId_fkey] FOREIGN KEY ([inviterId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[TeamInvite] ADD CONSTRAINT [TeamInvite_inviteeId_fkey] FOREIGN KEY ([inviteeId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
