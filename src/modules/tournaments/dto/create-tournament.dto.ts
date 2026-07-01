import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTournamentDto {
  @IsNotEmpty()
  @IsString()
  name!: string;

  @IsNotEmpty()
  @IsString()
  game!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  bannerUrl?: string;

  @IsInt()
  @Min(2)
  maxTeams!: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  minTeams?: number;

  @IsInt()
  @Min(1)
  teamSize!: number;

  @IsNotEmpty()
  @IsString()
  format!: string;

  @IsOptional()
  @IsString()
  prizePool?: string;

  @IsOptional()
  @IsString()
  rules?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  livestreamUrl?: string;

  @IsDateString()
  startDate!: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsDateString()
  registrationDeadline!: string;
}
