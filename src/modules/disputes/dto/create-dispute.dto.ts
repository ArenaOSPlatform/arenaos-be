import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDisputeDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
