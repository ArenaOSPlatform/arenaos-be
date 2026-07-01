import { Test, TestingModule } from '@nestjs/testing';
import { MatchesService } from './matches.service';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';
import { TournamentCompletionService } from '../tournament-completion.service';
import { RealtimeGateway } from '../realtime/realtime/realtime.gateway';

describe('MatchesService', () => {
  let service: MatchesService;
  let prisma: {
    match: { updateMany: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      match: {
        updateMany: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogsService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: LeaderboardsService, useValue: {} },
        { provide: TournamentCompletionService, useValue: {} },
        { provide: RealtimeGateway, useValue: {} },
      ],
    }).compile();

    service = module.get<MatchesService>(MatchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('does not throw when reminder queries hit a missing database column', async () => {
    prisma.match.findMany.mockRejectedValue({
      code: 'P2022',
      meta: { column: 'reminderSentAt' },
    });

    await expect(service['processDueReminders']()).resolves.toBeUndefined();
  });
});
