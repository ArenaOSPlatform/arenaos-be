export const UserRole = {
  PLAYER: 'PLAYER',
  ORGANIZER: 'ORGANIZER',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export function isUserRole(value: unknown): value is UserRole {
  return (
    value === UserRole.PLAYER ||
    value === UserRole.ORGANIZER ||
    value === UserRole.ADMIN
  );
}
