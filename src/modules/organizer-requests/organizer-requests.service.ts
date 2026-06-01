import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateOrganizerRequestDto } from './dto/create-organizer-request.dto';

@Injectable()
export class OrganizerRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createRequest(userId: string, dto: CreateOrganizerRequestDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, role: true, status: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new BadRequestException('Only active users can request organizer');
    }

    if (user.role === 'ORGANIZER') {
      throw new BadRequestException('You are already an organizer');
    }

    if (user.role === 'ADMIN') {
      throw new BadRequestException(
        'Admin accounts do not need organizer approval',
      );
    }

    const pendingRequest = await this.prisma.organizerRequest.findFirst({
      where: {
        userId,
        status: 'PENDING',
      },
    });

    if (pendingRequest) {
      throw new BadRequestException(
        'You already have a pending organizer request',
      );
    }

    const request = await this.prisma.organizerRequest.create({
      data: {
        userId,
        reason: dto.reason,
        experience: dto.experience,
        portfolioUrl: dto.portfolioUrl,
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
      },
    });

    await this.auditLogsService.createLog(
      userId,
      'SUBMIT_ORGANIZER_REQUEST',
      'ORGANIZER_REQUEST',
      request.id,
      {
        username: user.username,
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
          title: 'New organizer request',
          message: `${user.username} requested organizer access.`,
          type: 'ORGANIZER_REQUEST',
          metadata: { requestId: request.id },
        }),
      ),
    );

    return {
      message: 'Organizer request submitted successfully',
      data: request,
    };
  }

  async getMyRequests(userId: string) {
    const requests = await this.prisma.organizerRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    });

    return {
      message: 'Get organizer requests successfully',
      data: requests,
    };
  }
}
