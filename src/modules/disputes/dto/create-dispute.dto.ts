import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDisputeDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  type?: string;
}
