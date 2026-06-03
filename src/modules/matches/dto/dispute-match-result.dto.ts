import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DisputeMatchResultDto {
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

  @IsOptional()
  @IsString()
  note?: string;
}
