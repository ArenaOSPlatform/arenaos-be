import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserRole } from '../auth/constants/user-role';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime/realtime.gateway';
import { TournamentCompletionService } from '../tournament-completion.service';
import { DisputeMatchResultDto } from './dto/dispute-match-result.dto';
import { ScheduleMatchDto } from './dto/schedule-match.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';
import { UpdateMatchResultDto } from './dto/update-match-result.dto';
import { normalizeBestOf, validateBestOfScore } from './match-score.util';

type MatchTeamSlot = 'A' | 'B';

type CaptainMembership = {
  teamId: string;
  slot: MatchTeamSlot;
};

type PublicMatchPayloadSource = {
  id: string;
  tournamentId: string;
  bracketId: string;
  roundId: string | null;
  roundNumber: number;
  matchNumber: number;
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
  scoreA: number;
  scoreB: number;
  resultStatus: string | null;
  status: string;
  scheduledAt: Date | null;
  livestreamUrl: string | null;
  bestOf: string | null;
  nextMatchId: string | null;
  nextSlot: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const liveMatchStatuses = ['LIVE', 'IN_PROGRESS'];
const waitingConfirmationStatuses = [
  'WAITING_CONFIRMATION',
  'PENDING_CONFIRMATION',
];
const schedulableMatchStatuses = [
  'PENDING',
  'PENDING_SCHEDULE',
  'MATCH_SCHEDULED',
  'SCHEDULED',
];

@Injectable()
export class MatchesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchesService.name);
  private readonly reminderLeadMs = 15 * 60 * 1000;
  private readonly reminderPollMs = 30 * 1000;
  private reminderPoller?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly leaderboardsService: LeaderboardsService,
    private readonly tournamentCompletionService: TournamentCompletionService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async onModuleInit() {
    await this.processDueReminders();
    this.reminderPoller = setInterval(() => {
      void this.processDueReminders();
    }, this.reminderPollMs);
  }

  onModuleDestroy(): void {
    if (this.reminderPoller) {
      clearInterval(this.reminderPoller);
    }
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

  private toPublicMatchPayload(match: PublicMatchPayloadSource) {
    return {
      id: match.id,
      tournamentId: match.tournamentId,
      bracketId: match.bracketId,
      roundId: match.roundId,
      roundNumber: match.roundNumber,
      matchNumber: match.matchNumber,
      teamAId: match.teamAId,
      teamBId: match.teamBId,
      winnerId: match.winnerId,
      scoreA: match.scoreA,
      scoreB: match.scoreB,
      resultStatus: match.resultStatus,
      status: match.status,
      scheduledAt: match.scheduledAt,
      livestreamUrl: match.livestreamUrl,
      bestOf: match.bestOf,
      nextMatchId: match.nextMatchId,
      nextSlot: match.nextSlot,
      createdAt: match.createdAt,
      updatedAt: match.updatedAt,
    };
  }

  private async assertCanAccessMatchRoom(
    match: {
      teamAId: string | null;
      teamBId: string | null;
      tournament: {
        organizerId: string;
      };
    },
    userId: string,
    userRole: UserRole,
  ) {
    if (
      userRole === UserRole.ADMIN ||
      match.tournament.organizerId === userId
    ) {
      return;
    }

    const teamIds = [match.teamAId, match.teamBId].filter(Boolean) as string[];

    if (teamIds.length === 0) {
      throw new ForbiddenException('You cannot access this match room');
    }

    const membership = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: {
          in: teamIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You cannot access this match room');
    }
  }

  private async processDueReminders(): Promise<void> {
    const now = new Date();
    const reminderWindowEnd = new Date(now.getTime() + this.reminderLeadMs);
    const dueMatches = await this.prisma.match.findMany({
      where: {
        scheduledAt: { gt: now, lte: reminderWindowEnd },
        reminderSentAt: null,
        status: { notIn: ['COMPLETED', 'CANCELLED'] },
      },
      select: { id: true },
      take: 100,
    });

    await Promise.all(
      dueMatches.map(async ({ id }) => {
        const claimed = await this.prisma.match.updateMany({
          where: { id, reminderSentAt: null },
          data: { reminderSentAt: new Date() },
        });

        if (claimed.count === 0) {
          return;
        }

        try {
          await this.sendMatchReminder(id);
        } catch (error) {
          await this.prisma.match.update({
            where: { id },
            data: { reminderSentAt: null },
          });
          this.logger.error(
            `Failed to send match reminder for ${id}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }),
    );
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
    const bestOf = dto.bestOf?.trim() ? normalizeBestOf(dto.bestOf) : null;
    const note = dto.note?.trim() || null;

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

    const nextStatus = schedulableMatchStatuses.includes(match.status)
      ? 'SCHEDULED'
      : match.status;

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: {
        scheduledAt,
        roomCode,
        livestreamUrl,
        bestOf,
        note,
        status: nextStatus,
        reminderSentAt: null,
      },
      include: {
        tournament: true,
        bracket: true,
        evidences: true,
        checkIns: true,
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
        bestOf,
        note,
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

    this.realtimeGateway.emitMatchEvent(matchId, 'match:scheduled', updated);
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      this.toPublicMatchPayload(updated),
    );

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

    if (!liveMatchStatuses.includes(match.status)) {
      throw new BadRequestException(
        'Match must be live before livestream starts',
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
        evidences: true,
        checkIns: true,
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
      const registration = await this.prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_teamId: {
            tournamentId: match.tournamentId,
            teamId: membership.teamId,
          },
        },
        select: {
          lineupData: true,
        },
      });

      let lineupIds: string[] = [];

      if (registration?.lineupData) {
        try {
          const lineup = JSON.parse(registration.lineupData) as {
            mainPlayerIds?: string[];
            memberIds?: string[];
            substituteIds?: string[];
          };

          lineupIds = [
            ...(lineup.mainPlayerIds ?? lineup.memberIds ?? []),
            ...(lineup.substituteIds ?? []),
          ];
        } catch {
          lineupIds = [];
        }
      }

      if (!lineupIds.includes(userId)) {
        throw new BadRequestException(
          'Only captain or registered lineup players can check in',
        );
      }
    }

    if (!match.scheduledAt) {
      throw new BadRequestException('Match must be scheduled before check-in');
    }

    const checkedInAt = new Date();
    const checkInOpensAt = match.scheduledAt.getTime() - this.reminderLeadMs;

    if (checkedInAt.getTime() < checkInOpensAt) {
      throw new BadRequestException(
        'Check-in opens 15 minutes before scheduled match time',
      );
    }

    if (membership.teamId === match.teamAId) {
      if (match.teamACheckedInAt) {
        throw new BadRequestException('Team A has already checked in');
      }

      const nextStatus = match.teamBCheckedInAt ? 'READY' : 'CHECK_IN_OPEN';

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

      await this.prisma.matchCheckIn.upsert({
        where: {
          matchId_teamId: {
            matchId,
            teamId: membership.teamId,
          },
        },
        update: {
          checkedInBy: userId,
          checkedInAt,
        },
        create: {
          matchId,
          teamId: membership.teamId,
          checkedInBy: userId,
          checkedInAt,
        },
      });

      this.realtimeGateway.emitMatchEvent(
        matchId,
        'match:checkin_updated',
        updated,
      );
      this.realtimeGateway.emitTournamentEvent(
        match.tournamentId,
        'bracket:updated',
        this.toPublicMatchPayload(updated),
      );

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

    const nextStatus = match.teamACheckedInAt ? 'READY' : 'CHECK_IN_OPEN';

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

    await this.prisma.matchCheckIn.upsert({
      where: {
        matchId_teamId: {
          matchId,
          teamId: membership.teamId,
        },
      },
      update: {
        checkedInBy: userId,
        checkedInAt,
      },
      create: {
        matchId,
        teamId: membership.teamId,
        checkedInBy: userId,
        checkedInAt,
      },
    });

    this.realtimeGateway.emitMatchEvent(
      matchId,
      'match:checkin_updated',
      updated,
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      this.toPublicMatchPayload(updated),
    );

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
        status: 'LIVE',
      },
      include: {
        tournament: true,
        bracket: true,
      },
    });

    if (
      match.tournament.status === 'BRACKET_GENERATED' ||
      match.tournament.status === 'CHECK_IN_PHASE'
    ) {
      await this.prisma.tournament.update({
        where: { id: match.tournamentId },
        data: { status: 'ONGOING' },
      });
    }

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

    this.realtimeGateway.emitMatchEvent(matchId, 'match:live', updated);
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'tournament:status_changed',
      { tournamentId: match.tournamentId, status: 'ONGOING' },
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

    if (!liveMatchStatuses.includes(match.status)) {
      throw new BadRequestException('Match must be live to submit result');
    }

    if (!match.teamAId || !match.teamBId) {
      throw new BadRequestException('Match does not have enough teams');
    }

    validateBestOfScore(match.bestOf, dto.scoreA, dto.scoreB);

    const membership = await this.getCaptainMembership(match, userId);
    const opposingTeamId =
      membership.teamId === match.teamAId ? match.teamBId : match.teamAId;

    const { evidence, updated } = await this.prisma.$transaction(
      async (transaction) => {
        const createdEvidence = await transaction.matchEvidence.create({
          data: {
            matchId,
            submittedBy: userId,
            imageUrl: dto.imageUrl,
            fileUrl: dto.fileUrl ?? dto.imageUrl,
            type: dto.type ?? 'SCREENSHOT',
            note: dto.note,
          },
        });

        const updatedMatch = await transaction.match.update({
          where: { id: matchId },
          data: {
            pendingScoreA: dto.scoreA,
            pendingScoreB: dto.scoreB,
            resultStatus: 'PENDING_CONFIRMATION',
            resultSubmittedBy: userId,
            resultSubmittedTeamId: membership.teamId,
            resultSubmittedAt: new Date(),
            resultEvidenceId: createdEvidence.id,
            status: 'WAITING_CONFIRMATION',
          },
          include: {
            tournament: true,
            bracket: true,
          },
        });

        return { evidence: createdEvidence, updated: updatedMatch };
      },
      { timeout: 30_000 },
    );

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

    this.realtimeGateway.emitMatchEvent(
      matchId,
      'match:score_submitted',
      updated,
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      this.toPublicMatchPayload(updated),
    );

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

    if (!waitingConfirmationStatuses.includes(match.status)) {
      throw new BadRequestException('Match result is not pending confirmation');
    }

    const pendingScoreA = match.pendingScoreA;
    const pendingScoreB = match.pendingScoreB;
    const resultSubmittedTeamId = match.resultSubmittedTeamId;

    if (
      pendingScoreA === null ||
      pendingScoreB === null ||
      !resultSubmittedTeamId
    ) {
      throw new BadRequestException('Pending result is incomplete');
    }

    const membership = await this.getCaptainMembership(match, userId);

    if (membership.teamId === resultSubmittedTeamId) {
      throw new BadRequestException(
        'Submitting team cannot confirm its own result',
      );
    }

    const winnerId =
      pendingScoreA > pendingScoreB ? match.teamAId : match.teamBId;

    if (!winnerId) {
      throw new BadRequestException('Winner cannot be determined');
    }

    const updated = await this.prisma.$transaction(
      async (transaction) => {
        const updatedMatch = await transaction.match.update({
          where: { id: matchId },
          data: {
            scoreA: pendingScoreA,
            scoreB: pendingScoreB,
            winnerId,
            resultStatus: 'CONFIRMED',
            status: 'COMPLETED',
          },
          include: {
            tournament: true,
            bracket: true,
          },
        });

        if (match.nextMatchId && match.nextSlot) {
          await transaction.match.update({
            where: { id: match.nextMatchId },
            data:
              match.nextSlot === 'A'
                ? { teamAId: winnerId }
                : { teamBId: winnerId },
          });
        }

        return updatedMatch;
      },
      { timeout: 30_000 },
    );
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
        scoreA: pendingScoreA,
        scoreB: pendingScoreB,
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

    this.realtimeGateway.emitMatchEvent(matchId, 'match:completed', updated);
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      this.toPublicMatchPayload(updated),
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'leaderboard:updated',
      { tournamentId: match.tournamentId, matchId },
    );

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

    if (!waitingConfirmationStatuses.includes(match.status)) {
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

    const { dispute, updated } = await this.prisma.$transaction(
      async (transaction) => {
        if (dto.imageUrl) {
          await transaction.matchEvidence.create({
            data: {
              matchId,
              submittedBy: userId,
              imageUrl: dto.imageUrl,
              fileUrl: dto.fileUrl ?? dto.imageUrl,
              type: dto.type ?? 'SCREENSHOT',
              note: dto.note ?? 'Dispute evidence',
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

        const updatedMatch = await transaction.match.update({
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

        return { dispute: createdDispute, updated: updatedMatch };
      },
      { timeout: 30_000 },
    );

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

    this.realtimeGateway.emitMatchEvent(matchId, 'match:disputed', updated);
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      this.toPublicMatchPayload(updated),
    );

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

    if (
      ![
        ...liveMatchStatuses,
        ...waitingConfirmationStatuses,
        'DISPUTED',
      ].includes(match.status)
    ) {
      throw new BadRequestException(
        'Match must be in progress before submitting result',
      );
    }

    validateBestOfScore(match.bestOf, dto.scoreA, dto.scoreB);

    const winnerId = dto.scoreA > dto.scoreB ? match.teamAId : match.teamBId;

    const updated = await this.prisma.$transaction(
      async (transaction) => {
        const updatedMatch = await transaction.match.update({
          where: { id: matchId },
          data: {
            scoreA: dto.scoreA,
            scoreB: dto.scoreB,
            winnerId,
            resultStatus: 'ORGANIZER_CONFIRMED',
            status: 'COMPLETED',
          },
        });

        if (match.nextMatchId && match.nextSlot) {
          await transaction.match.update({
            where: { id: match.nextMatchId },
            data:
              match.nextSlot === 'A'
                ? { teamAId: winnerId }
                : { teamBId: winnerId },
          });
        }

        return updatedMatch;
      },
      { timeout: 30_000 },
    );

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

    await this.auditLogsService.createLog(
      organizerId,
      'UPDATE_MATCH_RESULT',
      'MATCH',
      matchId,
      {
        tournamentId: match.tournamentId,
        winnerId,
        scoreA: dto.scoreA,
        scoreB: dto.scoreB,
      },
    );

    this.realtimeGateway.emitMatchEvent(matchId, 'match:completed', updated);
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'bracket:updated',
      this.toPublicMatchPayload(updated),
    );
    this.realtimeGateway.emitTournamentEvent(
      match.tournamentId,
      'leaderboard:updated',
      { tournamentId: match.tournamentId, matchId },
    );

    return {
      message: 'Update match result successfully',
      data: updated,
    };
  }

  async findOne(matchId: string, userId: string, userRole: UserRole) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: true,
        bracket: true,
        evidences: true,
        checkIns: true,
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    await this.assertCanAccessMatchRoom(match, userId, userRole);

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
