import { IsEmail, Matches } from 'class-validator';

const strongPasswordPattern =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\sA-Za-z0-9]).{8,}$/;

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @Matches(/^\d{6}$/)
  otp!: string;

  @Matches(strongPasswordPattern, {
    message:
      'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol',
  })
  newPassword!: string;
}
