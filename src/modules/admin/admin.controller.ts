import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { Roles } from '../auth/decorator/roles.decorator';
import { UserRole } from '../auth/constants/user-role';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AdminService } from './admin.service';
import { RejectApprovalDto } from './dto/reject-approval.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  getUsers() {
    return this.adminService.getUsers();
  }

  @Get('teams')
  getTeams() {
    return this.adminService.getTeams();
  }

  @Get('tournaments')
  getTournaments() {
    return this.adminService.getTournaments();
  }

  @Get('organizer-requests')
  getOrganizerRequests() {
    return this.adminService.getOrganizerRequests();
  }

  @Patch('organizer-requests/:id/approve')
  approveOrganizerRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.adminService.approveOrganizerRequest(id, user.sub);
  }

  @Patch('organizer-requests/:id/reject')
  rejectOrganizerRequest(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.adminService.rejectOrganizerRequest(id, user.sub, dto);
  }

  @Get('tournament-approvals')
  getTournamentApprovals() {
    return this.adminService.getTournamentApprovals();
  }

  @Post('tournaments/:id/approve')
  approveTournament(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.adminService.approveTournament(id, user.sub);
  }

  @Post('tournaments/:id/reject')
  rejectTournament(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectApprovalDto,
  ) {
    return this.adminService.rejectTournament(id, user.sub, dto);
  }

  @Get('audit-logs')
  getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  @Get('disputes')
  getDisputes() {
    return this.adminService.getDisputes();
  }

  @Patch('users/:id/role')
  updateUserRole(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return this.adminService.updateUserRole(id, user.sub, dto);
  }

  @Patch('users/:id/status')
  updateUserStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.adminService.updateUserStatus(id, user.sub, dto);
  }
}
