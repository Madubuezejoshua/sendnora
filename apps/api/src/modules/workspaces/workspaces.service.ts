import { prisma } from '@invoicetap/database';
import { verifyPassword } from '@invoicetap/database/password';
import {
  AppError,
  generatePublicToken,
  slugify,
  type CreateWorkspaceInput,
  type InviteMemberInput,
  MEMBER_MANAGEMENT_ROLES,
} from '@invoicetap/shared';
import { assertCanAddTeamMember } from '../../services/billing.service.js';

async function generateUniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'workspace';
  let candidate = root;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const existing = await prisma.workspace.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${root}-${suffix}`;
  }
}

export async function createWorkspace(userId: string, input: CreateWorkspaceInput) {
  const slug = await generateUniqueSlug(input.businessName);

  return prisma.workspace.create({
    data: {
      slug,
      name: input.businessName,
      ownerId: userId,
      businessType: input.businessType,
      countryCode: input.countryCode,
      timezone: input.timezone,
      locale: input.locale,
      defaultCurrency: input.defaultCurrency,
      members: { create: { userId, role: 'WORKSPACE_OWNER', joinedAt: new Date() } },
      businessProfile: { create: { displayName: input.businessName } },
      subscription: {
        create: {
          planCode: 'FREE',
          status: 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          provider: 'MANUAL',
        },
      },
    },
    include: { businessProfile: true },
  });
}

export async function listMyWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId, removedAt: null },
    include: { workspace: { include: { businessProfile: true, subscription: true } } },
  });
  return memberships.map((m) => ({ role: m.role, workspace: m.workspace }));
}

export async function getWorkspace(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { businessProfile: { include: { address: true } }, subscription: true },
  });
  if (!workspace) throw new AppError('NOT_FOUND', 'Workspace not found');
  return workspace;
}

export async function updateWorkspaceSettings(
  workspaceId: string,
  input: Partial<{
    timezone: string;
    locale: string;
    defaultCurrency: string;
    invoiceDueDays: number;
    defaultNotes: string;
    defaultTerms: string;
    brandColor: string;
    pdfTemplate: string;
  }>,
) {
  return prisma.workspace.update({
    where: { id: workspaceId },
    data: {
      timezone: input.timezone,
      locale: input.locale,
      defaultCurrency: input.defaultCurrency,
      invoiceDueDays: input.invoiceDueDays,
      defaultNotes: input.defaultNotes,
      defaultTerms: input.defaultTerms,
      brandColor: input.brandColor,
      pdfTemplateKey: input.pdfTemplate,
    },
  });
}

export async function updateBusinessProfile(
  workspaceId: string,
  input: Partial<{
    businessName: string;
    contactEmail: string;
    contactPhone: string;
    website: string;
    taxIdNumber: string;
    address: {
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode?: string;
      countryCode: string;
    };
  }>,
) {
  const profile = await prisma.businessProfile.findUnique({ where: { workspaceId } });
  if (!profile) throw new AppError('NOT_FOUND', 'Business profile not found');

  let addressId = profile.addressId;
  if (input.address) {
    if (addressId) {
      await prisma.address.update({ where: { id: addressId }, data: input.address });
    } else {
      const created = await prisma.address.create({ data: input.address });
      addressId = created.id;
    }
  }

  const updated = await prisma.businessProfile.update({
    where: { workspaceId },
    data: {
      displayName: input.businessName,
      contactEmail: input.contactEmail,
      contactPhone: input.contactPhone,
      website: input.website,
      taxIdNumber: input.taxIdNumber,
      addressId,
    },
  });

  if (input.businessName) {
    await prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: input.businessName },
    });
  }

  return updated;
}

export async function listMembers(workspaceId: string) {
  return prisma.workspaceMember.findMany({
    where: { workspaceId, removedAt: null },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { invitedAt: 'asc' },
  });
}

export async function updateMemberRole(workspaceId: string, memberId: string, role: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
  if (!member) throw new AppError('NOT_FOUND', 'Member not found');
  if (member.role === 'WORKSPACE_OWNER') {
    throw new AppError('FORBIDDEN', 'Use the ownership-transfer flow to change the owner');
  }
  return prisma.workspaceMember.update({ where: { id: memberId }, data: { role: role as never } });
}

export async function removeMember(workspaceId: string, memberId: string, actorUserId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
  if (!member) throw new AppError('NOT_FOUND', 'Member not found');
  if (member.role === 'WORKSPACE_OWNER') {
    throw new AppError(
      'FORBIDDEN',
      'The workspace owner cannot be removed. Transfer ownership first.',
    );
  }
  if (member.userId === actorUserId) {
    throw new AppError('FORBIDDEN', 'Use "Leave workspace" to remove yourself');
  }
  return prisma.workspaceMember.update({
    where: { id: memberId },
    data: { removedAt: new Date() },
  });
}

export async function inviteMember(
  workspaceId: string,
  invitedById: string,
  input: InviteMemberInput,
) {
  await assertCanAddTeamMember(workspaceId);

  const existingMember = await prisma.workspaceMember.findFirst({
    where: { workspaceId, removedAt: null, user: { email: input.email } },
  });
  if (existingMember)
    throw new AppError('CONFLICT', 'This person is already a member of the workspace');

  return prisma.workspaceInvitation.create({
    data: {
      workspaceId,
      email: input.email,
      role: input.role,
      token: generatePublicToken(),
      invitedById,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
}

export async function listInvitations(workspaceId: string) {
  return prisma.workspaceInvitation.findMany({
    where: { workspaceId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
}

export async function revokeInvitation(workspaceId: string, invitationId: string) {
  const invite = await prisma.workspaceInvitation.findFirst({
    where: { id: invitationId, workspaceId },
  });
  if (!invite) throw new AppError('NOT_FOUND', 'Invitation not found');
  return prisma.workspaceInvitation.update({
    where: { id: invitationId },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
}

export async function acceptInvitation(userId: string, userEmail: string, token: string) {
  const invite = await prisma.workspaceInvitation.findUnique({ where: { token } });
  if (!invite || invite.status !== 'PENDING') {
    throw new AppError('NOT_FOUND', 'Invitation not found or already used');
  }
  if (invite.expiresAt < new Date()) {
    await prisma.workspaceInvitation.update({
      where: { id: invite.id },
      data: { status: 'EXPIRED' },
    });
    throw new AppError('CONFLICT', 'This invitation has expired');
  }
  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new AppError('FORBIDDEN', 'This invitation was sent to a different email address');
  }

  await assertCanAddTeamMember(invite.workspaceId);

  return prisma.$transaction(async (tx) => {
    await tx.workspaceInvitation.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    return tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
      create: { workspaceId: invite.workspaceId, userId, role: invite.role, joinedAt: new Date() },
      update: { role: invite.role, removedAt: null, joinedAt: new Date() },
    });
  });
}

export async function transferOwnership(
  workspaceId: string,
  currentOwnerUserId: string,
  newOwnerMemberId: string,
  currentPassword: string,
) {
  const owner = await prisma.user.findUnique({ where: { id: currentOwnerUserId } });
  if (!owner?.passwordHash || !(await verifyPassword(owner.passwordHash, currentPassword))) {
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect password');
  }

  const newOwnerMember = await prisma.workspaceMember.findFirst({
    where: { id: newOwnerMemberId, workspaceId, removedAt: null },
  });
  if (!newOwnerMember) throw new AppError('NOT_FOUND', 'Member not found');

  return prisma.$transaction(async (tx) => {
    const currentOwnerMember = await tx.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: currentOwnerUserId } },
    });
    if (!currentOwnerMember) throw new AppError('NOT_FOUND', 'Current owner membership not found');

    await tx.workspaceMember.update({
      where: { id: currentOwnerMember.id },
      data: { role: 'WORKSPACE_ADMIN' },
    });
    await tx.workspaceMember.update({
      where: { id: newOwnerMember.id },
      data: { role: 'WORKSPACE_OWNER' },
    });
    return tx.workspace.update({
      where: { id: workspaceId },
      data: { ownerId: newOwnerMember.userId },
    });
  });
}

/** Roles allowed to manage members in this workspace — used by route guards alongside the generic RBAC permission check. */
export { MEMBER_MANAGEMENT_ROLES };
