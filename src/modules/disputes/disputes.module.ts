import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TournamentCompletionService } from '../tournament-completion.service';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [
    AuditLogsModule,
    NotificationsModule,
    LeaderboardsModule,
    RealtimeModule,
  ],
  controllers: [DisputesController],
  providers: [DisputesService, TournamentCompletionService],
})
export class DisputesModule {}
