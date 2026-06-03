import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEvidenceDto {
  @IsNotEmpty()
  @IsString()
  imageUrl!: string;

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
