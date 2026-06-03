import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RegistrationsController } from './registrations.controller';
import { TournamentsController } from './tournaments.controller';
import { TournamentsService } from './tournaments.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
    }),
    AuditLogsModule,
    NotificationsModule,
    LeaderboardsModule,
    RealtimeModule,
  ],
  controllers: [TournamentsController, RegistrationsController],
  providers: [TournamentsService],
})
export class TournamentsModule {}
