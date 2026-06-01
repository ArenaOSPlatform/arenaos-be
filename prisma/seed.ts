import { PrismaClient, type Team, type User } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function ensureSeedUser(data: {
  username: string;
  email: string;
  passwordHash: string;
  role: string;
}): Promise<User> {
  const existingByEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });

  if (existingByEmail) {
    return prisma.user.update({
      where: { id: existingByEmail.id },
      data: {
        passwordHash: data.passwordHash,
        role: data.role,
        status: 'ACTIVE',
      },
    });
  }

  const existingByUsername = await prisma.user.findUnique({
    where: { username: data.username },
  });

  if (existingByUsername) {
    return prisma.user.update({
      where: { id: existingByUsername.id },
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        role: data.role,
        status: 'ACTIVE',
      },
    });
  }

  return prisma.user.create({
    data: {
      username: data.username,
      email: data.email,
      passwordHash: data.passwordHash,
      role: data.role,
      status: 'ACTIVE',
    },
  });
}

async function main() {
  const passwordHash = await bcrypt.hash('123456', 10);

  const admin = await ensureSeedUser({
    username: 'admin',
    email: 'admin@arenaos.com',
    passwordHash,
    role: 'ADMIN',
  });

  const organizer = await ensureSeedUser({
    username: 'organizer',
    email: 'organizer@arenaos.com',
    passwordHash,
    role: 'ORGANIZER',
  });

  const captains: User[] = [];

  for (const n of [1, 2, 3, 4]) {
    const captain = await ensureSeedUser({
      username: `captain${n}`,
      email: `captain${n}@arenaos.com`,
      passwordHash,
      role: 'PLAYER',
    });

    captains.push(captain);
  }

  const teamNames = [
    'Nova X',
    'Shadow Rift',
    'Crimson Wolves',
    'Neon Phantoms',
  ];

  const teams: Team[] = [];

  for (let i = 0; i < captains.length; i++) {
    const team = await prisma.team.upsert({
      where: { name: teamNames[i] },
      update: {},
      create: {
        name: teamNames[i],
        description: `Seed team ${i + 1}`,
        captainId: captains[i].id,
        members: {
          create: {
            userId: captains[i].id,
          },
        },
      },
    });

    teams.push(team);
  }

  const tournamentName = 'ArenaOS Seed Cup';
  const existingTournament = await prisma.tournament.findFirst({
    where: { name: tournamentName },
  });
  const tournamentPayload = {
    name: tournamentName,
    game: 'Valorant',
    description: 'Seed tournament for full demo flow',
    maxTeams: 4,
    teamSize: 5,
    format: 'SINGLE_ELIMINATION',
    prizePool: '$1000',
    rules: 'BO3. Check-in before match.',
    status: 'REGISTRATION_CLOSED',
    startDate: new Date('2026-07-01T08:00:00.000Z'),
    endDate: new Date('2026-07-03T08:00:00.000Z'),
    registrationDeadline: new Date('2026-06-25T08:00:00.000Z'),
    organizerId: organizer.id,
  };

  const tournament = existingTournament
    ? await prisma.tournament.update({
        where: { id: existingTournament.id },
        data: tournamentPayload,
      })
    : await prisma.tournament.create({
        data: tournamentPayload,
      });

  for (const team of teams) {
    await prisma.tournamentRegistration.upsert({
      where: {
        tournamentId_teamId: {
          tournamentId: tournament.id,
          teamId: team.id,
        },
      },
      update: {
        status: 'APPROVED',
      },
      create: {
        tournamentId: tournament.id,
        teamId: team.id,
        status: 'APPROVED',
      },
    });
  }

  console.log('Seed completed');
  console.log({
    admin: admin.email,
    organizer: organizer.email,
    captains: captains.map((item) => item.email),
    tournament: tournament.name,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
