import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizerRequestsController } from './organizer-requests.controller';
import { OrganizerRequestsService } from './organizer-requests.service';

@Module({
  imports: [AuditLogsModule, NotificationsModule],
  controllers: [OrganizerRequestsController],
  providers: [OrganizerRequestsService],
})
export class OrganizerRequestsModule {}
