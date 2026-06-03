import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { isUserRole } from '../auth/constants/user-role';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../realtime/realtime/realtime.gateway';
import { RejectApprovalDto } from './dto/reject-approval.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

const userSelect = {
  id: true,
  username: true,
  email: true,
  role: true,
  avatarUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      captainTeams: true,
      teamMembers: true,
      tournaments: true,
    },
  },
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async getUsers() {
    const users = await this.prisma.user.findMany({
      select: userSelect,
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get admin users successfully',
      data: users,
    };
  }

  async getTeams() {
    const teams = await this.prisma.team.findMany({
      include: {
        captain: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                email: true,
                role: true,
                status: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
            invites: true,
            registrations: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get admin teams successfully',
      data: teams,
    };
  }

  async getTournaments() {
    const tournaments = await this.prisma.tournament.findMany({
      include: {
        organizer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
          },
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get admin tournaments successfully',
      data: tournaments,
    };
  }

  async getOrganizerRequests() {
    const requests = await this.prisma.organizerRequest.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
        reviewer: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get organizer requests successfully',
      data: requests,
    };
  }

  async approveOrganizerRequest(requestId: string, adminId: string) {
    const request = await this.prisma.organizerRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new BadRequestException('Organizer request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Organizer request is already reviewed');
    }

    if (request.user.role === 'ADMIN') {
      throw new BadRequestException(
        'Admin accounts do not need organizer approval',
      );
    }

    const [updatedRequest] = await this.prisma.$transaction([
      this.prisma.organizerRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          reviewedBy: adminId,
          reviewedAt: new Date(),
          reviewNote: null,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              email: true,
              role: true,
              status: true,
            },
          },
          reviewer: {
            select: {
              id: true,
              username: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.user.update({
        where: { id: request.userId },
        data: { role: 'ORGANIZER' },
      }),
    ]);

    await this.auditLogsService.createLog(
      adminId,
      'ADMIN_APPROVE_ORGANIZER_REQUEST',
      'ORGANIZER_REQUEST',
      requestId,
      {
        userId: request.userId,
        previousRole: request.user.role,
        nextRole: 'ORGANIZER',
      },
    );

    await this.notificationsService.createNotification({
      userId: request.userId,
      title: 'Organizer request approved',
      message: 'Your account can now create and submit tournaments.',
      type: 'ORGANIZER_REQUEST_APPROVED',
      metadata: { requestId },
    });

    return {
      message: 'Approve organizer request successfully',
      data: updatedRequest,
    };
  }

  async rejectOrganizerRequest(
    requestId: string,
    adminId: string,
    dto: RejectApprovalDto,
  ) {
    const request = await this.prisma.organizerRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });

    if (!request) {
      throw new BadRequestException('Organizer request not found');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException('Organizer request is already reviewed');
    }

    const updatedRequest = await this.prisma.organizerRequest.update({
      where: { id: requestId },
      data: {
        status: 'REJECTED',
        reviewedBy: adminId,
        reviewedAt: new Date(),
        reviewNote: dto.reason ?? 'No reason provided',
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
          },
        },
        reviewer: {
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
      'ADMIN_REJECT_ORGANIZER_REQUEST',
      'ORGANIZER_REQUEST',
      requestId,
      {
        userId: request.userId,
        reason: updatedRequest.reviewNote,
      },
    );

    await this.notificationsService.createNotification({
      userId: request.userId,
      title: 'Organizer request rejected',
      message:
        updatedRequest.reviewNote ?? 'Your organizer request was rejected.',
      type: 'ORGANIZER_REQUEST_REJECTED',
      metadata: { requestId },
    });

    return {
      message: 'Reject organizer request successfully',
      data: updatedRequest,
    };
  }

  async getTournamentApprovals() {
    const tournaments = await this.prisma.tournament.findMany({
      where: {
        status: 'PENDING_APPROVAL',
      },
      include: {
        organizer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
          },
        },
        _count: {
          select: {
            registrations: true,
            matches: true,
          },
        },
      },
      orderBy: { approvalSubmittedAt: 'desc' },
    });

    return {
      message: 'Get tournament approvals successfully',
      data: tournaments,
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

    const updatedTournament = await this.prisma.tournament.update({
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
            role: true,
            status: true,
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

    await this.auditLogsService.createLog(
      adminId,
      'ADMIN_APPROVE_TOURNAMENT',
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
      updatedTournament,
    );

    return {
      message: 'Approve tournament successfully',
      data: updatedTournament,
    };
  }

  async rejectTournament(
    tournamentId: string,
    adminId: string,
    dto: RejectApprovalDto,
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

    const reason = dto.reason ?? 'No reason provided';
    const updatedTournament = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        status: 'DRAFT',
        approvalReviewedAt: new Date(),
        approvalReviewedBy: adminId,
        approvalRejectReason: reason,
      },
      include: {
        organizer: {
          select: {
            id: true,
            username: true,
            email: true,
            role: true,
            status: true,
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

    await this.auditLogsService.createLog(
      adminId,
      'ADMIN_REJECT_TOURNAMENT',
      'TOURNAMENT',
      tournamentId,
      {
        tournamentName: tournament.name,
        reason,
      },
    );

    await this.notificationsService.createNotification({
      userId: tournament.organizerId,
      title: 'Tournament needs changes',
      message: reason,
      type: 'TOURNAMENT_REJECTED',
      metadata: { tournamentId },
    });

    this.realtimeGateway.emitTournamentEvent(
      tournamentId,
      'tournament:status_changed',
      updatedTournament,
    );

    return {
      message: 'Reject tournament successfully',
      data: updatedTournament,
    };
  }

  async getAuditLogs() {
    const auditLogs = await this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get admin audit logs successfully',
      data: auditLogs,
    };
  }

  async getDisputes() {
    const disputes = await this.prisma.dispute.findMany({
      include: {
        match: {
          include: {
            evidences: true,
            tournament: {
              select: {
                id: true,
                name: true,
                game: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get admin disputes successfully',
      data: disputes,
    };
  }

  async updateUserRole(
    userId: string,
    adminId: string,
    dto: UpdateUserRoleDto,
  ) {
    if (!isUserRole(dto.role)) {
      throw new BadRequestException('Invalid user role');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!existingUser) {
      throw new BadRequestException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { role: dto.role },
      select: userSelect,
    });

    await this.auditLogsService.createLog(
      adminId,
      'ADMIN_UPDATE_USER_ROLE',
      'USER',
      userId,
      {
        previousRole: existingUser.role,
        nextRole: dto.role,
      },
    );

    return {
      message: 'Update user role successfully',
      data: updatedUser,
    };
  }

  async updateUserStatus(
    userId: string,
    adminId: string,
    dto: UpdateUserStatusDto,
  ) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });

    if (!existingUser) {
      throw new BadRequestException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { status: dto.status },
      select: userSelect,
    });

    await this.auditLogsService.createLog(
      adminId,
      'ADMIN_UPDATE_USER_STATUS',
      'USER',
      userId,
      {
        previousStatus: existingUser.status,
        nextStatus: dto.status,
      },
    );

    return {
      message: 'Update user status successfully',
      data: updatedUser,
    };
  }

  banUser(userId: string, adminId: string) {
    return this.updateUserStatus(userId, adminId, { status: 'BANNED' });
  }

  unbanUser(userId: string, adminId: string) {
    return this.updateUserStatus(userId, adminId, { status: 'ACTIVE' });
  }

  async getAnalytics() {
    const [
      totalUsers,
      activeUsers,
      bannedUsers,
      totalTeams,
      totalTournaments,
      openTournaments,
      ongoingTournaments,
      completedTournaments,
      openDisputes,
      pendingOrganizerRequests,
      pendingTournamentApprovals,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'BANNED' } }),
      this.prisma.team.count(),
      this.prisma.tournament.count(),
      this.prisma.tournament.count({ where: { status: 'OPEN_REGISTRATION' } }),
      this.prisma.tournament.count({ where: { status: 'ONGOING' } }),
      this.prisma.tournament.count({ where: { status: 'COMPLETED' } }),
      this.prisma.dispute.count({ where: { status: 'OPEN' } }),
      this.prisma.organizerRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.tournament.count({ where: { status: 'PENDING_APPROVAL' } }),
    ]);

    return {
      message: 'Get admin analytics successfully',
      data: {
        totalUsers,
        activeUsers,
        bannedUsers,
        totalTeams,
        totalTournaments,
        openTournaments,
        ongoingTournaments,
        completedTournaments,
        openDisputes,
        pendingOrganizerRequests,
        pendingTournamentApprovals,
      },
    };
  }
}
