import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyResetOtpDto } from './dto/verify-reset-otp.dto';
import { PasswordResetMailService } from './password-reset-mail.service';
import { UserRole, isUserRole } from './constants/user-role';

type AuthSessionUser = {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: string;
};

type GoogleTokenInfo = {
  aud?: string;
  sub?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly passwordResetMailService: PasswordResetMailService,
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

  private async createAuthSession(user: AuthSessionUser, message: string) {
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
      message,
      data: {
        ...tokens,
        role,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          avatarUrl: user.avatarUrl,
          role,
        },
      },
    };
  }

  private getGoogleClientIds() {
    return (process.env.GOOGLE_CLIENT_ID ?? '')
      .split(',')
      .map((clientId) => clientId.trim())
      .filter(Boolean);
  }

  private async verifyGoogleIdToken(idToken: string) {
    const googleClientIds = this.getGoogleClientIds();

    if (googleClientIds.length === 0) {
      throw new BadRequestException('Google login is not configured');
    }

    let tokenInfo: GoogleTokenInfo;

    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(
          idToken,
        )}`,
      );

      if (!response.ok) {
        throw new UnauthorizedException('Invalid Google token');
      }

      tokenInfo = (await response.json()) as GoogleTokenInfo;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException('Google token verification failed');
    }

    const emailVerified =
      tokenInfo.email_verified === true || tokenInfo.email_verified === 'true';

    if (
      !tokenInfo.aud ||
      !googleClientIds.includes(tokenInfo.aud) ||
      !tokenInfo.sub ||
      !tokenInfo.email ||
      !emailVerified
    ) {
      throw new UnauthorizedException('Invalid Google token');
    }

    return {
      googleId: tokenInfo.sub,
      email: tokenInfo.email.trim().toLowerCase(),
      name: tokenInfo.name?.trim() || tokenInfo.email.split('@')[0],
      avatarUrl: tokenInfo.picture?.trim() || null,
    };
  }

  private async generateGoogleUsername(name: string, email: string) {
    const source = name || email.split('@')[0] || 'player';
    const base =
      source
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 28) || 'player';
    const safeBase = base.length >= 3 ? base : `player-${base}`;
    let candidate = safeBase;
    let counter = 1;

    while (await this.usersService.findByUsername(candidate)) {
      counter += 1;
      candidate = `${safeBase}-${counter}`.slice(0, 36).replace(/-+$/g, '');
    }

    return candidate;
  }

  private normalizeEmail(email: string) {
    return email.trim().toLowerCase();
  }

  private getPasswordResetOtpExpiresAt() {
    const ttlMinutes = Number(process.env.PASSWORD_RESET_OTP_TTL_MINUTES ?? 10);
    const safeTtlMinutes = Number.isFinite(ttlMinutes)
      ? Math.max(1, ttlMinutes)
      : 10;

    return new Date(Date.now() + safeTtlMinutes * 60 * 1000);
  }

  private async getValidPasswordResetOtp(userId: string, otp: string) {
    const resetOtp = await this.prisma.passwordResetOtp.findFirst({
      where: {
        userId,
        consumedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!resetOtp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const isValidOtp = await bcrypt.compare(otp, resetOtp.otpHash);

    if (!isValidOtp) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    return resetOtp;
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

  async loginWithGoogle(dto: GoogleLoginDto) {
    const googleProfile = await this.verifyGoogleIdToken(dto.idToken);
    let user = await this.usersService.findByEmail(googleProfile.email);

    if (user) {
      const updateData: {
        googleId?: string | null;
        avatarUrl?: string | null;
      } = {};

      if (!user.googleId) {
        updateData.googleId = googleProfile.googleId;
      }

      if (!user.avatarUrl && googleProfile.avatarUrl) {
        updateData.avatarUrl = googleProfile.avatarUrl;
      }

      if (Object.keys(updateData).length > 0) {
        user = await this.usersService.updateGoogleIdentity(
          user.id,
          updateData,
        );
      }

      return this.createAuthSession(user, 'Login with Google successfully');
    }

    const username = await this.generateGoogleUsername(
      googleProfile.name,
      googleProfile.email,
    );
    const passwordHash = await bcrypt.hash(`google:${randomUUID()}`, 10);

    user = await this.usersService.create({
      email: googleProfile.email,
      username,
      passwordHash,
      provider: 'GOOGLE',
      googleId: googleProfile.googleId,
      avatarUrl: googleProfile.avatarUrl,
      role: UserRole.PLAYER,
    });

    return this.createAuthSession(user, 'Login with Google successfully');
  }

  async requestPasswordReset(dto: ForgotPasswordDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('Email is not registered');
    }

    const otp = randomInt(100000, 1000000).toString();
    const otpHash = await bcrypt.hash(otp, 10);
    const now = new Date();

    await this.prisma.passwordResetOtp.updateMany({
      where: {
        userId: user.id,
        consumedAt: null,
      },
      data: {
        consumedAt: now,
      },
    });

    await this.prisma.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt: this.getPasswordResetOtpExpiresAt(),
      },
    });

    try {
      await this.passwordResetMailService.sendPasswordResetOtp(email, otp);
    } catch {
      throw new BadRequestException('Could not send password reset email');
    }

    return {
      message: 'Password reset OTP has been sent',
    };
  }

  async verifyPasswordResetOtp(dto: VerifyResetOtpDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('Email is not registered');
    }

    await this.getValidPasswordResetOtp(user.id, dto.otp);

    return {
      message: 'OTP verified successfully',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = this.normalizeEmail(dto.email);
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('Email is not registered');
    }

    await this.getValidPasswordResetOtp(user.id, dto.otp);

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    const consumedAt = new Date();

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          refreshTokenHash: null,
        },
      }),
      this.prisma.passwordResetOtp.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
        },
        data: {
          consumedAt,
        },
      }),
    ]);

    return {
      message: 'Password reset successfully',
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
        avatarUrl: authUser.avatarUrl,
        role,
        status: authUser.status,
      },
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException('Access denied');
    }

    const nextUsername = dto.username?.trim();

    if (nextUsername && nextUsername !== user.username) {
      const existingUsername =
        await this.usersService.findByUsername(nextUsername);

      if (existingUsername && existingUsername.id !== userId) {
        throw new BadRequestException('Username already exists');
      }
    }

    const updatedUser = await this.usersService.updateProfile(userId, {
      username: nextUsername || undefined,
      avatarUrl:
        dto.avatarUrl === undefined
          ? undefined
          : dto.avatarUrl?.trim()
            ? dto.avatarUrl.trim()
            : null,
    });
    const role = this.parseUserRole(updatedUser.role);

    return {
      message: 'Update profile successfully',
      data: {
        sub: updatedUser.id,
        email: updatedUser.email,
        username: updatedUser.username,
        avatarUrl: updatedUser.avatarUrl,
        role,
        status: updatedUser.status,
      },
    };
  }
}
