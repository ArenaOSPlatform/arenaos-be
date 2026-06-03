import { IsOptional, IsString } from 'class-validator';

export class InviteMemberDto {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  identifier?: string;
}
