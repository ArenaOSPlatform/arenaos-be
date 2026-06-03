import { Test, TestingModule } from '@nestjs/testing';
import { TournamentsService } from './tournaments.service';

describe('TournamentsService', () => {
  let service: TournamentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TournamentsService],
    })
      .useMocker(() => ({}))
      .compile();

    service = module.get<TournamentsService>(TournamentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

describe('TournamentsService announcements', () => {
  const originalFetch = global.fetch;
  const originalDiscordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

  let service: TournamentsService;
  let prisma: {
    tournament: { findUnique: jest.Mock };
    tournamentAnnouncement: { create: jest.Mock };
  };
  let auditLogsService: { createLog: jest.Mock };
  let notificationsService: { createNotification: jest.Mock };

  beforeEach(() => {
    prisma = {
      tournament: {
        findUnique: jest.fn(),
      },
      tournamentAnnouncement: {
        create: jest.fn(),
      },
    };
    auditLogsService = {
      createLog: jest.fn().mockResolvedValue(undefined),
    };
    notificationsService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };

    service = new TournamentsService(
      prisma as never,
      auditLogsService as never,
      notificationsService as never,
      {} as never,
      {} as never,
    );
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.DISCORD_WEBHOOK_URL = originalDiscordWebhookUrl;
    jest.restoreAllMocks();
  });

  function mockTournament() {
    prisma.tournament.findUnique.mockResolvedValue({
      id: 'tournament-1',
      name: 'Summer Arena Cup',
      organizerId: 'organizer-1',
      status: 'OPEN',
      registrations: [
        {
          team: {
            members: [{ userId: 'player-1' }, { userId: 'player-2' }],
          },
        },
      ],
    });
  }

  function mockAnnouncement() {
    prisma.tournamentAnnouncement.create.mockResolvedValue({
      id: 'announcement-1',
      tournamentId: 'tournament-1',
      createdBy: 'organizer-1',
      title: 'Schedule update',
      content: 'Grand final starts at 8 PM.',
      type: 'INFO',
      createdAt: new Date('2026-06-03T12:00:00.000Z'),
      updatedAt: new Date('2026-06-03T12:00:00.000Z'),
    });
  }

  it('posts a Discord webhook when an announcement is created', async () => {
    mockTournament();
    mockAnnouncement();

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: jest.fn().mockResolvedValue(''),
    });

    global.fetch = fetchMock as never;
    process.env.DISCORD_WEBHOOK_URL =
      'https://discord.com/api/webhooks/webhook-id/webhook-token';

    const result = await service.createAnnouncement(
      'tournament-1',
      'organizer-1',
      {
        title: 'Schedule update',
        content: 'Grand final starts at 8 PM.',
        type: 'INFO',
      },
    );

    expect(result.data.delivery).toEqual({
      inAppRecipients: 2,
      discord: {
        configured: true,
        sent: true,
        status: 200,
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, request] = fetchMock.mock.calls[0] as [URL, RequestInit];

    if (typeof request.body !== 'string') {
      throw new Error('Expected Discord webhook request body to be a string');
    }

    const body = JSON.parse(request.body) as {
      username: string;
      content: string;
      allowed_mentions: { parse: string[] };
      embeds: Array<{
        title: string;
        description: string;
        fields: Array<{ name: string; value: string; inline: boolean }>;
      }>;
    };

    expect(url.toString()).toBe(
      'https://discord.com/api/webhooks/webhook-id/webhook-token?wait=true',
    );
    expect(request.method).toBe('POST');
    expect(body.username).toBe('ArenaOS');
    expect(body.allowed_mentions.parse).toEqual([]);
    expect(body.embeds[0].title).toBe('Schedule update');
    expect(body.embeds[0].description).toBe('Grand final starts at 8 PM.');
    expect(body.embeds[0].fields).toEqual(
      expect.arrayContaining([
        {
          name: 'Tournament',
          value: 'Summer Arena Cup',
          inline: false,
        },
        {
          name: 'Notified members',
          value: '2',
          inline: true,
        },
      ]),
    );
  });

  it('keeps the announcement flow successful when Discord fails', async () => {
    mockTournament();
    mockAnnouncement();

    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Server Error',
      text: jest.fn().mockResolvedValue('discord unavailable'),
    });

    global.fetch = fetchMock as never;
    process.env.DISCORD_WEBHOOK_URL =
      'https://discord.com/api/webhooks/webhook-id/webhook-token';

    const result = await service.createAnnouncement(
      'tournament-1',
      'organizer-1',
      {
        title: 'Schedule update',
        content: 'Grand final starts at 8 PM.',
        type: 'INFO',
      },
    );

    expect(result.message).toBe('Announcement created successfully');
    expect(result.data.delivery).toEqual({
      inAppRecipients: 2,
      discord: {
        configured: true,
        sent: false,
        status: 500,
        error: 'Server Error',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notificationsService.createNotification).toHaveBeenCalledTimes(2);
  });

  it('creates announcement and posts Discord when there are no team members', async () => {
    prisma.tournament.findUnique.mockResolvedValue({
      id: 'tournament-1',
      name: 'Summer Arena Cup',
      organizerId: 'organizer-1',
      status: 'DRAFT',
      registrations: [],
    });
    mockAnnouncement();

    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: jest.fn().mockResolvedValue(''),
    });

    global.fetch = fetchMock as never;
    process.env.DISCORD_WEBHOOK_URL =
      'https://discord.com/api/webhooks/webhook-id/webhook-token';

    const result = await service.createAnnouncement(
      'tournament-1',
      'organizer-1',
      {
        title: 'Draft update',
        content: 'Draft tournament announcement.',
        type: 'INFO',
      },
    );

    expect(result.message).toBe('Announcement created successfully');
    expect(result.data.delivery.inAppRecipients).toBe(0);
    expect(result.data.delivery.discord.sent).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(notificationsService.createNotification).not.toHaveBeenCalled();
  });
});
