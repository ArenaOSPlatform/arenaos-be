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

  @SubscribeMessage('join:user')
  async joinUserRoom(
    @MessageBody() userId: string,
    @ConnectedSocket() client: Socket,
  ) {
    await client.join(`user:${userId}`);

    return {
      message: `Joined room user:${userId}`,
    };
  }

  sendNotification(userId: string, notification: unknown) {
    console.log('EMIT TO ROOM:', `user:${userId}`);
    console.log('PAYLOAD:', notification);

    this.server.to(`user:${userId}`).emit('notification:new', notification);
  }
}
