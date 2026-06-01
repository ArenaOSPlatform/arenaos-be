import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterTeamDto } from './dto/register-team.dto';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

type LineupPlayer = {
  id: string;
  username: string;
  email: string;
};

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly leaderboardsService: LeaderboardsService,
  ) {}

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

    const tournament = await this.prisma.tournament.create({
      data: {
        name: dto.name,
        game: dto.game,
        description: dto.description,
        bannerUrl: dto.bannerUrl,
        maxTeams: dto.maxTeams,
        teamSize: dto.teamSize,
        format: dto.format,
        prizePool: dto.prizePool,
        rules: dto.rules,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        registrationDeadline: new Date(dto.registrationDeadline),
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
            'COMPLETED',
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

    if (tournament.status !== 'DRAFT') {
      throw new BadRequestException('Only draft tournaments can be submitted');
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

    return {
      message: 'Tournament submitted for admin approval',
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

    if (tournament.status !== 'APPROVED') {
      throw new BadRequestException(
        'Tournament must be approved by admin before opening registration',
      );
    }

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: 'OPEN_REGISTRATION' },
    });

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

    const updated = await this.prisma.tournament.update({
      where: { id },
      data: { status: 'REGISTRATION_CLOSED' },
    });

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

    const team = await this.prisma.team.findFirst({
      where: { captainId: userId },
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
      include: { tournament: true },
    });

    if (!registration) {
      throw new BadRequestException('Registration not found');
    }

    if (registration.tournament.organizerId !== organizerId) {
      throw new BadRequestException('Only organizer can approve registration');
    }

    if (registration.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    if (!registration.lineupData) {
      throw new BadRequestException('Registration lineup is required');
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'APPROVED',
        rejectReason: null,
      },
    });

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

    if (registration.tournament.status === 'COMPLETED') {
      throw new BadRequestException('Tournament is completed and archived');
    }

    const updated = await this.prisma.tournamentRegistration.update({
      where: { id: registrationId },
      data: {
        status: 'REJECTED',
        rejectReason: reason ?? 'No reason provided',
      },
    });

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

    if (tournament.bracket) {
      throw new BadRequestException('Bracket already generated');
    }

    const approvedTeams = tournament.registrations.map((item) => item.team);

    if (approvedTeams.length < 2) {
      throw new BadRequestException('At least 2 approved teams are required');
    }

    if (approvedTeams.length % 2 !== 0) {
      throw new BadRequestException(
        'MVP bracket requires even number of teams',
      );
    }

    if (approvedTeams.length !== 4) {
      throw new BadRequestException(
        'MVP auto advance requires exactly 4 approved teams',
      );
    }

    const bracket = await this.prisma.bracket.create({
      data: {
        tournamentId,
        format: tournament.format,
      },
    });

    const match1 = await this.prisma.match.create({
      data: {
        tournamentId,
        bracketId: bracket.id,
        roundNumber: 1,
        matchNumber: 1,
        teamAId: approvedTeams[0].id,
        teamBId: approvedTeams[1].id,
        status: 'PENDING',
      },
    });

    const match2 = await this.prisma.match.create({
      data: {
        tournamentId,
        bracketId: bracket.id,
        roundNumber: 1,
        matchNumber: 2,
        teamAId: approvedTeams[2].id,
        teamBId: approvedTeams[3].id,
        status: 'PENDING',
      },
    });

    const finalMatch = await this.prisma.match.create({
      data: {
        tournamentId,
        bracketId: bracket.id,
        roundNumber: 2,
        matchNumber: 1,
        status: 'PENDING',
      },
    });

    await this.prisma.match.update({
      where: { id: match1.id },
      data: {
        nextMatchId: finalMatch.id,
        nextSlot: 'A',
      },
    });

    await this.prisma.match.update({
      where: { id: match2.id },
      data: {
        nextMatchId: finalMatch.id,
        nextSlot: 'B',
      },
    });

    await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'BRACKET_GENERATED',
      },
    });

    const fullBracket = await this.prisma.bracket.findUnique({
      where: { id: bracket.id },
      include: {
        matches: {
          orderBy: [{ roundNumber: 'asc' }, { matchNumber: 'asc' }],
        },
      },
    });

    return {
      message: 'Generate bracket successfully',
      data: fullBracket,
    };
  }

  async getBracket(tournamentId: string) {
    const bracket = await this.prisma.bracket.findUnique({
      where: { tournamentId },
      include: {
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
      data: bracket,
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

    if (userIds.length === 0) {
      throw new BadRequestException('No registered teams to notify');
    }

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

    return {
      message: 'Announcement created successfully',
      data: announcement,
    };
  }
}
