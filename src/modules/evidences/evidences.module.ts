import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { EvidencesController } from './evidences.controller';
import { EvidencesService } from './evidences.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'arenaos_access_secret',
    }),
  ],
  controllers: [EvidencesController],
  providers: [EvidencesService],
})
export class EvidencesModule {}
