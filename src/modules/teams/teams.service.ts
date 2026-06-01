import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateTeamDto } from './dto/create-team.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { LeaderboardsService } from '../leaderboards/leaderboards.service';

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly leaderboardsService: LeaderboardsService,
  ) {}

  private readonly teamDetailInclude = {
    captain: {
      select: {
        id: true,
        username: true,
        email: true,
      },
    },
    members: {
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
    },
  } as const;

  async createTeam(captainId: string, dto: CreateTeamDto) {
    const existing = await this.prisma.team.findUnique({
      where: { name: dto.name },
    });

    if (existing) {
      throw new BadRequestException('Team name already exists');
    }

    const team = await this.prisma.team.create({
      data: {
        name: dto.name,
        description: dto.description,
        logoUrl: dto.logoUrl,
        captainId,
        members: {
          create: {
            userId: captainId,
          },
        },
      },
      include: {
        captain: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        members: true,
      },
    });

    return {
      message: 'Create team successfully',
      data: team,
    };
  }

  async findAll() {
    const teams = await this.prisma.team.findMany({
      include: {
        captain: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
        members: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      message: 'Get teams successfully',
      data: teams,
    };
  }

  async findOne(id: string) {
    const team = await this.prisma.team.findUnique({
      where: { id },
      include: this.teamDetailInclude,
    });

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    return {
      message: 'Get team successfully',
      data: team,
    };
  }

  async updateTeam(teamId: string, userId: string, dto: UpdateTeamDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    if (team.captainId !== userId) {
      throw new BadRequestException('Only captain can edit team');
    }

    const nextName = dto.name?.trim();
    const hasName = nextName !== undefined;
    const hasDescription = dto.description !== undefined;
    const hasLogo = dto.logoUrl !== undefined;

    if (!hasName && !hasDescription && !hasLogo) {
      throw new BadRequestException('No team fields to update');
    }

    if (hasName && !nextName) {
      throw new BadRequestException('Team name is required');
    }

    if (nextName && nextName !== team.name) {
      const existing = await this.prisma.team.findUnique({
        where: { name: nextName },
      });

      if (existing) {
        throw new BadRequestException('Team name already exists');
      }
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        ...(nextName ? { name: nextName } : {}),
        ...(hasDescription
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(hasLogo ? { logoUrl: dto.logoUrl?.trim() || null } : {}),
      },
      include: this.teamDetailInclude,
    });

    return {
      message: 'Update team successfully',
      data: updated,
    };
  }

  async removeMember(teamId: string, targetUserId: string, captainId: string) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: true,
      },
    });

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    if (team.captainId !== captainId) {
      throw new BadRequestException('Only captain can remove team members');
    }

    if (targetUserId === team.captainId) {
      throw new BadRequestException('Captain cannot be removed from team');
    }

    const member = team.members.find((item) => item.userId === targetUserId);

    if (!member) {
      throw new BadRequestException('User is not a member of this team');
    }

    await this.prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId,
          userId: targetUserId,
        },
      },
    });

    await this.notificationsService.createNotification({
      userId: targetUserId,
      title: 'Removed from team',
      message: `You have been removed from team ${team.name}.`,
      type: 'TEAM_MEMBER_REMOVED',
      metadata: {
        teamId,
      },
    });

    return {
      message: 'Remove member successfully',
    };
  }

  async leaveTeam(userId: string) {
    const membership = await this.prisma.teamMember.findFirst({
      where: { userId },
      include: {
        team: {
          include: {
            members: true,
            _count: {
              select: {
                registrations: true,
                leaderboardEntries: true,
                rankingHistories: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      throw new BadRequestException('You are not in any team');
    }

    const team = membership.team;

    if (team.captainId === userId) {
      if (team.members.length > 1) {
        throw new BadRequestException(
          'Captain cannot leave while other members are still in the team',
        );
      }

      const matchCount = await this.prisma.match.count({
        where: {
          OR: [
            { teamAId: team.id },
            { teamBId: team.id },
            { winnerId: team.id },
          ],
        },
      });
      const hasTournamentHistory =
        team._count.registrations > 0 ||
        team._count.leaderboardEntries > 0 ||
        team._count.rankingHistories > 0 ||
        matchCount > 0;

      if (hasTournamentHistory) {
        throw new BadRequestException(
          'Captain cannot leave a team with tournament history',
        );
      }

      await this.prisma.$transaction([
        this.prisma.teamInvite.deleteMany({
          where: { teamId: team.id },
        }),
        this.prisma.teamMember.deleteMany({
          where: { teamId: team.id },
        }),
        this.prisma.team.delete({
          where: { id: team.id },
        }),
      ]);

      return {
        message: 'Leave team successfully',
        data: null,
      };
    }

    await this.prisma.teamMember.delete({
      where: {
        teamId_userId: {
          teamId: team.id,
          userId,
        },
      },
    });

    await this.notificationsService.createNotification({
      userId: team.captainId,
      title: 'Member left team',
      message: `A member has left team ${team.name}.`,
      type: 'TEAM_MEMBER_LEFT',
      metadata: {
        teamId: team.id,
        userId,
      },
    });

    return {
      message: 'Leave team successfully',
      data: null,
    };
  }

  async inviteMember(teamId: string, inviterId: string, dto: InviteMemberDto) {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      throw new BadRequestException('Team not found');
    }

    if (team.captainId !== inviterId) {
      throw new BadRequestException('Only captain can invite members');
    }

    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!invitee) {
      throw new BadRequestException('User not found');
    }

    if (invitee.id === inviterId) {
      throw new BadRequestException('You cannot invite yourself');
    }

    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId,
          userId: invitee.id,
        },
      },
    });

    if (existingMember) {
      throw new BadRequestException('User is already in this team');
    }

    const existingInvite = await this.prisma.teamInvite.findUnique({
      where: {
        teamId_inviteeId: {
          teamId,
          inviteeId: invitee.id,
        },
      },
    });

    if (existingInvite) {
      throw new BadRequestException('Invite already exists for this user');
    }

    const invite = await this.prisma.teamInvite.create({
      data: {
        teamId,
        inviterId,
        inviteeId: invitee.id,
      },
    });
    await this.notificationsService.createNotification({
      userId: invitee.id,
      title: 'Team invitation',
      message: `You have been invited to join team ${team.name}`,
      type: 'TEAM_INVITE',
      metadata: {
        teamId,
        inviteId: invite.id,
      },
    });

    return {
      message: 'Invite member successfully',
      data: invite,
    };
  }
  async getMyInvites(userId: string) {
    const invites = await this.prisma.teamInvite.findMany({
      where: {
        inviteeId: userId,
        status: 'PENDING',
      },
      include: {
        team: true,
        inviter: {
          select: {
            id: true,
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return {
      message: 'Get my invites successfully',
      data: invites,
    };
  }

  async acceptInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new BadRequestException('Invite not found');
    }

    if (invite.inviteeId !== userId) {
      throw new BadRequestException('This invite does not belong to you');
    }

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Invite is not pending');
    }

    const existingMember = await this.prisma.teamMember.findUnique({
      where: {
        teamId_userId: {
          teamId: invite.teamId,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new BadRequestException('You are already in this team');
    }

    const result = await this.prisma.$transaction([
      this.prisma.teamMember.create({
        data: {
          teamId: invite.teamId,
          userId,
        },
      }),
      this.prisma.teamInvite.update({
        where: { id: inviteId },
        data: { status: 'ACCEPTED' },
      }),
    ]);

    return {
      message: 'Accept invite successfully',
      data: result,
    };
  }

  async rejectInvite(inviteId: string, userId: string) {
    const invite = await this.prisma.teamInvite.findUnique({
      where: { id: inviteId },
    });

    if (!invite) {
      throw new BadRequestException('Invite not found');
    }

    if (invite.inviteeId !== userId) {
      throw new BadRequestException('This invite does not belong to you');
    }

    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Invite is not pending');
    }

    const rejected = await this.prisma.teamInvite.update({
      where: { id: inviteId },
      data: { status: 'REJECTED' },
    });

    return {
      message: 'Reject invite successfully',
      data: rejected,
    };
  }
  async getMyTeam(userId: string) {
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId },
      include: {
        team: {
          include: {
            captain: {
              select: {
                id: true,
                username: true,
                email: true,
              },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!teamMember) {
      return {
        message: 'You are not in any team',
        data: null,
      };
    }

    return {
      message: 'Get my team successfully',
      data: teamMember.team,
    };
  }

  getMyRankingHistory(userId: string) {
    return this.leaderboardsService.getMyTeamRankingHistory(userId);
  }

  async getMySchedule(userId: string) {
    const teamMember = await this.prisma.teamMember.findFirst({
      where: { userId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!teamMember) {
      return {
        message: 'You are not in any team',
        data: [],
      };
    }

    const matches = await this.prisma.match.findMany({
      where: {
        OR: [{ teamAId: teamMember.teamId }, { teamBId: teamMember.teamId }],
      },
      include: {
        tournament: {
          select: {
            id: true,
            name: true,
            game: true,
          },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'desc' }],
    });

    const teamIds = [
      ...new Set(
        matches
          .flatMap((match) => [match.teamAId, match.teamBId])
          .filter(Boolean) as string[],
      ),
    ];

    const teams = await this.prisma.team.findMany({
      where: {
        id: {
          in: teamIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
    const teamById = new Map(teams.map((team) => [team.id, team]));

    return {
      message: 'Get team schedule successfully',
      data: matches.map((match) => {
        const teamSlot = match.teamAId === teamMember.teamId ? 'A' : 'B';
        const opponentId = teamSlot === 'A' ? match.teamBId : match.teamAId;
        const opponent = opponentId ? teamById.get(opponentId) : null;

        return {
          id: match.id,
          tournament: match.tournament,
          roundNumber: match.roundNumber,
          matchNumber: match.matchNumber,
          teamSlot,
          opponent,
          scheduledAt: match.scheduledAt,
          roomCode: match.roomCode,
          livestreamUrl: match.livestreamUrl,
          status: match.status,
        };
      }),
    };
  }
}
