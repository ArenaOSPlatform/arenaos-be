import { IsOptional, IsString } from 'class-validator';

export class CreateOrganizerRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  experience?: string;

  @IsOptional()
  @IsString()
  portfolioUrl?: string;
}
