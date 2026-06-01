import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

type AuthLoginResponse = {
  data: {
    accessToken: string;
    user: {
      email: string;
      role: string;
    };
  };
};

describe('Auth E2E', () => {
  let app: INestApplication<App>;

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

  it('should login admin successfully', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@arenaos.com',
        password: '123456',
      })
      .expect(201);
    const body = res.body as unknown as AuthLoginResponse;

    expect(body.data.accessToken).toBeDefined();
    expect(body.data.user.email).toBe('admin@arenaos.com');
    expect(body.data.user.role).toBe('ADMIN');
  });
});
