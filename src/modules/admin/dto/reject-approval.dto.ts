import { IsNotEmpty, IsString } from 'class-validator';

export class RejectApprovalDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
