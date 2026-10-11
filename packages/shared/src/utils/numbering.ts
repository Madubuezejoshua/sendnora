/**
 * Pure formatting logic for quote/invoice/receipt numbers.
 *
 * The atomic, concurrency-safe part (incrementing the counter exactly once
 * per document) lives in the API's DocumentSequence service, which wraps a
 * `SELECT ... FOR UPDATE`-style row lock (via a Prisma interactive
 * transaction) around a read-increment-write of the `DocumentSequence`
 * table, keyed by (workspaceId, documentType[, year]). This module only
 * turns the resulting integer into the final display string, so the format
 * itself is unit-testable without a database.
 */
export type DocumentType = 'QUOTE' | 'INVOICE' | 'RECEIPT' | 'CREDIT_NOTE';

export interface NumberingFormat {
  prefix: string;
  padding: number;
  includeYear: boolean;
  separator: string;
}

export const DEFAULT_NUMBERING_FORMATS: Record<DocumentType, NumberingFormat> = {
  QUOTE: { prefix: 'QUO', padding: 4, includeYear: true, separator: '-' },
  INVOICE: { prefix: 'INV', padding: 4, includeYear: true, separator: '-' },
  RECEIPT: { prefix: 'RCT', padding: 4, includeYear: true, separator: '-' },
  CREDIT_NOTE: { prefix: 'CRN', padding: 4, includeYear: true, separator: '-' },
};

export function formatDocumentNumber(
  format: NumberingFormat,
  sequenceValue: number,
  year: number,
): string {
  const parts = [format.prefix];
  if (format.includeYear) parts.push(String(year));
  parts.push(String(sequenceValue).padStart(format.padding, '0'));
  return parts.join(format.separator);
}

export function validateNumberingFormat(format: Partial<NumberingFormat>): NumberingFormat {
  const prefix = (format.prefix ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (prefix.length === 0 || prefix.length > 10) {
    throw new Error('Numbering prefix must be 1-10 alphanumeric characters');
  }
  const padding = format.padding ?? 4;
  if (padding < 1 || padding > 8) {
    throw new Error('Numbering padding must be between 1 and 8');
  }
  return {
    prefix,
    padding,
    includeYear: format.includeYear ?? true,
    separator: format.separator ?? '-',
  };
}
