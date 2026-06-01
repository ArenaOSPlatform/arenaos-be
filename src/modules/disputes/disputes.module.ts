import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TournamentCompletionService } from '../tournament-completion.service';
import { DisputesController } from './disputes.controller';
import { DisputesService } from './disputes.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
    }),
    AuditLogsModule,
    NotificationsModule,
    LeaderboardsModule,
  ],
  controllers: [DisputesController],
  providers: [DisputesService, TournamentCompletionService],
})
export class DisputesModule {}
