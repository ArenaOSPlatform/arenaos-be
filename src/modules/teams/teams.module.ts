import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { TeamInvitesController } from './team-invites.controller';
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    NotificationsModule,
    LeaderboardsModule,
    AuditLogsModule,
  ],
  controllers: [TeamsController, TeamInvitesController],
  providers: [TeamsService],
})
export class TeamsModule {}
