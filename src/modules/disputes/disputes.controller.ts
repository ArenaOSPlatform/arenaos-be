import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { DisputesService } from './disputes.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post('matches/:matchId/disputes')
  createDispute(
    @Param('matchId') matchId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDisputeDto,
  ) {
    return this.disputesService.createDispute(matchId, user.sub, dto);
  }

  @Get('disputes')
  getDisputes(@CurrentUser() user: JwtPayload) {
    return this.disputesService.getDisputes(user.sub, user.role);
  }

  @Get('disputes/:id')
  getDispute(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.disputesService.getDispute(id, user.sub, user.role);
  }

  @Post('disputes/:id/request-evidence')
  requestEvidence(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body('message') message?: string,
  ) {
    return this.disputesService.requestEvidence(
      id,
      user.sub,
      user.role,
      message,
    );
  }

  @Post('disputes/:id/resolve')
  resolveDispute(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResolveDisputeDto,
  ) {
    return this.disputesService.resolveDispute(id, user.sub, user.role, dto);
  }
}
