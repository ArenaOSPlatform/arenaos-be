import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterTeamDto } from './dto/register-team.dto';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import {
  AnnouncementType,
  CreateAnnouncementDto,
} from './dto/create-announcement.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { RealtimeGateway } from '../realtime/realtime/realtime.gateway';
import { randomInt } from 'node:crypto';

type LineupPlayer = {
  id: string;
  username: string;
  email: string;
};

type DiscordAnnouncementPayload = {
  announcementId: string;
  tournamentName: string;
  title: string;
  content: string;
  type: AnnouncementType;
  createdAt: Date;
  notifiedMembers: number;
};

type DiscordWebhookDelivery = {
  configured: boolean;
  sent: boolean;
  status?: number;
  error?: string;
};

type PublicBracketMatchSource = {
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

const discordColorByType: Record<AnnouncementType, number> = {
  INFO: 0x22d3ee,
  WARNING: 0xfbbf24,
  URGENT: 0xf87171,
};

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

function truncateDiscordText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function normalizeGameName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN');
}

function normalizeTournamentFormat(value: string): string {
  return value
    .trim()
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function parseLineupIds(lineupData?: string | null): string[] {
  if (!lineupData) return [];

  try {
    const parsed = JSON.parse(lineupData) as {
      mainPlayerIds?: string[];
      memberIds?: string[];
      substituteIds?: string[];
    };

    return [
      ...(parsed.mainPlayerIds ?? parsed.memberIds ?? []),
      ...(parsed.substituteIds ?? []),
    ];
  } catch {
    return [];
  }
}

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly leaderboardsService: LeaderboardsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private async createIntegrationDeliveryLog(input: {
    provider: string;
    eventType: string;
    status: string;
    recipient?: string;
    targetType?: string;
    targetId?: string;
    providerStatus?: number;
    providerMessageId?: string;
    error?: string;
    metadata?: Record<string, unknown>;
  }) {
    try {
      await this.prisma.integrationDeliveryLog.create({
        data: {
          provider: input.provider,
          eventType: input.eventType,
          status: input.status,
          recipient: input.recipient,
          targetType: input.targetType,
          targetId: input.targetId,
          providerStatus: input.providerStatus,
          providerMessageId: input.providerMessageId,
          error: input.error,
          metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Could not write integration delivery log: ${message}`);
    }
  }

  private validateTournamentConfig(input: {
    startDate: Date;
    endDate?: Date | null;
    registrationDeadline: Date;
    minTeams: number;
    maxTeams: number;
    teamSize: number;
    format: string;
  }) {
    if (Number.isNaN(input.startDate.getTime())) {
      throw new BadRequestException('Invalid start date');
    }

    if (Number.isNaN(input.registrationDeadline.getTime())) {
      throw new BadRequestException('Invalid registration deadline');
    }

    if (input.endDate && Number.isNaN(input.endDate.getTime())) {
      throw new BadRequestException('Invalid end date');
    }

    if (input.registrationDeadline.getTime() >= input.startDate.getTime()) {
      throw new BadRequestException(
        'Registration deadline must be before start date',
      );
    }

    if (input.endDate && input.endDate.getTime() < input.startDate.getTime()) {
      throw new BadRequestException('End date must be after start date');
    }

    if (input.maxTeams < input.minTeams) {
      throw new BadRequestException(
        'Max teams must be greater than or equal to min teams',
      );
    }

    if (input.teamSize < 1) {
      throw new BadRequestException('Team size must be greater than 0');
    }

    if (normalizeTournamentFormat(input.format) !== 'SINGLE_ELIMINATION') {
      throw new BadRequestException(
        'MVP currently supports Single Elimination tournaments only',
      );
    }
  }

  private async assertLineupHasNoTournamentConflict(params: {
    tournamentId: string;
    teamId: string;
    selectedIds: string[];
    activeStatuses?: string[];
  }) {
    const activeRegistrations =
      await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId: params.tournamentId,
          teamId: {
            not: params.teamId,
          },
          status: {
            in: params.activeStatuses ?? ['PENDING', 'APPROVED'],
          },
        },
        select: {
          teamId: true,
          lineupData: true,
        },
      });

    const selectedIdSet = new Set(params.selectedIds);
    const conflictedRegistration = activeRegistrations.find((registration) =>
      parseLineupIds(registration.lineupData).some((playerId) =>
        selectedIdSet.has(playerId),
      ),
    );

    if (conflictedRegistration) {
      throw new BadRequestException(
        'A lineup player is already registered with another team in this tournament',
      );
    }
  }

  private toPublicBracketMatch(match: PublicBracketMatchSource) {
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

  private toPublicBracket<T extends { matches: PublicBracketMatchSource[] }>(
    bracket: T,
  ) {
    return {
      ...bracket,
      matches: bracket.matches.map((match) => this.toPublicBracketMatch(match)),
    };
  }

  async createTournament(organizerId: string, dto: CreateTournamentDto) {
    const organizer = await this.prisma.user.findUnique({
      where: { id: organizerId },
      select: { id: true, role: true, status: true },
    });

    if (!organizer) {
      throw new BadRequestException('Organizer not found');
    }

    if (organizer.role !== 'ORGANIZER') {
      throw new BadRequestException(
        'Admin approval is required before creating tournaments',
      );
    }

    if (organizer.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Only active organizers can create tournaments',
      );
    }

    const startDate = new Date(dto.startDate);
    const endDate = dto.endDate ? new Date(dto.endDate) : null;
    const registrationDeadline = new Date(dto.registrationDeadline);
    const minTeams = dto.minTeams ?? 2;
    const format = normalizeTournamentFormat(dto.format);

    this.validateTournamentConfig({
      startDate,
      endDate,
      registrationDeadline,
      minTeams,
      maxTeams: dto.maxTeams,
      teamSize: dto.teamSize,
      format,
    });

    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name.trim(),
        game: dto.game.trim(),
        description: dto.description?.trim() || null,
        bannerUrl: dto.bannerUrl?.trim() || null,
        maxTeams: dto.maxTeams,
        minTeams,
        teamSize: dto.teamSize,
        format,
        prizePool: dto.prizePool?.trim() || null,
        rules: dto.rules?.trim() || null,
        region: dto.region?.trim() || null,
        livestreamUrl: dto.livestreamUrl?.trim() || null,
        startDate,
        endDate,
        registrationDeadline,
        organizerId,
      },
    });
    await this.auditLogsService.createLog(
      organizerId,
      'CREATE_TOURNAMENT',
      'TOURNAMENT',
      tournament.id,
      {
        tournamentName: tournament.name,
      },
    );

    return {
      message: 'Draft tournament created successfully',
      data: tournament,
    };
  }

  async findAll() {
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: {
          in: [
            'OPEN_REGISTRATION',
            'REGISTRATION_CLOSED',
            'BRACKET_GENERATED',
            'CHECK_IN_PHASE',
            'ONGOING',
            'FINALIZING',
            'COMPLETED',
            'CANCELLED',
            'ARCHIVED',
          ],
        },
      },
      include: {
        organizer: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Get tournaments successfully',
      data: tournaments,
    };
  }

  async findMine(organizerId: string) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { organizerId },
      include: {
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Get my tournaments successfully',
      data: tournaments,
    };
  }

  async submitApproval(id: string, organizerId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.organizerId !== organizerId) {
      throw new BadRequestException(
        'Only organizer can submit this tournament',
      );
    }

    if (!['DRAFT', 'REJECTED'].includes(tournament.status)) {
      throw new BadRequestException(
        'Only draft or rejected tournaments can be submitted',
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: {
        status: 'PENDING_APPROVAL',
        approvalSubmittedAt: new Date(),
        approvalReviewedAt: null,
        approvalReviewedBy: null,
        approvalRejectReason: null,
      },
    });

    await this.auditLogsService.createLog(
      organizerId,
      'SUBMIT_TOURNAMENT_APPROVAL',
      'TOURNAMENT',
      id,
      {
        tournamentName: tournament.name,
      },
    );

    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE' },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.createNotification({
          userId: admin.id,
          title: 'Tournament pending approval',
          message: `${tournament.name} is ready for admin review.`,
          type: 'TOURNAMENT_APPROVAL',
          metadata: { tournamentId: id },
        }),
      ),
    );

    this.realtimeGateway.emitTournamentEvent(
      id,
      'tournament:status_changed',
      updated,
    );

    return {
      message: 'Tournament submitted for admin approval',
      data: updated,
    };
  }

  async approveTournament(tournamentId: string, adminId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { organizer: true },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Tournament is not pending approval');
    }

    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'OPEN_REGISTRATION',
        approvalReviewedAt: new Date(),
        approvalReviewedBy: adminId,
        approvalRejectReason: null,
      },
      include: {
        organizer: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    await this.auditLogsService.createLog(
      adminId,
      'APPROVE_TOURNAMENT',
      'TOURNAMENT',
      tournamentId,
      {
        tournamentName: tournament.name,
        nextStatus: 'OPEN_REGISTRATION',
      },
    );

    await this.notificationsService.createNotification({
      userId: tournament.organizerId,
      title: 'Tournament approved',
      message: `${tournament.name} is now open for registration.`,
      type: 'TOURNAMENT_APPROVED',
      metadata: { tournamentId },
    });

    this.realtimeGateway.emitTournamentEvent(
      tournamentId,
      'tournament:status_changed',
      updated,
    );

    return {
      message: 'Approve tournament successfully',
      data: updated,
    };
  }

  async rejectTournament(
    tournamentId: string,
    adminId: string,
    reason?: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { organizer: true },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Tournament is not pending approval');
    }

    const rejectReason = reason?.trim();

    if (!rejectReason) {
      throw new BadRequestException('Reject reason is required');
    }

    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'REJECTED',
        approvalReviewedAt: new Date(),
        approvalReviewedBy: adminId,
        approvalRejectReason: rejectReason,
      },
      include: {
        organizer: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    await this.auditLogsService.createLog(
      adminId,
      'REJECT_TOURNAMENT',
      'TOURNAMENT',
      tournamentId,
      {
        tournamentName: tournament.name,
        reason: rejectReason,
      },
    );

    await this.notificationsService.createNotification({
      userId: tournament.organizerId,
      title: 'Tournament needs changes',
      message: rejectReason,
      type: 'TOURNAMENT_REJECTED',
      metadata: { tournamentId },
    });

    this.realtimeGateway.emitTournamentEvent(
      tournamentId,
      'tournament:status_changed',
      updated,
    );

    return {
      message: 'Reject tournament successfully',
      data: updated,
    };
  }

  async cancelTournament(
    id: string,
    actorId: string,
    actorRole: string,
    reason?: string,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    const canCancel =
      actorRole === 'ADMIN' || tournament.organizerId === actorId;

    if (!canCancel) {
      throw new BadRequestException('Only organizer or admin can cancel');
    }

    if (['COMPLETED', 'ARCHIVED'].includes(tournament.status)) {
      throw new BadRequestException(
        'Completed or archived tournaments cannot be cancelled',
      );
    }

    const cancelReason = reason?.trim();

    if (!cancelReason) {
      throw new BadRequestException('Cancel reason is required');
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    await this.auditLogsService.createLog(
      actorId,
      'CANCEL_TOURNAMENT',
      'TOURNAMENT',
      id,
      {
        previousStatus: tournament.status,
        reason: cancelReason,
      },
    );

    this.realtimeGateway.emitTournamentEvent(
      id,
      'tournament:status_changed',
      updated,
    );

    return {
      message: 'Cancel tournament successfully',
      data: updated,
    };
  }

  async archiveTournament(id: string, actorId: string, actorRole: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    const canArchive =
      actorRole === 'ADMIN' || tournament.organizerId === actorId;

    if (!canArchive) {
      throw new BadRequestException('Only organizer or admin can archive');
    }

    if (!['COMPLETED', 'CANCELLED'].includes(tournament.status)) {
      throw new BadRequestException(
        'Only completed or cancelled tournaments can be archived',
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await this.auditLogsService.createLog(
      actorId,
      'ARCHIVE_TOURNAMENT',
      'TOURNAMENT',
      id,
      {
        previousStatus: tournament.status,
      },
    );

    this.realtimeGateway.emitTournamentEvent(
      id,
      'tournament:status_changed',
      updated,
    );

    return {
      message: 'Archive tournament successfully',
      data: updated,
    };
  }

  async findOne(id: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
      include: {
        organizer: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    return {
      message: 'Get tournament successfully',
      data: tournament,
    };
  }

  async updateTournament(
    id: string,
    organizerId: string,
    dto: UpdateTournamentDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.organizerId !== organizerId) {
      throw new BadRequestException(
        'Only organizer can update this tournament',
      );
    }

    if (
      [
        'REGISTRATION_CLOSED',
        'BRACKET_GENERATED',
        'CHECK_IN_PHASE',
        'ONGOING',
        'FINALIZING',
        'COMPLETED',
        'CANCELLED',
        'ARCHIVED',
      ].includes(tournament.status)
    ) {
      throw new BadRequestException(
        'Tournament cannot be edited after registration is locked',
      );
    }

    const data = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.game !== undefined ? { game: dto.game.trim() } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description?.trim() || null }
        : {}),
      ...(dto.bannerUrl !== undefined
        ? { bannerUrl: dto.bannerUrl?.trim() || null }
        : {}),
      ...(dto.maxTeams !== undefined ? { maxTeams: dto.maxTeams } : {}),
      ...(dto.minTeams !== undefined ? { minTeams: dto.minTeams } : {}),
      ...(dto.teamSize !== undefined ? { teamSize: dto.teamSize } : {}),
      ...(dto.format !== undefined
        ? { format: normalizeTournamentFormat(dto.format) }
        : {}),
      ...(dto.prizePool !== undefined
        ? { prizePool: dto.prizePool?.trim() || null }
        : {}),
      ...(dto.rules !== undefined ? { rules: dto.rules?.trim() || null } : {}),
      ...(dto.region !== undefined
        ? { region: dto.region?.trim() || null }
        : {}),
      ...(dto.livestreamUrl !== undefined
        ? { livestreamUrl: dto.livestreamUrl?.trim() || null }
        : {}),
      ...(dto.startDate !== undefined
        ? { startDate: new Date(dto.startDate) }
        : {}),
      ...(dto.endDate !== undefined
        ? { endDate: dto.endDate ? new Date(dto.endDate) : null }
        : {}),
      ...(dto.registrationDeadline !== undefined
        ? { registrationDeadline: new Date(dto.registrationDeadline) }
        : {}),
    };

    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No tournament fields to update');
    }

    this.validateTournamentConfig({
      startDate:
        dto.startDate !== undefined
          ? new Date(dto.startDate)
          : tournament.startDate,
      endDate:
        dto.endDate !== undefined
          ? dto.endDate
            ? new Date(dto.endDate)
            : null
          : tournament.endDate,
      registrationDeadline:
        dto.registrationDeadline !== undefined
          ? new Date(dto.registrationDeadline)
          : tournament.registrationDeadline,
      minTeams: dto.minTeams ?? tournament.minTeams,
      maxTeams: dto.maxTeams ?? tournament.maxTeams,
      teamSize: dto.teamSize ?? tournament.teamSize,
      format: dto.format ?? tournament.format,
    });

    const updated = await this.prisma.tournament.update({
      where: { id },
      data,
    });

    await this.auditLogsService.createLog(
      organizerId,
      'UPDATE_TOURNAMENT',
      'TOURNAMENT',
      id,
      {
        oldValue: tournament,
        newValue: updated,
      },
    );

    return {
      message: 'Update tournament successfully',
      data: updated,
    };
  }

  async openRegistration(id: string, organizerId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.organizerId !== organizerId) {
      throw new BadRequestException(
        'Only organizer can update this tournament',
      );
    }

    if (tournament.status === 'OPEN_REGISTRATION') {
      return {
        message: 'Tournament registration is already open',
        data: tournament,
      };
    }

    if (tournament.status !== 'REGISTRATION_CLOSED') {
      throw new BadRequestException(
        'Only closed-registration tournaments can be opened manually',
      );
    }

    const bracket = await this.prisma.bracket.findUnique({
      where: { tournamentId: id },
      select: { id: true },
    });

    if (bracket) {
      throw new BadRequestException(
        'Tournament with generated bracket cannot reopen registration',
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: 'OPEN_REGISTRATION' },
    });

    this.realtimeGateway.emitTournamentEvent(
      id,
      'tournament:status_changed',
      updated,
    );

    return {
      message: 'Open registration successfully',
      data: updated,
    };
  }

  async closeRegistration(id: string, organizerId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.organizerId !== organizerId) {
      throw new BadRequestException(
        'Only organizer can update this tournament',
      );
    }

    if (tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    if (tournament.status !== 'OPEN_REGISTRATION') {
      throw new BadRequestException(
        'Only open tournaments can close registration',
      );
    }

    const pendingRegistrationCount =
      await this.prisma.tournamentRegistration.count({
        where: {
          tournamentId: id,
          status: 'PENDING',
        },
      });

    if (pendingRegistrationCount > 0) {
      throw new BadRequestException(
        'All pending registrations must be approved or rejected before closing registration',
      );
    }

    const approvedRegistrations =
      await this.prisma.tournamentRegistration.findMany({
        where: {
          tournamentId: id,
          status: 'APPROVED',
        },
        include: {
          team: {
            include: {
              members: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      });

    if (approvedRegistrations.length < tournament.minTeams) {
      throw new BadRequestException(
        `At least ${tournament.minTeams} approved teams are required before closing registration`,
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: 'REGISTRATION_CLOSED' },
    });

    await this.auditLogsService.createLog(
      organizerId,
      'CLOSE_REGISTRATION',
      'TOURNAMENT',
      id,
      {
        tournamentName: tournament.name,
        approvedTeams: approvedRegistrations.length,
      },
    );

    const participantUserIds = [
      ...new Set(
        approvedRegistrations.flatMap((registration) =>
          registration.team.members.map((member) => member.userId),
        ),
      ),
    ];

    await Promise.all(
      participantUserIds.map((userId) =>
        this.notificationsService.createNotification({
          userId,
          title: 'Tournament registration closed',
          message: `${tournament.name} registration is locked. Lineups are now locked.`,
          type: 'TOURNAMENT_REGISTRATION_CLOSED',
          metadata: { tournamentId: id },
        }),
      ),
    );

    this.realtimeGateway.emitTournamentEvent(
      id,
      'tournament:status_changed',
      updated,
    );

    return {
      message: 'Close registration successfully',
      data: updated,
    };
  }
  async registerTeam(
    tournamentId: string,
    userId: string,
    dto: RegisterTeamDto,
  ) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.status !== 'OPEN_REGISTRATION') {
      throw new BadRequestException('Tournament registration is not open');
    }

    const approvedRegistrationCount =
      await this.prisma.tournamentRegistration.count({
        where: {
          tournamentId,
          status: 'APPROVED',
        },
      });

    if (approvedRegistrationCount >= tournament.maxTeams) {
      throw new BadRequestException('Tournament approved team slots are full');
    }

    const activeRegistrationCount =
      await this.prisma.tournamentRegistration.count({
        where: {
          tournamentId,
          status: {
            in: ['PENDING', 'APPROVED'],
          },
        },
      });

    if (activeRegistrationCount >= tournament.maxTeams * 2) {
      throw new BadRequestException(
        'Tournament has too many pending registrations waiting for review',
      );
    }

    const team = await this.prisma.team.findFirst({
      where: {
        captainId: userId,
        ...(dto.teamId ? { id: dto.teamId } : {}),
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!team) {
      throw new BadRequestException('Only captain can register tournament');
    }

    if (team.status !== 'ACTIVE') {
      throw new BadRequestException('Banned or inactive teams cannot register');
    }

    if (
      team.game &&
      normalizeGameName(team.game) !== normalizeGameName(tournament.game)
    ) {
      throw new BadRequestException('Team game does not match tournament game');
    }

    if (team.members.length < tournament.teamSize) {
      throw new BadRequestException(
        `Team must have at least ${tournament.teamSize} members`,
      );
    }

    const mainPlayerIds = dto.mainPlayerIds ?? dto.memberIds ?? [];

    if (mainPlayerIds.length !== tournament.teamSize) {
      throw new BadRequestException(
        `Main lineup must include exactly ${tournament.teamSize} players`,
      );
    }

    const substituteIds = dto.substituteIds ?? [];
    const overlap = mainPlayerIds.some((memberId) =>
      substituteIds.includes(memberId),
    );

    if (overlap) {
      throw new BadRequestException(
        'Main lineup and substitutes cannot contain the same player',
      );
    }

    const teamPlayers = team.members.map((member) => member.user);
    const teamPlayerIds = new Set(teamPlayers.map((player) => player.id));
    const selectedIds = [...mainPlayerIds, ...substituteIds];
    const invalidPlayerId = selectedIds.find(
      (playerId) => !teamPlayerIds.has(playerId),
    );

    if (invalidPlayerId) {
      throw new BadRequestException('Lineup players must belong to your team');
    }

    await this.assertLineupHasNoTournamentConflict({
      tournamentId,
      teamId: team.id,
      selectedIds,
    });

    const playerById = new Map(
      teamPlayers.map((player) => [
        player.id,
        {
          id: player.id,
          username: player.username,
          email: player.email,
        },
      ]),
    );

    const pickPlayers = (playerIds: string[]): LineupPlayer[] =>
      playerIds
        .map((playerId) => playerById.get(playerId))
        .filter(Boolean) as LineupPlayer[];

    const lineupData = {
      mainPlayerIds,
      memberIds: mainPlayerIds,
      substituteIds,
      mainPlayers: pickPlayers(mainPlayerIds),
      substitutes: pickPlayers(substituteIds),
    };

    const existingRegistration =
      await this.prisma.tournamentRegistration.findUnique({
        where: {
          tournamentId_teamId: {
            tournamentId,
            teamId: team.id,
          },
        },
      });

    if (existingRegistration) {
      throw new BadRequestException('Team already registered this tournament');
    }

    const registration = await this.prisma.tournamentRegistration.create({
      data: {
        tournamentId,
        teamId: team.id,
        lineupData: JSON.stringify(lineupData),
      },
      include: {
        team: true,
        tournament: true,
      },
    });

    await this.auditLogsService.createLog(
      userId,
      'REGISTER_TEAM_TOURNAMENT',
      'TOURNAMENT_REGISTRATION',
      registration.id,
      {
        tournamentId,
        tournamentName: tournament.name,
        teamId: team.id,
        mainPlayerIds,
        substituteIds,
      },
    );

    await this.notificationsService.createNotification({
      userId: tournament.organizerId,
      title: 'Team registration pending',
      message: `${team.name} registered for ${tournament.name}.`,
      type: 'TOURNAMENT_REGISTRATION_PENDING',
      metadata: {
        tournamentId,
        registrationId: registration.id,
        teamId: team.id,
      },
    });

    this.realtimeGateway.emitTournamentEvent(
      tournamentId,
      'registration:updated',
      registration,
    );

    return {
      message: 'Register tournament successfully',
      data: registration,
    };
  }

  async getRegistrations(tournamentId: string) {
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId },
      include: {
        team: {
          include: {
            captain: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
            members: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Get tournament registrations successfully',
      data: registrations,
    };
  }

  async approveRegistration(registrationId: string, organizerId: string) {
    const registration = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
      include: {
        tournament: true,
        team: {
          include: {
            members: true,
          },
        },
      },
    });

    if (!registration) {
      throw new BadRequestException('Registration not found');
    }

    if (registration.tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can approve registration');
    }

    if (registration.status !== 'PENDING') {
      throw new BadRequestException(
        'Only pending registrations can be approved',
      );
    }

    if (registration.tournament.status !== 'OPEN_REGISTRATION') {
      throw new BadRequestException(
        'Registrations can only be approved while registration is open',
      );
    }

    if (!registration.lineupData) {
      throw new BadRequestException('Registration lineup is required');
    }

    if (registration.team.status !== 'ACTIVE') {
      throw new BadRequestException('Inactive teams cannot be approved');
    }

    const lineupIds = parseLineupIds(registration.lineupData);
    const mainLineupIds = (() => {
      try {
        const parsed = JSON.parse(registration.lineupData ?? '{}') as {
          mainPlayerIds?: string[];
          memberIds?: string[];
        };

        return parsed.mainPlayerIds ?? parsed.memberIds ?? [];
      } catch {
        return [];
      }
    })();

    if (mainLineupIds.length !== registration.tournament.teamSize) {
      throw new BadRequestException(
        `Main lineup must include exactly ${registration.tournament.teamSize} players`,
      );
    }

    const currentMemberIds = new Set(
      registration.team.members.map((member) => member.userId),
    );

    if (lineupIds.some((playerId) => !currentMemberIds.has(playerId))) {
      throw new BadRequestException(
        'Lineup players must still belong to the registered team',
      );
    }

    await this.assertLineupHasNoTournamentConflict({
      tournamentId: registration.tournamentId,
      teamId: registration.teamId,
      selectedIds: lineupIds,
      activeStatuses: ['APPROVED'],
    });

    const approvedCount = await this.prisma.tournamentRegistration.count({
      where: {
        tournamentId: registration.tournamentId,
        status: 'APPROVED',
      },
    });

    if (approvedCount >= registration.tournament.maxTeams) {
      throw new BadRequestException('Tournament approved team slots are full');
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'APPROVED',
        rejectReason: null,
      },
    });

    const teamMembers = await this.prisma.teamMember.findMany({
      where: { teamId: registration.teamId },
      select: { userId: true },
    });

    await Promise.all(
      teamMembers.map((member) =>
        this.notificationsService.createNotification({
          userId: member.userId,
          title: 'Tournament registration approved',
          message: `Your team was approved for ${registration.tournament.name}.`,
          type: 'TOURNAMENT_REGISTRATION_APPROVED',
          metadata: {
            tournamentId: registration.tournamentId,
            registrationId,
            teamId: registration.teamId,
          },
        }),
      ),
    );

    await this.auditLogsService.createLog(
      organizerId,
      'APPROVE_TEAM_REGISTRATION',
      'TOURNAMENT_REGISTRATION',
      registrationId,
      {
        tournamentId: registration.tournamentId,
        teamId: registration.teamId,
      },
    );

    this.realtimeGateway.emitTournamentEvent(
      registration.tournamentId,
      'registration:updated',
      updated,
    );

    return {
      message: 'Approve registration successfully',
      data: updated,
    };
  }

  async rejectRegistration(
    registrationId: string,
    organizerId: string,
    reason?: string,
  ) {
    const registration = await this.prisma.tournamentRegistration.findUnique({
      where: { id: registrationId },
      include: { tournament: true },
    });

    if (!registration) {
      throw new BadRequestException('Registration not found');
    }

    if (registration.tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can reject registration');
    }

    if (registration.status !== 'PENDING') {
      throw new BadRequestException(
        'Only pending registrations can be rejected',
      );
    }

    if (registration.tournament.status !== 'OPEN_REGISTRATION') {
      throw new BadRequestException(
        'Registrations can only be rejected while registration is open',
      );
    }

    const rejectReason = reason?.trim();

    if (!rejectReason) {
      throw new BadRequestException('Reject reason is required');
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'REJECTED',
        rejectReason,
      },
    });

    const teamMembers = await this.prisma.teamMember.findMany({
      where: { teamId: registration.teamId },
      select: { userId: true },
    });

    await Promise.all(
      teamMembers.map((member) =>
        this.notificationsService.createNotification({
          userId: member.userId,
          title: 'Tournament registration rejected',
          message: rejectReason,
          type: 'TOURNAMENT_REGISTRATION_REJECTED',
          metadata: {
            tournamentId: registration.tournamentId,
            registrationId,
            teamId: registration.teamId,
          },
        }),
      ),
    );

    await this.auditLogsService.createLog(
      organizerId,
      'REJECT_TEAM_REGISTRATION',
      'TOURNAMENT_REGISTRATION',
      registrationId,
      {
        tournamentId: registration.tournamentId,
        teamId: registration.teamId,
        reason: rejectReason,
      },
    );

    this.realtimeGateway.emitTournamentEvent(
      registration.tournamentId,
      'registration:updated',
      updated,
    );

    return {
      message: 'Reject registration successfully',
      data: updated,
    };
  }
  async generateBracket(tournamentId: string, organizerId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: {
            status: 'APPROVED',
          },
          include: {
            team: true,
          },
        },
        bracket: true,
      },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can generate bracket');
    }

    if (tournament.status !== 'REGISTRATION_CLOSED') {
      throw new BadRequestException(
        'Registration must be closed before generating bracket',
      );
    }

    if (normalizeTournamentFormat(tournament.format) !== 'SINGLE_ELIMINATION') {
      throw new BadRequestException(
        'MVP currently supports Single Elimination brackets only',
      );
    }

    if (tournament.bracket) {
      throw new BadRequestException('Bracket already generated');
    }

    const pendingRegistrations = await this.prisma.tournamentRegistration.count(
      {
        where: {
          tournamentId,
          status: 'PENDING',
        },
      },
    );

    if (pendingRegistrations > 0) {
      throw new BadRequestException(
        'All pending registrations must be resolved before generating bracket',
      );
    }

    const approvedTeams = tournament.registrations.map((item) => item.team);

    if (approvedTeams.length < tournament.minTeams) {
      throw new BadRequestException(
        `At least ${tournament.minTeams} approved teams are required`,
      );
    }

    const bracketSize = 2 ** Math.ceil(Math.log2(approvedTeams.length));
    const roundCount = Math.log2(bracketSize);
    const shuffledTeams = shuffled(approvedTeams);
    const seededSlots = [
      ...shuffledTeams,
      ...Array.from({ length: bracketSize - shuffledTeams.length }, () => null),
    ];

    const bracket = await this.prisma.$transaction(
      async (transaction) => {
        const createdBracket = await transaction.bracket.create({
          data: {
            tournamentId,
            format: tournament.format,
            status: 'LOCKED',
            generatedAt: new Date(),
          },
        });

        const rounds = await Promise.all(
          Array.from({ length: roundCount }, (_, index) => {
            const roundNumber = index + 1;
            const name =
              roundNumber === roundCount
                ? 'Final'
                : roundNumber === roundCount - 1
                  ? 'Semifinal'
                  : `Round ${roundNumber}`;

            return transaction.bracketRound.create({
              data: {
                bracketId: createdBracket.id,
                roundNumber,
                name,
              },
            });
          }),
        );

        const matchesByRound = new Map<
          number,
          { id: string; matchNumber: number }[]
        >();

        for (let roundNumber = 1; roundNumber <= roundCount; roundNumber += 1) {
          const matchCount = bracketSize / 2 ** roundNumber;
          const round = rounds[roundNumber - 1];
          const roundMatches: { id: string; matchNumber: number }[] = [];

          for (
            let matchNumber = 1;
            matchNumber <= matchCount;
            matchNumber += 1
          ) {
            const slotIndex = (matchNumber - 1) * 2;
            const teamA = roundNumber === 1 ? seededSlots[slotIndex] : null;
            const teamB = roundNumber === 1 ? seededSlots[slotIndex + 1] : null;
            const byeWinner =
              teamA && !teamB ? teamA : !teamA && teamB ? teamB : null;

            const match = await transaction.match.create({
              data: {
                tournamentId,
                bracketId: createdBracket.id,
                roundId: round.id,
                roundNumber,
                matchNumber,
                teamAId: teamA?.id ?? null,
                teamBId: teamB?.id ?? null,
                winnerId: byeWinner?.id ?? null,
                resultStatus: byeWinner ? 'BYE' : null,
                status: byeWinner ? 'COMPLETED' : 'PENDING_SCHEDULE',
              },
            });

            roundMatches.push({ id: match.id, matchNumber });
          }

          matchesByRound.set(roundNumber, roundMatches);
        }

        for (let roundNumber = 1; roundNumber < roundCount; roundNumber += 1) {
          const currentRound = matchesByRound.get(roundNumber) ?? [];
          const nextRound = matchesByRound.get(roundNumber + 1) ?? [];

          await Promise.all(
            currentRound.map((match) => {
              const nextMatchIndex = Math.ceil(match.matchNumber / 2) - 1;
              const nextMatch = nextRound[nextMatchIndex];

              if (!nextMatch) return Promise.resolve(null);

              return transaction.match.update({
                where: { id: match.id },
                data: {
                  nextMatchId: nextMatch.id,
                  nextSlot: match.matchNumber % 2 === 1 ? 'A' : 'B',
                },
              });
            }),
          );
        }

        const byeMatches = await transaction.match.findMany({
          where: {
            bracketId: createdBracket.id,
            resultStatus: 'BYE',
            winnerId: { not: null },
          },
          select: {
            winnerId: true,
            nextMatchId: true,
            nextSlot: true,
          },
        });

        await Promise.all(
          byeMatches.map((match) => {
            if (!match.nextMatchId || !match.nextSlot || !match.winnerId) {
              return Promise.resolve(null);
            }

            return transaction.match.update({
              where: { id: match.nextMatchId },
              data:
                match.nextSlot === 'A'
                  ? { teamAId: match.winnerId }
                  : { teamBId: match.winnerId },
            });
          }),
        );

        await transaction.tournament.update({
          where: { id: tournamentId },
          data: { status: 'BRACKET_GENERATED' },
        });

        return createdBracket;
      },
      { timeout: 30_000 },
    );

    await this.auditLogsService.createLog(
      organizerId,
      'GENERATE_BRACKET',
      'BRACKET',
      bracket.id,
      {
        tournamentId,
        bracketSize,
        approvedTeams: approvedTeams.length,
        byeCount: bracketSize - approvedTeams.length,
      },
    );

    const fullBracket = await this.prisma.bracket.findUnique({
      where: { id: bracket.id },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
        },
        matches: {
          orderBy: [{ roundNumber: 'asc' }, { matchNumber: 'asc' }],
        },
      },
    });

    const publicBracket = fullBracket
      ? this.toPublicBracket(fullBracket)
      : null;

    this.realtimeGateway.emitTournamentEvent(
      tournamentId,
      'bracket:generated',
      publicBracket,
    );
    this.realtimeGateway.emitTournamentEvent(
      tournamentId,
      'tournament:status_changed',
      { tournamentId, status: 'BRACKET_GENERATED' },
    );

    return {
      message: 'Generate bracket successfully',
      data: publicBracket,
    };
  }

  async getBracket(tournamentId: string) {
    const bracket = await this.prisma.bracket.findUnique({
      where: { tournamentId },
      include: {
        rounds: {
          orderBy: { roundNumber: 'asc' },
        },
        matches: {
          orderBy: [{ roundNumber: 'asc' }, { matchNumber: 'asc' }],
        },
      },
    });

    if (!bracket) {
      throw new BadRequestException('Bracket not found');
    }

    return {
      message: 'Get bracket successfully',
      data: this.toPublicBracket(bracket),
    };
  }

  getLeaderboard(tournamentId: string) {
    return this.leaderboardsService.getTournamentLeaderboard(tournamentId);
  }

  async getAnnouncements(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { id: true },
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    const announcements = await this.prisma.tournamentAnnouncement.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get tournament announcements successfully',
      data: announcements,
    };
  }

  async createAnnouncement(
    tournamentId: string,
    organizerId: string,
    dto: CreateAnnouncementDto,
  ) {
    const title = dto.title.trim();
    const content = dto.content.trim();

    if (!title || !content) {
      throw new BadRequestException(
        'Announcement title and content are required',
      );
    }

    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        registrations: {
          where: {
            status: {
              in: ['PENDING', 'APPROVED'],
            },
          },
          include: {
            team: {
              include: {
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
    });

    if (!tournament) {
      throw new BadRequestException('Tournament not found');
    }

    if (tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can create announcement');
    }

    if (tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    const userIds = [
      ...new Set(
        tournament.registrations.flatMap((registration) =>
          registration.team.members.map((member) => member.userId),
        ),
      ),
    ];

    const announcement = await this.prisma.tournamentAnnouncement.create({
      data: {
        tournamentId,
        createdBy: organizerId,
        title,
        content,
        type: dto.type,
      },
    });

    await this.auditLogsService.createLog(
      organizerId,
      'CREATE_ANNOUNCEMENT',
      'TOURNAMENT_ANNOUNCEMENT',
      announcement.id,
      {
        tournamentId,
        tournamentName: tournament.name,
        type: dto.type,
      },
    );

    await Promise.all(
      userIds.map((userId) =>
        this.notificationsService.createNotification({
          userId,
          title,
          message:
            content.length > 140 ? `${content.slice(0, 140)}...` : content,
          type: 'TOURNAMENT_ANNOUNCEMENT',
          metadata: {
            tournamentId,
            announcementId: announcement.id,
            announcementType: dto.type,
          },
        }),
      ),
    );

    const discordDelivery = await this.sendDiscordWebhook({
      announcementId: announcement.id,
      tournamentName: tournament.name,
      title,
      content,
      type: dto.type,
      createdAt: announcement.createdAt,
      notifiedMembers: userIds.length,
    });

    await this.createIntegrationDeliveryLog({
      provider: 'DISCORD',
      eventType: 'TOURNAMENT_ANNOUNCEMENT',
      status: discordDelivery.sent
        ? 'SENT'
        : discordDelivery.configured
          ? 'FAILED'
          : 'SKIPPED',
      targetType: 'TOURNAMENT_ANNOUNCEMENT',
      targetId: announcement.id,
      providerStatus: discordDelivery.status,
      error: discordDelivery.error,
      metadata: {
        tournamentId,
        tournamentName: tournament.name,
        announcementType: dto.type,
        notifiedMembers: userIds.length,
        configured: discordDelivery.configured,
      },
    });

    return {
      message: 'Announcement created successfully',
      data: {
        announcement,
        delivery: {
          inAppRecipients: userIds.length,
          discord: discordDelivery,
        },
      },
    };
  }

  private async sendDiscordWebhook(
    payload: DiscordAnnouncementPayload,
  ): Promise<DiscordWebhookDelivery> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim().replace(
      /^["'<]+|[>"']+$/g,
      '',
    );

    if (!webhookUrl) {
      return {
        configured: false,
        sent: false,
      };
    }

    try {
      const url = new URL(webhookUrl);
      url.searchParams.set('wait', 'true');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'ArenaOS',
          content: 'New ArenaOS tournament announcement',
          allowed_mentions: {
            parse: [],
          },
          embeds: [
            {
              title: truncateDiscordText(payload.title, 256),
              description: truncateDiscordText(payload.content, 4096),
              color: discordColorByType[payload.type],
              fields: [
                {
                  name: 'Tournament',
                  value: truncateDiscordText(payload.tournamentName, 1024),
                  inline: false,
                },
                {
                  name: 'Type',
                  value: payload.type,
                  inline: true,
                },
                {
                  name: 'Notified members',
                  value: String(payload.notifiedMembers),
                  inline: true,
                },
              ],
              footer: {
                text: `Announcement ${payload.announcementId}`,
              },
              timestamp: payload.createdAt.toISOString(),
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        const detail = errorBody
          ? ` - ${truncateDiscordText(errorBody, 300)}`
          : '';

        this.logger.warn(
          `Discord webhook failed for announcement ${payload.announcementId}: ${response.status} ${response.statusText}${detail}`,
        );

        return {
          configured: true,
          sent: false,
          status: response.status,
          error: response.statusText || 'Discord webhook failed',
        };
      }

      return {
        configured: true,
        sent: true,
        status: response.status,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.logger.warn(
        `Discord webhook failed for announcement ${payload.announcementId}: ${message}`,
      );

      return {
        configured: true,
        sent: false,
        error: message,
      };
    }
  }
}
