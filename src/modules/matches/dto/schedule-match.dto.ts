import {
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class ScheduleMatchDto {
  @IsISO8601()
  scheduledAt!: string;

  @IsNotEmpty()
  @IsString()
  roomCode!: string;

  @IsOptional()
  @IsString()
  @IsUrl({ require_protocol: true })
  livestreamUrl?: string;

  @IsOptional()
  @IsString()
  bestOf?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
