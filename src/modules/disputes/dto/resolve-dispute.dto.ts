import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const disputeResolveDecisions = [
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
}
