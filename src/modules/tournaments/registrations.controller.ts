import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RejectRegistrationDto } from './dto/reject-registration.dto';
import { TournamentsService } from './tournaments.service';

@Controller('registrations')
@UseGuards(JwtAuthGuard)
export class RegistrationsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Post(':id/approve')
  approveRegistration(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.tournamentsService.approveRegistration(id, user.sub);
  }

  @Post(':id/reject')
  rejectRegistration(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: RejectRegistrationDto,
  ) {
    return this.tournamentsService.rejectRegistration(id, user.sub, dto.reason);
  }
}
