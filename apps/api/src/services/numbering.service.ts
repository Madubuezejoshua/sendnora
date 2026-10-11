import type { Prisma } from '@invoicetap/database';
import {
  DEFAULT_NUMBERING_FORMATS,
  formatDocumentNumber,
  validateNumberingFormat,
  type DocumentType,
  type NumberingFormat,
} from '@invoicetap/shared';

/**
 * Atomically allocates the next sequence number for a workspace + document
 * type + year. MUST be called inside the same Prisma transaction that
 * creates the document, using the transaction client (`tx`) passed in —
 * never the global `prisma` — so two concurrent requests can never be
 * handed the same number. Postgres serializes the upsert's row lock, which
 * is what makes this safe under concurrency (see DATABASE.md).
 */
export async function allocateDocumentNumber(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  documentType: DocumentType,
  customFormats: Record<string, Partial<NumberingFormat>> | null | undefined,
): Promise<string> {
  const year = new Date().getUTCFullYear();

  const sequence = await tx.documentSequence.upsert({
    where: { workspaceId_documentType_year: { workspaceId, documentType, year } },
    create: { workspaceId, documentType, year, currentValue: 1 },
    update: { currentValue: { increment: 1 } },
  });

  const override = customFormats?.[documentType];
  const format = override
    ? validateNumberingFormat({ ...DEFAULT_NUMBERING_FORMATS[documentType], ...override })
    : DEFAULT_NUMBERING_FORMATS[documentType];

  return formatDocumentNumber(format, sequence.currentValue, year);
}
