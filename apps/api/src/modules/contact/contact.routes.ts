import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@invoicetap/database';
import { emailSchema } from '@invoicetap/shared';
import { validateBody } from '../../middleware/validate.js';
import { contactFormRateLimit } from '../../middleware/rate-limit.js';
import { requireAuth } from '../../middleware/auth.js';
import { requireWorkspace } from '../../middleware/workspace-context.js';
import {
  sendTemplatedEmail,
  contactAcknowledgementTemplate,
} from '../../services/email/email.service.js';

export const contactRouter = Router();

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: emailSchema,
  subject: z.string().max(200).optional(),
  message: z.string().min(1).max(5000),
});

contactRouter.post(
  '/contact',
  contactFormRateLimit,
  validateBody(contactSchema),
  async (req, res, next) => {
    try {
      const submission = await prisma.contactSubmission.create({ data: req.body });
      await sendTemplatedEmail({
        to: req.body.email,
        templateKey: 'contact_acknowledgement',
        template: contactAcknowledgementTemplate({ name: req.body.name }),
      }).catch(() => {});
      res.status(201).json({ data: { id: submission.id } });
    } catch (err) {
      next(err);
    }
  },
);

export const supportTicketsRouter = Router();
supportTicketsRouter.use(requireAuth, requireWorkspace);

supportTicketsRouter.post(
  '/support-tickets',
  validateBody(
    z.object({ subject: z.string().min(1).max(200), message: z.string().min(1).max(5000) }),
  ),
  async (req, res, next) => {
    try {
      const ticket = await prisma.supportTicket.create({
        data: {
          workspaceId: req.workspace!.workspaceId,
          userId: req.auth!.userId,
          subject: req.body.subject,
          message: req.body.message,
        },
      });
      res.status(201).json({ data: ticket });
    } catch (err) {
      next(err);
    }
  },
);

supportTicketsRouter.get('/support-tickets', async (req, res, next) => {
  try {
    const tickets = await prisma.supportTicket.findMany({
      where: { workspaceId: req.workspace!.workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: tickets });
  } catch (err) {
    next(err);
  }
});
