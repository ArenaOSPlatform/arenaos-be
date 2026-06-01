import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UserRole, isUserRole } from '../constants/user-role';

type RequestWithUser = Request & {
  user?: {
    sub: string;
    email: string;
    username: string;
    role: UserRole;
  };
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid authorization format');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        username: string;
        role: string;
      }>(token, {
        secret: process.env.JWT_SECRET || 'arenaos_access_secret',
      });

      if (!isUserRole(payload.role)) {
        throw new UnauthorizedException('Invalid token role');
      }

      request.user = { ...payload, role: payload.role };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }
}
