import { IsInt, Min } from 'class-validator';

export class UpdateMatchResultDto {
  @IsInt()
  @Min(0)
  scoreA!: number;

  @IsInt()
  @Min(0)
  scoreB!: number;
}
