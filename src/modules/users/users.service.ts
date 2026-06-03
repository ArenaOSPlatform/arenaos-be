import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { User } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  create(data: {
    email: string;
    username: string;
    passwordHash: string;
    provider?: string;
    googleId?: string | null;
    avatarUrl?: string | null;
    role?: string;
  }): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  findAll(): Promise<User[]> {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        avatarUrl: true,
        role: true,
        status: true,
        createdAt: true,
        teamMembers: {
          include: {
            team: {
              select: {
                id: true,
                name: true,
                logoUrl: true,
                game: true,
                region: true,
                status: true,
                totalMatchesPlayed: true,
                totalWins: true,
                totalLosses: true,
                championCount: true,
                overallWinRate: true,
              },
            },
          },
        },
      },
    });

    return {
      message: user ? 'Get user profile successfully' : 'User not found',
      data: user,
    };
  }
  updateRefreshTokenHash(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  updateProfile(
    userId: string,
    data: {
      username?: string;
      avatarUrl?: string | null;
    },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  updateGoogleIdentity(
    userId: string,
    data: {
      googleId?: string | null;
      avatarUrl?: string | null;
    },
  ): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }
}
