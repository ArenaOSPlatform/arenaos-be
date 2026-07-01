import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UserRole } from '../auth/constants/user-role';
import { CreateEvidenceDto } from './dto/create-evidence.dto';

@Injectable()
export class EvidencesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCanViewEvidence(
    match: {
      teamAId: string | null;
      teamBId: string | null;
      tournament: {
        organizerId: string;
      };
    },
    userId: string,
    userRole: UserRole,
  ) {
    if (
      userRole === UserRole.ADMIN ||
      match.tournament.organizerId === userId
    ) {
      return;
    }

    const teamIds = [match.teamAId, match.teamBId].filter(Boolean) as string[];

    if (teamIds.length === 0) {
      throw new ForbiddenException('You cannot access this match evidence');
    }

    const membership = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: {
          in: teamIds,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('You cannot access this match evidence');
    }
  }

  private async assertCanSubmitEvidence(
    match: {
      teamAId: string | null;
      teamBId: string | null;
      tournament: {
        organizerId: string;
      };
    },
    userId: string,
    userRole: UserRole,
  ) {
    if (
      userRole === UserRole.ADMIN ||
      match.tournament.organizerId === userId
    ) {
      return;
    }

    const teamIds = [match.teamAId, match.teamBId].filter(Boolean) as string[];

    if (teamIds.length === 0) {
      throw new ForbiddenException('You cannot submit evidence for this match');
    }

    const captainMembership = await this.prisma.teamMember.findFirst({
      where: {
        userId,
        teamId: {
          in: teamIds,
        },
        team: {
          captainId: userId,
        },
      },
      select: {
        id: true,
      },
    });

    if (!captainMembership) {
      throw new ForbiddenException(
        'Only match captains, organizer, or admin can submit evidence',
      );
    }
  }

  async createEvidence(
    matchId: string,
    userId: string,
    userRole: UserRole,
    dto: CreateEvidenceDto,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: {
          select: {
            organizerId: true,
          },
        },
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    await this.assertCanSubmitEvidence(match, userId, userRole);

    const evidence = await this.prisma.matchEvidence.create({
      data: {
        matchId,
        submittedBy: userId,
        imageUrl: dto.imageUrl,
        fileUrl: dto.fileUrl ?? dto.imageUrl,
        type: dto.type ?? 'SCREENSHOT',
        note: dto.note,
      },
    });

    return {
      message: 'Submit evidence successfully',
      data: evidence,
    };
  }

  async getMatchEvidences(matchId: string, userId: string, userRole: UserRole) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        tournament: {
          select: {
            organizerId: true,
          },
        },
      },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    await this.assertCanViewEvidence(match, userId, userRole);

    const evidences = await this.prisma.matchEvidence.findMany({
      where: { matchId },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Get evidences successfully',
      data: evidences,
    };
  }
}
