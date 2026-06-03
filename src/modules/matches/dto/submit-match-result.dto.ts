import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class SubmitMatchResultDto {
  @IsInt()
  @Min(0)
  scoreA!: number;

  @IsInt()
  @Min(0)
  scoreB!: number;

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
