import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UserRole, isUserRole } from '../constants/user-role';

type RequestWithRefreshUser = Request & {
  user?: {
    sub: string;
    email: string;
    username: string;
    role: UserRole;
    refreshToken: string;
  };
};

@Injectable()
export class RefreshTokenGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithRefreshUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid refresh token format');
    }

    const payload = await this.jwtService.verifyAsync<{
      sub: string;
      email: string;
      username: string;
      role: string;
    }>(token, {
      secret: process.env.JWT_REFRESH_SECRET || 'arenaos_refresh_secret',
    });

    if (!isUserRole(payload.role)) {
      throw new UnauthorizedException('Invalid refresh token role');
    }

    request.user = {
      ...payload,
      role: payload.role,
      refreshToken: token,
    };

    return true;
  }
}
