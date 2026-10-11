import { z } from 'zod';
import { WORKSPACE_ROLES } from '../constants/roles.js';
import { addressSchema, currencyCodeSchema, emailSchema } from './common.js';

export const businessTypeSchema = z.enum([
  'FREELANCER',
  'SOLE_PROPRIETOR',
  'PARTNERSHIP',
  'LIMITED_COMPANY',
  'NGO',
  'OTHER',
]);

export const createWorkspaceSchema = z.object({
  businessName: z.string().trim().min(1).max(150),
  businessType: businessTypeSchema.default('FREELANCER'),
  countryCode: z.string().length(2),
  timezone: z.string().min(1),
  locale: z.string().min(2).max(20).default('en'),
  defaultCurrency: currencyCodeSchema,
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateBusinessProfileSchema = z.object({
  businessName: z.string().trim().min(1).max(150).optional(),
  businessType: businessTypeSchema.optional(),
  contactEmail: emailSchema.optional(),
  contactPhone: z.string().max(30).optional(),
  website: z.string().url().max(200).optional().or(z.literal('')),
  taxIdNumber: z.string().max(60).optional(),
  address: addressSchema.optional(),
});

export const updateWorkspaceSettingsSchema = z.object({
  timezone: z.string().optional(),
  locale: z.string().optional(),
  defaultCurrency: currencyCodeSchema.optional(),
  invoiceDueDays: z.number().int().min(0).max(365).optional(),
  defaultNotes: z.string().max(2000).optional(),
  defaultTerms: z.string().max(4000).optional(),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  pdfTemplate: z.enum(['MODERN', 'CLASSIC', 'MINIMAL']).optional(),
});

export const inviteMemberSchema = z.object({
  email: emailSchema,
  role: z.enum(WORKSPACE_ROLES).refine((r) => r !== 'WORKSPACE_OWNER', {
    message: 'Cannot invite a member directly as owner',
  }),
});
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(20),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(WORKSPACE_ROLES).refine((r) => r !== 'WORKSPACE_OWNER', {
    message: 'Use the ownership-transfer flow to change the owner',
  }),
});

export const transferOwnershipSchema = z.object({
  newOwnerMemberId: z.string().min(1),
  currentPassword: z.string().min(1, 'Re-authentication is required to transfer ownership'),
});
