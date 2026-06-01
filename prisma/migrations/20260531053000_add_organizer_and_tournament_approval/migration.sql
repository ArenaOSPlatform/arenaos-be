BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[OrganizerRequest] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [reason] NVARCHAR(1000),
    [experience] NVARCHAR(1000),
    [portfolioUrl] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [OrganizerRequest_status_df] DEFAULT 'PENDING',
    [reviewedBy] NVARCHAR(1000),
    [reviewNote] NVARCHAR(1000),
    [reviewedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [OrganizerRequest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [OrganizerRequest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AlterTable
ALTER TABLE [dbo].[Tournament] ADD [approvalSubmittedAt] DATETIME2,
    [approvalReviewedAt] DATETIME2,
    [approvalReviewedBy] NVARCHAR(1000),
    [approvalRejectReason] NVARCHAR(1000);

-- AddForeignKey
ALTER TABLE [dbo].[OrganizerRequest] ADD CONSTRAINT [OrganizerRequest_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[OrganizerRequest] ADD CONSTRAINT [OrganizerRequest_reviewedBy_fkey] FOREIGN KEY ([reviewedBy]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
