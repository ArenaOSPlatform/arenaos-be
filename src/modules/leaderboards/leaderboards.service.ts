import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const WIN_POINTS = 3;

type LeaderboardTeam = {
  id: string;
  name: string;
  captainId: string;
};

type LeaderboardStats = {
  tournamentId: string;
  teamId: string;
  teamName: string;
  captainId: string;
  rank: number;
  highestRank: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  points: number;
  winRate: number;
};

type CompletedMatch = {
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
};

@Injectable()
export class LeaderboardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private getHeadToHeadScore(
    matches: CompletedMatch[],
    teamAId: string,
    teamBId: string,
  ) {
    return matches.reduce(
      (score, match) => {
        const isHeadToHead =
          (match.teamAId === teamAId && match.teamBId === teamBId) ||
          (match.teamAId === teamBId && match.teamBId === teamAId);

        if (!isHeadToHead) return score;

        if (match.winnerId === teamAId) {
          return { teamA: score.teamA + 1, teamB: score.teamB };
        }

        if (match.winnerId === teamBId) {
          return { teamA: score.teamA, teamB: score.teamB + 1 };
        }

        return score;
      },
      { teamA: 0, teamB: 0 },
    );
  }

  async recalculateTournamentLeaderboard(
    tournamentId: string,
    completedMatchId?: string,
    notifyTeamIds: string[] = [],
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: { status: 'APPROVED' },
          include: {
            team: {
              select: {
                id: true,
                name: true,
                captainId: true,
              },
            },
          },
        },
      },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    const completedMatches = await this.prisma.match.findMany({
      where: {
        tournamentId,
        status: 'COMPLETED',
        winnerId: {
          not: null,
        },
      },
      select: {
        teamAId: true,
        teamBId: true,
        winnerId: true,
      },
    });

    const teamsById = new Map<string, LeaderboardTeam>();

    tournament.registrations.forEach((registration) => {
      teamsById.set(registration.team.id, registration.team);
    });

    const matchTeamIds = [
      ...new Set(
        completedMatches
          .flatMap((match) => [match.teamAId, match.teamBId])
          .filter(Boolean) as string[],
      ),
    ].filter((teamId) => !teamsById.has(teamId));

    if (matchTeamIds.length > 0) {
      const matchTeams = await this.prisma.team.findMany({
        where: {
          id: {
            in: matchTeamIds,
          },
        },
        select: {
          id: true,
          name: true,
          captainId: true,
        },
      });

      matchTeams.forEach((team) => teamsById.set(team.id, team));
    }

    const statsByTeamId = new Map<string, LeaderboardStats>();

    teamsById.forEach((team) => {
      statsByTeamId.set(team.id, {
        tournamentId,
        teamId: team.id,
        teamName: team.name,
        captainId: team.captainId,
        rank: 0,
        highestRank: 0,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        points: 0,
        winRate: 0,
      });
    });

    completedMatches.forEach((match) => {
      if (!match.teamAId || !match.teamBId || !match.winnerId) return;

      const teamA = statsByTeamId.get(match.teamAId);
      const teamB = statsByTeamId.get(match.teamBId);

      if (!teamA || !teamB) return;

      teamA.matchesPlayed += 1;
      teamB.matchesPlayed += 1;

      if (match.winnerId === match.teamAId) {
        teamA.wins += 1;
        teamA.points += WIN_POINTS;
        teamB.losses += 1;
      } else if (match.winnerId === match.teamBId) {
        teamB.wins += 1;
        teamB.points += WIN_POINTS;
        teamA.losses += 1;
      }
    });

    const existingRows = await this.prisma.tournamentLeaderboard.findMany({
      where: { tournamentId },
    });
    const existingByTeamId = new Map(
      existingRows.map((row) => [row.teamId, row]),
    );

    const rows = [...statsByTeamId.values()]
      .map((row) => ({
        ...row,
        winRate:
          row.matchesPlayed === 0
            ? 0
            : Number(((row.wins / row.matchesPlayed) * 100).toFixed(1)),
      }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.wins !== a.wins) return b.wins - a.wins;

        const headToHead = this.getHeadToHeadScore(
          completedMatches,
          a.teamId,
          b.teamId,
        );

        if (headToHead.teamA !== headToHead.teamB) {
          return headToHead.teamB - headToHead.teamA;
        }

        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        if (a.losses !== b.losses) return a.losses - b.losses;

        return a.teamName.localeCompare(b.teamName);
      })
      .map((row, index) => {
        const rank = index + 1;
        const existing = existingByTeamId.get(row.teamId);
        const highestRank =
          existing?.highestRank && existing.highestRank > 0
            ? Math.min(existing.highestRank, rank)
            : rank;

        return {
          ...row,
          rank,
          highestRank,
        };
      });

    if (rows.length > 0) {
      await this.prisma.$transaction(
        rows.map((row) =>
          this.prisma.tournamentLeaderboard.upsert({
            where: {
              tournamentId_teamId: {
                tournamentId,
                teamId: row.teamId,
              },
            },
            update: {
              rank: row.rank,
              highestRank: row.highestRank,
              matchesPlayed: row.matchesPlayed,
              wins: row.wins,
              losses: row.losses,
              points: row.points,
              winRate: row.winRate,
            },
            create: {
              tournamentId,
              teamId: row.teamId,
              rank: row.rank,
              highestRank: row.highestRank,
              matchesPlayed: row.matchesPlayed,
              wins: row.wins,
              losses: row.losses,
              points: row.points,
              winRate: row.winRate,
            },
          }),
        ),
      );
    }

    if (completedMatchId && rows.length > 0) {
      await this.prisma.$transaction(
        rows.map((row) =>
          this.prisma.teamRankingHistory.upsert({
            where: {
              tournamentId_teamId_matchId: {
                tournamentId,
                teamId: row.teamId,
                matchId: completedMatchId,
              },
            },
            update: {
              rank: row.rank,
              highestRank: row.highestRank,
              matchesPlayed: row.matchesPlayed,
              wins: row.wins,
              losses: row.losses,
              points: row.points,
              winRate: row.winRate,
            },
            create: {
              tournamentId,
              teamId: row.teamId,
              matchId: completedMatchId,
              rank: row.rank,
              highestRank: row.highestRank,
              matchesPlayed: row.matchesPlayed,
              wins: row.wins,
              losses: row.losses,
              points: row.points,
              winRate: row.winRate,
            },
          }),
        ),
      );
    }

    const notifySet = new Set(notifyTeamIds);
    const affectedRows = rows.filter((row) => notifySet.has(row.teamId));

    await Promise.all(
      affectedRows.map((row) =>
        this.notificationsService.createNotification({
          userId: row.captainId,
          title: 'Leaderboard updated',
          message: `${tournament.name}: ${row.teamName} is now rank #${row.rank} with ${row.points} points.`,
          type: 'LEADERBOARD_UPDATED',
          metadata: {
            tournamentId,
            teamId: row.teamId,
            rank: row.rank,
            points: row.points,
            wins: row.wins,
            losses: row.losses,
          },
        }),
      ),
    );

    return rows;
  }

  async getTournamentLeaderboard(tournamentId: string) {
    const rows = await this.recalculateTournamentLeaderboard(tournamentId);

    return {
      message: 'Get tournament leaderboard successfully',
      data: rows,
    };
  }

  async getMyTeamRankingHistory(userId: string) {
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            captainId: true,
            totalMatchesPlayed: true,
            totalWins: true,
            totalLosses: true,
            championCount: true,
            overallWinRate: true,
          },
        },
      },
    });

    if (!teamMember) {
      return {
        message: 'You are not in any team',
        data: null,
      };
    }

    const [leaderboardEntries, snapshots] = await Promise.all([
      this.prisma.tournamentLeaderboard.findMany({
        where: { teamId: teamMember.teamId },
        include: {
          tournament: {
            select: {
              id: true,
              name: true,
              game: true,
              status: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.teamRankingHistory.findMany({
        where: { teamId: teamMember.teamId },
        include: {
          tournament: {
            select: {
              id: true,
              name: true,
              game: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const totals = leaderboardEntries.reduce(
      (acc, row) => ({
        matchesPlayed: acc.matchesPlayed + row.matchesPlayed,
        wins: acc.wins + row.wins,
        losses: acc.losses + row.losses,
        points: acc.points + row.points,
      }),
      {
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        points: 0,
      },
    );

    const latestEntry = leaderboardEntries[0] ?? null;
    const highestRank = leaderboardEntries
      .filter((row) => row.highestRank > 0)
      .reduce<
        number | null
      >((best, row) => (best === null ? row.highestRank : Math.min(best, row.highestRank)), null);
    const winRate =
      totals.matchesPlayed === 0
        ? 0
        : Number(((totals.wins / totals.matchesPlayed) * 100).toFixed(1));

    return {
      message: 'Get team ranking history successfully',
      data: {
        team: teamMember.team,
        currentRank: latestEntry?.rank ?? null,
        highestRank,
        winRate,
        ...totals,
        overall: {
          matchesPlayed: teamMember.team.totalMatchesPlayed,
          wins: teamMember.team.totalWins,
          losses: teamMember.team.totalLosses,
          championCount: teamMember.team.championCount,
          winRate: teamMember.team.overallWinRate,
        },
        tournamentHistory: leaderboardEntries.map((row) => ({
          tournamentId: row.tournamentId,
          tournamentName: row.tournament.name,
          game: row.tournament.game,
          status: row.tournament.status,
          rank: row.rank,
          highestRank: row.highestRank,
          matchesPlayed: row.matchesPlayed,
          wins: row.wins,
          losses: row.losses,
          points: row.points,
          winRate: row.winRate,
          updatedAt: row.updatedAt,
        })),
        snapshots: snapshots.map((row) => ({
          tournamentId: row.tournamentId,
          tournamentName: row.tournament.name,
          game: row.tournament.game,
          matchId: row.matchId,
          rank: row.rank,
          highestRank: row.highestRank,
          matchesPlayed: row.matchesPlayed,
          wins: row.wins,
          losses: row.losses,
          points: row.points,
          winRate: row.winRate,
          createdAt: row.createdAt,
        })),
      },
    };
  }
}
