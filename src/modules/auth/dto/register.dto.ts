import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

const strongPasswordMessage =
  'Password must be at least 8 characters and include uppercase, lowercase, number, and symbol';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'Full name must be at least 3 characters' })
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^\sA-Za-z0-9]).{8,}$/, {
    message: strongPasswordMessage,
  })
  password!: string;
}
