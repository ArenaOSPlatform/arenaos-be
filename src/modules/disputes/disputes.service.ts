import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { UserRole } from '../auth/constants/user-role';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime/realtime.gateway';
import { TournamentCompletionService } from '../tournament-completion.service';
import { validateBestOfScore } from '../matches/match-score.util';
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
    private readonly realtimeGateway: RealtimeGateway,
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

    const membership = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: {
          in: [match.teamAId, match.teamBId].filter(Boolean) as string[],
        },
      },
      include: {
        team: {
          select: {
            captainId: true,
          },
        },
      },
    });

    if (!membership || membership.team.captainId !== userId) {
      throw new BadRequestException(
        'Only a captain from this match can create dispute',
      );
    }

    const evidenceUrl = dto.fileUrl ?? dto.imageUrl;

    const { dispute, updatedMatch } = await this.prisma.$transaction(
      async (transaction) => {
        if (evidenceUrl) {
          await transaction.matchEvidence.create({
            data: {
              matchId,
              submittedBy: userId,
              imageUrl: evidenceUrl,
              fileUrl: evidenceUrl,
              type: dto.type ?? 'SCREENSHOT',
              note: 'Dispute evidence',
            },
          });
        }

        const createdDispute = await transaction.dispute.create({
          data: {
            matchId,
            createdBy: userId,
            teamId: membership.teamId,
            reason: dto.reason,
            description: dto.description,
          },
        });

        const disputedMatch = await transaction.match.update({
          where: { id: matchId },
          data: { status: 'DISPUTED' },
        });

        return {
          dispute: createdDispute,
          updatedMatch: disputedMatch,
        };
      },
      { timeout: 30_000 },
    );

    await this.auditLogsService.createLog(
      userId,
      'CREATE_DISPUTE',
      'DISPUTE',
      dispute.id,
      {
        matchId,
        tournamentId: match.tournamentId,
        teamId: membership.teamId,
      },
    );

    this.realtimeGateway.emitMatchEvent(
      matchId,
      'match:disputed',
      updatedMatch,
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      updatedMatch,
    );

    return {
      message: 'Create dispute successfully',
      data: dispute,
    };
  }

  async getDisputes(userId: string, userRole: UserRole) {
    const teamIds =
      userRole === UserRole.PLAYER
        ? (
            await this.prisma.teamMember.findMany({
              where: { userId },
              select: { teamId: true },
            })
          ).map((membership) => membership.teamId)
        : [];
    const disputes = await this.prisma.dispute.findMany({
      where:
        userRole === UserRole.ADMIN
          ? undefined
          : userRole === UserRole.ORGANIZER
            ? { match: { tournament: { organizerId: userId } } }
            : {
                OR: [
                  { createdBy: userId },
                  ...(teamIds.length > 0 ? [{ teamId: { in: teamIds } }] : []),
                ],
              },
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

  async getDispute(disputeId: string, userId: string, userRole: UserRole) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        match: {
          include: {
            evidences: true,
            tournament: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new BadRequestException('Dispute not found');
    }

    const isOrganizer = dispute.match.tournament.organizerId === userId;
    const isCreator = dispute.createdBy === userId;
    const isTeamMember = dispute.teamId
      ? Boolean(
          await this.prisma.teamMember.findUnique({
            where: {
              teamId_userId: {
                teamId: dispute.teamId,
                userId,
              },
            },
            select: { id: true },
          }),
        )
      : false;

    if (
      userRole !== UserRole.ADMIN &&
      !isOrganizer &&
      !isCreator &&
      !isTeamMember
    ) {
      throw new ForbiddenException('You cannot access this dispute');
    }

    return {
      message: 'Get dispute successfully',
      data: dispute,
    };
  }

  async requestEvidence(
    disputeId: string,
    userId: string,
    userRole: UserRole,
    message?: string,
  ) {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        match: {
          include: {
            tournament: true,
          },
        },
      },
    });

    if (!dispute) {
      throw new BadRequestException('Dispute not found');
    }

    const canRequest =
      userRole === UserRole.ADMIN ||
      dispute.match.tournament.organizerId === userId;

    if (!canRequest) {
      throw new BadRequestException(
        'Only organizer or admin can request evidence',
      );
    }

    if (dispute.status === 'RESOLVED') {
      throw new BadRequestException(
        'Resolved disputes cannot request evidence',
      );
    }

    const updated = await this.prisma.dispute.update({
      where: { id: disputeId },
      data: {
        status: 'EVIDENCE_REQUESTED',
        decisionReason: message?.trim() || 'More evidence requested',
      },
    });

    const teamIds = [dispute.match.teamAId, dispute.match.teamBId].filter(
      Boolean,
    ) as string[];

    await this.notifyTeamMembers(teamIds, {
      title: 'More dispute evidence requested',
      message:
        message ??
        `${dispute.match.tournament.name} dispute needs more evidence.`,
      type: 'DISPUTE_EVIDENCE_REQUESTED',
      metadata: {
        disputeId,
        matchId: dispute.matchId,
        tournamentId: dispute.match.tournamentId,
      },
    });

    await this.auditLogsService.createLog(
      userId,
      'REQUEST_DISPUTE_EVIDENCE',
      'DISPUTE',
      disputeId,
      {
        matchId: dispute.matchId,
        tournamentId: dispute.match.tournamentId,
        message,
      },
    );

    return {
      message: 'Request evidence successfully',
      data: updated,
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

    const decisionReason = dto.decisionReason.trim();

    if (!decisionReason) {
      throw new BadRequestException('Decision reason is required');
    }

    let updatedMatchStatus = 'COMPLETED';
    let resultStatus = 'RESOLVED';
    let winnerId: string | null = null;
    let scoreA = match.pendingScoreA;
    let scoreB = match.pendingScoreB;

    if (dto.scoreA !== undefined || dto.scoreB !== undefined) {
      if (dto.scoreA === undefined || dto.scoreB === undefined) {
        throw new BadRequestException(
          'Both scoreA and scoreB are required when changing result',
        );
      }

      validateBestOfScore(match.bestOf, dto.scoreA, dto.scoreB);
      scoreA = dto.scoreA;
      scoreB = dto.scoreB;
    }

    if (dto.decision === 'KEEP_RESULT') {
      if (scoreA === null || scoreB === null) {
        throw new BadRequestException('Pending result is incomplete');
      }

      validateBestOfScore(match.bestOf, scoreA, scoreB);
      winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
    }

    if (dto.decision === 'CHANGE_RESULT') {
      if (dto.scoreA === undefined || dto.scoreB === undefined) {
        throw new BadRequestException(
          'scoreA and scoreB are required for CHANGE_RESULT',
        );
      }

      winnerId = dto.scoreA > dto.scoreB ? match.teamAId : match.teamBId;
      resultStatus = 'CHANGED_BY_DISPUTE';
    }

    if (
      dto.decision === 'APPROVE_TEAM_A_RESULT' ||
      dto.decision === 'TECHNICAL_WIN_TEAM_A' ||
      dto.decision === 'DISQUALIFY_TEAM_B'
    ) {
      winnerId = match.teamAId;
    }

    if (
      dto.decision === 'APPROVE_TEAM_B_RESULT' ||
      dto.decision === 'TECHNICAL_WIN_TEAM_B' ||
      dto.decision === 'DISQUALIFY_TEAM_A'
    ) {
      winnerId = match.teamBId;
    }

    if (dto.decision.startsWith('TECHNICAL_WIN')) {
      resultStatus = 'TECHNICAL_WIN';
    }

    if (dto.decision.startsWith('DISQUALIFY')) {
      resultStatus = 'DISQUALIFIED';
    }

    if (dto.decision === 'REMATCH') {
      updatedMatchStatus = 'READY';
      resultStatus = 'REMATCH';
    } else {
      if (scoreA === null || scoreB === null) {
        if (
          resultStatus === 'TECHNICAL_WIN' ||
          resultStatus === 'DISQUALIFIED'
        ) {
          scoreA = winnerId === match.teamAId ? 1 : 0;
          scoreB = winnerId === match.teamBId ? 1 : 0;
        } else {
          throw new BadRequestException('Pending result is incomplete');
        }
      }

      if (!winnerId) {
        throw new BadRequestException('Winner cannot be determined');
      }
    }

    const completedResult =
      dto.decision === 'REMATCH'
        ? null
        : {
            scoreA: scoreA as number,
            scoreB: scoreB as number,
            winnerId: winnerId as string,
          };

    const resolved = await this.prisma.$transaction(
      async (transaction) => {
        const updatedDispute = await transaction.dispute.update({
          where: { id: disputeId },
          data: {
            status: 'RESOLVED',
            decision: dto.decision,
            decisionReason,
            resolvedBy: userId,
            resolvedAt: new Date(),
          },
        });

        if (!completedResult) {
          await transaction.match.update({
            where: { id: dispute.matchId },
            data: {
              status: updatedMatchStatus,
              resultStatus,
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

          return updatedDispute;
        }

        await transaction.match.update({
          where: { id: dispute.matchId },
          data: {
            status: updatedMatchStatus,
            resultStatus,
            scoreA: completedResult.scoreA,
            scoreB: completedResult.scoreB,
            winnerId: completedResult.winnerId,
          },
        });

        if (match.nextMatchId && match.nextSlot) {
          await transaction.match.update({
            where: { id: match.nextMatchId },
            data:
              match.nextSlot === 'A'
                ? { teamAId: completedResult.winnerId }
                : { teamBId: completedResult.winnerId },
          });
        }

        return updatedDispute;
      },
      { timeout: 30_000 },
    );

    if (completedResult) {
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
        decisionReason,
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
        decisionReason,
        winnerId,
      },
    });

    this.realtimeGateway.emitMatchEvent(
      dispute.matchId,
      dto.decision === 'REMATCH' ? 'match:disputed' : 'match:completed',
      {
        disputeId,
        matchId: dispute.matchId,
        status: updatedMatchStatus,
        decision: dto.decision,
        winnerId,
      },
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      {
        disputeId,
        matchId: dispute.matchId,
        status: updatedMatchStatus,
        decision: dto.decision,
        winnerId,
      },
    );

    return {
      message: 'Resolve dispute successfully',
      data: resolved,
    };
  }
}
