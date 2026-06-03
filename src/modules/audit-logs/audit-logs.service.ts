import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  createLog(
    userId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    metadata?: unknown,
  ) {
    const serializedMetadata = metadata ? JSON.stringify(metadata) : null;

    return this.prisma.auditLog.create({
      data: {
        userId,
        actorId: userId,
        action,
        entityType,
        targetType: entityType,
        entityId,
        targetId: entityId,
        metadata: serializedMetadata,
        newValue: serializedMetadata,
      },
    });
  }

  findAll() {
    return this.prisma.auditLog.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
