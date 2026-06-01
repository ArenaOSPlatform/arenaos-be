import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TournamentCompletionService } from '../tournament-completion.service';
import { DisputeMatchResultDto } from './dto/dispute-match-result.dto';
import { ScheduleMatchDto } from './dto/schedule-match.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';
import { UpdateMatchResultDto } from './dto/update-match-result.dto';

type MatchTeamSlot = 'A' | 'B';

type CaptainMembership = {
  teamId: string;
  slot: MatchTeamSlot;
};

@Injectable()
export class MatchesService implements OnModuleInit {
  private readonly reminderTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  private readonly reminderLeadMs = 15 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly leaderboardsService: LeaderboardsService,
    private readonly tournamentCompletionService: TournamentCompletionService,
  ) {}

  async onModuleInit() {
    const scheduledMatches = await this.prisma.match.findMany({
      where: {
        scheduledAt: {
          gt: new Date(),
        },
        status: {
          notIn: ['COMPLETED', 'CANCELLED'],
        },
      },
      select: {
        id: true,
        scheduledAt: true,
      },
    });

    scheduledMatches.forEach((match) => {
      if (match.scheduledAt) {
        this.scheduleReminder(match.id, match.scheduledAt);
      }
    });
  }

  private async getCaptainMembership(
    match: { teamAId: string | null; teamBId: string | null },
    userId: string,
  ): Promise<CaptainMembership> {
    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    const membership = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: {
          in: [match.teamAId, match.teamBId],
        },
      },
      include: {
        team: {
          select: {
            id: true,
            captainId: true,
          },
        },
      },
    });

    if (!membership) {
      throw new BadRequestException('User does not belong to this match');
    }

    if (membership.team.captainId !== userId) {
      throw new BadRequestException(
        'Only team captain can perform this action',
      );
    }

    return {
      teamId: membership.teamId,
      slot: membership.teamId === match.teamAId ? 'A' : 'B',
    };
  }

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

  private async notifyTournamentAudience(
    tournamentId: string,
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
        OR: [
          {
            teamId: {
              in: teamIds,
            },
          },
          {
            team: {
              registrations: {
                some: {
                  tournamentId,
                  status: {
                    in: ['PENDING', 'APPROVED'],
                  },
                },
              },
            },
          },
        ],
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

  private scheduleReminder(matchId: string, scheduledAt: Date) {
    const existingTimer = this.reminderTimers.get(matchId);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const reminderAt = scheduledAt.getTime() - this.reminderLeadMs;
    const delay = Math.max(0, reminderAt - Date.now());

    const timer = setTimeout(() => {
      void this.sendMatchReminder(matchId);
      this.reminderTimers.delete(matchId);
    }, delay);

    this.reminderTimers.set(matchId, timer);
  }

  private async sendMatchReminder(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
      },
    });

    if (!match || !match.teamAId || !match.teamBId || !match.scheduledAt) {
      return;
    }

    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      return;
    }

    await this.notifyTeamMembers([match.teamAId, match.teamBId], {
      title: 'Match starts soon',
      message: `${match.tournament.name} match starts in 15 minutes. Room: ${match.roomCode ?? 'TBA'}.`,
      type: 'MATCH_REMINDER',
      metadata: {
        matchId,
        tournamentId: match.tournamentId,
        scheduledAt: match.scheduledAt,
        roomCode: match.roomCode,
      },
    });
  }

  async scheduleMatch(
    matchId: string,
    organizerId: string,
    dto: ScheduleMatchDto,
  ) {
    const scheduledAt = new Date(dto.scheduledAt);
    const roomCode = dto.roomCode.trim();
    const livestreamUrl = dto.livestreamUrl?.trim() || null;

    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Invalid scheduled time');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('Scheduled time must be in the future');
    }

    if (!roomCode) {
      throw new BadRequestException('Room code is required');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    if (match.tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can schedule match');
    }

    if (match.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    if (match.status === 'COMPLETED') {
      throw new BadRequestException('Match is already completed');
    }

    if (match.status === 'CANCELLED') {
      throw new BadRequestException('Match is cancelled');
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    const nextStatus =
      match.status === 'PENDING' || match.status === 'MATCH_SCHEDULED'
        ? 'MATCH_SCHEDULED'
        : match.status;

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        scheduledAt,
        roomCode,
        livestreamUrl,
        status: nextStatus,
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    await this.auditLogsService.createLog(
      organizerId,
      'SCHEDULE_MATCH',
      'MATCH',
      matchId,
      {
        tournamentId: match.tournamentId,
        tournamentName: match.tournament.name,
        scheduledAt,
        roomCode,
        livestreamUrl,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
      },
    );

    await this.notifyTeamMembers([match.teamAId, match.teamBId], {
      title: 'Match scheduled',
      message: `${match.tournament.name} match is scheduled for ${scheduledAt.toLocaleString()}.`,
      type: 'MATCH_SCHEDULED',
      metadata: {
        matchId,
        tournamentId: match.tournamentId,
        scheduledAt,
        roomCode,
        livestreamUrl,
      },
    });

    this.scheduleReminder(matchId, scheduledAt);

    return {
      message: 'Match scheduled successfully',
      data: updated,
    };
  }

  async updateLivestream(
    matchId: string,
    organizerId: string,
    dto: UpdateLivestreamDto,
  ) {
    const livestreamUrl = dto.livestreamUrl.trim();

    try {
      const url = new URL(livestreamUrl);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('Invalid protocol');
      }
    } catch {
      throw new BadRequestException('Invalid livestream URL');
    }

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    if (match.tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can update livestream');
    }

    if (match.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      throw new BadRequestException('Match is already completed or cancelled');
    }

    if (match.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Match must be in progress before livestream starts',
      );
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        livestreamUrl,
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    await this.auditLogsService.createLog(
      organizerId,
      'UPDATE_LIVESTREAM',
      'MATCH',
      matchId,
      {
        tournamentId: match.tournamentId,
        tournamentName: match.tournament.name,
        livestreamUrl,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
      },
    );

    await this.notifyTournamentAudience(
      match.tournamentId,
      [match.teamAId, match.teamBId],
      {
        title: 'Livestream is live',
        message: `${match.tournament.name} match is live now.`,
        type: 'MATCH_LIVESTREAM_UPDATED',
        metadata: {
          matchId,
          tournamentId: match.tournamentId,
          livestreamUrl,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
        },
      },
    );

    return {
      message: 'Livestream updated successfully',
      data: updated,
    };
  }

  async checkIn(matchId: string, userId: string) {
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

    if (match.status === 'COMPLETED' || match.status === 'CANCELLED') {
      throw new BadRequestException('Match is already completed or cancelled');
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    const matchTeamIds = [match.teamAId, match.teamBId];
    const membership = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: {
          in: matchTeamIds,
        },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            captainId: true,
          },
        },
      },
    });

    if (!membership) {
      throw new BadRequestException('User does not belong to this match');
    }

    if (membership.team.captainId !== userId) {
      throw new BadRequestException('Only team captain can check in');
    }

    const checkedInAt = new Date();

    if (membership.teamId === match.teamAId) {
      if (match.teamACheckedInAt) {
        throw new BadRequestException('Team A has already checked in');
      }

      const nextStatus = match.teamBCheckedInAt ? 'READY' : 'TEAM_A_CHECKED_IN';

      const updated = await this.prisma.match.update({
        where: { id: matchId },
        data: {
          teamACheckedInAt: checkedInAt,
          teamACheckedInBy: userId,
          status: nextStatus,
        },
        include: {
          tournament: true,
          bracket: true,
        },
      });

      return {
        message:
          nextStatus === 'READY'
            ? 'Both teams checked in. Match is ready'
            : 'Team A checked in successfully',
        data: updated,
      };
    }

    if (match.teamBCheckedInAt) {
      throw new BadRequestException('Team B has already checked in');
    }

    const nextStatus = match.teamACheckedInAt ? 'READY' : 'TEAM_B_CHECKED_IN';

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        teamBCheckedInAt: checkedInAt,
        teamBCheckedInBy: userId,
        status: nextStatus,
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    return {
      message:
        nextStatus === 'READY'
          ? 'Both teams checked in. Match is ready'
          : 'Team B checked in successfully',
      data: updated,
    };
  }

  async startMatch(matchId: string, organizerId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    if (match.tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can start match');
    }

    if (match.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    if (match.status === 'COMPLETED') {
      throw new BadRequestException('Match is already completed');
    }

    if (match.status === 'CANCELLED') {
      throw new BadRequestException('Match is cancelled');
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    if (!match.teamACheckedInAt || !match.teamBCheckedInAt) {
      throw new BadRequestException(
        'Both teams must check in before match start',
      );
    }

    if (match.status !== 'READY') {
      throw new BadRequestException('Match must be ready before start');
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        status: 'IN_PROGRESS',
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    await this.auditLogsService.createLog(
      organizerId,
      'START_MATCH',
      'MATCH',
      matchId,
      {
        tournamentId: match.tournamentId,
        tournamentName: match.tournament.name,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
      },
    );

    const teamMembers = await this.prisma.teamMember.findMany({
      where: {
        teamId: {
          in: [match.teamAId, match.teamBId],
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
          title: 'Match started',
          message: `${match.tournament.name} match is now in progress.`,
          type: 'MATCH_STARTED',
          metadata: {
            matchId,
            tournamentId: match.tournamentId,
            teamAId: match.teamAId,
            teamBId: match.teamBId,
          },
        }),
      ),
    );

    return {
      message: 'Match started successfully',
      data: updated,
    };
  }

  async submitResult(
    matchId: string,
    userId: string,
    dto: SubmitMatchResultDto,
  ) {
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

    if (match.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Match must be in progress to submit result',
      );
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    if (dto.scoreA === dto.scoreB) {
      throw new BadRequestException('Draw result is not allowed');
    }

    const membership = await this.getCaptainMembership(match, userId);
    const opposingTeamId =
      membership.teamId === match.teamAId ? match.teamBId : match.teamAId;

    const evidence = await this.prisma.matchEvidence.create({
      data: {
        matchId,
        submittedBy: userId,
        imageUrl: dto.imageUrl,
        note: dto.note,
      },
    });

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        pendingScoreA: dto.scoreA,
        pendingScoreB: dto.scoreB,
        resultStatus: 'PENDING_CONFIRMATION',
        resultSubmittedBy: userId,
        resultSubmittedTeamId: membership.teamId,
        resultSubmittedAt: new Date(),
        resultEvidenceId: evidence.id,
        status: 'PENDING_CONFIRMATION',
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    await this.auditLogsService.createLog(
      userId,
      'SUBMIT_MATCH_RESULT',
      'MATCH',
      matchId,
      {
        tournamentId: match.tournamentId,
        submittedTeamId: membership.teamId,
        scoreA: dto.scoreA,
        scoreB: dto.scoreB,
        evidenceId: evidence.id,
      },
    );

    await this.notifyTeamMembers([opposingTeamId], {
      title: 'Match result needs confirmation',
      message: `${match.tournament.name} result was submitted. Please confirm or dispute.`,
      type: 'MATCH_RESULT_PENDING_CONFIRMATION',
      metadata: {
        matchId,
        tournamentId: match.tournamentId,
        submittedTeamId: membership.teamId,
      },
    });

    return {
      message: 'Match result submitted for confirmation',
      data: updated,
    };
  }

  async confirmResult(matchId: string, userId: string) {
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

    if (match.status !== 'PENDING_CONFIRMATION') {
      throw new BadRequestException('Match result is not pending confirmation');
    }

    if (
      match.pendingScoreA === null ||
      match.pendingScoreB === null ||
      !match.resultSubmittedTeamId
    ) {
      throw new BadRequestException('Pending result is incomplete');
    }

    const membership = await this.getCaptainMembership(match, userId);

    if (membership.teamId === match.resultSubmittedTeamId) {
      throw new BadRequestException(
        'Submitting team cannot confirm its own result',
      );
    }

    const winnerId =
      match.pendingScoreA > match.pendingScoreB ? match.teamAId : match.teamBId;

    if (!winnerId) {
      throw new BadRequestException('Winner cannot be determined');
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        scoreA: match.pendingScoreA,
        scoreB: match.pendingScoreB,
        winnerId,
        resultStatus: 'CONFIRMED',
        status: 'COMPLETED',
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    await this.advanceWinner(match, winnerId);
    await this.leaderboardsService.recalculateTournamentLeaderboard(
      match.tournamentId,
      matchId,
      [match.teamAId!, match.teamBId!],
    );
    await this.tournamentCompletionService.completeIfFinalMatch(
      matchId,
      userId,
      'CONFIRM_MATCH_RESULT',
    );

    await this.auditLogsService.createLog(
      userId,
      'CONFIRM_MATCH_RESULT',
      'MATCH',
      matchId,
      {
        tournamentId: match.tournamentId,
        confirmedByTeamId: membership.teamId,
        winnerId,
        scoreA: match.pendingScoreA,
        scoreB: match.pendingScoreB,
      },
    );

    await this.notifyTeamMembers([match.teamAId!, match.teamBId!], {
      title: 'Match result confirmed',
      message: `${match.tournament.name} match is completed.`,
      type: 'MATCH_RESULT_CONFIRMED',
      metadata: {
        matchId,
        tournamentId: match.tournamentId,
        winnerId,
      },
    });

    return {
      message: 'Match result confirmed successfully',
      data: updated,
    };
  }

  async disputeResult(
    matchId: string,
    userId: string,
    dto: DisputeMatchResultDto,
  ) {
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

    if (match.status !== 'PENDING_CONFIRMATION') {
      throw new BadRequestException('Match result is not pending confirmation');
    }

    if (!match.resultSubmittedTeamId) {
      throw new BadRequestException('Pending result is incomplete');
    }

    const membership = await this.getCaptainMembership(match, userId);

    if (membership.teamId === match.resultSubmittedTeamId) {
      throw new BadRequestException(
        'Submitting team cannot dispute its own result',
      );
    }

    if (dto.imageUrl) {
      await this.prisma.matchEvidence.create({
        data: {
          matchId,
          submittedBy: userId,
          imageUrl: dto.imageUrl,
          note: dto.note ?? 'Dispute evidence',
        },
      });
    }

    const dispute = await this.prisma.dispute.create({
      data: {
        matchId,
        createdBy: userId,
        reason: dto.reason,
        description: dto.description,
      },
    });

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        resultStatus: 'DISPUTED',
        status: 'DISPUTED',
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    await this.auditLogsService.createLog(
      userId,
      'DISPUTE_MATCH_RESULT',
      'MATCH',
      matchId,
      {
        tournamentId: match.tournamentId,
        disputeId: dispute.id,
        disputedByTeamId: membership.teamId,
        reason: dto.reason,
      },
    );

    await this.notificationsService.createNotification({
      userId: match.tournament.organizerId,
      title: 'Match result disputed',
      message: `${match.tournament.name} has a disputed match result.`,
      type: 'MATCH_RESULT_DISPUTED',
      metadata: {
        matchId,
        tournamentId: match.tournamentId,
        disputeId: dispute.id,
      },
    });

    return {
      message: 'Match result disputed successfully',
      data: updated,
    };
  }

  async updateResult(
    matchId: string,
    organizerId: string,
    dto: UpdateMatchResultDto,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    if (match.tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can update match result');
    }

    if (match.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match teams are not ready');
    }

    if (match.status !== 'IN_PROGRESS') {
      throw new BadRequestException(
        'Match must be in progress before submitting result',
      );
    }

    if (dto.scoreA === dto.scoreB) {
      throw new BadRequestException('Draw result is not allowed');
    }

    const winnerId = dto.scoreA > dto.scoreB ? match.teamAId : match.teamBId;

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        scoreA: dto.scoreA,
        scoreB: dto.scoreB,
        winnerId,
        status: 'COMPLETED',
      },
    });

    if (match.nextMatchId && match.nextSlot) {
      await this.prisma.match.update({
        where: { id: match.nextMatchId },
        data:
          match.nextSlot === 'A'
            ? { teamAId: winnerId }
            : { teamBId: winnerId },
      });
    }

    await this.leaderboardsService.recalculateTournamentLeaderboard(
      match.tournamentId,
      matchId,
      [match.teamAId, match.teamBId],
    );
    await this.tournamentCompletionService.completeIfFinalMatch(
      matchId,
      organizerId,
      'UPDATE_MATCH_RESULT',
    );

    return {
      message: 'Update match result successfully',
      data: updated,
    };
  }

  async findOne(matchId: string) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    const teamIds = [
      ...new Set(
        [match.teamAId, match.teamBId, match.winnerId].filter(
          Boolean,
        ) as string[],
      ),
    ];
    const teams = await this.prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
      },
      select: {
        id: true,
        name: true,
        logoUrl: true,
      },
    });
    const teamById = new Map(teams.map((team) => [team.id, team]));

    return {
      message: 'Get match successfully',
      data: {
        ...match,
        teamA: match.teamAId ? (teamById.get(match.teamAId) ?? null) : null,
        teamB: match.teamBId ? (teamById.get(match.teamBId) ?? null) : null,
        winnerTeam: match.winnerId
          ? (teamById.get(match.winnerId) ?? null)
          : null,
      },
    };
  }
}
