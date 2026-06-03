import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamsService } from './teams.service';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTeamDto) {
    return this.teamsService.createTeam(user.sub, dto);
  }
  @UseGuards(JwtAuthGuard)
  @Get('my')
  getMyTeam(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMyTeam(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/ranking-history')
  getMyRankingHistory(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMyRankingHistory(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/schedule')
  getMySchedule(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMySchedule(user.sub);
  }

  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':teamId/members/:userId')
  removeMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.removeMember(teamId, userId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('leave')
  leaveTeam(@CurrentUser() user: JwtPayload) {
    return this.teamsService.leaveTeam(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post([':teamId/invites', ':teamId/invite'])
  inviteMember(
    @Param('teamId') teamId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteMemberDto,
  ) {
    return this.teamsService.inviteMember(teamId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invites/me')
  getMyInvites(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMyInvites(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invites/:inviteId/accept')
  acceptInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.acceptInvite(inviteId, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invites/:inviteId/reject')
  rejectInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.rejectInvite(inviteId, user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  updateTeam(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.updateTeam(id, user.sub, dto);
  }
}
