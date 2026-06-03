import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
      signOptions: { expiresIn: '15m' },
    }),
    AuditLogsModule,
    NotificationsModule,
    RealtimeModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
