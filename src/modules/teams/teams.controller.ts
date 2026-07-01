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
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTeamDto } from './dto/create-team.dto';
import { TeamsService } from './teams.service';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { Roles } from '../auth/decorator/roles.decorator';
import { UserRole } from '../auth/constants/user-role';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTeamDto) {
    return this.teamsService.createTeam(user.sub, dto);
  }
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Get('my/all')
  getMyTeams(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMyTeams(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Get('my')
  getMyTeam(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMyTeam(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Get('my/ranking-history')
  getMyRankingHistory(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMyRankingHistory(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Get('my/schedule')
  getMySchedule(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMySchedule(user.sub);
  }

  @Get()
  findAll() {
    return this.teamsService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Get(':teamId/ranking-history')
  getTeamRankingHistory(
    @Param('teamId') teamId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.getMyRankingHistory(user.sub, teamId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Get(':teamId/schedule')
  getTeamSchedule(
    @Param('teamId') teamId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.getMySchedule(user.sub, teamId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Delete(':teamId/members/:userId')
  removeMember(
    @Param('teamId') teamId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.removeMember(teamId, userId, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Post('leave')
  leaveTeam(@CurrentUser() user: JwtPayload) {
    return this.teamsService.leaveTeam(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Post(':teamId/leave')
  leaveSelectedTeam(
    @Param('teamId') teamId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.leaveTeam(user.sub, teamId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Post([':teamId/invites', ':teamId/invite'])
  inviteMember(
    @Param('teamId') teamId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteMemberDto,
  ) {
    return this.teamsService.inviteMember(teamId, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Get('invites/me')
  getMyInvites(@CurrentUser() user: JwtPayload) {
    return this.teamsService.getMyInvites(user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Post('invites/:inviteId/accept')
  acceptInvite(
    @Param('inviteId') inviteId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teamsService.acceptInvite(inviteId, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLAYER)
  @Patch(':id')
  updateTeam(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.updateTeam(id, user.sub, dto);
  }
}
