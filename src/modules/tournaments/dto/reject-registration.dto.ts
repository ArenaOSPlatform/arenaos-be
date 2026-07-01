import { IsNotEmpty, IsString } from 'class-validator';

export class RejectRegistrationDto {
  @IsNotEmpty()
  @IsString()
  reason!: string;
}
