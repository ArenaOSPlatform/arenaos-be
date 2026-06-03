import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogsService } from './audit-logs/audit-logs.service';
import { NotificationsService } from './notifications/notifications.service';
import { RealtimeGateway } from './realtime/realtime/realtime.gateway';

type MatchCompletionSource =
  | 'CONFIRM_MATCH_RESULT'
  | 'UPDATE_MATCH_RESULT'
  | 'RESOLVE_DISPUTE';

@Injectable()
export class TournamentCompletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private async recomputeTeamAggregates(teamIds: string[]) {
    const uniqueTeamIds = [...new Set(teamIds)].filter(Boolean);

    if (uniqueTeamIds.length === 0) return;

    const [completedMatches, championRows] = await Promise.all([
      this.prisma.match.findMany({
        where: {
          status: 'COMPLETED',
          winnerId: {
            not: null,
          },
          OR: [
            {
              teamAId: {
                in: uniqueTeamIds,
              },
            },
            {
              teamBId: {
                in: uniqueTeamIds,
              },
            },
          ],
        },
        select: {
          teamAId: true,
          teamBId: true,
          winnerId: true,
        },
      }),
      this.prisma.tournament.findMany({
        where: {
          status: 'COMPLETED',
          championTeamId: {
            in: uniqueTeamIds,
          },
        },
        select: {
          championTeamId: true,
        },
      }),
    ]);

    const championCountByTeamId = new Map(
      uniqueTeamIds.map((teamId) => [teamId, 0]),
    );

    championRows.forEach((row) => {
      if (!row.championTeamId) return;

      championCountByTeamId.set(
        row.championTeamId,
        (championCountByTeamId.get(row.championTeamId) ?? 0) + 1,
      );
    });

    await this.prisma.$transaction(
      uniqueTeamIds.map((teamId) => {
        let totalMatchesPlayed = 0;
        let totalWins = 0;
        let totalLosses = 0;

        completedMatches.forEach((match) => {
          if (!match.teamAId || !match.teamBId || !match.winnerId) return;

          const participated =
            match.teamAId === teamId || match.teamBId === teamId;

          if (!participated) return;

          totalMatchesPlayed += 1;

          if (match.winnerId === teamId) {
            totalWins += 1;
          } else {
            totalLosses += 1;
          }
        });

        const overallWinRate =
          totalMatchesPlayed === 0
            ? 0
            : Number(((totalWins / totalMatchesPlayed) * 100).toFixed(1));

        return this.prisma.team.update({
          where: { id: teamId },
          data: {
            totalMatchesPlayed,
            totalWins,
            totalLosses,
            championCount: championCountByTeamId.get(teamId) ?? 0,
            overallWinRate,
          },
        });
      }),
    );
  }

  async completeIfFinalMatch(
    matchId: string,
    actorId: string,
    sourceAction: MatchCompletionSource,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: {
          include: {
            registrations: {
              where: {
                status: {
                  in: ['PENDING', 'APPROVED'],
                },
              },
              include: {
                team: {
                  select: {
                    id: true,
                    name: true,
                    members: {
                      select: {
                        userId: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!match) return null;
    if (match.status !== 'COMPLETED') return null;
    if (!match.winnerId || !match.teamAId || !match.teamBId) return null;
    if (match.nextMatchId || match.nextSlot) return null;
    if (match.tournament.status === 'COMPLETED') return null;

    const runnerUpTeamId =
      match.winnerId === match.teamAId ? match.teamBId : match.teamAId;
    const completedAt = new Date();
    const registeredTeamIds = match.tournament.registrations.map(
      (registration) => registration.team.id,
    );
    const affectedTeamIds = [
      ...registeredTeamIds,
      match.teamAId,
      match.teamBId,
      match.winnerId,
      runnerUpTeamId,
    ];

    const [totalTeams, totalMatches, championTeam, runnerUpTeam] =
      await Promise.all([
        this.prisma.tournamentRegistration.count({
          where: {
            tournamentId: match.tournamentId,
            status: 'APPROVED',
          },
        }),
        this.prisma.match.count({
          where: { tournamentId: match.tournamentId },
        }),
        this.prisma.team.findUnique({
          where: { id: match.winnerId },
          select: { id: true, name: true },
        }),
        this.prisma.team.findUnique({
          where: { id: runnerUpTeamId },
          select: { id: true, name: true },
        }),
      ]);

    const updatedTournament = await this.prisma.tournament.update({
      where: { id: match.tournamentId },
      data: {
        status: 'COMPLETED',
        championTeamId: match.winnerId,
        runnerUpTeamId,
        completedAt,
      },
    });

    await this.recomputeTeamAggregates(affectedTeamIds);

    await this.auditLogsService.createLog(
      actorId,
      'COMPLETE_TOURNAMENT',
      'TOURNAMENT',
      match.tournamentId,
      {
        tournamentName: match.tournament.name,
        finalMatchId: match.id,
        sourceAction,
        championTeamId: match.winnerId,
        championTeamName: championTeam?.name ?? null,
        runnerUpTeamId,
        runnerUpTeamName: runnerUpTeam?.name ?? null,
        totalTeams,
        totalMatches,
        completedAt,
      },
    );

    const participantUserIds = [
      ...new Set(
        match.tournament.registrations.flatMap((registration) =>
          registration.team.members.map((member) => member.userId),
        ),
      ),
    ];
    const championUserIds = [
      ...new Set(
        match.tournament.registrations
          .filter((registration) => registration.team.id === match.winnerId)
          .flatMap((registration) =>
            registration.team.members.map((member) => member.userId),
          ),
      ),
    ];
    const metadata = {
      tournamentId: match.tournamentId,
      finalMatchId: match.id,
      championTeamId: match.winnerId,
      championTeamName: championTeam?.name ?? null,
      runnerUpTeamId,
      runnerUpTeamName: runnerUpTeam?.name ?? null,
      totalTeams,
      totalMatches,
      completedAt,
    };

    await Promise.all([
      ...participantUserIds.map((userId) =>
        this.notificationsService.createNotification({
          userId,
          title: 'Tournament completed',
          message: `${match.tournament.name} has completed. Champion: ${championTeam?.name ?? match.winnerId}.`,
          type: 'TOURNAMENT_COMPLETED',
          metadata,
        }),
      ),
      ...championUserIds.map((userId) =>
        this.notificationsService.createNotification({
          userId,
          title: 'Tournament champion',
          message: `${championTeam?.name ?? 'Your team'} won ${match.tournament.name}.`,
          type: 'TOURNAMENT_CHAMPION',
          metadata,
        }),
      ),
      this.notificationsService.createNotification({
        userId: match.tournament.organizerId,
        title: 'Tournament completed',
        message: `${match.tournament.name} is now archived with champion ${championTeam?.name ?? match.winnerId}.`,
        type: 'TOURNAMENT_COMPLETED',
        metadata,
      }),
    ]);

    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'tournament:status_changed',
      updatedTournament,
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      metadata,
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'leaderboard:updated',
      metadata,
    );

    return updatedTournament;
  }
}
