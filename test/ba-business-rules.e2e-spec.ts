import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
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
    status: string;
  };
};

type RegistrationResponse = {
  data: {
    id: string;
    status: string;
  };
};

type CaptainFixture = {
  token: string;
  userId: string;
  username: string;
  email: string;
};

type TeamResponse = {
  data: {
    id: string;
  };
};

type InviteResponse = {
  data: {
    id: string;
    status: string;
  };
};

describe('BA Business Rules E2E', () => {
  const runId = randomUUID().replaceAll('-', '');

  let app: INestApplication<App>;
  let organizerToken = '';
  let adminToken = '';

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

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: '123456',
      })
      .expect(201);

    const body = res.body as LoginResponse;
    return body.data.accessToken;
  }

  function tournamentPayload(name: string) {
    return {
      name,
      game: 'Valorant',
      description: 'BA business rules E2E tournament',
      maxTeams: 4,
      minTeams: 2,
      teamSize: 1,
      format: 'SINGLE_ELIMINATION',
      prizePool: '$1000',
      rules: 'BO3',
      startDate: '2026-07-01T08:00:00.000Z',
      endDate: '2026-07-03T08:00:00.000Z',
      registrationDeadline: '2026-06-25T08:00:00.000Z',
    };
  }

  async function createTournament(name: string): Promise<TournamentResponse> {
    const res = await request(app.getHttpServer())
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send(tournamentPayload(name))
      .expect(201);

    return res.body as TournamentResponse;
  }

  async function createCaptain(index: number): Promise<CaptainFixture> {
    const username = `ba_rules_${runId}_${index}`;
    const email = `${username}@arenaos.com`;
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        email,
        password: '123456',
      })
      .expect(201);

    const body = res.body as LoginResponse;

    return {
      token: body.data.accessToken,
      userId: body.data.user.id,
      username,
      email,
    };
  }

  async function createTeam(
    captain: CaptainFixture,
    name: string,
    game = 'Valorant',
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${captain.token}`)
      .send({
        name,
        game,
        region: 'VN',
        description: 'BA business rules E2E team',
      })
      .expect(201);

    const body = res.body as TeamResponse;
    return body.data.id;
  }

  beforeAll(async () => {
    organizerToken = await login('organizer@arenaos.com');
    adminToken = await login('admin@arenaos.com');
  });

  it('should reject tournament dates that do not match real approval rules', async () => {
    await request(app.getHttpServer())
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        ...tournamentPayload(`Invalid Date Cup ${runId}`),
        registrationDeadline: '2026-07-02T08:00:00.000Z',
      })
      .expect(400);
  });

  it('should require an admin rejection reason and allow resubmission after rejection', async () => {
    const createBody = await createTournament(`Reject Flow Cup ${runId}`);
    const tournamentId = createBody.data.id;

    await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/submit-approval`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/tournaments/${tournamentId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);

    const rejectRes = await request(app.getHttpServer())
      .post(`/admin/tournaments/${tournamentId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Rules need clearer match dispute handling',
      })
      .expect(201);

    const rejectBody = rejectRes.body as TournamentResponse;
    expect(rejectBody.data.status).toBe('REJECTED');

    const resubmitRes = await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/submit-approval`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    const resubmitBody = resubmitRes.body as TournamentResponse;
    expect(resubmitBody.data.status).toBe('PENDING_APPROVAL');
  });

  it('should require a cancellation reason before changing tournament status', async () => {
    const createBody = await createTournament(`Cancel Reason Cup ${runId}`);
    const tournamentId = createBody.data.id;

    await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/cancel`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({})
      .expect(400);

    const cancelRes = await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/cancel`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        reason: 'Organizer cannot guarantee tournament operations',
      })
      .expect(201);

    const cancelBody = cancelRes.body as TournamentResponse;
    expect(cancelBody.data.status).toBe('CANCELLED');
  });

  it('should prevent one player from belonging to multiple active teams', async () => {
    const captain = await createCaptain(1);

    await createTeam(captain, `BA Rules Team A ${runId}`, ' Valorant ');

    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${captain.token}`)
      .send({
        name: `BA Rules Team B ${runId}`,
        game: 'League of Legends',
        region: 'VN',
        description: 'Second active team in a different game',
      })
      .expect(400);
  });

  it('should prevent invite and accept flows from creating multiple team memberships', async () => {
    const captainA = await createCaptain(2);
    const captainB = await createCaptain(3);
    const invitee = await createCaptain(4);

    const teamAId = await createTeam(
      captainA,
      `BA Rules Invite Team A ${runId}`,
    );
    const teamBId = await createTeam(
      captainB,
      `BA Rules Invite Team B ${runId}`,
    );

    const inviteRes = await request(app.getHttpServer())
      .post(`/teams/${teamAId}/invites`)
      .set('Authorization', `Bearer ${captainA.token}`)
      .send({
        email: invitee.email,
      })
      .expect(201);

    const inviteBody = inviteRes.body as InviteResponse;
    expect(inviteBody.data.status).toBe('PENDING');

    await createTeam(invitee, `BA Rules Invitee Own Team ${runId}`);

    await request(app.getHttpServer())
      .post(`/teams/${teamBId}/invites`)
      .set('Authorization', `Bearer ${captainB.token}`)
      .send({
        username: invitee.username,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/teams/invites/${inviteBody.data.id}/accept`)
      .set('Authorization', `Bearer ${invitee.token}`)
      .expect(400);
  });

  it('should block closing registration while any team registration is still pending', async () => {
    const createBody = await createTournament(
      `Pending Registration Cup ${runId}`,
    );
    const tournamentId = createBody.data.id;
    const captain = await createCaptain(5);

    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${captain.token}`)
      .send({
        name: `BA Rules Pending Team ${runId}`,
        game: 'Valorant',
        region: 'VN',
        description: 'Pending registration team',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/submit-approval`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/tournaments/${tournamentId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const registrationRes = await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/register-team`)
      .set('Authorization', `Bearer ${captain.token}`)
      .send({
        mainPlayerIds: [captain.userId],
        substituteIds: [],
      })
      .expect(201);

    const registrationBody = registrationRes.body as RegistrationResponse;
    expect(registrationBody.data.status).toBe('PENDING');

    await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/close-registration`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(400);
  });
});
