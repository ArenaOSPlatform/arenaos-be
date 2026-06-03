import { IsEmail, Matches } from 'class-validator';

export class VerifyResetOtpDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/)
  otp!: string;
}
