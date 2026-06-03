import { IsOptional, IsString } from 'class-validator';

export class CreateOrganizerRequestDto {
  @IsOptional()
  @IsString()
  organizationName?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  socialLink?: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

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
