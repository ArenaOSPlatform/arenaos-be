import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { RolesGuard } from './guards/roles.guard';
import { DatabaseModule } from '../../database/database.module';

@Global()
@Module({
  imports: [DatabaseModule, JwtModule.register({})],
  providers: [JwtAuthGuard, RefreshTokenGuard, RolesGuard, RateLimitGuard],
  exports: [
    JwtModule,
    JwtAuthGuard,
    RefreshTokenGuard,
    RolesGuard,
    RateLimitGuard,
  ],
})
export class SecurityModule {}
