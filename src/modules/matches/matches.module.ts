import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TournamentCompletionService } from '../tournament-completion.service';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [
    AuditLogsModule,
    NotificationsModule,
    LeaderboardsModule,
    RealtimeModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService, TournamentCompletionService],
})
export class MatchesModule {}
