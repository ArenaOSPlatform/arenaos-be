import { IsIn } from 'class-validator';

export const UserStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  BANNED: 'BANNED',
} as const;

export class UpdateUserStatusDto {
  @IsIn(Object.values(UserStatus))
  status!: string;
}
