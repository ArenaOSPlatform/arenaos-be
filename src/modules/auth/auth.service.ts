import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole, isUserRole } from './constants/user-role';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  private async signTokens(user: {
    id: string;
    email: string;
    username: string;
    role: UserRole;
  }) {
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
      expiresIn: '15m',
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'arenaos_refresh_secret',
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }

  private parseUserRole(role: string): UserRole {
    if (!isUserRole(role)) {
      throw new UnauthorizedException('Invalid user role');
    }

    return role;
  }

  async register(dto: RegisterDto) {
    const existingEmail = await this.usersService.findByEmail(dto.email);
    if (existingEmail) throw new BadRequestException('Email already exists');

    const existingUsername = await this.usersService.findByUsername(
      dto.username,
    );
    if (existingUsername)
      throw new BadRequestException('Username already exists');

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.usersService.create({
      email: dto.email,
      username: dto.username,
      passwordHash,
    });

    const role = this.parseUserRole(user.role);
    const tokens = await this.signTokens({
      id: user.id,
      email: user.email,
      username: user.username,
      role,
    });
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);

    await this.usersService.updateRefreshTokenHash(user.id, refreshTokenHash);

    return {
      message: 'Register successfully',
      data: {
        ...tokens,
        role,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role,
        },
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    const authUser = user;

    if (!authUser) throw new UnauthorizedException('Invalid email or password');

    const isMatch = await bcrypt.compare(dto.password, authUser.passwordHash);
    if (!isMatch) throw new UnauthorizedException('Invalid email or password');

    const role = this.parseUserRole(authUser.role);
    const tokens = await this.signTokens({
      id: authUser.id,
      email: authUser.email,
      username: authUser.username,
      role,
    });
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);

    await this.usersService.updateRefreshTokenHash(
      authUser.id,
      refreshTokenHash,
    );

    return {
      message: 'Login successfully',
      data: {
        ...tokens,
        role,
        user: {
          id: authUser.id,
          email: authUser.email,
          username: authUser.username,
          role,
        },
      },
    };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    const authUser = user;

    if (!authUser || !authUser.refreshTokenHash) {
      throw new UnauthorizedException('Access denied');
    }

    const isMatch = await bcrypt.compare(
      refreshToken,
      authUser.refreshTokenHash,
    );

    if (!isMatch) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const role = this.parseUserRole(authUser.role);
    const tokens = await this.signTokens({
      id: authUser.id,
      email: authUser.email,
      username: authUser.username,
      role,
    });
    const refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);

    await this.usersService.updateRefreshTokenHash(
      authUser.id,
      refreshTokenHash,
    );

    return {
      message: 'Refresh token successfully',
      data: {
        ...tokens,
        role,
        user: {
          id: authUser.id,
          email: authUser.email,
          username: authUser.username,
          role,
        },
      },
    };
  }

  async logout(userId: string) {
    await this.usersService.updateRefreshTokenHash(userId, null);

    return {
      message: 'Logout successfully',
    };
  }

  async getMe(userId: string) {
    const user = await this.usersService.findById(userId);
    const authUser = user;

    if (!authUser) {
      throw new UnauthorizedException('Access denied');
    }

    const role = this.parseUserRole(authUser.role);

    return {
      message: 'Get current user successfully',
      data: {
        sub: authUser.id,
        email: authUser.email,
        username: authUser.username,
        role,
        status: authUser.status,
      },
    };
  }
}
