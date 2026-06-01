import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateEvidenceDto } from './dto/create-evidence.dto';

@Injectable()
export class EvidencesService {
  constructor(private readonly prisma: PrismaService) {}

  async createEvidence(
    matchId: string,
    userId: string,
    dto: CreateEvidenceDto,
  ) {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
    });

    if (!match) {
      throw new BadRequestException('Match not found');
    }

    const evidence = await this.prisma.matchEvidence.create({
      data: {
        matchId,
        submittedBy: userId,
        imageUrl: dto.imageUrl,
        note: dto.note,
      },
    });

    return {
      message: 'Submit evidence successfully',
      data: evidence,
    };
  }

  async getMatchEvidences(matchId: string) {
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
