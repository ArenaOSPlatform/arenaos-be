import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { TeamsModule } from './modules/teams/teams.module';
import { TournamentsModule } from './modules/tournaments/tournaments.module';
import { MatchesModule } from './modules/matches/matches.module';
import { EvidencesModule } from './modules/evidences/evidences.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AdminModule } from './modules/admin/admin.module';
import { OrganizerRequestsModule } from './modules/organizer-requests/organizer-requests.module';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { LandingModule } from './modules/landing/landing.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthModule,
    TeamsModule,
    TournamentsModule,
    MatchesModule,
    EvidencesModule,
    DisputesModule,
    AuditLogsModule,
    NotificationsModule,
    RealtimeModule,
    AdminModule,
    OrganizerRequestsModule,
    LeaderboardsModule,
    UploadsModule,
    LandingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
