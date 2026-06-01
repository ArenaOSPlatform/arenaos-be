import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizerRequestsController } from './organizer-requests.controller';
import { OrganizerRequestsService } from './organizer-requests.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
    }),
    AuditLogsModule,
    NotificationsModule,
  ],
  controllers: [OrganizerRequestsController],
  providers: [OrganizerRequestsService],
})
export class OrganizerRequestsModule {}
