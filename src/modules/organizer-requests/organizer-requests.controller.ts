import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorator/current-user.decorator';
import type { JwtPayload } from '../auth/decorator/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateOrganizerRequestDto } from './dto/create-organizer-request.dto';
import { OrganizerRequestsService } from './organizer-requests.service';

@Controller('organizer-requests')
@UseGuards(JwtAuthGuard)
export class OrganizerRequestsController {
  constructor(
    private readonly organizerRequestsService: OrganizerRequestsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateOrganizerRequestDto,
  ) {
    return this.organizerRequestsService.createRequest(user.sub, dto);
  }

  @Get('me')
  getMine(@CurrentUser() user: JwtPayload) {
    return this.organizerRequestsService.getMyRequests(user.sub);
  }
}
