import { IsOptional, IsString } from 'class-validator';

export class RejectRegistrationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
