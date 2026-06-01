import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateEvidenceDto {
  @IsNotEmpty()
  @IsString()
  imageUrl!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
