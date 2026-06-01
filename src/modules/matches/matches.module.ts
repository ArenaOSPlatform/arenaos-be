import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TournamentCompletionService } from '../tournament-completion.service';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    AuditLogsModule,
    NotificationsModule,
    LeaderboardsModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService, TournamentCompletionService],
})
export class MatchesModule {}
