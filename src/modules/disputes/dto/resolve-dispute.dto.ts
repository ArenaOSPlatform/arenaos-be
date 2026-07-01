import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export const disputeResolveDecisions = [
  'KEEP_RESULT',
  'CHANGE_RESULT',
  'TECHNICAL_WIN_TEAM_A',
  'TECHNICAL_WIN_TEAM_B',
  'DISQUALIFY_TEAM_A',
  'DISQUALIFY_TEAM_B',
  'APPROVE_TEAM_A_RESULT',
  'APPROVE_TEAM_B_RESULT',
  'REMATCH',
] as const;

export type DisputeResolveDecision = (typeof disputeResolveDecisions)[number];

export class ResolveDisputeDto {
  @IsNotEmpty()
  @IsString()
  @IsIn(disputeResolveDecisions)
  decision!: DisputeResolveDecision;

  @IsNotEmpty()
  @IsString()
  decisionReason!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  scoreA?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  scoreB?: number;
}
