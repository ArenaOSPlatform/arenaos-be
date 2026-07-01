import 'dotenv/config';

import { PrismaClient } from '@prisma/client';

type DuplicateMembership = {
  userId: string;
  email: string;
  username: string;
  teamCount: number;
  teams: string | null;
};

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error('DATABASE_URL is required to check team memberships.');
    process.exitCode = 2;
    return;
  }

  const duplicates = await prisma.$queryRaw<DuplicateMembership[]>`
    SELECT
      tm."userId",
      u.email,
      u.username,
      COUNT(*)::int AS "teamCount",
      STRING_AGG(t.name, ', ' ORDER BY t.name) AS teams
    FROM "TeamMember" tm
    JOIN "User" u ON u.id = tm."userId"
    JOIN "Team" t ON t.id = tm."teamId"
    GROUP BY tm."userId", u.email, u.username
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, u.email ASC
  `;

  if (duplicates.length === 0) {
    console.log('OK: no user belongs to more than one team.');
    return;
  }

  console.error(
    `Found ${duplicates.length} user(s) with multiple team memberships.`,
  );

  for (const item of duplicates) {
    console.error(
      `- ${item.email} (${item.username}, ${item.userId}) has ${item.teamCount} teams: ${item.teams ?? 'unknown'}`,
    );
  }

  console.error(
    'Clean these records before applying the TeamMember_userId unique migration.',
  );
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
