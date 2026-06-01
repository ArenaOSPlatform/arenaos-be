import { Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime/realtime.gateway';

@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
