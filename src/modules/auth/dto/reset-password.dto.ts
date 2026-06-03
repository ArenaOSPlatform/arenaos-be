import { IsEmail, Matches, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/)
  otp!: string;

  @MinLength(6)
  newPassword!: string;
}
