import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

jest.setTimeout(30000);

type LoginResponse = {
  data: {
    accessToken: string;
    user: {
      id: string;
      email: string;
    };
  };
};

type TeamResponse = {
  data: {
    captain: {
      email: string;
    };
  };
};

type TournamentCreateResponse = {
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

type MatchSummary = {
  id: string;
  roundNumber: number;
  matchNumber: number;
  teamAId?: string | null;
  teamBId?: string | null;
};

type BracketResponse = {
  data: {
    matches: MatchSummary[];
  };
};

type CaptainFixture = {
  token: string;
  userId: string;
};

function assertDefined<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

describe('Bracket + Match E2E', () => {
  const runId = randomUUID();

  let app: INestApplication<App>;

  let organizerToken = '';
  let adminToken = '';
  let tournamentId = '';
  let match1Id = '';
  let match2Id = '';
  let finalMatchId = '';

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

  async function loginByEmail(email: string): Promise<string> {
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

  async function createCaptainTeam(index: number): Promise<CaptainFixture> {
    const username = `bracket_${runId.replaceAll('-', '')}_${index}`;
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

    await request(app.getHttpServer())
      .post('/teams')
      .set('Authorization', `Bearer ${body.data.accessToken}`)
      .send({
        name: `Bracket E2E Team ${index} ${runId}`,
        game: 'Valorant',
        region: 'VN',
        description: 'Bracket E2E test team',
      })
      .expect(201);

    return {
      token: body.data.accessToken,
      userId: body.data.user.id,
    };
  }

  async function getTeamCaptainEmail(teamId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get(`/teams/${teamId}`)
      .expect(200);

    const body = res.body as TeamResponse;
    return body.data.captain.email;
  }

  async function playMatch(
    matchId: string,
    winnerSide: 'A' | 'B',
  ): Promise<void> {
    const bracketRes = await request(app.getHttpServer())
      .get(`/tournaments/${tournamentId}/bracket`)
      .expect(200);

    const bracketBody = bracketRes.body as BracketResponse;
    const match = bracketBody.data.matches.find(
      (item: { id: string }) => item.id === matchId,
    );

    assertDefined(match, 'Match was not found');
    assertDefined(match.teamAId, 'Match teamA was not assigned');
    assertDefined(match.teamBId, 'Match teamB was not assigned');

    const teamAEmail = await getTeamCaptainEmail(match.teamAId);
    const teamBEmail = await getTeamCaptainEmail(match.teamBId);
    const teamAToken = await loginByEmail(teamAEmail);
    const teamBToken = await loginByEmail(teamBEmail);
    const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await request(app.getHttpServer())
      .patch(`/matches/${matchId}/schedule`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        scheduledAt,
        roomCode: `ROOM-${matchId.slice(0, 5)}`,
        bestOf: 'BO3',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/matches/${matchId}/check-in`)
      .set('Authorization', `Bearer ${teamAToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/matches/${matchId}/check-in`)
      .set('Authorization', `Bearer ${teamBToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/matches/${matchId}/start`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    const submitterToken = winnerSide === 'A' ? teamAToken : teamBToken;
    const confirmerToken = winnerSide === 'A' ? teamBToken : teamAToken;
    const scoreA = winnerSide === 'A' ? 2 : 0;
    const scoreB = winnerSide === 'A' ? 0 : 2;

    await request(app.getHttpServer())
      .post(`/matches/${matchId}/submit-result`)
      .set('Authorization', `Bearer ${submitterToken}`)
      .send({
        scoreA,
        scoreB,
        imageUrl: 'https://example.com/evidence.png',
        note: 'E2E match result',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/matches/${matchId}/confirm-result`)
      .set('Authorization', `Bearer ${confirmerToken}`)
      .expect(201);
  }

  it('should login organizer', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'organizer@arenaos.com',
        password: '123456',
      })
      .expect(201);

    const body = res.body as LoginResponse;
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

    const body = res.body as LoginResponse;
    adminToken = body.data.accessToken;
  });

  it('should create a tournament and generate bracket', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/tournaments')
      .set('Authorization', `Bearer ${organizerToken}`)
      .send({
        name: `Bracket E2E Cup ${runId}`,
        game: 'Valorant',
        description: 'Bracket E2E test',
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

    const createBody = createRes.body as TournamentCreateResponse;
    tournamentId = createBody.data.id;

    await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/submit-approval`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/tournaments/${tournamentId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tournaments/${tournamentId}/open-registration`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(200);

    const captains: CaptainFixture[] = [];
    for (const index of [1, 2, 3, 4]) {
      captains.push(await createCaptainTeam(index));
    }

    for (const captain of captains) {
      const registrationRes = await request(app.getHttpServer())
        .post(`/tournaments/${tournamentId}/register-team`)
        .set('Authorization', `Bearer ${captain.token}`)
        .send({
          mainPlayerIds: [captain.userId],
          substituteIds: [],
        })
        .expect(201);

      const registrationBody = registrationRes.body as RegistrationResponse;

      await request(app.getHttpServer())
        .post(`/registrations/${registrationBody.data.id}/approve`)
        .set('Authorization', `Bearer ${organizerToken}`)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/close-registration`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    const generateRes = await request(app.getHttpServer())
      .post(`/tournaments/${tournamentId}/generate-bracket`)
      .set('Authorization', `Bearer ${organizerToken}`)
      .expect(201);

    const body = generateRes.body as BracketResponse;

    expect(body.data.matches.length).toBe(3);

    const matches = body.data.matches;

    const match1 = matches.find(
      (item: { roundNumber: number; matchNumber: number }) =>
        item.roundNumber === 1 && item.matchNumber === 1,
    );
    assertDefined(match1, 'Match 1 was not found');
    match1Id = match1.id;

    const match2 = matches.find(
      (item: { roundNumber: number; matchNumber: number }) =>
        item.roundNumber === 1 && item.matchNumber === 2,
    );
    assertDefined(match2, 'Match 2 was not found');
    match2Id = match2.id;

    const finalMatch = matches.find(
      (item: { roundNumber: number; matchNumber: number }) =>
        item.roundNumber === 2 && item.matchNumber === 1,
    );
    assertDefined(finalMatch, 'Final match was not found');
    finalMatchId = finalMatch.id;
  });

  it('should update match 1 result and advance winner to final teamA', async () => {
    await playMatch(match1Id, 'A');

    const bracketRes = await request(app.getHttpServer())
      .get(`/tournaments/${tournamentId}/bracket`)
      .expect(200);

    const bracketBody = bracketRes.body as BracketResponse;

    const finalMatch = bracketBody.data.matches.find(
      (item: { id: string }) => item.id === finalMatchId,
    );

    assertDefined(finalMatch, 'Final match was not found');
    expect(finalMatch.teamAId).toBeDefined();
  });

  it('should update match 2 result and advance winner to final teamB', async () => {
    await playMatch(match2Id, 'B');

    const bracketRes = await request(app.getHttpServer())
      .get(`/tournaments/${tournamentId}/bracket`)
      .expect(200);

    const bracketBody = bracketRes.body as BracketResponse;

    const finalMatch = bracketBody.data.matches.find(
      (item: { id: string }) => item.id === finalMatchId,
    );

    assertDefined(finalMatch, 'Final match was not found');
    expect(finalMatch.teamAId).toBeDefined();
    expect(finalMatch.teamBId).toBeDefined();
  });
});
