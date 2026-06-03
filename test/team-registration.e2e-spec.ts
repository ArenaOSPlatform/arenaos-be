import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

type LoginResponse = {
  data: {
    accessToken: string;
    user: {
      id: string;
    };
  };
};

type TournamentResponse = {
  data: {
    id: string;
  };
};

type RegistrationResponse = {
  data: {
    id: string;
    status: string;
  };
};

describe('Team Registration E2E', () => {
  const runId = randomUUID();

  let app: INestApplication<App>;

  let organizerToken = '';
  let adminToken = '';
  let captainToken = '';
  let captainUserId = '';
  let tournamentId = '';
  let registrationId = '';

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
  });

  it('should login admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@arenaos.com',
        password: '123456',
      })
      .expect(201);
    const body = res.body as unknown as LoginResponse;

    adminToken = body.data.accessToken;
  });

  it('should register captain player and create team', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username: `teamreg_${runId}`,
        email: `teamreg_${runId}@arenaos.com`,
        password: '123456',
      })
      .expect(201);
    const body = res.body as unknown as LoginResponse;

    captainToken = body.data.accessToken;
    captainUserId = body.data.user.id;

    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        name: `Team Registration E2E ${runId}`,
        game: 'Valorant',
        region: 'VN',
        description: 'Team registration E2E test team',
      })
      .expect(201);
  });

  it('should create tournament and approve registration opening', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Registration E2E Cup ${runId}`,
        game: 'Valorant',
        description: 'Registration E2E test',
        maxTeams: 4,
        teamSize: 1,
        format: 'SINGLE_ELIMINATION',
        prizePool: '$1000',
        rules: 'BO3',
        startDate: '2026-07-01T08:00:00.000Z',
        endDate: '2026-07-03T08:00:00.000Z',
        registrationDeadline: '2026-06-25T08:00:00.000Z',
      })
      .expect(201);
    const createBody = createRes.body as unknown as TournamentResponse;

    tournamentId = createBody.data.id;

    await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/submit-approval`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/tournaments/${tournamentId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
  });

  it('should register captain team to tournament', async () => {
    const res = await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/register-team`)
      .set('Authorization', `Bearer ${captainToken}`)
      .send({
        mainPlayerIds: [captainUserId],
        substituteIds: [],
      })
      .expect(201);
    const body = res.body as unknown as RegistrationResponse;

    registrationId = body.data.id;

    expect(body.data.status).toBe('PENDING');
  });

  it('should approve registration', async () => {
    const res = await request(app.getHttpServer())
      .post(`/registrations/${registrationId}/approve`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);
    const body = res.body as unknown as RegistrationResponse;

    expect(body.data.status).toBe('APPROVED');
  });
});
