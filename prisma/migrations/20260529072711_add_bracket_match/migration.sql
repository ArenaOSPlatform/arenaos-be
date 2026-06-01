BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Bracket] (
    [id] NVARCHAR(1000) NOT NULL,
    [tournamentId] NVARCHAR(1000) NOT NULL,
    [format] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Bracket_status_df] DEFAULT 'GENERATED',
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Bracket_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Bracket_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Bracket_tournamentId_key] UNIQUE NONCLUSTERED ([tournamentId])
);

-- CreateTable
CREATE TABLE [dbo].[Match] (
    [id] NVARCHAR(1000) NOT NULL,
    [tournamentId] NVARCHAR(1000) NOT NULL,
    [bracketId] NVARCHAR(1000) NOT NULL,
    [roundNumber] INT NOT NULL,
    [matchNumber] INT NOT NULL,
    [teamAId] NVARCHAR(1000),
    [teamBId] NVARCHAR(1000),
    [winnerId] NVARCHAR(1000),
    [scoreA] INT NOT NULL CONSTRAINT [Match_scoreA_df] DEFAULT 0,
    [scoreB] INT NOT NULL CONSTRAINT [Match_scoreB_df] DEFAULT 0,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Match_status_df] DEFAULT 'PENDING',
    [scheduledAt] DATETIME2,
    [livestreamUrl] NVARCHAR(1000),
    [roomCode] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Match_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Match_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[Bracket] ADD CONSTRAINT [Bracket_tournamentId_fkey] FOREIGN KEY ([tournamentId]) REFERENCES [dbo].[Tournament]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Match] ADD CONSTRAINT [Match_tournamentId_fkey] FOREIGN KEY ([tournamentId]) REFERENCES [dbo].[Tournament]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Match] ADD CONSTRAINT [Match_bracketId_fkey] FOREIGN KEY ([bracketId]) REFERENCES [dbo].[Bracket]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
