import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeamsService } from './teams.service';

@Controller('team-invites')
@UseGuards(JwtAuthGuard)
export class TeamInvitesController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post(':id/accept')
  acceptInvite(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.teamsService.acceptInvite(id, user.sub);
  }

  @Post(':id/reject')
  rejectInvite(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.teamsService.rejectInvite(id, user.sub);
  }
}
