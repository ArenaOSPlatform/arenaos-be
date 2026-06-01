import { IsIn } from 'class-validator';
import { UserRole } from '../../auth/constants/user-role';

export class UpdateUserRoleDto {
  @IsIn(Object.values(UserRole))
  role!: string;
}
