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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DisputeMatchResultDto } from './dto/dispute-match-result.dto';
import { ScheduleMatchDto } from './dto/schedule-match.dto';
import { SubmitMatchResultDto } from './dto/submit-match-result.dto';
import { UpdateLivestreamDto } from './dto/update-livestream.dto';
import { MatchesService } from './matches.service';

@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/check-in')
  checkIn(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.matchesService.checkIn(id, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/start')
  startMatch(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.matchesService.startMatch(id, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/schedule')
  @Post(':id/schedule')
  scheduleMatch(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ScheduleMatchDto,
  ) {
    return this.matchesService.scheduleMatch(id, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/livestream')
  updateLivestream(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateLivestreamDto,
  ) {
    return this.matchesService.updateLivestream(id, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/submit-result')
  @Post(':id/result/submit')
  submitResult(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitMatchResultDto,
  ) {
    return this.matchesService.submitResult(id, user.sub, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/confirm-result')
  @Post(':id/result/confirm')
  confirmResult(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.matchesService.confirmResult(id, user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/dispute')
  @Post(':id/result/dispute')
  disputeResult(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: DisputeMatchResultDto,
  ) {
    return this.matchesService.disputeResult(id, user.sub, dto);
  }
}
