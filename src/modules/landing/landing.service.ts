import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const publicTournamentStatuses = [
  'OPEN_REGISTRATION',
  'REGISTRATION_CLOSED',
  'BRACKET_GENERATED',
  'COMPLETED',
];

@Injectable()
export class LandingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    const [tournaments, topTeams, bracket] = await Promise.all([
      this.getFeaturedTournaments(),
      this.getTopTeams(),
      this.getBracketPreview(),
    ]);

    return {
      message: 'Get landing overview successfully',
      data: {
        tournaments,
        topTeams,
        bracket,
      },
    };
  }

  private async getFeaturedTournaments() {
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: {
          in: publicTournamentStatuses,
        },
      },
      select: {
        id: true,
        name: true,
        game: true,
        status: true,
        maxTeams: true,
        prizePool: true,
        rules: true,
        startDate: true,
        registrationDeadline: true,
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 3,
    });

    return tournaments.map((tournament) => ({
      id: tournament.id,
      name: tournament.name,
      game: tournament.game,
      status: tournament.status,
      teams: tournament._count.registrations,
      maxTeams: tournament.maxTeams,
      prize: tournament.prizePool,
      rules: tournament.rules,
      startDate: tournament.startDate,
      registrationDeadline: tournament.registrationDeadline,
      matches: tournament._count.matches,
    }));
  }

  private async getTopTeams() {
    const teams = await this.prisma.team.findMany({
      select: {
        id: true,
        name: true,
        totalMatchesPlayed: true,
        totalWins: true,
        totalLosses: true,
        championCount: true,
        overallWinRate: true,
      },
      orderBy: [
        { championCount: 'desc' },
        { totalWins: 'desc' },
        { overallWinRate: 'desc' },
        { createdAt: 'asc' },
      ],
      take: 4,
    });

    return teams.map((team, index) => ({
      id: team.id,
      rank: index + 1,
      name: team.name,
      matchesPlayed: team.totalMatchesPlayed,
      wins: team.totalWins,
      losses: team.totalLosses,
      championCount: team.championCount,
      winRate: team.overallWinRate,
    }));
  }

  private async getBracketPreview() {
    const bracket = await this.prisma.bracket.findFirst({
      where: {
        tournament: {
          status: {
            in: ['BRACKET_GENERATED', 'COMPLETED'],
          },
        },
      },
      select: {
        id: true,
        tournament: {
          select: {
            id: true,
            name: true,
            game: true,
            format: true,
          },
        },
        matches: {
          select: {
            id: true,
            roundNumber: true,
            matchNumber: true,
            teamAId: true,
            teamBId: true,
            winnerId: true,
            scoreA: true,
            scoreB: true,
            status: true,
          },
          orderBy: [{ roundNumber: 'asc' }, { matchNumber: 'asc' }],
          take: 3,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!bracket) {
      return null;
    }

    const teamIds = [
      ...new Set(
        bracket.matches.flatMap((match) =>
          [match.teamAId, match.teamBId, match.winnerId].filter(Boolean),
        ),
      ),
    ] as string[];

    const teams = await this.prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const teamNameById = new Map(teams.map((team) => [team.id, team.name]));

    return {
      id: bracket.id,
      tournament: bracket.tournament,
      matches: bracket.matches.map((match) => ({
        id: match.id,
        roundNumber: match.roundNumber,
        matchNumber: match.matchNumber,
        left: match.teamAId ? teamNameById.get(match.teamAId) : null,
        right: match.teamBId ? teamNameById.get(match.teamBId) : null,
        winner: match.winnerId ? teamNameById.get(match.winnerId) : null,
        score:
          match.status === 'COMPLETED'
            ? `${match.scoreA} - ${match.scoreB}`
            : match.status,
        status: match.status,
      })),
    };
  }
}
