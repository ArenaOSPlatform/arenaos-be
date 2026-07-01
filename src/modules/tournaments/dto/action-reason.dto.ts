import { IsNotEmpty, IsString } from 'class-validator';

export class ActionReasonDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
