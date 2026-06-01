import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

type LoginResponse = {
  data: {
    accessToken: string;
  };
};

type TournamentResponse = {
  data: {
    id: string;
    status: string;
  };
};

describe('Tournament E2E', () => {
  let app: INestApplication<App>;

  let organizerToken = '';
  let tournamentId = '';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should login organizer', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'organizer@arenaos.com',
        password: '123456',
      })
      .expect(201);
    const body = res.body as unknown as LoginResponse;

    organizerToken = body.data.accessToken;

    expect(organizerToken).toBeDefined();
  });

  it('should create tournament', async () => {
    const res = await request(app.getHttpServer())
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `E2E Cup ${Date.now()}`,
        game: 'Valorant',
        description: 'E2E tournament test',
        maxTeams: 4,
        teamSize: 5,
        format: 'SINGLE_ELIMINATION',
        prizePool: '$1000',
        rules: 'BO3',
        startDate: '2026-07-01T08:00:00.000Z',
        endDate: '2026-07-03T08:00:00.000Z',
        registrationDeadline: '2026-06-25T08:00:00.000Z',
      })
      .expect(201);
    const body = res.body as unknown as TournamentResponse;

    tournamentId = body.data.id;

    expect(tournamentId).toBeDefined();
    expect(body.data.status).toBe('DRAFT');
  });

  it('should get tournament detail', async () => {
    const res = await request(app.getHttpServer())
      .get(`/tournaments/${tournamentId}`)
      .expect(200);
    const body = res.body as unknown as TournamentResponse;

    expect(body.data.id).toBe(tournamentId);
  });
});
