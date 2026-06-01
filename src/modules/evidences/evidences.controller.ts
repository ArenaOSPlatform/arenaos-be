import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { EvidencesService } from './evidences.service';

@Controller('matches')
export class EvidencesController {
  constructor(private readonly evidencesService: EvidencesService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':id/evidence')
  createEvidence(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEvidenceDto,
  ) {
    return this.evidencesService.createEvidence(id, user.sub, dto);
  }

  @Get(':id/evidence')
  getEvidence(@Param('id') id: string) {
    return this.evidencesService.getMatchEvidences(id);
  }
}
