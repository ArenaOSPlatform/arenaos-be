import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { UserRole, isUserRole } from '../constants/user-role';
import { getJwtRefreshSecret } from '../../../config/environment';
import { getRefreshTokenFromRequest } from '../refresh-token-cookie';

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
    const [type, headerToken] = authHeader?.split(' ') ?? [];
    const token =
      type === 'Bearer' && headerToken
        ? headerToken
        : getRefreshTokenFromRequest(request);

    if (!token) {
      throw new UnauthorizedException('Missing refresh token');
    }

    let payload: {
      sub: string;
      email: string;
      username: string;
      role: string;
    };

    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: getJwtRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

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
