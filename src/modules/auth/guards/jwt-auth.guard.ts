import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UserRole, isUserRole } from '../constants/user-role';
import { getJwtAccessSecret } from '../../../config/environment';
import { PrismaService } from '../../../database/prisma.service';

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
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

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
        secret: getJwtAccessSecret(),
      });

      if (!isUserRole(payload.role)) {
        throw new UnauthorizedException('Invalid token role');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
        },
      });

      if (!user || user.status !== 'ACTIVE' || !isUserRole(user.role)) {
        throw new UnauthorizedException('Account is not active');
      }

      request.user = {
        sub: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return true;
  }
}
