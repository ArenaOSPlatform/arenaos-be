import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    NotificationsModule,
    LeaderboardsModule,
  ],
  controllers: [TeamsController],
  providers: [TeamsService],
})
export class TeamsModule {}
