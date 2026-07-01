import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma.service';
import { UserRole } from '../auth/constants/user-role';
import { DisputesService } from './disputes.service';

describe('DisputesService', () => {
  let service: DisputesService;
  let prisma: {
    dispute: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      dispute: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputesService,
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .useMocker(() => ({}))
      .compile();

    service = module.get<DisputesService>(DisputesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not write before a dispute resolution is fully validated', async () => {
    prisma.dispute.findUnique.mockResolvedValue({
      id: 'dispute-1',
      status: 'OPEN',
      matchId: 'match-1',
      match: {
        id: 'match-1',
        tournamentId: 'tournament-1',
        teamAId: 'team-a',
        teamBId: 'team-b',
        pendingScoreA: 2,
        pendingScoreB: 1,
        bestOf: 'BO3',
        nextMatchId: null,
        nextSlot: null,
        tournament: {
          id: 'tournament-1',
          name: 'Arena Cup',
          organizerId: 'organizer-1',
          status: 'ONGOING',
        },
        evidences: [],
      },
    });

    await expect(
      service.resolveDispute('dispute-1', 'admin-1', UserRole.ADMIN, {
        decision: 'CHANGE_RESULT',
        decisionReason: 'Correcting the submitted score',
        scoreA: 2,
      }),
    ).rejects.toThrow('Both scoreA and scoreB are required');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
