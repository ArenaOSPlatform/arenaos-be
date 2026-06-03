import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { TournamentsService } from './tournaments.service';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { RejectRegistrationDto } from './dto/reject-registration.dto';
import { RegisterTeamDto } from './dto/register-team.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { Roles } from '../auth/decorator/roles.decorator';
import { UserRole } from '../auth/constants/user-role';

@Controller('tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTournamentDto) {
    return this.tournamentsService.createTournament(user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournamentsService.updateTournament(id, user.sub, dto);
  }

  @Get()
  findAll() {
    return this.tournamentsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  findMine(@CurrentUser() user: JwtPayload) {
    return this.tournamentsService.findMine(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submit-approval')
  submitApproval(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tournamentsService.submitApproval(id, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post([':id/bracket/generate', ':id/generate-bracket'])
  generateBracket(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tournamentsService.generateBracket(id, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/approve')
  approveTournament(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.approveTournament(id, user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/reject')
  rejectTournament(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectRegistrationDto,
  ) {
    return this.tournamentsService.rejectTournament(id, user.sub, dto.reason);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/cancel')
  cancelTournament(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.cancelTournament(id, user.sub, user.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/archive')
  archiveTournament(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.archiveTournament(id, user.sub, user.role);
  }

  @Get(':id/bracket')
  getBracket(@Param('id') id: string) {
    return this.tournamentsService.getBracket(id);
  }

  @Get(':id/leaderboard')
  getLeaderboard(@Param('id') id: string) {
    return this.tournamentsService.getLeaderboard(id);
  }

  @Get(':id/announcements')
  getAnnouncements(@Param('id') id: string) {
    return this.tournamentsService.getAnnouncements(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/announcements')
  createAnnouncement(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.tournamentsService.createAnnouncement(id, user.sub, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tournamentsService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/open-registration')
  openRegistration(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tournamentsService.openRegistration(id, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/close-registration')
  closeRegistration(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.tournamentsService.closeRegistration(id, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/close-registration')
  closeRegistrationPost(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.closeRegistration(id, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('registrations/:registrationId/approve')
  approveRegistration(
    @Param('registrationId') registrationId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.approveRegistration(
      registrationId,
      user.sub,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('registrations/:registrationId/reject')
  rejectRegistration(
    @Param('registrationId') registrationId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectRegistrationDto,
  ) {
    return this.tournamentsService.rejectRegistration(
      registrationId,
      user.sub,
      dto.reason,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/register-team')
  registerTeam(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterTeamDto,
  ) {
    return this.tournamentsService.registerTeam(id, user.sub, dto);
  }

  @Get(':id/registrations')
  getRegistrations(@Param('id') id: string) {
    return this.tournamentsService.getRegistrations(id);
  }
}
