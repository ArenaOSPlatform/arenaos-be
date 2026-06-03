import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  private async joinUserRoomFor(userId: string, client: Socket) {
    await client.join(`user:${userId}`);

    return {
      message: `Joined room user:${userId}`,
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
    await client.join(`match:${matchId}`);

    return {
      message: `Joined room match:${matchId}`,
    };
  }

  sendNotification(userId: string, notification: unknown) {
    console.log('EMIT TO ROOM:', `user:${userId}`);
    console.log('PAYLOAD:', notification);

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
