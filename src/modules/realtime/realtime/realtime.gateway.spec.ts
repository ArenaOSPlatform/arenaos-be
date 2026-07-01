import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import { PrismaService } from '../../../database/prisma.service';
import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: { verifyAsync: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  it('joins only the authenticated user notification room', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'user@example.com',
      username: 'player',
      role: 'PLAYER',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'player',
      role: 'PLAYER',
      status: 'ACTIVE',
    });
    const join = jest.fn();
    const client = {
      id: 'socket-1',
      data: {},
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      join,
      disconnect: jest.fn(),
    } as unknown as Socket;

    await gateway.handleConnection(client);

    expect(join).toHaveBeenCalledWith('user:user-1');
    await expect(gateway.joinUserRoom('user-2', client)).rejects.toThrow(
      'Cannot join another user notification room',
    );
  });

  it('disconnects a socket when the account is no longer active', async () => {
    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'user@example.com',
      username: 'player',
      role: 'PLAYER',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'player',
      role: 'PLAYER',
      status: 'BANNED',
    });
    const disconnect = jest.fn();
    const client = {
      id: 'socket-1',
      data: {},
      handshake: { auth: { token: 'valid-token' }, headers: {} },
      join: jest.fn(),
      disconnect,
    } as unknown as Socket;

    await gateway.handleConnection(client);

    expect(disconnect).toHaveBeenCalledWith(true);
  });
});
