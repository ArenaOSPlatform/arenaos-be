import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { isAllowedCorsOrigin } from '../../../config/cors';
import { getJwtAccessSecret } from '../../../config/environment';
import { PrismaService } from '../../../database/prisma.service';
import { isUserRole, type UserRole } from '../../auth/constants/user-role';

type RealtimeUser = {
  sub: string;
  email: string;
  username: string;
  role: UserRole;
};

const publicTournamentStatuses = [
  'OPEN_REGISTRATION',
  'REGISTRATION_CLOSED',
  'BRACKET_GENERATED',
  'CHECK_IN_PHASE',
  'ONGOING',
  'FINALIZING',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
];

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      callback(null, isAllowedCorsOrigin(origin));
    },
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  @WebSocketServer()
  server!: Server;

  async handleConnection(client: Socket): Promise<void> {
    const token = this.getHandshakeToken(client);

    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        username: string;
        role: string;
      }>(token, { secret: getJwtAccessSecret() });

      if (!payload.sub || !isUserRole(payload.role)) {
        throw new Error('Invalid token payload');
      }

      const currentUser = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          username: true,
          role: true,
          status: true,
        },
      });

      if (
        !currentUser ||
        currentUser.status !== 'ACTIVE' ||
        !isUserRole(currentUser.role)
      ) {
        throw new Error('Account is not active');
      }

      const user: RealtimeUser = {
        sub: currentUser.id,
        email: currentUser.email,
        username: currentUser.username,
        role: currentUser.role,
      };
      const clientData = client.data as { user?: RealtimeUser };
      clientData.user = user;
      await client.join(`user:${user.sub}`);
    } catch {
      this.logger.warn(`Rejected socket with invalid token: ${client.id}`);
      client.disconnect(true);
    }
  }

  private getHandshakeToken(client: Socket): string | undefined {
    const auth = client.handshake.auth as { token?: unknown };
    const authToken = auth.token;

    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;

    if (typeof authorization !== 'string') {
      return undefined;
    }

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' && token ? token : undefined;
  }

  private getAuthenticatedUser(client: Socket): RealtimeUser {
    const clientData = client.data as { user?: RealtimeUser };

    if (!clientData.user) {
      throw new WsException('Authentication required');
    }

    return clientData.user;
  }

  private async joinUserRoomFor(userId: string, client: Socket) {
    const clientData = client.data as { user?: RealtimeUser };
    const user = clientData.user;

    if (!user || user.sub !== userId) {
      throw new WsException('Cannot join another user notification room');
    }

    await client.join(`user:${user.sub}`);

    return {
      message: `Joined room user:${user.sub}`,
    };
  }

  @SubscribeMessage('join:user')
  joinUserRoom(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    return this.joinUserRoomFor(userId, client);
  }

  @SubscribeMessage('join:user-notifications')
  joinUserNotificationsRoom(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    return this.joinUserRoomFor(userId, client);
  }

  @SubscribeMessage('join:tournament')
  async joinTournamentRoom(
    @MessageBody() tournamentId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.getAuthenticatedUser(client);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: {
        id: true,
        organizerId: true,
        status: true,
      },
    });

    if (!tournament) {
      throw new WsException('Tournament not found');
    }

    const canJoin =
      publicTournamentStatuses.includes(tournament.status) ||
      user.role === 'ADMIN' ||
      tournament.organizerId === user.sub;

    if (!canJoin) {
      throw new WsException('Cannot join this tournament room');
    }

    await client.join(`tournament:${tournamentId}`);

    return {
      message: `Joined room tournament:${tournamentId}`,
    };
  }

  @SubscribeMessage('join:match')
  async joinMatchRoom(
    @MessageBody() matchId: string,
    @ConnectedSocket() client: Socket,
  ) {
    const user = this.getAuthenticatedUser(client);
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        teamAId: true,
        teamBId: true,
        tournament: {
          select: {
            organizerId: true,
          },
        },
      },
    });

    if (!match) {
      throw new WsException('Match not found');
    }

    if (user.role !== 'ADMIN' && match.tournament.organizerId !== user.sub) {
      const teamIds = [match.teamAId, match.teamBId].filter(
        Boolean,
      ) as string[];
      const membership =
        teamIds.length > 0
          ? await this.prisma.teamMember.findFirst({
              where: {
                userId: user.sub,
                teamId: {
                  in: teamIds,
                },
              },
              select: {
                id: true,
              },
            })
          : null;

      if (!membership) {
        throw new WsException('Cannot join this match room');
      }
    }

    await client.join(`match:${matchId}`);

    return {
      message: `Joined room match:${matchId}`,
    };
  }

  sendNotification(userId: string, notification: unknown) {
    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }

  emitTournamentEvent(
    tournamentId: string,
    event:
      | 'tournament:status_changed'
      | 'registration:updated'
      | 'bracket:generated'
      | 'bracket:updated'
      | 'leaderboard:updated',
    payload: unknown,
  ) {
    this.server.to(`tournament:${tournamentId}`).emit(event, payload);
  }

  emitMatchEvent(
    matchId: string,
    event:
      | 'match:scheduled'
      | 'match:checkin_updated'
      | 'match:live'
      | 'match:score_submitted'
      | 'match:completed'
      | 'match:disputed',
    payload: unknown,
  ) {
    this.server.to(`match:${matchId}`).emit(event, payload);
  }
}
