import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { RealtimeGateway } from '../realtime/realtime/realtime.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async createNotification(data: {
    userId: string;
    title: string;
    message: string;
    type: string;
    metadata?: unknown;
  }) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        message: data.message,
        type: data.type,
        metadata: data.metadata ? JSON.stringify(data.metadata) : null,
      },
    });
    console.log('CREATE NOTIFICATION FOR:', data.userId);
    this.realtimeGateway.sendNotification(data.userId, notification);

    return notification;
  }

  sendNotification(userId: string, notification: unknown) {
    console.log('EMIT TO ROOM:', `user:${userId}`);
    this.realtimeGateway.sendNotification(userId, notification);
  }

  async getMyNotifications(userId: string) {
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get notifications successfully',
      data: notifications,
    };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new BadRequestException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new BadRequestException('This notification does not belong to you');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return {
      message: 'Mark notification as read successfully',
      data: updated,
    };
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    return {
      message: 'Mark all notifications as read successfully',
    };
  }
}
