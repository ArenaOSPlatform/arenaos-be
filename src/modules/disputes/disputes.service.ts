import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserRole } from '../auth/constants/user-role';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TournamentCompletionService } from '../tournament-completion.service';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';

@Injectable()
export class DisputesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly leaderboardsService: LeaderboardsService,
    private readonly tournamentCompletionService: TournamentCompletionService,
  ) {}

  private async notifyTeamMembers(
    teamIds: string[],
    data: {
      title: string;
      message: string;
      type: string;
      metadata?: unknown;
    },
  ) {
    const teamMembers = await this.prisma.teamMember.findMany({
      where: {
        teamId: {
          in: teamIds,
        },
      },
      select: {
        userId: true,
      },
    });

    const userIds = [...new Set(teamMembers.map((member) => member.userId))];

    await Promise.all(
      userIds.map((userId) =>
        this.notificationsService.createNotification({
          userId,
          ...data,
        }),
      ),
    );
  }

  private async advanceWinner(
    match: {
      nextMatchId: string | null;
      nextSlot: string | null;
    },
    winnerId: string,
  ) {
    if (!match.nextMatchId || !match.nextSlot) return;

    await this.prisma.match.update({
      where: { id: match.nextMatchId },
      data:
        match.nextSlot === 'A' ? { teamAId: winnerId } : { teamBId: winnerId },
    });
  }

  async createDispute(matchId: string, userId: string, dto: CreateDisputeDto) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    if (match.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        matchId,
        createdBy: userId,
        reason: dto.reason,
        description: dto.description,
      },
    });

    await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'DISPUTED' },
    });

    return {
      message: 'Create dispute successfully',
      data: dispute,
    };
  }

  async getDisputes() {
    const disputes = await this.prisma.dispute.findMany({
      include: {
        match: {
          include: {
            evidences: true,
            tournament: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Get disputes successfully',
      data: disputes,
    };
  }

  async resolveDispute(
    disputeId: string,
    userId: string,
    userRole: UserRole,
    dto: ResolveDisputeDto,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        match: {
          include: {
            tournament: true,
            evidences: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new BadRequestException('Dispute not found');
    }

    const canResolve =
      userRole === UserRole.ADMIN ||
      dispute.match.tournament.organizerId === userId;

    if (!canResolve) {
      throw new BadRequestException(
        'Only organizer or admin can resolve dispute',
      );
    }

    if (dispute.match.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    if (dispute.status === 'RESOLVED') {
      throw new BadRequestException('Dispute is already resolved');
    }

    const match = dispute.match;

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    if (
      dto.decision !== 'REMATCH' &&
      (match.pendingScoreA === null || match.pendingScoreB === null)
    ) {
      throw new BadRequestException('Pending result is incomplete');
    }

    const resolved = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'RESOLVED',
        decision: dto.decision,
        resolvedBy: userId,
        resolvedAt: new Date(),
      },
    });

    let updatedMatchStatus = 'COMPLETED';
    let winnerId: string | null = null;

    if (dto.decision === 'APPROVE_TEAM_A_RESULT') {
      winnerId = match.teamAId;
    }

    if (dto.decision === 'APPROVE_TEAM_B_RESULT') {
      winnerId = match.teamBId;
    }

    if (dto.decision === 'REMATCH') {
      updatedMatchStatus = 'READY';

      await this.prisma.match.update({
        where: { id: dispute.matchId },
        data: {
          status: updatedMatchStatus,
          resultStatus: 'REMATCH',
          pendingScoreA: null,
          pendingScoreB: null,
          resultSubmittedBy: null,
          resultSubmittedTeamId: null,
          resultSubmittedAt: null,
          resultEvidenceId: null,
          scoreA: 0,
          scoreB: 0,
          winnerId: null,
        },
      });
    } else {
      if (!winnerId) {
        throw new BadRequestException('Winner cannot be determined');
      }

      await this.prisma.match.update({
        where: { id: dispute.matchId },
        data: {
          status: updatedMatchStatus,
          resultStatus: 'RESOLVED',
          scoreA: match.pendingScoreA!,
          scoreB: match.pendingScoreB!,
          winnerId,
        },
      });

      await this.advanceWinner(match, winnerId);
      await this.leaderboardsService.recalculateTournamentLeaderboard(
        match.tournamentId,
        dispute.matchId,
        [match.teamAId, match.teamBId],
      );
      await this.tournamentCompletionService.completeIfFinalMatch(
        dispute.matchId,
        userId,
        'RESOLVE_DISPUTE',
      );
    }

    await this.auditLogsService.createLog(
      userId,
      'RESOLVE_DISPUTE',
      'DISPUTE',
      disputeId,
      {
        matchId: dispute.matchId,
        tournamentId: match.tournamentId,
        decision: dto.decision,
        winnerId,
        resolvedByRole: userRole,
      },
    );

    await this.notifyTeamMembers([match.teamAId, match.teamBId], {
      title:
        dto.decision === 'REMATCH'
          ? 'Match dispute resolved: rematch'
          : 'Match dispute resolved',
      message:
        dto.decision === 'REMATCH'
          ? `${match.tournament.name} match will be replayed.`
          : `${match.tournament.name} match result was resolved.`,
      type: 'MATCH_DISPUTE_RESOLVED',
      metadata: {
        matchId: dispute.matchId,
        tournamentId: match.tournamentId,
        disputeId,
        decision: dto.decision,
        winnerId,
      },
    });

    return {
      message: 'Resolve dispute successfully',
      data: resolved,
    };
  }
}
